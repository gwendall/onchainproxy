import { BigNumber } from "ethers";

export const resolveErc1155TemplateUri = (uri: string, tokenId: BigNumber) => {
  if (!uri) return uri;
  if (!uri.includes("{id}")) return uri;
  const hexId = tokenId.toHexString().slice(2).padStart(64, "0").toLowerCase();
  return uri.replace("{id}", hexId);
};


