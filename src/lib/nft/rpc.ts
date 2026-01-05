import { BigNumber, ethers } from "ethers";

import { LruTtlCache } from "@/lib/cache/lru";
import { resolveErc1155TemplateUri } from "@/lib/nft/erc1155";
import { CRYPTOPUNKS_DATA_CONTRACT, isCryptoPunksContract } from "@/lib/nft/punks";
import type { SupportedChain } from "@/lib/nft/chain";

const ERC721_ABI = ["function tokenURI(uint256 tokenId) view returns (string)"];
const ERC1155_ABI = ["function uri(uint256 id) view returns (string)"];

// CryptoPunks are pre-ERC721. We read SVG + attributes from CryptoPunksData.
const PUNKS_DATA_ABI = [
  "function punkImageSvg(uint16 index) view returns (string)",
  "function punkAttributes(uint16 index) view returns (string)",
];

const defaultRpcUrlsByChain: Record<SupportedChain, string[]> = {
  eth: [
    "https://ethereum.publicnode.com",
    // Some providers require API keys; keep defaults to keyless endpoints.
    "https://rpc.flashbots.net",
    "https://eth.llamarpc.com",
    "https://1rpc.io/eth",
    "https://cloudflare-eth.com",
  ],
  arb: [
    "https://arbitrum-one.publicnode.com",
    "https://arb1.arbitrum.io/rpc",
    "https://arbitrum.llamarpc.com",
    "https://1rpc.io/arb",
  ],
  op: [
    "https://optimism.publicnode.com",
    "https://mainnet.optimism.io",
    "https://optimism.llamarpc.com",
    "https://1rpc.io/op",
  ],
  base: [
    "https://base.publicnode.com",
    "https://mainnet.base.org",
    "https://base.llamarpc.com",
    "https://1rpc.io/base",
  ],
  polygon: [
    "https://polygon-bor.publicnode.com",
    "https://polygon-rpc.com",
    "https://polygon.llamarpc.com",
    "https://1rpc.io/matic",
  ],
  zksync: [
    "https://mainnet.era.zksync.io",
    "https://zksync-era.publicnode.com",
  ],
  linea: [
    "https://rpc.linea.build",
    "https://linea.publicnode.com",
  ],
  scroll: [
    "https://rpc.scroll.io",
    "https://scroll.publicnode.com",
  ],
  "polygon-zkevm": [
    "https://zkevm-rpc.com",
    "https://polygon-zkevm.publicnode.com",
  ],
};

const envKeyForChain = (chain: SupportedChain) =>
  chain
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

const getRpcUrls = (rpcUrlQuery: string | null, chain: SupportedChain) => {
  const unique: string[] = [];
  const add = (url: string) => {
    if (!url) return;
    if (!unique.includes(url)) unique.push(url);
  };

  if (typeof rpcUrlQuery === "string" && rpcUrlQuery.length > 0) add(rpcUrlQuery);

  // Chain-specific env (preferred): ONCHAIN_RPC_URLS_ARB / ONCHAIN_RPC_URL_ARB, etc.
  {
    const suffix = envKeyForChain(chain);
    const env =
      process.env[`ONCHAIN_RPC_URLS_${suffix}`]
      || process.env[`ONCHAIN_RPC_URL_${suffix}`]
      // Backwards-compatible legacy envs (not documented).
      || process.env[`NFT_RPC_URLS_${suffix}`]
      || process.env[`NFT_RPC_URL_${suffix}`]
      || "";
    if (typeof env === "string" && env.length > 0) {
      for (const u of env.split(",").map((s) => s.trim()).filter((s) => s.length > 0)) add(u);
    }
  }

  // Backwards-compatible/global env (applies to all chains when set).
  {
    const env = process.env.ONCHAIN_RPC_URLS
      || process.env.ONCHAIN_RPC_URL
      // Backwards-compatible legacy envs (not documented).
      || process.env.NFT_RPC_URLS
      || process.env.NFT_RPC_URL
      || "";
    if (typeof env === "string" && env.length > 0) {
      for (const u of env.split(",").map((s) => s.trim()).filter((s) => s.length > 0)) add(u);
    }
  }

  for (const u of defaultRpcUrlsByChain[chain]) add(u);
  return unique;
};

const tokenUriCache = new LruTtlCache<string, string>({
  maxEntries: 2000,
});

const erc721Iface = new ethers.utils.Interface(ERC721_ABI);
const erc1155Iface = new ethers.utils.Interface(ERC1155_ABI);
const punksDataIface = new ethers.utils.Interface(PUNKS_DATA_ABI);

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

const toSvgDataUrl = (svgOrDataUrl: string) => {
  const s = String(svgOrDataUrl ?? "").trim();
  // Some implementations return a full data: URL already. If so, keep it as-is.
  if (s.toLowerCase().startsWith("data:")) return s;
  return `data:image/svg+xml;utf8,${encodeURIComponent(s)}`;
};

const ethCallWithFallback = async (params: {
  chain: SupportedChain;
  rpcUrlQuery: string | null;
  to: string;
  data: string;
  timeoutMs: number;
}) => {
  const rpcUrls = getRpcUrls(params.rpcUrlQuery, params.chain);
  const attempts: Array<{ url: string; error: string }> = [];
  let lastRpcError: unknown;

  for (const url of rpcUrls) {
    try {
      const result = await jsonRpcCall({
        rpcUrl: url,
        method: "eth_call",
        rpcParams: [{ to: params.to, data: params.data }, "latest"],
        timeoutMs: params.timeoutMs,
      });
      if (typeof result !== "string") throw new Error("Bad RPC result");
      return { result, rpcUrl: url };
    } catch (e) {
      lastRpcError = e;
      attempts.push({ url, error: String(e) });
    }
  }

  const error = new Error("RPC eth_call failed");
  (error as unknown as { cause?: unknown }).cause = { last: lastRpcError, attempts };
  throw error;
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
  chain: SupportedChain;
  contract: string;
  tokenId: BigNumber;
  rpcUrlQuery: string | null;
  cacheTtlMs: number;
}) => {
  const nowMs = Date.now();
  const cacheKey = `${params.chain}:${params.contract}:${params.tokenId.toString()}`;
  const cached = tokenUriCache.get(cacheKey, nowMs);
  if (cached) return { metadataUri: cached, rpcUrl: "cache" };

  // CryptoPunks special-case (pre-ERC721).
  if (params.chain === "eth" && isCryptoPunksContract(params.contract)) {
    const id = (() => {
      try {
        // CryptoPunks are 0..9999, fits in uint16.
        return params.tokenId.toNumber();
      } catch {
        return null;
      }
    })();
    if (id === null || id < 0 || id > 9999) {
      const err = new Error("Invalid CryptoPunks tokenId");
      (err as unknown as { cause?: unknown }).cause = { tokenId: params.tokenId.toString() };
      throw err;
    }

    const svgData = punksDataIface.encodeFunctionData("punkImageSvg", [id]);
    const attrsData = punksDataIface.encodeFunctionData("punkAttributes", [id]);

    const [{ result: svgCallRes, rpcUrl }, { result: attrsCallRes }] = await Promise.all([
      ethCallWithFallback({
        chain: params.chain,
        rpcUrlQuery: params.rpcUrlQuery,
        to: CRYPTOPUNKS_DATA_CONTRACT,
        data: svgData,
        timeoutMs: 10_000,
      }),
      ethCallWithFallback({
        chain: params.chain,
        rpcUrlQuery: params.rpcUrlQuery,
        to: CRYPTOPUNKS_DATA_CONTRACT,
        data: attrsData,
        timeoutMs: 10_000,
      }),
    ]);

    const svgDecoded = punksDataIface.decodeFunctionResult("punkImageSvg", svgCallRes);
    const attrsDecoded = punksDataIface.decodeFunctionResult("punkAttributes", attrsCallRes);
    const svg = String(svgDecoded[0] ?? "");
    const attrsRaw = String(attrsDecoded[0] ?? "");

    const attributes = attrsRaw
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .map((value) => ({ trait_type: "attribute", value }));

    const image = toSvgDataUrl(svg);
    const metadata = {
      name: `CryptoPunk ${id}`,
      description: "CryptoPunks (on-chain). Resolved via CryptoPunksData.",
      image,
      attributes,
      external_url: `https://www.larvalabs.com/cryptopunks/details/${id}`,
    };

    const metadataUri = `data:application/json;utf8,${encodeURIComponent(JSON.stringify(metadata))}`;
    tokenUriCache.set(cacheKey, metadataUri, params.cacheTtlMs, nowMs);
    return { metadataUri, rpcUrl };
  }

  const rpcUrls = getRpcUrls(params.rpcUrlQuery, params.chain);

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


