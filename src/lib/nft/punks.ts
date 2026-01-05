export const CRYPTOPUNKS_ORIGINAL_CONTRACT = "0xb47e3cd837ddf8e4c57f05d70ab865de6e193bbb";
export const CRYPTOPUNKS_DATA_CONTRACT = "0x16f5a35647d6f03d5d3da7b35409d65ba03af3b2";

export const isCryptoPunksContract = (contract: string) => {
  const c = contract.trim().toLowerCase();
  return c === CRYPTOPUNKS_ORIGINAL_CONTRACT || c === CRYPTOPUNKS_DATA_CONTRACT;
};


