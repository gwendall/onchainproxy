"use server";

import { Alchemy, Network, NftFilters } from "alchemy-sdk";
import { createPublicClient, http, getAddress, isAddress } from "viem";
import { normalize } from "viem/ens";
import { mainnet } from "viem/chains";
import { resolveNftMetadata } from "@/lib/nft/metadata";
import type { SupportedChain } from "@/lib/nft/chain";
import { LruTtlCache } from "@/lib/cache/lru";

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

const looksLikeEnsName = (s: string) => {
  const v = String(s || "").trim();
  return v.length > 0 && v.includes(".") && !v.includes(" ");
};

const ensCache = new LruTtlCache<string, string>({
  maxEntries: 2000,
});

// Get viem client for ENS resolution
const getEnsClient = () => {
  // Try to use Alchemy for more reliable ENS resolution
  const alchemyKey = process.env.ALCHEMY_API_KEY;
  const rpcUrl = alchemyKey
    ? `https://eth-mainnet.g.alchemy.com/v2/${alchemyKey}`
    : "https://cloudflare-eth.com";

  return createPublicClient({
    chain: mainnet,
    transport: http(rpcUrl),
  });
};

const resolveEnsToAddress = async (ensName: string) => {
  const name = String(ensName || "").trim();
  const nowMs = Date.now();
  const cached = ensCache.get(name.toLowerCase(), nowMs);
  if (cached) return cached;

  // Use viem's getEnsAddress which is more reliable for ENS resolution
  const client = getEnsClient();
  const resolved = await client.getEnsAddress({
    name: normalize(name),
  });

  if (!resolved) {
    throw new Error(`ENS name has no address record: ${name}`);
  }

  const checksum = getAddress(resolved);
  ensCache.set(name.toLowerCase(), checksum, 10 * 60 * 1000, nowMs);
  return checksum;
};

export async function scanNfts(addressOrEns: string, chain: SupportedChain) {
  try {
    const alchemy = getAlchemy(chain);
    const raw = String(addressOrEns || "").trim();

    const { resolvedAddress, resolvedTarget } = await (async () => {
      if (isAddress(raw)) {
        const checksum = getAddress(raw);
        return { resolvedAddress: checksum, resolvedTarget: checksum };
      }
      if (looksLikeEnsName(raw)) {
        const checksum = await resolveEnsToAddress(raw);
        return { resolvedAddress: checksum, resolvedTarget: raw };
      }
      throw new Error(`Invalid address or ENS name: ${addressOrEns}`);
    })();

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
      const response = await alchemy.nft.getNftsForOwner(resolvedAddress, {
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
      resolvedAddress,
      resolvedTarget,
    };
  } catch (e: unknown) {
    console.error("Scan error details:", e);
    throw new Error(e instanceof Error ? e.message : "Failed to scan NFTs");
  }
}

export async function checkNftStatus(chain: string, contract: string, tokenId: string) {
  try {
    const metadataResult = await resolveNftMetadata({
      chain: chain as SupportedChain,
      contract,
      tokenId,
      rpcUrlQuery: null,
      cacheTtlMs: 60 * 1000,
    });

    let imageOk = false;

    if (metadataResult.imageUrl) {
      try {
        const res = await fetch(metadataResult.imageUrl, {
          method: "HEAD",
          signal: AbortSignal.timeout(5000),
        });
        if (res.ok) {
          imageOk = true;
        } else {
          // Some servers block HEAD, try GET with range
          const resGet = await fetch(metadataResult.imageUrl, {
            method: "GET",
            headers: { Range: "bytes=0-10" },
            signal: AbortSignal.timeout(5000),
          });
          if (resGet.ok) imageOk = true;
        }
      } catch {
        // Image fetch failed
      }
    }

    return { ok: true, metadataOk: true, imageOk };
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return { ok: false, metadataOk: false, imageOk: false, error: message };
  }
}
