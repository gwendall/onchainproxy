import { LruTtlCache } from "@/lib/cache/lru";
import { getSharp } from "@/lib/image/sharp";
import { computeWeakEtag } from "@/lib/nft/etag";

type FetchImageResult = {
  contentType: string;
  body: Buffer;
};

const imageFetchCache = new LruTtlCache<string, FetchImageResult>({
  maxEntries: 500,
});

const fetchWithTimeout = async (url: string, timeoutMs: number) => {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      cache: "no-store",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(t);
  }
};

export const decodeDataUrlToBuffer = (dataUrl: string) => {
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

export const fetchImageBuffer = async (params: {
  url: string;
  cacheTtlMs: number;
}) => {
  const nowMs = Date.now();
  const cached = imageFetchCache.get(params.url, nowMs);
  if (cached) return cached;

  const resp = await fetchWithTimeout(params.url, 15_000);
  if (!resp.ok) throw new Error(`Image fetch failed (${resp.status})`);

  const contentType = resp.headers.get("content-type") || "";
  const ab = await resp.arrayBuffer();
  const body = Buffer.from(ab);

  const result: FetchImageResult = { contentType, body };
  imageFetchCache.set(params.url, result, params.cacheTtlMs, nowMs);
  return result;
};

const imageTransformCache = new LruTtlCache<string, Buffer>({
  maxEntries: 500,
});

export const maybeResizeToWebp = async (params: {
  input: Buffer;
  inputContentType: string;
  width: number;
  height: number;
  quality: number;
  cacheTtlMs: number;
}) => {
  const safeContentType = typeof params.inputContentType === "string" ? params.inputContentType : "";
  const isSvg = safeContentType.includes("image/svg");
  const isGif = safeContentType.includes("image/gif");
  const isImage = safeContentType.startsWith("image/");

  if (isSvg || isGif || !isImage) return null;

  const inputId = computeWeakEtag(params.input);
  const key = `${params.width}x${params.height}:q${params.quality}:${safeContentType}:${inputId}`;
  const nowMs = Date.now();
  const cached = imageTransformCache.get(key, nowMs);
  if (cached) return cached;

  const sharp = await getSharp();
  if (!sharp) return null;

  const output = await sharp(params.input)
    .resize({
      width: params.width,
      height: params.height,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: params.quality })
    .toBuffer();

  imageTransformCache.set(key, output, params.cacheTtlMs, nowMs);
  return output;
};


