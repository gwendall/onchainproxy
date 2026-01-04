export type NftIdentifiers = {
  contract: string;
  tokenId: string;
};

export type NftMetadataResult = {
  contract: string;
  tokenId: string;
  metadataUri: string;
  metadataUrl: string;
  metadata: unknown;
  imageUri?: string;
  imageUrl?: string;
};


