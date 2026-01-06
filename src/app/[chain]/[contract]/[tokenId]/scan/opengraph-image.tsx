import { ImageResponse } from "next/og";
import { Alchemy, Network } from "alchemy-sdk";
import { normalizeChain, type SupportedChain } from "@/lib/nft/chain";

export const runtime = "nodejs";

export const alt = "Token Health Check";
export const size = {
  width: 1200,
  height: 630,
};

export const contentType = "image/png";

const chainDisplayName = (chain: string) => {
  switch (chain) {
    case "eth": return "Ethereum";
    case "arb": return "Arbitrum";
    case "op": return "Optimism";
    case "base": return "Base";
    case "polygon": return "Polygon";
    case "zksync": return "zkSync";
    case "linea": return "Linea";
    case "scroll": return "Scroll";
    case "polygon-zkevm": return "zkEVM";
    default: return chain;
  }
};

const shortAddress = (addr: string) => {
  const a = String(addr || "");
  if (a.length <= 12) return a;
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
};

const alchemyNetworkForChain = (chain: SupportedChain): Network | null => {
  switch (chain) {
    case "eth": return Network.ETH_MAINNET;
    case "arb": return Network.ARB_MAINNET;
    case "op": return Network.OPT_MAINNET;
    case "base": return Network.BASE_MAINNET;
    case "polygon": return Network.MATIC_MAINNET;
    default: return null;
  }
};

const ScanLogo = () => {
  const stroke = "white";
  return (
    <svg
      width="48"
      height="48"
      viewBox="0 0 70 70"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x="8" y="8" width="54" height="54" rx="10" stroke={stroke} strokeWidth="4" />
      <path d="M18 28V18H28" stroke={stroke} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M42 18H52V28" stroke={stroke} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M52 42V52H42" stroke={stroke} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M28 52H18V42" stroke={stroke} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M22 35H48" stroke={stroke} strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
};

type NftInfo = {
  title?: string;
  collection?: string;
  imageUrl?: string;
};

async function fetchNftInfoFromAlchemy(
  chain: SupportedChain,
  contract: string,
  tokenId: string
): Promise<NftInfo | null> {
  const network = alchemyNetworkForChain(chain);
  if (!network) return null;

  const apiKey = process.env.ALCHEMY_API_KEY;
  if (!apiKey) return null;

  try {
    const alchemy = new Alchemy({ apiKey, network });
    const nft = await alchemy.nft.getNftMetadata(contract, tokenId);

    const title = nft.name || nft.raw?.metadata?.name || undefined;
    const collection =
      nft.collection?.name ||
      nft.contract?.openSeaMetadata?.collectionName ||
      nft.contract?.name ||
      undefined;
    const imageUrl =
      nft.image?.thumbnailUrl ||
      nft.image?.cachedUrl ||
      nft.image?.pngUrl ||
      nft.image?.originalUrl ||
      (typeof nft.raw?.metadata?.image === "string" ? nft.raw.metadata.image : undefined) ||
      undefined;

    return { title, collection, imageUrl };
  } catch {
    return null;
  }
}

async function fetchImageData(url: string): Promise<ArrayBuffer | null> {
  // Normalize IPFS URLs
  let fetchUrl = url;
  if (url.startsWith("ipfs://ipfs/")) {
    fetchUrl = `https://ipfs.io/ipfs/${url.slice("ipfs://ipfs/".length)}`;
  } else if (url.startsWith("ipfs://")) {
    fetchUrl = `https://ipfs.io/ipfs/${url.slice("ipfs://".length)}`;
  }

  try {
    const res = await fetch(fetchUrl, {
      headers: { "User-Agent": "OnChainProxy/1.0" },
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      return await res.arrayBuffer();
    }
  } catch {
    // Fetch failed
  }
  return null;
}

export default async function Image({
  params,
}: {
  params: Promise<{ chain: string; contract: string; tokenId: string }>;
}) {
  const { chain: rawChain, contract: rawContract, tokenId: rawTokenId } = await params;
  
  const chain = normalizeChain(rawChain);
  const contract = decodeURIComponent(rawContract).trim();
  const tokenId = decodeURIComponent(rawTokenId).trim();

  let nftInfo: NftInfo = {};
  let imageData: ArrayBuffer | null = null;
  
  if (chain) {
    // 1. Try Alchemy first to get NFT info (works even if our service is down)
    const alchemyInfo = await fetchNftInfoFromAlchemy(chain, contract, tokenId);
    if (alchemyInfo) {
      nftInfo = alchemyInfo;
    }

    // 2. Try our endpoint as a fallback/supplement
    try {
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 
        (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
      
      const metadataRes = await fetch(`${baseUrl}/${chain}/${contract}/${tokenId}`, {
        next: { revalidate: 3600 },
        signal: AbortSignal.timeout(5000),
      });
      
      if (metadataRes.ok) {
        const metadata = await metadataRes.json();
        // Fill in any missing info from our endpoint
        if (!nftInfo.title && metadata?.name) nftInfo.title = metadata.name;
        if (!nftInfo.collection && metadata?.collection) nftInfo.collection = metadata.collection;
        if (!nftInfo.imageUrl && metadata?.imageUrl) nftInfo.imageUrl = metadata.imageUrl;
      }
    } catch {
      // Our endpoint failed, but we might still have Alchemy data
    }

    // 3. Try to fetch the actual image
    if (nftInfo.imageUrl) {
      imageData = await fetchImageData(nftInfo.imageUrl);
    }
  }

  return new ImageResponse(
    (
      <div
        style={{
          background: "linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 100%)",
          width: "100%",
          height: "100%",
          display: "flex",
          padding: "60px",
        }}
      >
        {/* Left side - NFT Image */}
        <div
          style={{
            width: "400px",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginRight: "60px",
          }}
        >
          {imageData ? (
            <img
              src={`data:image/png;base64,${Buffer.from(imageData).toString("base64")}`}
              alt={`Token #${tokenId}`}
              width={380}
              height={380}
              style={{
                objectFit: "cover",
                borderRadius: "20px",
                border: "4px solid rgba(255,255,255,0.1)",
              }}
            />
          ) : (
            <div
              style={{
                width: "380px",
                height: "380px",
                background: "rgba(255,255,255,0.05)",
                borderRadius: "20px",
                border: "4px solid rgba(255,255,255,0.1)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "rgba(255,255,255,0.3)",
                fontSize: "64px",
                fontWeight: 700,
              }}
            >
              Asset
            </div>
          )}
        </div>

        {/* Right side - Info */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
          }}
        >
          {/* Header with logo */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "16px",
              marginBottom: "40px",
            }}
          >
            <ScanLogo />
            <div
              style={{
                display: "flex",
                color: "rgba(255,255,255,0.6)",
                fontSize: "28px",
                fontFamily: "ui-monospace, monospace",
              }}
            >
              Token Health Check
            </div>
          </div>

          {/* Chain badge */}
          <div
            style={{
              display: "flex",
              marginBottom: "24px",
            }}
          >
            <div
              style={{
                display: "flex",
                background: "rgba(255,255,255,0.1)",
                color: "white",
                padding: "8px 20px",
                borderRadius: "100px",
                fontSize: "24px",
                fontFamily: "ui-monospace, monospace",
              }}
            >
              {chain ? chainDisplayName(chain) : rawChain}
            </div>
          </div>

          {/* Title (if available) */}
          {nftInfo.title ? (
            <div
              style={{
                display: "flex",
                color: "white",
                fontSize: "42px",
                fontFamily: "ui-monospace, monospace",
                fontWeight: 700,
                marginBottom: "8px",
              }}
            >
              {nftInfo.title.length > 24 ? nftInfo.title.slice(0, 24) + "…" : nftInfo.title}
            </div>
          ) : null}

          {/* Collection (if available) */}
          {nftInfo.collection ? (
            <div
              style={{
                display: "flex",
                color: "rgba(255,255,255,0.6)",
                fontSize: "26px",
                fontFamily: "ui-monospace, monospace",
                marginBottom: "24px",
              }}
            >
              {nftInfo.collection.length > 30 ? nftInfo.collection.slice(0, 30) + "…" : nftInfo.collection}
            </div>
          ) : null}

          {/* Contract + Token ID row */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "24px",
              marginTop: nftInfo.title || nftInfo.collection ? "auto" : "0",
            }}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "column",
              }}
            >
              <div
                style={{
                  display: "flex",
                  color: "rgba(255,255,255,0.4)",
                  fontSize: "18px",
                  fontFamily: "ui-monospace, monospace",
                  marginBottom: "4px",
                }}
              >
                Contract
              </div>
              <div
                style={{
                  display: "flex",
                  color: "rgba(255,255,255,0.8)",
                  fontSize: "24px",
                  fontFamily: "ui-monospace, monospace",
                  fontWeight: 500,
                }}
              >
                {shortAddress(contract)}
              </div>
            </div>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
              }}
            >
              <div
                style={{
                  display: "flex",
                  color: "rgba(255,255,255,0.4)",
                  fontSize: "18px",
                  fontFamily: "ui-monospace, monospace",
                  marginBottom: "4px",
                }}
              >
                Token
              </div>
              <div
                style={{
                  display: "flex",
                  color: "rgba(255,255,255,0.8)",
                  fontSize: "24px",
                  fontFamily: "ui-monospace, monospace",
                  fontWeight: 500,
                }}
              >
                #{tokenId.length > 12 ? tokenId.slice(0, 12) + "…" : tokenId}
              </div>
            </div>
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}

