export type SupportedChain = "eth";

export const normalizeChain = (raw: string): SupportedChain | null => {
  const c = decodeURIComponent(raw).trim().toLowerCase();
  if (c === "eth" || c === "ethereum") return "eth";
  return null;
};


