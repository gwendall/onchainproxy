import { BigNumber, ethers } from "ethers";

import { LruTtlCache } from "@/lib/cache/lru";
import { resolveErc1155TemplateUri } from "@/lib/nft/erc1155";

const ERC721_ABI = ["function tokenURI(uint256 tokenId) view returns (string)"];
const ERC1155_ABI = ["function uri(uint256 id) view returns (string)"];

const defaultRpcUrls = [
  "https://ethereum.publicnode.com",
  // Some providers require API keys; keep defaults to keyless endpoints.
  "https://rpc.flashbots.net",
  "https://eth.llamarpc.com",
  "https://1rpc.io/eth",
  "https://cloudflare-eth.com",
];

const getRpcUrls = (rpcUrlQuery: string | null) => {
  const unique: string[] = [];
  const add = (url: string) => {
    if (!url) return;
    if (!unique.includes(url)) unique.push(url);
  };

  if (typeof rpcUrlQuery === "string" && rpcUrlQuery.length > 0) add(rpcUrlQuery);

  const env = process.env.NFT_RPC_URLS || process.env.NFT_RPC_URL;
  if (typeof env === "string" && env.length > 0) {
    for (const u of env.split(",").map((s) => s.trim()).filter((s) => s.length > 0)) add(u);
  }

  for (const u of defaultRpcUrls) add(u);
  return unique;
};

const tokenUriCache = new LruTtlCache<string, string>({
  maxEntries: 2000,
});

const erc721Iface = new ethers.utils.Interface(ERC721_ABI);
const erc1155Iface = new ethers.utils.Interface(ERC1155_ABI);

const fetchWithTimeout = async (url: string, init: RequestInit & { timeoutMs: number }) => {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), init.timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(t);
  }
};

type JsonRpcErrorShape = {
  code?: unknown;
  message?: unknown;
};

const jsonRpcCall = async (params: {
  rpcUrl: string;
  method: string;
  rpcParams: unknown[];
  timeoutMs: number;
}) => {
  const resp = await fetchWithTimeout(params.rpcUrl, {
    timeoutMs: params.timeoutMs,
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: params.method,
      params: params.rpcParams,
    }),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    const err = new Error(`RPC HTTP ${resp.status}`);
    (err as unknown as { cause?: unknown }).cause = text;
    throw err;
  }

  const json = (await resp.json()) as unknown as {
    result?: unknown;
    error?: JsonRpcErrorShape;
  };

  if (json && typeof json === "object" && json.error) {
    const msg = typeof json.error.message === "string" ? json.error.message : "RPC error";
    const err = new Error(msg);
    (err as unknown as { code?: unknown }).code = json.error.code;
    throw err;
  }

  return json.result;
};

const isNetworkishError = (e: unknown) => {
  if (!(e instanceof Error)) return false;
  const msg = e.message.toLowerCase();
  return (
    msg.includes("timeout")
    || msg.includes("aborted")
    || msg.includes("fetch")
    || msg.includes("network")
    || msg.includes("rpc http")
  );
};

const shouldTryErc1155Fallback = (e: unknown) => {
  if (!(e instanceof Error)) return false;
  const msg = e.message.toLowerCase();
  // If the RPC transport is failing, don't fallback; just try another RPC.
  if (isNetworkishError(e)) return false;
  // Otherwise, reverts / unsupported selectors often show up as "execution reverted" / "revert".
  return msg.includes("revert") || msg.includes("execution reverted") || msg.includes("call exception");
};

export const resolveTokenMetadataUri = async (params: {
  contract: string;
  tokenId: BigNumber;
  rpcUrlQuery: string | null;
  cacheTtlMs: number;
}) => {
  const nowMs = Date.now();
  const cacheKey = `${params.contract}:${params.tokenId.toString()}`;
  const cached = tokenUriCache.get(cacheKey, nowMs);
  if (cached) return { metadataUri: cached, rpcUrl: "cache" };

  const rpcUrls = getRpcUrls(params.rpcUrlQuery);

  const attempts: Array<{ url: string; error: string }> = [];
  let lastRpcError: unknown;
  for (const url of rpcUrls) {
    try {
      // Try ERC-721 first.
      try {
        const data = erc721Iface.encodeFunctionData("tokenURI", [params.tokenId]);
        const result = await jsonRpcCall({
          rpcUrl: url,
          method: "eth_call",
          rpcParams: [{ to: params.contract, data }, "latest"],
          timeoutMs: 10_000,
        });
        if (typeof result !== "string") throw new Error("Bad RPC result");
        const decoded = erc721Iface.decodeFunctionResult("tokenURI", result);
        const metadataUri = String(decoded[0]);
        tokenUriCache.set(cacheKey, metadataUri, params.cacheTtlMs, nowMs);
        return { metadataUri, rpcUrl: url };
      } catch (e) {
        if (!shouldTryErc1155Fallback(e)) throw e;
        const data = erc1155Iface.encodeFunctionData("uri", [params.tokenId]);
        const result = await jsonRpcCall({
          rpcUrl: url,
          method: "eth_call",
          rpcParams: [{ to: params.contract, data }, "latest"],
          timeoutMs: 10_000,
        });
        if (typeof result !== "string") throw new Error("Bad RPC result");
        const decoded = erc1155Iface.decodeFunctionResult("uri", result);
        let metadataUri = String(decoded[0]);
        metadataUri = resolveErc1155TemplateUri(metadataUri, params.tokenId);
        tokenUriCache.set(cacheKey, metadataUri, params.cacheTtlMs, nowMs);
        return { metadataUri, rpcUrl: url };
      }
    } catch (e) {
      lastRpcError = e;
      attempts.push({ url, error: String(e) });
    }
  }

  const error = new Error("Failed to resolve token metadata URI");
  (error as unknown as { cause?: unknown }).cause = { last: lastRpcError, attempts };
  throw error;
};


