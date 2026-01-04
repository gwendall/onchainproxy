import type { NextRequest } from "next/server";

import { setCacheControl } from "@/lib/nft/http";

export const runtime = "nodejs";

export const GET = async (
  request: NextRequest,
  ctx: { params: Promise<{ contract: string; tokenId: string }> },
) => {
  const { contract, tokenId } = await ctx.params;
  const targetUrl = new URL(`/${contract}/${tokenId}/image`, request.url);
  request.nextUrl.searchParams.forEach((v, k) => targetUrl.searchParams.set(k, v));

  const resp = Response.redirect(targetUrl, 308);
  setCacheControl(resp.headers, 60 * 60); // cache redirects for 1h
  return resp;
};


