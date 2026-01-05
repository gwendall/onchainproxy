export type SupportedChain =
  | "eth"
  | "arb"
  | "op"
  | "base"
  | "polygon"
  | "zksync"
  | "linea"
  | "scroll"
  | "polygon-zkevm";

export const SUPPORTED_CHAINS: SupportedChain[] = [
  "eth",
  "arb",
  "op",
  "base",
  "polygon",
  "zksync",
  "linea",
  "scroll",
  "polygon-zkevm",
];

export const supportedChainsHint = () => SUPPORTED_CHAINS.map((c) => `/${c}/...`).join(", ");

export const normalizeChain = (raw: string): SupportedChain | null => {
  const c = decodeURIComponent(raw).trim().toLowerCase();
  if (c === "eth" || c === "ethereum" || c === "mainnet") return "eth";
  if (c === "arb" || c === "arbitrum" || c === "arbitrum-one" || c === "arbitrumone") return "arb";
  if (c === "op" || c === "optimism") return "op";
  if (c === "base") return "base";
  if (c === "polygon" || c === "matic" || c === "poly") return "polygon";
  if (c === "zksync" || c === "zksync-era" || c === "era") return "zksync";
  if (c === "linea") return "linea";
  if (c === "scroll") return "scroll";
  if (c === "polygon-zkevm" || c === "polygonzkevm" || c === "zkevm") return "polygon-zkevm";
  return null;
};


