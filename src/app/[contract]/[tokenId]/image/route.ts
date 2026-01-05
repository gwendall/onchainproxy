import { ethers } from "ethers";
import { NextResponse, type NextRequest } from "next/server";

import { computeWeakEtag, maybeNotModified } from "@/lib/nft/etag";
import { clampInt, jsonError, sendSvgFallback, setCacheControl } from "@/lib/nft/http";
import { fetchImageBuffer, maybeResizeToWebp } from "@/lib/nft/image";
import { decodeDataUrlToBuffer } from "@/lib/nft/dataUrl";
import { resolveNftMetadata } from "@/lib/nft/metadata";

export const runtime = "nodejs";

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
  ctx: { params: Promise<{ contract: string; tokenId: string }> },
) => {
  try {
    const { contract: rawContract, tokenId: rawTokenId } = await ctx.params;
    const contract = decodeURIComponent(rawContract).trim();
    const tokenId = decodeURIComponent(rawTokenId).trim();
    if (!ethers.utils.isAddress(contract)) return sendSvgFallback(400, "Invalid contract");

    const search = request.nextUrl.searchParams;
    const rpcUrl = search.get("rpcUrl");
    const raw = search.get("raw"); // "1" / "true" to return the original bytes (no transform)
    const wantOriginal = raw === "1" || raw === "true" || raw === "yes";

    const cacheSeconds = 60 * 60 * 24; // 1 day
    const lruTtlMs = 5 * 60 * 1000; // 5 min per instance

    const width = clampInt(search.get("w"), 16, 2048, 512);
    const height = clampInt(search.get("h"), 16, 2048, 512);
    const quality = clampInt(search.get("q"), 30, 90, 70);

    const meta = await resolveNftMetadata({
      contract,
      tokenId,
      rpcUrlQuery: rpcUrl,
      cacheTtlMs: lruTtlMs,
    });

    const imageUrl = meta.imageUrl;
    if (!imageUrl) return sendSvgFallback(404, "No image");

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


