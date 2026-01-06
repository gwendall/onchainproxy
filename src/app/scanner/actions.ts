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

type ScanNftsResult = {
  nfts: Array<{
    contract: { address: string };
    tokenId: string;
    title?: string;
    collection?: string;
    thumbnailUrl?: string;
  }>;
  resolvedAddress: string;
  resolvedTarget: string;
  error?: undefined;
} | {
  nfts: [];
  resolvedAddress: string;
  resolvedTarget: string;
  error: string;
};

export async function scanNfts(addressOrEns: string, chain: SupportedChain): Promise<ScanNftsResult> {
  const raw = String(addressOrEns || "").trim();
  
  // Resolve address first
  let resolvedAddress: string;
  let resolvedTarget: string;
  
  try {
    if (isAddress(raw)) {
      const checksum = getAddress(raw);
      resolvedAddress = checksum;
      resolvedTarget = checksum;
    } else if (looksLikeEnsName(raw)) {
      const checksum = await resolveEnsToAddress(raw);
      resolvedAddress = checksum;
      resolvedTarget = raw;
    } else {
      return {
        nfts: [],
        resolvedAddress: "",
        resolvedTarget: raw,
        error: `Invalid address or ENS name: ${addressOrEns}`,
      };
    }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to resolve address";
    console.error("Address resolution error:", e);
    return {
      nfts: [],
      resolvedAddress: "",
      resolvedTarget: raw,
      error: message,
    };
  }
  
  try {
    const alchemy = getAlchemy(chain);

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
    const message = e instanceof Error ? e.message : "Failed to scan assets";
    return {
      nfts: [],
      resolvedAddress,
      resolvedTarget,
      error: message,
    };
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
  // Audit data
  metadataStorage?: StorageType;
  imageStorage?: StorageType;
  imageFormat?: ImageFormat;
  imageSizeBytes?: number;
  metadataCentralizedDomain?: string;
  imageCentralizedDomain?: string;
  // IPFS pin status
  metadataIpfsPinStatus?: IpfsPinStatus;
  imageIpfsPinStatus?: IpfsPinStatus;
  // URIs
  metadataUri?: string;
  imageUri?: string;
  // Response time for centralized hosts
  metadataResponseTimeMs?: number;
  metadataIsSlow?: boolean;
  imageResponseTimeMs?: number;
  imageIsSlow?: boolean;
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

// Storage type detection
type StorageType = "onchain" | "ipfs" | "arweave" | "centralized" | "unknown";

// IPFS pin status
type IpfsPinStatus = "pinned" | "available" | "unavailable" | "unknown";

// Known IPFS pinning services - if content is served from these, it's likely pinned
const KNOWN_PINNING_SERVICES = [
  "pinata.cloud",
  "gateway.pinata.cloud",
  "nftstorage.link",
  "nft.storage",
  "dweb.link",
  "w3s.link",
  "infura-ipfs.io",
  "cloudflare-ipfs.com",
  "cf-ipfs.com",
  "fleek.co",
  "fleek.cool",
  "4everland.io",
  "thirdweb.com",
];

// Alternative IPFS gateways to check availability
const IPFS_GATEWAYS = [
  "https://ipfs.io/ipfs/",
  "https://cloudflare-ipfs.com/ipfs/",
  "https://dweb.link/ipfs/",
];

const extractIpfsCid = (uri: string | undefined): string | null => {
  if (!uri) return null;
  
  // ipfs://CID or ipfs://ipfs/CID
  if (uri.startsWith("ipfs://")) {
    const path = uri.slice(7);
    // Remove ipfs/ prefix if present
    const cleaned = path.startsWith("ipfs/") ? path.slice(5) : path;
    // Extract CID (before any path)
    return cleaned.split("/")[0] || null;
  }
  
  // HTTP gateway URL with /ipfs/CID
  const match = uri.match(/\/ipfs\/([a-zA-Z0-9]+)/);
  return match?.[1] || null;
};

const isFromPinningService = (uri: string | undefined): boolean => {
  if (!uri) return false;
  const u = uri.toLowerCase();
  return KNOWN_PINNING_SERVICES.some((service) => u.includes(service));
};

const extractDomain = (uri: string | undefined): string | null => {
  if (!uri) return null;
  try {
    const url = new URL(uri);
    return url.hostname;
  } catch {
    return null;
  }
};

// Measure response time and analyze if the host is slow
// Uses TTFB (Time To First Byte) as the main metric since it's independent of file size
// TTFB > 2000ms is considered slow regardless of file size
// For smaller files (<1MB), TTFB > 1000ms is also considered slow
const analyzeResponseTime = (responseTimeMs: number, sizeBytes?: number): ResponseTimeAnalysis => {
  // Calculate throughput if size is known
  const throughputKBps = sizeBytes && responseTimeMs > 0 
    ? Math.round((sizeBytes / 1024) / (responseTimeMs / 1000)) 
    : undefined;
  
  // Determine if slow:
  // - TTFB > 2000ms = definitely slow server
  // - TTFB > 1000ms for files < 1MB = likely slow server
  // - We don't penalize for large files that take time
  const isLargeFile = sizeBytes && sizeBytes > 1024 * 1024; // > 1MB
  const isSlow = responseTimeMs > 2000 || (!isLargeFile && responseTimeMs > 1000);
  
  return {
    responseTimeMs,
    isSlow,
    throughputKBps,
  };
};

// Fetch with timing - returns response and timing info
const fetchWithTiming = async (url: string, options?: RequestInit): Promise<{ res: Response; responseTimeMs: number } | null> => {
  try {
    const start = performance.now();
    const res = await fetch(url, {
      ...options,
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    const responseTimeMs = Math.round(performance.now() - start);
    return { res, responseTimeMs };
  } catch {
    return null;
  }
};

const checkIpfsAvailability = async (cid: string): Promise<{ available: boolean; gatewaysUp: number }> => {
  const results = await Promise.allSettled(
    IPFS_GATEWAYS.map(async (gateway) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      try {
        const res = await fetch(`${gateway}${cid}`, {
          method: "HEAD",
          signal: controller.signal,
        });
        return res.ok || res.status === 429; // 429 = rate limited but available
      } finally {
        clearTimeout(timeout);
      }
    })
  );
  
  const gatewaysUp = results.filter(
    (r) => r.status === "fulfilled" && r.value === true
  ).length;
  
  return {
    available: gatewaysUp > 0,
    gatewaysUp,
  };
};

const detectStorageType = (uri: string | undefined): StorageType => {
  if (!uri) return "unknown";
  const u = uri.toLowerCase();
  
  // On-chain data URLs
  if (u.startsWith("data:")) return "onchain";
  
  // IPFS
  if (u.startsWith("ipfs://") || u.includes("/ipfs/") || u.includes("ipfs.io") || u.includes("pinata") || u.includes("nftstorage")) {
    return "ipfs";
  }
  
  // Arweave
  if (u.startsWith("ar://") || u.includes("arweave.net") || u.includes("arweave.dev")) {
    return "arweave";
  }
  
  // If it's an HTTP URL that's not IPFS/Arweave gateway, it's centralized
  if (u.startsWith("http://") || u.startsWith("https://")) {
    return "centralized";
  }
  
  return "unknown";
};

// Image format detection from content-type or magic bytes
type ImageFormat = "png" | "jpeg" | "gif" | "webp" | "svg" | "bmp" | "avif" | "unknown";

const detectImageFormat = (contentType: string | null, magicBytes?: Buffer): ImageFormat => {
  const ct = (contentType || "").toLowerCase();
  
  // Try content-type first
  if (ct.includes("image/png")) return "png";
  if (ct.includes("image/jpeg") || ct.includes("image/jpg")) return "jpeg";
  if (ct.includes("image/gif")) return "gif";
  if (ct.includes("image/webp")) return "webp";
  if (ct.includes("image/svg")) return "svg";
  if (ct.includes("image/bmp")) return "bmp";
  if (ct.includes("image/avif")) return "avif";
  
  // Try magic bytes if available
  if (magicBytes && magicBytes.length >= 4) {
    // PNG: 89 50 4E 47
    if (magicBytes[0] === 0x89 && magicBytes[1] === 0x50 && magicBytes[2] === 0x4E && magicBytes[3] === 0x47) {
      return "png";
    }
    // JPEG: FF D8 FF
    if (magicBytes[0] === 0xFF && magicBytes[1] === 0xD8 && magicBytes[2] === 0xFF) {
      return "jpeg";
    }
    // GIF: GIF87a or GIF89a
    if (magicBytes.toString("ascii", 0, 3) === "GIF") {
      return "gif";
    }
    // WebP: RIFF....WEBP
    if (magicBytes.toString("ascii", 0, 4) === "RIFF" && magicBytes.length >= 12 && magicBytes.toString("ascii", 8, 12) === "WEBP") {
      return "webp";
    }
    // SVG: starts with < (after trimming)
    const head = magicBytes.toString("utf8", 0, Math.min(100, magicBytes.length)).trimStart();
    if (head.startsWith("<svg") || (head.startsWith("<?xml") && head.includes("<svg"))) {
      return "svg";
    }
    // BMP: BM
    if (magicBytes.toString("ascii", 0, 2) === "BM") {
      return "bmp";
    }
  }
  
  return "unknown";
};

// Response time analysis for centralized hosts
export type ResponseTimeAnalysis = {
  responseTimeMs: number;
  isSlow: boolean;
  // Throughput in KB/s if size is known
  throughputKBps?: number;
};

export type NftAuditResult = {
  ok: boolean;
  error?: string;
  errorSource?: ErrorSource;
  isTransient?: boolean;
  
  // Metadata analysis
  metadata?: {
    ok: boolean;
    uri: string;
    url: string;
    storageType: StorageType;
    isOnchain: boolean;
    ipfsCid?: string;
    ipfsPinStatus?: IpfsPinStatus;
    ipfsGatewaysUp?: number;
    centralizedDomain?: string;
    responseTime?: ResponseTimeAnalysis;
    raw?: unknown;
  };
  
  // Image analysis
  image?: {
    ok: boolean;
    uri?: string;
    url?: string;
    storageType: StorageType;
    isOnchain: boolean;
    ipfsCid?: string;
    ipfsPinStatus?: IpfsPinStatus;
    ipfsGatewaysUp?: number;
    centralizedDomain?: string;
    responseTime?: ResponseTimeAnalysis;
    format?: ImageFormat;
    contentType?: string;
    sizeBytes?: number;
    error?: string;
  };
};

export async function auditNft(chain: string, contract: string, tokenId: string, options?: { refresh?: boolean }): Promise<NftAuditResult> {
  let metadataResult;
  const refresh = options?.refresh ?? false;
  
  try {
    metadataResult = await resolveNftMetadata({
      chain: chain as SupportedChain,
      contract,
      tokenId,
      rpcUrlQuery: null,
      cacheTtlMs: 60 * 1000,
      skipCache: refresh,
    });
  } catch (e: unknown) {
    const { source, message, isTransient } = classifyError(e);
    return {
      ok: false,
      error: message,
      errorSource: source,
      isTransient,
    };
  }

  const metadataStorageType = detectStorageType(metadataResult.metadataUri);
  
  // Check IPFS pin status for metadata
  let metadataIpfsCid: string | undefined;
  let metadataIpfsPinStatus: IpfsPinStatus | undefined;
  let metadataIpfsGatewaysUp: number | undefined;
  let metadataCentralizedDomain: string | undefined;
  
  if (metadataStorageType === "ipfs") {
    metadataIpfsCid = extractIpfsCid(metadataResult.metadataUri) || undefined;
    
    if (isFromPinningService(metadataResult.metadataUrl || metadataResult.metadataUri)) {
      metadataIpfsPinStatus = "pinned";
    } else if (metadataIpfsCid) {
      // Check availability on multiple gateways
      const { available, gatewaysUp } = await checkIpfsAvailability(metadataIpfsCid);
      metadataIpfsGatewaysUp = gatewaysUp;
      metadataIpfsPinStatus = available ? "available" : "unavailable";
    }
  } else if (metadataStorageType === "centralized") {
    metadataCentralizedDomain = extractDomain(metadataResult.metadataUrl || metadataResult.metadataUri) || undefined;
  }
  
  // Measure response time for centralized metadata (via a quick HEAD request)
  let metadataResponseTime: ResponseTimeAnalysis | undefined;
  if (metadataStorageType === "centralized" && metadataResult.metadataUrl) {
    const result = await fetchWithTiming(metadataResult.metadataUrl, { method: "HEAD" });
    if (result?.res.ok) {
      metadataResponseTime = analyzeResponseTime(result.responseTimeMs);
    }
  }
  
  // Analyze image
  let imageAnalysis: NftAuditResult["image"] | undefined;
  
  if (metadataResult.imageUri || metadataResult.imageUrl) {
    const imageStorageType = detectStorageType(metadataResult.imageUri || metadataResult.imageUrl);
    const isImageOnchain = metadataResult.imageUri?.startsWith("data:") ?? false;
    
    // Check IPFS pin status for image
    let imageIpfsCid: string | undefined;
    let imageIpfsPinStatus: IpfsPinStatus | undefined;
    let imageIpfsGatewaysUp: number | undefined;
    let imageCentralizedDomain: string | undefined;
    
    if (imageStorageType === "ipfs" && !isImageOnchain) {
      imageIpfsCid = extractIpfsCid(metadataResult.imageUri || metadataResult.imageUrl) || undefined;
      
      if (isFromPinningService(metadataResult.imageUrl || metadataResult.imageUri)) {
        imageIpfsPinStatus = "pinned";
      } else if (imageIpfsCid) {
        // Check availability on multiple gateways
        const { available, gatewaysUp } = await checkIpfsAvailability(imageIpfsCid);
        imageIpfsGatewaysUp = gatewaysUp;
        imageIpfsPinStatus = available ? "available" : "unavailable";
      }
    } else if (imageStorageType === "centralized") {
      imageCentralizedDomain = extractDomain(metadataResult.imageUrl || metadataResult.imageUri) || undefined;
    }
    
    // Initialize image analysis
    let imageResponseTime: ResponseTimeAnalysis | undefined;
    
    imageAnalysis = {
      ok: false,
      uri: metadataResult.imageUri,
      url: metadataResult.imageUrl,
      storageType: imageStorageType,
      isOnchain: isImageOnchain,
      ipfsCid: imageIpfsCid,
      ipfsPinStatus: imageIpfsPinStatus,
      ipfsGatewaysUp: imageIpfsGatewaysUp,
      centralizedDomain: imageCentralizedDomain,
    };
    
    // If on-chain, try to detect format from data URL
    if (isImageOnchain && metadataResult.imageUri) {
      const match = metadataResult.imageUri.match(/^data:([^;,]+)/);
      const mimeType = match?.[1] || null;
      imageAnalysis.format = detectImageFormat(mimeType);
      imageAnalysis.contentType = mimeType || undefined;
      imageAnalysis.ok = true;
    } else if (metadataResult.imageUrl) {
      // Fetch image headers to get format, size, AND response time in ONE request
      const headResult = await fetchWithTiming(metadataResult.imageUrl, { method: "HEAD" });
      
      if (headResult?.res.ok) {
        const contentType = headResult.res.headers.get("content-type");
        const contentLength = headResult.res.headers.get("content-length");
        const sizeBytes = contentLength ? parseInt(contentLength, 10) : undefined;
        
        imageAnalysis.ok = true;
        imageAnalysis.contentType = contentType || undefined;
        imageAnalysis.format = detectImageFormat(contentType);
        imageAnalysis.sizeBytes = sizeBytes;
        
        // Calculate response time analysis for centralized storage
        if (imageStorageType === "centralized") {
          imageResponseTime = analyzeResponseTime(headResult.responseTimeMs, sizeBytes);
        }
      } else {
        // Try GET with range to get magic bytes (fallback)
        try {
          const resGet = await fetch(metadataResult.imageUrl, {
            method: "GET",
            headers: { Range: "bytes=0-32" },
            signal: AbortSignal.timeout(5000),
          });
          
          if (resGet.ok || resGet.status === 206) {
            const contentType = resGet.headers.get("content-type");
            const contentRange = resGet.headers.get("content-range");
            const ab = await resGet.arrayBuffer();
            const magicBytes = Buffer.from(ab);
            
            imageAnalysis.ok = true;
            imageAnalysis.contentType = contentType || undefined;
            imageAnalysis.format = detectImageFormat(contentType, magicBytes);
            
            // Parse content-range for total size: "bytes 0-32/12345"
            if (contentRange) {
              const sizeMatch = contentRange.match(/\/(\d+)$/);
              if (sizeMatch) {
                imageAnalysis.sizeBytes = parseInt(sizeMatch[1], 10);
              }
            }
          } else {
            imageAnalysis.error = `Image fetch failed (${resGet.status})`;
          }
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : "Unknown error";
          imageAnalysis.error = msg;
        }
      }
    }
    
    // Add response time to image analysis
    if (imageResponseTime) {
      imageAnalysis.responseTime = imageResponseTime;
    }
  }

  return {
    ok: true,
    metadata: {
      ok: true,
      uri: metadataResult.metadataUri,
      url: metadataResult.metadataUrl,
      storageType: metadataStorageType,
      isOnchain: metadataResult.metadataUri.startsWith("data:"),
      ipfsCid: metadataIpfsCid,
      ipfsPinStatus: metadataIpfsPinStatus,
      ipfsGatewaysUp: metadataIpfsGatewaysUp,
      centralizedDomain: metadataCentralizedDomain,
      responseTime: metadataResponseTime,
      raw: metadataResult.metadata,
    },
    image: imageAnalysis,
  };
}

export async function checkNftStatus(chain: string, contract: string, tokenId: string, options?: { refresh?: boolean }): Promise<NftStatusResult> {
  // Use the audit function internally for detailed analysis
  const audit = await auditNft(chain, contract, tokenId, options);
  
  if (!audit.ok) {
    return {
      ok: false,
      metadataOk: false,
      imageOk: false,
      error: audit.error,
      errorSource: audit.errorSource,
      isTransient: audit.isTransient,
    };
  }

  const imageOk = audit.image?.ok ?? true; // No image = ok
  const imageError = audit.image?.error;
  const imageErrorSource: ErrorSource | undefined = imageError ? "image_fetch" : undefined;

  return {
    ok: true,
    metadataOk: true,
    imageOk,
    imageError,
    imageErrorSource,
    metadataStorage: audit.metadata?.storageType,
    imageStorage: audit.image?.storageType,
    imageFormat: audit.image?.format,
    imageSizeBytes: audit.image?.sizeBytes,
    metadataIpfsPinStatus: audit.metadata?.ipfsPinStatus,
    imageIpfsPinStatus: audit.image?.ipfsPinStatus,
    metadataUri: audit.metadata?.url || audit.metadata?.uri,
    imageUri: audit.image?.url || audit.image?.uri,
    metadataResponseTimeMs: audit.metadata?.responseTime?.responseTimeMs,
    metadataIsSlow: audit.metadata?.responseTime?.isSlow,
    imageResponseTimeMs: audit.image?.responseTime?.responseTimeMs,
    imageIsSlow: audit.image?.responseTime?.isSlow,
  };
}
