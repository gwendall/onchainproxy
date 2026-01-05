import { ImageResponse } from "next/og";
import { normalizeChain } from "@/lib/nft/chain";

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

export default async function Image({
  params,
}: {
  params: Promise<{ chain: string; contract: string; tokenId: string }>;
}) {
  const { chain: rawChain, contract: rawContract, tokenId: rawTokenId } = await params;
  
  const chain = normalizeChain(rawChain);
  const contract = decodeURIComponent(rawContract).trim();
  const tokenId = decodeURIComponent(rawTokenId).trim();

  // Try to fetch the NFT image
  let imageUrl: string | null = null;
  let imageData: ArrayBuffer | null = null;
  
  if (chain) {
    try {
      // First get metadata to find image URL
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || process.env.VERCEL_URL 
        ? `https://${process.env.VERCEL_URL}` 
        : "http://localhost:3000";
      
      const metadataRes = await fetch(`${baseUrl}/${chain}/${contract}/${tokenId}`, {
        next: { revalidate: 3600 },
      });
      
      if (metadataRes.ok) {
        const metadata = await metadataRes.json();
        imageUrl = metadata?.imageUrl;
        
        // If we have an image URL, try to fetch it
        if (imageUrl) {
          try {
            const imgRes = await fetch(imageUrl, {
              headers: { "User-Agent": "OnChainProxy/1.0" },
              signal: AbortSignal.timeout(5000),
            });
            if (imgRes.ok) {
              imageData = await imgRes.arrayBuffer();
            }
          } catch {
            // Image fetch failed, will use fallback
          }
        }
      }
    } catch {
      // Metadata fetch failed, will use fallback
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
              NFT
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

          {/* Contract */}
          <div
            style={{
              display: "flex",
              color: "rgba(255,255,255,0.5)",
              fontSize: "24px",
              fontFamily: "ui-monospace, monospace",
              marginBottom: "12px",
            }}
          >
            Contract
          </div>
          <div
            style={{
              display: "flex",
              color: "white",
              fontSize: "36px",
              fontFamily: "ui-monospace, monospace",
              fontWeight: 600,
              marginBottom: "32px",
            }}
          >
            {shortAddress(contract)}
          </div>

          {/* Token ID */}
          <div
            style={{
              display: "flex",
              color: "rgba(255,255,255,0.5)",
              fontSize: "24px",
              fontFamily: "ui-monospace, monospace",
              marginBottom: "12px",
            }}
          >
            Token ID
          </div>
          <div
            style={{
              display: "flex",
              color: "white",
              fontSize: "48px",
              fontFamily: "ui-monospace, monospace",
              fontWeight: 700,
            }}
          >
            #{tokenId.length > 10 ? tokenId.slice(0, 10) + "..." : tokenId}
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}

