import { ethers } from "ethers";
import type { NextRequest } from "next/server";

import { normalizeChain, supportedChainsHint } from "@/lib/nft/chain";
import { computeWeakEtag, maybeNotModified } from "@/lib/nft/etag";
import { jsonError, setCacheControl } from "@/lib/nft/http";
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
  ctx: { params: Promise<unknown> },
) => {
  try {
    const { chain: rawChain, contract: rawContract, tokenId: rawTokenId } = (await ctx.params) as {
      chain: string;
      contract: string;
      tokenId: string;
    };
    const chain = normalizeChain(rawChain);
    if (!chain) return jsonError(400, `Unsupported chain (use ${supportedChainsHint()})`);

    const contract = decodeURIComponent(rawContract).trim();
    const tokenId = decodeURIComponent(rawTokenId).trim();
    if (!ethers.utils.isAddress(contract)) return jsonError(400, "Invalid contract");

    const rpcUrl = request.nextUrl.searchParams.get("rpcUrl");
    const refresh = request.nextUrl.searchParams.get("refresh") === "1";
    const cacheSeconds = 60 * 60 * 24; // 1 day
    const lruTtlMs = 5 * 60 * 1000; // 5 min per instance

    const result = await resolveNftMetadata({
      chain,
      contract,
      tokenId,
      rpcUrlQuery: rpcUrl,
      cacheTtlMs: lruTtlMs,
      skipCache: refresh,
    });

    const body = Buffer.from(JSON.stringify(result), "utf8");
    const etag = computeWeakEtag(body);
    if (!refresh && maybeNotModified(request, etag)) {
      const headers = new Headers();
      headers.set("ETag", etag);
      setCacheControl(headers, cacheSeconds, refresh);
      return new Response(null, { status: 304, headers });
    }

    const headers = new Headers();
    headers.set("Content-Type", "application/json; charset=utf-8");
    headers.set("ETag", etag);
    setCacheControl(headers, cacheSeconds, refresh);
    return new Response(body, { status: 200, headers });
  } catch (e) {
    console.error("[metadata] failed", e);
    if (process.env.NODE_ENV !== "production" && request.nextUrl.searchParams.get("debug") === "1") {
      const headers = new Headers();
      headers.set("Content-Type", "application/json; charset=utf-8");
      return new Response(JSON.stringify({ error: "Metadata error", debug: debugError(e) }), {
        status: 500,
        headers,
      });
    }
    const msg = e instanceof Error ? e.message : "";
    if (msg === "Invalid tokenId" || msg === "Invalid contract") return jsonError(400, msg);
    return jsonError(500, "Metadata error");
  }
};


