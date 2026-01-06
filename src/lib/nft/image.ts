import { LruTtlCache } from "@/lib/cache/lru";
import { getSharp } from "@/lib/image/sharp";
import { computeWeakEtag } from "@/lib/nft/etag";

type FetchImageResult = {
  contentType: string;
  body: Buffer;
};

const startsWithAscii = (buf: Buffer, ascii: string) => {
  if (buf.length < ascii.length) return false;
  return buf.toString("ascii", 0, ascii.length) === ascii;
};

const looksLikeGif = (buf: Buffer) => startsWithAscii(buf, "GIF87a") || startsWithAscii(buf, "GIF89a");

const looksLikeSvg = (buf: Buffer) => {
  // Very cheap sniff: check first ~1KB for an <svg ...> tag (after trimming BOM/whitespace).
  const head = buf.subarray(0, 1024).toString("utf8").trimStart();
  return head.startsWith("<svg") || head.startsWith("<?xml") && head.includes("<svg");
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

export const fetchImageBuffer = async (params: {
  url: string;
  cacheTtlMs: number;
  skipCache?: boolean;
}) => {
  const nowMs = Date.now();
  if (!params.skipCache) {
    const cached = imageFetchCache.get(params.url, nowMs);
    if (cached) return cached;
  }

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
  allowSvgRasterize?: boolean;
  backgroundColor?: string;
}) => {
  const safeContentType = typeof params.inputContentType === "string" ? params.inputContentType : "";
  const ct = safeContentType.toLowerCase();

  const isSvg = ct.includes("image/svg") || (ct.length === 0 || ct.includes("octet-stream")) && looksLikeSvg(params.input);
  const isGif = ct.includes("image/gif") || (ct.length === 0 || ct.includes("octet-stream")) && looksLikeGif(params.input);

  // Some gateways (esp. IPFS) serve images as `application/octet-stream` (or omit content-type).
  // sharp can still decode based on magic bytes, so treat "unknown" as possibly-image.
  const isImageish = ct.startsWith("image/") || ct.length === 0 || ct.includes("octet-stream");

  if ((isSvg && !params.allowSvgRasterize) || isGif || !isImageish) return null;

  const inputId = computeWeakEtag(params.input);
  const key = `${params.width}x${params.height}:q${params.quality}:svg${params.allowSvgRasterize ? 1 : 0}:${safeContentType}:${inputId}`;
  const nowMs = Date.now();
  const cached = imageTransformCache.get(key, nowMs);
  if (cached) return cached;

  const sharp = await getSharp();
  if (!sharp) return null;

  const resizeToWebp = (input: Buffer) => {
    let pipe = sharp(input)
      .resize({
        width: params.width,
        height: params.height,
        fit: "inside",
        // For raster inputs, avoid upscaling.
        // For SVGs, upscaling is expected (vector), otherwise thumbnails can end up tiny.
        withoutEnlargement: !isSvg,
      });

    // If requested (e.g. CryptoPunks), fill transparent pixels with a known background color.
    if (params.backgroundColor && params.backgroundColor.trim().length > 0) {
      pipe = pipe.flatten({ background: params.backgroundColor.trim() });
    }

    return pipe
      .webp(
        isSvg
          // SVG -> lossless WebP to avoid compression artifacts (sharp edges, flat colors).
          ? { lossless: true, quality: 100 }
          : { quality: params.quality },
      )
      .toBuffer();
  };

  let output: Buffer | null = null;
  try {
    output = await resizeToWebp(params.input);
  } catch {
    // Some builds of sharp/libvips don't support BMP, but Ethereum NFTs sometimes embed BMP in data: URLs (e.g. Moonbirds).
    // Fallback: decode BMP in pure JS, then feed raw RGBA pixels into sharp.
    if (safeContentType.includes("image/bmp")) {
      try {
        const bmpMod = (await import("bmp-js")) as unknown as {
          decode: (buf: Buffer) => { data: Uint8Array; width: number; height: number };
        };
        const decoded = bmpMod.decode(params.input);
        // bmp-js outputs pixels as A,B,G,R (alpha first). sharp expects raw RGBA.
        // Also, for BMPs without alpha, bmp-js sets alpha to 0 — force it to 255 to avoid weird rendering.
        const abgr = Buffer.from(decoded.data);

        const bitPP = (() => {
          try {
            if (params.input.length < 30) return null;
            if (params.input.toString("ascii", 0, 2) !== "BM") return null;
            return params.input.readUInt16LE(28);
          } catch {
            return null;
          }
        })();

        const rgba = Buffer.allocUnsafe(abgr.length);

        let alphaAllZero = true;
        if (bitPP === 32) {
          for (let i = 0; i + 3 < abgr.length; i += 4) {
            if (abgr[i] !== 0) {
              alphaAllZero = false;
              break;
            }
          }
        }

        const forceOpaque = bitPP !== 32 || alphaAllZero;

        for (let i = 0; i + 3 < abgr.length; i += 4) {
          const a = forceOpaque ? 255 : abgr[i];
          const b = abgr[i + 1];
          const g = abgr[i + 2];
          const r = abgr[i + 3];
          rgba[i] = r;
          rgba[i + 1] = g;
          rgba[i + 2] = b;
          rgba[i + 3] = a;
        }

        output = await sharp(rgba, {
          raw: {
            width: decoded.width,
            height: decoded.height,
            channels: 4,
          },
        })
          .resize({
            width: params.width,
            height: params.height,
            fit: "inside",
            withoutEnlargement: true,
          })
          .webp({ quality: params.quality })
          .toBuffer();
      } catch {
        // If the fallback fails, just skip transforming (the route will passthrough).
        output = null;
      }
    } else {
      // Unknown decode issue: skip transforming (passthrough).
      output = null;
    }
  }

  if (!output) return null;

  imageTransformCache.set(key, output, params.cacheTtlMs, nowMs);
  return output;
};


