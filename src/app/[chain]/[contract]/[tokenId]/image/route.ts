import { ethers } from "ethers";
import { NextResponse, type NextRequest } from "next/server";

import { normalizeChain, supportedChainsHint } from "@/lib/nft/chain";
import { decodeDataUrlToBuffer } from "@/lib/nft/dataUrl";
import { computeWeakEtag, maybeNotModified } from "@/lib/nft/etag";
import { clampInt, jsonError, sendSvgFallback, setCacheControl } from "@/lib/nft/http";
import { fetchImageBuffer, maybeResizeToWebp } from "@/lib/nft/image";
import { resolveNftMetadata } from "@/lib/nft/metadata";

export const runtime = "nodejs";

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

const pickTokenName = (metadata: unknown): string | null => {
  if (!isRecord(metadata)) return null;
  const name = metadata["name"];
  return typeof name === "string" && name.trim().length > 0 ? name.trim() : null;
};

const slugify = (input: string) => {
  const s = input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // diacritics
    .replace(/[^\x20-\x7E]/g, "") // non-ascii
    .trim()
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return s.length > 0 ? s : "nft";
};

const extFromContentType = (contentType: string) => {
  const ct = (contentType || "").toLowerCase();
  if (ct.includes("image/webp")) return "webp";
  if (ct.includes("image/png")) return "png";
  if (ct.includes("image/jpeg") || ct.includes("image/jpg")) return "jpg";
  if (ct.includes("image/gif")) return "gif";
  if (ct.includes("image/svg")) return "svg";
  if (ct.includes("image/bmp")) return "bmp";
  if (ct.includes("image/avif")) return "avif";
  return "bin";
};

const setInlineFilename = (headers: Headers, filenameBase: string, tokenId: string, contentType: string) => {
  const ext = extFromContentType(contentType);
  const base = filenameBase || "nft";
  // Avoid doubling the tokenId when metadata name already contains it (e.g. "meebit-14076").
  const needsTokenSuffix = !(base === tokenId || base.endsWith(`-${tokenId}`) || base.endsWith(tokenId));
  const fullBase = needsTokenSuffix ? `${base}-${tokenId}` : base;
  // inline keeps normal rendering, but browsers often reuse filename on "Save image as..."
  headers.set("Content-Disposition", `inline; filename="${fullBase}.${ext}"`);
};

const debugError = (e: unknown) => {
  if (e instanceof Error) {
    const anyErr = e as unknown as { cause?: unknown };
    const cause = (() => {
      const c = anyErr.cause;
      if (c === undefined) return undefined;
      if (c === null) return null;
      if (typeof c === "string" || typeof c === "number" || typeof c === "boolean") return c;
      try {
        return JSON.parse(JSON.stringify(c));
      } catch {
        return String(c);
      }
    })();
    return {
      name: e.name,
      message: e.message,
      cause,
      stack: e.stack,
    };
  }
  return { message: String(e) };
};

export const GET = async (
  request: NextRequest,
  ctx: { params: Promise<unknown> },
) => {
  try {
    const { chain: rawChain, contract: rawContract, tokenId: rawTokenId } = (await ctx.params) as {
      chain: string;
      contract: string;
      tokenId: string;
    };
    const chain = normalizeChain(rawChain);
    if (!chain) return sendSvgFallback(400, `Unsupported chain (use ${supportedChainsHint()})`);

    const contract = decodeURIComponent(rawContract).trim();
    const tokenId = decodeURIComponent(rawTokenId).trim();
    if (!ethers.utils.isAddress(contract)) return sendSvgFallback(400, "Invalid contract");

    const search = request.nextUrl.searchParams;
    const rpcUrl = search.get("rpcUrl");
    const raw = search.get("raw"); // "1" to return the original bytes (no transform)
    const wantOriginal = raw === "1";
    // By default we rasterize SVGs to WebP for thumbnail friendliness.
    // Use raw=1 to get the original SVG, or svg=1 to force passthrough SVG without redirect.
    const svg = search.get("svg");
    const forceSvg = svg === "1";
    const allowSvgRasterize = !wantOriginal && !forceSvg;

    const cacheSeconds = 60 * 60 * 24; // 1 day
    const lruTtlMs = 5 * 60 * 1000; // 5 min per instance

    const width = clampInt(search.get("w"), 16, 2048, 512);
    const height = clampInt(search.get("h"), 16, 2048, 512);
    const quality = clampInt(search.get("q"), 30, 90, 70);

    const meta = await resolveNftMetadata({
      chain,
      contract,
      tokenId,
      rpcUrlQuery: rpcUrl,
      cacheTtlMs: lruTtlMs,
    });

    const imageUrl = meta.imageUrl;
    if (!imageUrl) return sendSvgFallback(404, "No image");

    const tokenName = pickTokenName(meta.metadata);
    const filenameBase = slugify(tokenName ?? contract.slice(0, 6));

    if (wantOriginal) {
      // Redirect when possible, but for data: URLs return the bytes directly.
      if (!imageUrl.startsWith("data:")) {
        const resp = NextResponse.redirect(imageUrl, 302);
        setCacheControl(resp.headers, cacheSeconds);
        return resp;
      }
    }

    if (imageUrl.startsWith("data:")) {
      const decoded = decodeDataUrlToBuffer(imageUrl);
      if (!decoded) return sendSvgFallback(400, "Bad data URL");

      const transformed = await maybeResizeToWebp({
        input: decoded.body,
        inputContentType: decoded.mime,
        width,
        height,
        quality,
        cacheTtlMs: lruTtlMs,
        allowSvgRasterize,
      });

      // If sharp isn't available or content-type is excluded (svg/gif/etc), just passthrough.
      if (!transformed || wantOriginal) {
        const etag = computeWeakEtag(decoded.body);
        if (maybeNotModified(request, etag)) {
          const headers = new Headers();
          headers.set("ETag", etag);
          setCacheControl(headers, cacheSeconds);
          return new Response(null, { status: 304, headers });
        }
        const headers = new Headers();
        headers.set("Content-Type", decoded.mime);
        headers.set("ETag", etag);
        setCacheControl(headers, cacheSeconds);
        setInlineFilename(headers, filenameBase, tokenId, decoded.mime);
        return new Response(new Uint8Array(decoded.body), { status: 200, headers });
      }

      const etag = computeWeakEtag(transformed);
      if (maybeNotModified(request, etag)) {
        const headers = new Headers();
        headers.set("ETag", etag);
        setCacheControl(headers, cacheSeconds);
        return new Response(null, { status: 304, headers });
      }
      const headers = new Headers();
      headers.set("Content-Type", "image/webp");
      headers.set("ETag", etag);
      setCacheControl(headers, cacheSeconds);
      setInlineFilename(headers, filenameBase, tokenId, "image/webp");
      return new Response(new Uint8Array(transformed), { status: 200, headers });
    }

    const fetched = await fetchImageBuffer({
      url: imageUrl,
      cacheTtlMs: lruTtlMs,
    });

    const transformed = await maybeResizeToWebp({
      input: fetched.body,
      inputContentType: fetched.contentType,
      width,
      height,
      quality,
      cacheTtlMs: lruTtlMs,
      allowSvgRasterize,
    });

    if (!transformed) {
      const etag = computeWeakEtag(fetched.body);
      if (maybeNotModified(request, etag)) {
        const headers = new Headers();
        headers.set("ETag", etag);
        setCacheControl(headers, cacheSeconds);
        return new Response(null, { status: 304, headers });
      }

      const headers = new Headers();
      if (fetched.contentType) headers.set("Content-Type", fetched.contentType);
      headers.set("ETag", etag);
      setCacheControl(headers, cacheSeconds);
      setInlineFilename(headers, filenameBase, tokenId, fetched.contentType);
      return new Response(new Uint8Array(fetched.body), { status: 200, headers });
    }

    const etag = computeWeakEtag(transformed);
    if (maybeNotModified(request, etag)) {
      const headers = new Headers();
      headers.set("ETag", etag);
      setCacheControl(headers, cacheSeconds);
      return new Response(null, { status: 304, headers });
    }

    const headers = new Headers();
    headers.set("Content-Type", "image/webp");
    headers.set("ETag", etag);
    setCacheControl(headers, cacheSeconds);
    setInlineFilename(headers, filenameBase, tokenId, "image/webp");
    return new Response(new Uint8Array(transformed), { status: 200, headers });
  } catch (e) {
    console.error("[image] failed", e);
    // Keep it image-shaped for consumers.
    const msg = e instanceof Error ? e.message : "";
    if (msg === "Invalid tokenId" || msg === "Invalid contract") return sendSvgFallback(400, msg);
    if (process.env.NODE_ENV !== "production" && request.nextUrl.searchParams.get("debug") === "1") {
      const headers = new Headers();
      headers.set("Content-Type", "application/json; charset=utf-8");
      return new Response(JSON.stringify({ error: "Image error", debug: debugError(e) }), {
        status: 500,
        headers,
      });
    }
    if (request.nextUrl.searchParams.get("json") === "1") return jsonError(500, "Image error");
    return sendSvgFallback(500, "Image error");
  }
};


