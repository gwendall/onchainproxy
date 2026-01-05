"use client";

import { useMemo, useState } from "react";
import { Section } from "@/components/Section";
import { scanNfts, checkNftStatus } from "./actions";

type NftItem = {
  contract: string;
  tokenId: string;
  chain: string;
  title?: string;
  collection?: string;
  thumbnailUrl?: string;
  status?: "pending" | "scanning" | "ok" | "error";
  error?: string;
  metadataStatus?: "ok" | "error";
  imageStatus?: "ok" | "error";
};

const shortAddress = (addr: string) => {
  const a = String(addr || "");
  if (a.length <= 12) return a;
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
};

const normalizeImageUrl = (url: string | undefined) => {
  if (!url) return undefined;
  const u = String(url).trim();
  if (!u) return undefined;
  if (u.startsWith("ipfs://ipfs/")) return `https://ipfs.io/ipfs/${u.slice("ipfs://ipfs/".length)}`;
  if (u.startsWith("ipfs://")) return `https://ipfs.io/ipfs/${u.slice("ipfs://".length)}`;
  return u;
};

const isHexAddress = (s: string) => /^0x[a-fA-F0-9]{40}$/.test(String(s || "").trim());

export default function ScannerPage() {
  const [input, setInput] = useState("");
  const [submittedAddress, setSubmittedAddress] = useState<string>("");
  const [nfts, setNfts] = useState<NftItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [scannedCount, setScannedCount] = useState(0);

  const stats = useMemo(() => {
    const total = nfts.length;
    const scanned = scannedCount;
    const metadataLive = nfts.filter((n) => n.metadataStatus === "ok").length;
    const metadataDown = nfts.filter((n) => n.metadataStatus === "error").length;
    const imageLive = nfts.filter((n) => n.imageStatus === "ok").length;
    const imageDown = nfts.filter((n) => n.imageStatus === "error").length;
    const errors = nfts.filter((n) => n.status === "error").length;

    const scannedOrTotal = scanned > 0 ? scanned : total;
    const pct = (num: number, den: number) => {
      if (!den || den <= 0) return 0;
      return Math.round((num / den) * 100);
    };

    const metadataBrokenPct = pct(metadataDown, scannedOrTotal);
    const imageBrokenPct = pct(imageDown, scannedOrTotal);
    const brokenAssets = nfts.filter((n) => n.metadataStatus === "error" || n.imageStatus === "error").length;
    const brokenAssetsPct = pct(brokenAssets, scannedOrTotal);

    return {
      total,
      scanned,
      progressPct: pct(scanned, total),
      metadataLive,
      metadataDown,
      imageLive,
      imageDown,
      errors,
      metadataBrokenPct,
      imageBrokenPct,
      brokenAssets,
      brokenAssetsPct,
    };
  }, [nfts, scannedCount]);

  const handleScan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isHexAddress(input)) return;

    const nextSubmitted = input.trim();
    setLoading(true);
    setNfts([]);
    setScannedCount(0);
    setSubmittedAddress(nextSubmitted);

    try {
      // Step 1: Fetch NFTs from Alchemy
      const result = await scanNfts(nextSubmitted);
      
      const items: NftItem[] = result.nfts.map((n: any) => ({
        contract: n.contract?.address,
        tokenId: n.tokenId,
        chain: "eth", // Default to ETH for now, as we'll scan ETH mainnet
        title: n.title || `#${n.tokenId}`,
        collection: n.collection,
        thumbnailUrl: n.thumbnailUrl,
        status: "pending",
      }));

      setNfts(items);
      setLoading(false);

      // Step 2: Scan each NFT one by one
      processQueue(items);

    } catch (err: any) {
      alert("Error fetching NFTs: " + err.message);
      setLoading(false);
    }
  };

  const inputTrimmed = input.trim();
  const canSubmit = isHexAddress(inputTrimmed) && !(loading && nfts.length === 0);

  const processQueue = async (items: NftItem[]) => {
    // We'll process in small batches or one by one
    // For "one by one" visual effect, we can do it sequentially
    
    const newNfts = [...items];
    
    for (let i = 0; i < newNfts.length; i++) {
      const item = newNfts[i];
      // Update status to scanning
      item.status = "scanning";
      setNfts([...newNfts]);

      try {
        const status = await checkNftStatus(item.chain, item.contract, item.tokenId);
        
        item.status = status.ok ? "ok" : "error";
        item.metadataStatus = status.metadataOk ? "ok" : "error";
        item.imageStatus = status.imageOk ? "ok" : "error";
        if (!status.ok) {
           item.error = status.error;
        }
      } catch (err) {
        item.status = "error";
        item.error = "Check failed";
      }

      setScannedCount(prev => prev + 1);
      setNfts([...newNfts]);
    }
  };

  return (
    <main className="min-h-screen max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8 font-mono text-sm">
      <div className="space-y-8 sm:space-y-10">
        <header className="space-y-3">
          <h1 className="font-bold">NFT Scanner</h1>
          <p className="text-foreground-muted">
            Enter an Ethereum address to scan owned NFTs and check if their metadata and images are live.
          </p>
        </header>

        <Section title="Target">
          <form onSubmit={handleScan} className="flex flex-col sm:flex-row gap-3 sm:gap-4">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="0x..."
              spellCheck={false}
              autoCapitalize="none"
              autoCorrect="off"
              className="flex-1 px-0 py-2 bg-transparent border-b border-foreground-faint/30 rounded-none focus:border-foreground focus:outline-none placeholder:text-foreground-faint/50"
            />
            <button
              type="submit"
              disabled={!canSubmit}
              className="w-full sm:w-auto px-6 py-2 bg-foreground text-background font-bold rounded-none hover:opacity-90 disabled:opacity-50"
            >
              {loading && nfts.length === 0 ? "Fetching..." : "Scan"}
            </button>
          </form>
          {inputTrimmed.length > 0 && !isHexAddress(inputTrimmed) ? (
            <div className="mt-2 text-foreground-faint">
              Please enter a valid Ethereum address (0x + 40 hex chars).
            </div>
          ) : null}
        </Section>

        {nfts.length > 0 && (
          <div className="space-y-8 sm:space-y-10">
            <Section title="Summary">
              <div className="flex flex-wrap gap-x-8 gap-y-4 text-foreground-muted">
                <div className="space-y-1">
                   <div className="text-foreground-faint">Wallet</div>
                   <div className="text-foreground font-bold truncate max-w-[200px]" title={submittedAddress}>
                    {shortAddress(submittedAddress)}
                  </div>
                </div>
                <div className="space-y-1">
                   <div className="text-foreground-faint">Progress</div>
                   <div className="text-foreground font-bold">
                    {stats.scanned}/{stats.total} ({stats.progressPct}%)
                   </div>
                </div>
                {stats.errors > 0 && (
                  <div className="space-y-1">
                    <div className="text-foreground-faint">Errors</div>
                    <div className="text-red-500 font-bold">{stats.errors}</div>
                  </div>
                )}
                <div className="space-y-1">
                  <div className="text-foreground-faint">Broken Assets</div>
                  <div className="flex items-center gap-2">
                    <span className="text-foreground font-bold">{stats.brokenAssets}</span>
                    <span className="text-red-500">({stats.brokenAssetsPct}%)</span>
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-foreground-faint">Metadata</div>
                  <div className="flex items-center gap-2">
                    <span className="text-green-500">{stats.metadataLive}</span>
                    <span className="text-foreground-faint">/</span>
                    <span className="text-red-500">{stats.metadataDown}</span>
                    <span className="text-foreground-faint">({stats.metadataBrokenPct}%)</span>
                  </div>
                </div>
                <div className="space-y-1">
                   <div className="text-foreground-faint">Images</div>
                   <div className="flex items-center gap-2">
                    <span className="text-green-500">{stats.imageLive}</span>
                    <span className="text-foreground-faint">/</span>
                    <span className="text-red-500">{stats.imageDown}</span>
                    <span className="text-foreground-faint">({stats.imageBrokenPct}%)</span>
                  </div>
                </div>
              </div>
            </Section>

            <Section title={`Results (${scannedCount}/${nfts.length})`}>
              <div className="border-t border-foreground-faint/20">
                {nfts.map((nft, idx) => {
                  const thumb = normalizeImageUrl(nft.thumbnailUrl);

                  return (
                    <div
                      key={`${nft.contract}-${nft.tokenId}-${idx}`}
                      className="flex flex-col sm:flex-row sm:items-start gap-4 py-4 border-b border-foreground-faint/20 last:border-0"
                    >
                      <div className="w-12 h-12 sm:w-16 sm:h-16 bg-foreground-faint/10 overflow-hidden shrink-0">
                        {thumb ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={thumb}
                            alt={nft.title || "NFT"}
                            className="w-full h-full object-cover transition-all duration-300"
                            loading="lazy"
                            referrerPolicy="no-referrer"
                            onError={(e) => {
                              (e.currentTarget as HTMLImageElement).style.display = "none";
                            }}
                          />
                        ) : (
                           <div className="w-full h-full flex items-center justify-center text-foreground-faint/30 font-bold text-xs">IMG</div>
                        )}
                      </div>

                      <div className="min-w-0 flex-1 flex flex-col gap-1">
                        <div className="font-bold truncate" title={nft.title}>
                          {nft.title || `#${nft.tokenId}`}
                        </div>
                        {nft.collection ? (
                          <div className="text-foreground-muted truncate" title={nft.collection}>
                            {nft.collection}
                          </div>
                        ) : null}
                        
                        <div className="text-foreground-faint flex items-center gap-x-3 min-w-0 text-xs sm:text-sm">
                          <span className="shrink-0 font-mono">{shortAddress(nft.contract)}</span>
                          <span className="min-w-0 truncate" title={`Token #${nft.tokenId}`}>
                            #{nft.tokenId}
                          </span>
                          <a 
                            href={`https://opensea.io/assets/ethereum/${nft.contract}/${nft.tokenId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="shrink-0 text-foreground-faint/70 hover:text-foreground hover:underline transition-colors"
                          >
                            OpenSea ↗
                          </a>
                        </div>
                        
                        {nft.error ? (
                          <div className="text-red-500">{nft.error}</div>
                        ) : null}
                      </div>

                      <div className="shrink-0 text-right self-end sm:self-auto sm:ml-auto">
                        {nft.status === "pending" ? (
                          <div className="text-foreground-faint opacity-50">QUEUED</div>
                        ) : nft.status === "scanning" ? (
                          <div className="text-blue-500 animate-pulse">SCANNING</div>
                        ) : (
                          <div className="flex flex-wrap justify-end sm:flex-col sm:items-end gap-x-4 gap-y-1">
                            <div className={nft.metadataStatus === "ok" ? "text-green-600" : "text-red-500 font-bold"}>
                              META: {nft.metadataStatus === "ok" ? "OK" : "ERR"}
                            </div>
                            <div className={nft.imageStatus === "ok" ? "text-green-600" : "text-red-500 font-bold"}>
                              IMG: {nft.imageStatus === "ok" ? "OK" : "ERR"}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Section>
          </div>
        )}
      </div>
    </main>
  );
}
