import { BigNumber, ethers } from "ethers";

import { LruTtlCache } from "@/lib/cache/lru";
import { resolveErc1155TemplateUri } from "@/lib/nft/erc1155";
import { ipfsToHttp } from "@/lib/nft/ipfs";
import { resolveTokenMetadataUri } from "@/lib/nft/rpc";
import type { NftMetadataResult } from "@/lib/nft/types";

const isRecord = (v: unknown): v is Record<string, unknown> => (
  typeof v === "object" && v !== null
);

const pickImageField = (metadata: unknown): string | undefined => {
  if (!isRecord(metadata)) return undefined;
  const keys = ["image", "image_url", "imageUrl", "imageURI", "imageUri"] as const;
  for (const key of keys) {
    const val = metadata[key];
    if (typeof val === "string" && val.length > 0) return val;
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

const decodeDataUrl = (dataUrl: string) => {
  const match = dataUrl.match(/^data:([^;,]+)?(;base64)?,(.*)$/);
  if (!match) return null;
  const mime = match[1] || "application/octet-stream";
  const isBase64 = Boolean(match[2]);
  const dataPart = match[3] || "";
  const body = isBase64
    ? Buffer.from(dataPart, "base64")
    : Buffer.from(decodeURIComponent(dataPart), "utf8");
  return { mime, body };
};

export const resolveNftMetadata = async (params: {
  contract: string;
  tokenId: string;
  rpcUrlQuery: string | null;
  cacheTtlMs: number;
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
  const cacheKey = `${params.contract}:${tokenIdBn.toString()}`;
  const cached = metadataCache.get(cacheKey, nowMs);
  if (cached) return cached;

  const { metadataUri } = await resolveTokenMetadataUri({
    contract: params.contract,
    tokenId: tokenIdBn,
    rpcUrlQuery: params.rpcUrlQuery,
    cacheTtlMs: params.cacheTtlMs,
  });

  // tokenURI may itself be an onchain data: URL
  if (metadataUri.startsWith("data:")) {
    const decoded = decodeDataUrl(metadataUri);
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
      "User-Agent": "nft-api/1.0 (+https://vercel.com)",
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


