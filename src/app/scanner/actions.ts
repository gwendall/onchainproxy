"use server";

import { Alchemy, Network, NftFilters } from "alchemy-sdk";
import { createPublicClient, http, getAddress, isAddress } from "viem";
import { normalize } from "viem/ens";
import { mainnet } from "viem/chains";
import { resolveNftMetadata } from "@/lib/nft/metadata";
import type { SupportedChain } from "@/lib/nft/chain";
import { LruTtlCache } from "@/lib/cache/lru";

const alchemyNetworkForChain = (chain: SupportedChain): Network | null => {
  switch (chain) {
    case "eth":
      return Network.ETH_MAINNET;
    case "arb":
      return Network.ARB_MAINNET;
    case "op":
      return Network.OPT_MAINNET;
    case "base":
      return Network.BASE_MAINNET;
    case "polygon":
      return Network.MATIC_MAINNET;
    default:
      return null;
  }
};

// Helper to get Alchemy instance
const getAlchemy = (chain: SupportedChain) => {
  const network = alchemyNetworkForChain(chain);
  if (!network) {
    throw new Error(`Wallet scanning is not supported on ${chain} yet.`);
  }
  const apiKey = process.env.ALCHEMY_API_KEY;
  const config = {
    apiKey,
    network,
  };
  return new Alchemy(config);
};

const looksLikeEnsName = (s: string) => {
  const v = String(s || "").trim();
  return v.length > 0 && v.includes(".") && !v.includes(" ");
};

const ensCache = new LruTtlCache<string, string>({
  maxEntries: 2000,
});

// Get viem client for ENS resolution
const getEnsClient = () => {
  // Try to use Alchemy for more reliable ENS resolution
  const alchemyKey = process.env.ALCHEMY_API_KEY;
  const rpcUrl = alchemyKey
    ? `https://eth-mainnet.g.alchemy.com/v2/${alchemyKey}`
    : "https://cloudflare-eth.com";

  return createPublicClient({
    chain: mainnet,
    transport: http(rpcUrl),
  });
};

const resolveEnsToAddress = async (ensName: string) => {
  const name = String(ensName || "").trim();
  const nowMs = Date.now();
  const cached = ensCache.get(name.toLowerCase(), nowMs);
  if (cached) return cached;

  // Use viem's getEnsAddress which is more reliable for ENS resolution
  const client = getEnsClient();
  const resolved = await client.getEnsAddress({
    name: normalize(name),
  });

  if (!resolved) {
    throw new Error(`ENS name has no address record: ${name}`);
  }

  const checksum = getAddress(resolved);
  ensCache.set(name.toLowerCase(), checksum, 10 * 60 * 1000, nowMs);
  return checksum;
};

export async function scanNfts(addressOrEns: string, chain: SupportedChain) {
  try {
    const alchemy = getAlchemy(chain);
    const raw = String(addressOrEns || "").trim();

    const { resolvedAddress, resolvedTarget } = await (async () => {
      if (isAddress(raw)) {
        const checksum = getAddress(raw);
        return { resolvedAddress: checksum, resolvedTarget: checksum };
      }
      if (looksLikeEnsName(raw)) {
        const checksum = await resolveEnsToAddress(raw);
        return { resolvedAddress: checksum, resolvedTarget: raw };
      }
      throw new Error(`Invalid address or ENS name: ${addressOrEns}`);
    })();

    // Fetch NFTs (paginate: pageSize max is 100)
    // Chain selected via Alchemy network config above.
    const ownedNfts: Array<{
      contract: { address: string };
      tokenId: string;
      title?: string;
      collection?: string;
      thumbnailUrl?: string;
    }> = [];

    let pageKey: string | undefined;
    const maxNfts = 2000; // safety cap

    while (ownedNfts.length < maxNfts) {
      const response = await alchemy.nft.getNftsForOwner(resolvedAddress, {
        pageSize: 100,
        pageKey,
        excludeFilters: [NftFilters.SPAM],
      });

      for (const nft of response.ownedNfts) {
        const title = nft.name || nft.raw?.metadata?.name || undefined;
        const collection =
          nft.collection?.name
          || nft.contract?.openSeaMetadata?.collectionName
          || nft.contract?.name
          || undefined;
        const thumbnailUrl =
          nft.image?.thumbnailUrl
          || nft.image?.cachedUrl
          || nft.image?.pngUrl
          || nft.image?.originalUrl
          || (typeof nft.raw?.metadata?.image === "string" ? nft.raw.metadata.image : undefined)
          || undefined;

        ownedNfts.push({
          contract: { address: nft.contract.address },
          tokenId: nft.tokenId,
          title,
          collection,
          thumbnailUrl,
        });
      }

      pageKey = response.pageKey;
      if (!pageKey) break;
    }

    // Return object with nfts and the resolved address
    return {
      nfts: ownedNfts,
      resolvedAddress,
      resolvedTarget,
    };
  } catch (e: unknown) {
    console.error("Scan error details:", e);
    throw new Error(e instanceof Error ? e.message : "Failed to scan NFTs");
  }
}

type ErrorSource = "rpc" | "contract" | "metadata_fetch" | "parsing" | "image_fetch" | "unknown";

const classifyError = (e: unknown): { source: ErrorSource; message: string; isTransient: boolean } => {
  if (!(e instanceof Error)) {
    return { source: "unknown", message: "Unknown error", isTransient: false };
  }

  const msg = e.message.toLowerCase();
  const cause = (e as { cause?: unknown }).cause;

  // RPC/Network errors - likely transient, retry later
  if (
    msg.includes("timeout") ||
    msg.includes("aborted") ||
    msg.includes("fetch") ||
    msg.includes("network") ||
    msg.includes("rpc http") ||
    msg.includes("rpc eth_call failed")
  ) {
    return { source: "rpc", message: e.message, isTransient: true };
  }

  // Contract errors - permanent, contract doesn't support the interface or token doesn't exist
  if (
    msg.includes("revert") ||
    msg.includes("execution reverted") ||
    msg.includes("call exception") ||
    msg.includes("failed to resolve token metadata uri")
  ) {
    // Check if all attempts failed - might be RPC issue masquerading as contract error
    const attempts = (cause as { attempts?: Array<{ error: string }> })?.attempts;
    const allRpcErrors = attempts?.every((a) =>
      a.error.toLowerCase().includes("timeout") ||
      a.error.toLowerCase().includes("rpc http")
    );
    if (allRpcErrors) {
      return { source: "rpc", message: "All RPC endpoints failed", isTransient: true };
    }
    return { source: "contract", message: e.message, isTransient: false };
  }

  // Metadata fetch errors - could be transient (server down) or permanent (404)
  if (msg.includes("metadata fetch failed")) {
    const status = msg.match(/\((\d+)\)/)?.[1];
    const isTransient = status ? !["400", "404", "410"].includes(status) : true;
    return { source: "metadata_fetch", message: e.message, isTransient };
  }

  // Parsing/validation errors - permanent
  if (
    msg.includes("invalid contract") ||
    msg.includes("invalid tokenid") ||
    msg.includes("bad metadata data url") ||
    msg.includes("no metadata url") ||
    msg.includes("bad rpc result")
  ) {
    return { source: "parsing", message: e.message, isTransient: false };
  }

  return { source: "unknown", message: e.message, isTransient: false };
};

export type NftStatusResult = {
  ok: boolean;
  metadataOk: boolean;
  imageOk: boolean;
  error?: string;
  errorSource?: ErrorSource;
  isTransient?: boolean;
  imageError?: string;
  imageErrorSource?: ErrorSource;
};

export type NftInfo = {
  title?: string;
  collection?: string;
  imageUrl?: string;
  exists: boolean;
};

export async function fetchNftInfo(chain: SupportedChain, contract: string, tokenId: string): Promise<NftInfo> {
  const network = alchemyNetworkForChain(chain);
  if (!network) {
    return { exists: false };
  }

  try {
    const alchemy = getAlchemy(chain);
    const nft = await alchemy.nft.getNftMetadata(contract, tokenId);

    // Check if the NFT exists (Alchemy returns empty data for non-existent tokens)
    const exists = !!(nft.name || nft.raw?.metadata || nft.image?.originalUrl);

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

    return { title, collection, imageUrl, exists };
  } catch {
    return { exists: false };
  }
}

export async function checkNftStatus(chain: string, contract: string, tokenId: string): Promise<NftStatusResult> {
  let metadataResult;
  
  try {
    metadataResult = await resolveNftMetadata({
      chain: chain as SupportedChain,
      contract,
      tokenId,
      rpcUrlQuery: null,
      cacheTtlMs: 60 * 1000,
    });
  } catch (e: unknown) {
    const { source, message, isTransient } = classifyError(e);
    return {
      ok: false,
      metadataOk: false,
      imageOk: false,
      error: message,
      errorSource: source,
      isTransient,
    };
  }

  // Metadata resolved successfully, now check image
  let imageOk = false;
  let imageError: string | undefined;
  let imageErrorSource: ErrorSource | undefined;

  if (metadataResult.imageUrl) {
    try {
      const res = await fetch(metadataResult.imageUrl, {
        method: "HEAD",
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        imageOk = true;
      } else {
        // Some servers block HEAD, try GET with range
        const resGet = await fetch(metadataResult.imageUrl, {
          method: "GET",
          headers: { Range: "bytes=0-10" },
          signal: AbortSignal.timeout(5000),
        });
        if (resGet.ok) {
          imageOk = true;
        } else {
          imageError = `Image fetch failed (${resGet.status})`;
          imageErrorSource = "image_fetch";
        }
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      const isNetwork = msg.toLowerCase().includes("timeout") || 
                       msg.toLowerCase().includes("abort") ||
                       msg.toLowerCase().includes("fetch");
      imageError = msg;
      imageErrorSource = isNetwork ? "rpc" : "image_fetch";
    }
  } else {
    // No image URL in metadata - this might be intentional (e.g. some NFTs)
    imageOk = true; // Don't mark as error if there's simply no image field
  }

  return {
    ok: true,
    metadataOk: true,
    imageOk,
    imageError,
    imageErrorSource,
  };
}
