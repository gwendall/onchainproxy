import { LruTtlCache } from "@/lib/cache/lru";
import { getSharp } from "@/lib/image/sharp";
import { computeWeakEtag } from "@/lib/nft/etag";
export { decodeDataUrlToBuffer } from "@/lib/nft/dataUrl";

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

  const resizeToWebp = (input: Buffer) =>
    sharp(input)
      .resize({
        width: params.width,
        height: params.height,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: params.quality })
      .toBuffer();

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


