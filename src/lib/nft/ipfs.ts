export const ipfsToHttp = (uri: string) => {
  if (!uri) return uri;
  const gateway = process.env.IPFS_GATEWAY && process.env.IPFS_GATEWAY.length > 0
    ? process.env.IPFS_GATEWAY
    : "https://ipfs.io/ipfs";

  if (uri.startsWith("ipfs://ipfs/")) return `${gateway}/${uri.slice("ipfs://ipfs/".length)}`;
  if (uri.startsWith("ipfs://")) return `${gateway}/${uri.slice("ipfs://".length)}`;
  return uri;
};


