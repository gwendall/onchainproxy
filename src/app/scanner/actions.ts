"use server";

import { Alchemy, Network, NftFilters } from "alchemy-sdk";
import { resolveNftMetadata } from "@/lib/nft/metadata";
import type { SupportedChain } from "@/lib/nft/chain";

const alchemyNetworkForChain = (chain: SupportedChain): Network | null => {
  switch (chain) {
    case "eth":
      return Network.ETH_MAINNET;
    case "arb":
      return Network.ARB_MAINNET;
    case "op":
      return Network.OPT_MAINNET;
    case "base":
      return Network.BASE_MAINNET;
    case "polygon":
      return Network.MATIC_MAINNET;
    default:
      return null;
  }
};

// Helper to get Alchemy instance
const getAlchemy = (chain: SupportedChain) => {
  const network = alchemyNetworkForChain(chain);
  if (!network) {
    throw new Error(`Wallet scanning is not supported on ${chain} yet.`);
  }
  const apiKey = process.env.ALCHEMY_API_KEY;
  const config = {
    apiKey,
    network,
  };
  return new Alchemy(config);
};

const isHexAddress = (s: string) => /^0x[a-fA-F0-9]{40}$/.test(String(s || "").trim());

export async function scanNfts(addressOrEns: string, chain: SupportedChain) {
  try {
    const alchemy = getAlchemy(chain);
    const address = addressOrEns.trim();

    // ENS support disabled for now; only accept raw 0x addresses.
    if (!isHexAddress(address)) {
      throw new Error(`Invalid address: ${addressOrEns}`);
    }

    // Fetch NFTs (paginate: pageSize max is 100)
    // Chain selected via Alchemy network config above.
    const ownedNfts: Array<{
      contract: { address: string };
      tokenId: string;
      title?: string;
      collection?: string;
      thumbnailUrl?: string;
    }> = [];

    let pageKey: string | undefined;
    const maxNfts = 2000; // safety cap

    while (ownedNfts.length < maxNfts) {
      const response = await alchemy.nft.getNftsForOwner(address, {
        pageSize: 100,
        pageKey,
        excludeFilters: [NftFilters.SPAM],
      });

      for (const nft of response.ownedNfts) {
        const title = nft.name || nft.raw?.metadata?.name || undefined;
        const collection =
          nft.collection?.name
          || nft.contract?.openSeaMetadata?.collectionName
          || nft.contract?.name
          || undefined;
        const thumbnailUrl =
          nft.image?.thumbnailUrl
          || nft.image?.cachedUrl
          || nft.image?.pngUrl
          || nft.image?.originalUrl
          || (typeof nft.raw?.metadata?.image === "string" ? nft.raw.metadata.image : undefined)
          || undefined;

        ownedNfts.push({
          contract: { address: nft.contract.address },
          tokenId: nft.tokenId,
          title,
          collection,
          thumbnailUrl,
        });
      }

      pageKey = response.pageKey;
      if (!pageKey) break;
    }

    // Return object with nfts and the resolved address
    return {
      nfts: ownedNfts,
      resolvedAddress: address
    };
  } catch (e: any) {
    console.error("Scan error details:", e);
    throw new Error(e.message || "Failed to scan NFTs");
  }
}

export async function checkNftStatus(chain: string, contract: string, tokenId: string) {
  try {
    // 1. Check Metadata Resolution
    // We use the existing logic of onchainproxy which is very robust
    const metadataResult = await resolveNftMetadata({
      chain: chain as SupportedChain,
      contract,
      tokenId,
      rpcUrlQuery: null,
      cacheTtlMs: 60 * 1000, // 1 minute cache for checks
    });

    let imageOk = false;

    // 2. Check Image Availability
    if (metadataResult.imageUrl) {
      try {
        const res = await fetch(metadataResult.imageUrl, { method: "HEAD", signal: AbortSignal.timeout(5000) });
        if (res.ok) {
          imageOk = true;
        } else {
            // Some servers block HEAD, try GET with range or just assume OK if it resolved?
            // Let's try a small GET if HEAD fails
             const resGet = await fetch(metadataResult.imageUrl, { 
                method: "GET", 
                headers: { Range: "bytes=0-10" },
                signal: AbortSignal.timeout(5000)
             });
             if (resGet.ok) imageOk = true;
        }
      } catch (e) {
        // Image fetch failed
      }
    }

    return {
      ok: true, // The check process itself ran OK
      metadataOk: true, // resolveNftMetadata didn't throw
      imageOk,
    };

  } catch (e: any) {
    // resolveNftMetadata threw an error, meaning metadata is down or unreachable
    return {
      ok: false,
      metadataOk: false,
      imageOk: false,
      error: e.message,
    };
  }
}
