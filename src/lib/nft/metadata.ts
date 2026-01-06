import { BigNumber, ethers } from "ethers";

import { LruTtlCache } from "@/lib/cache/lru";
import { decodeDataUrlToBuffer } from "@/lib/nft/dataUrl";
import { resolveErc1155TemplateUri } from "@/lib/nft/erc1155";
import { ipfsToHttp } from "@/lib/nft/ipfs";
import { resolveTokenMetadataUri } from "@/lib/nft/rpc";
import type { SupportedChain } from "@/lib/nft/chain";
import type { NftMetadataResult } from "@/lib/nft/types";

const isRecord = (v: unknown): v is Record<string, unknown> => (
  typeof v === "object" && v !== null
);

const pickImageField = (metadata: unknown): string | undefined => {
  if (!isRecord(metadata)) return undefined;
  // First check for standard URL-based image fields
  const urlKeys = ["image", "image_url", "imageUrl", "imageURI", "imageUri"] as const;
  for (const key of urlKeys) {
    const val = metadata[key];
    if (typeof val === "string" && val.length > 0) return val;
  }
  // Check for inline image data (e.g. Pak's "merge" NFTs use image_data with raw SVG)
  const imageData = metadata["image_data"];
  if (typeof imageData === "string" && imageData.length > 0) {
    // If it's already a data URL, return as-is
    if (imageData.startsWith("data:")) return imageData;
    // If it looks like SVG, wrap in a data URL
    const trimmed = imageData.trimStart();
    if (trimmed.startsWith("<svg") || trimmed.startsWith("<?xml")) {
      return `data:image/svg+xml;base64,${Buffer.from(imageData).toString("base64")}`;
    }
    // For other inline data, assume it's already encoded or return as-is
    return imageData;
  }
  return undefined;
};

const fetchWithTimeout = async (url: string, init: RequestInit & { timeoutMs: number }) => {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), init.timeoutMs);
  try {
    const resp = await fetch(url, { ...init, signal: controller.signal });
    return resp;
  } finally {
    clearTimeout(t);
  }
};

const metadataCache = new LruTtlCache<string, NftMetadataResult>({
  maxEntries: 2000,
});

export const resolveNftMetadata = async (params: {
  chain: SupportedChain;
  contract: string;
  tokenId: string;
  rpcUrlQuery: string | null;
  cacheTtlMs: number;
  skipCache?: boolean;
}): Promise<NftMetadataResult> => {
  if (!ethers.utils.isAddress(params.contract)) {
    throw new Error("Invalid contract");
  }
  let tokenIdBn: BigNumber;
  try {
    tokenIdBn = BigNumber.from(params.tokenId);
  } catch {
    throw new Error("Invalid tokenId");
  }

  const nowMs = Date.now();
  const cacheKey = `${params.chain}:${params.contract}:${tokenIdBn.toString()}`;
  if (!params.skipCache) {
    const cached = metadataCache.get(cacheKey, nowMs);
    if (cached) return cached;
  }

  const { metadataUri } = await resolveTokenMetadataUri({
    chain: params.chain,
    contract: params.contract,
    tokenId: tokenIdBn,
    rpcUrlQuery: params.rpcUrlQuery,
    cacheTtlMs: params.cacheTtlMs,
  });

  // tokenURI may itself be an onchain data: URL
  if (metadataUri.startsWith("data:")) {
    const decoded = decodeDataUrlToBuffer(metadataUri);
    if (!decoded) throw new Error("Bad metadata data URL");
    const text = decoded.body.toString("utf8");
    const json = JSON.parse(text) as unknown;
    const imageUri = pickImageField(json);
    const imageUrl = imageUri
      ? ipfsToHttp(resolveErc1155TemplateUri(imageUri, tokenIdBn))
      : undefined;
    const result: NftMetadataResult = {
      contract: params.contract,
      tokenId: tokenIdBn.toString(),
      metadataUri,
      metadataUrl: metadataUri,
      metadata: json,
      imageUri,
      imageUrl,
    };
    metadataCache.set(cacheKey, result, params.cacheTtlMs, nowMs);
    return result;
  }

  const metadataUrl = ipfsToHttp(metadataUri);
  if (!metadataUrl) throw new Error("No metadata URL");

  const resp = await fetchWithTimeout(metadataUrl, {
    timeoutMs: 10_000,
    headers: {
      Accept: "application/json",
      "User-Agent": "nftproxy/1.0",
    },
    // Never rely on Next fetch caching for this: we cache at CDN + our own LRU.
    cache: "no-store",
  });

  if (!resp.ok) {
    throw new Error(`Metadata fetch failed (${resp.status})`);
  }

  const json = (await resp.json()) as unknown;
  const imageUri = pickImageField(json);
  const imageUrl = imageUri
    ? ipfsToHttp(resolveErc1155TemplateUri(imageUri, tokenIdBn))
    : undefined;

  const result: NftMetadataResult = {
    contract: params.contract,
    tokenId: tokenIdBn.toString(),
    metadataUri,
    metadataUrl,
    metadata: json,
    imageUri,
    imageUrl,
  };
  metadataCache.set(cacheKey, result, params.cacheTtlMs, nowMs);
  return result;
};


