"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { isAddress } from "viem";
import { Section } from "@/components/Section";
import { scanNfts, checkNftStatus } from "./actions";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { SUPPORTED_CHAINS, type SupportedChain } from "@/lib/nft/chain";

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

const looksLikeEnsName = (s: string) => {
  const v = String(s || "").trim();
  return v.length > 0 && v.includes(".") && !v.includes(" ");
};

const isValidTarget = (s: string) => isAddress(s) || looksLikeEnsName(s);

const openSeaChainSlug = (chain: string) => {
  switch (chain) {
    case "eth":
      return "ethereum";
    case "polygon":
      return "matic";
    case "arb":
      return "arbitrum";
    case "op":
      return "optimism";
    case "base":
      return "base";
    default:
      return "ethereum";
  }
};

type ScannerSession = {
  target: string;
  resolvedAddress: string;
  chain: SupportedChain;
  savedAt: number;
  scanStartedAt?: number;
  scanEndedAt?: number;
  nfts: NftItem[];
};

const sessionKey = (target: string, chain: SupportedChain) =>
  `onchainproxy:scanner:${chain}:${target.toLowerCase()}`;
const lastSessionKey = "onchainproxy:scanner:lastSession";

const resetNftScan = (n: NftItem): NftItem => ({
  ...n,
  status: "pending",
  error: undefined,
  metadataStatus: undefined,
  imageStatus: undefined,
});

const getRestoredSession = (): { session: ScannerSession; nfts: NftItem[]; shouldResume: boolean } | null => {
  if (typeof window === "undefined") return null;
  try {
    const lastRaw = window.localStorage.getItem(lastSessionKey);
    if (!lastRaw) return null;

    const last = JSON.parse(lastRaw) as { target?: string; chain?: SupportedChain };
    if (!last?.target || !last?.chain) return null;

    const raw = window.localStorage.getItem(sessionKey(last.target, last.chain));
    if (!raw) return null;

    const parsed = JSON.parse(raw) as ScannerSession;
    if (!parsed.target || !parsed.resolvedAddress || !Array.isArray(parsed.nfts)) return null;

    const restoredNfts = parsed.nfts.map((n) =>
      n.status === "scanning" ? { ...n, status: "pending" as const } : n
    );

    return {
      session: parsed,
      nfts: restoredNfts,
      shouldResume: restoredNfts.some((n) => n.status === "pending"),
    };
  } catch {
    return null;
  }
};

export default function ScannerPage() {
  const restored = useMemo(() => getRestoredSession(), []);
  
  const [input, setInput] = useState(restored?.session.target ?? "");
  const [selectedChain, setSelectedChain] = useState<SupportedChain>(restored?.session.chain ?? "eth");
  const [submittedTarget, setSubmittedTarget] = useState(restored?.session.target ?? "");
  const [submittedAddress, setSubmittedAddress] = useState(restored?.session.resolvedAddress ?? "");
  const [submittedChain, setSubmittedChain] = useState<SupportedChain>(restored?.session.chain ?? "eth");
  const [nfts, setNfts] = useState<NftItem[]>(restored?.nfts ?? []);
  const [loading, setLoading] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [scanStartedAt, setScanStartedAt] = useState<number | null>(restored?.session.scanStartedAt ?? null);
  const [scanEndedAt, setScanEndedAt] = useState<number | null>(restored?.session.scanEndedAt ?? null);
  const cancelRef = useRef(false);
  const runIdRef = useRef(0);
  const autoScanTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const needsAutoScanRef = useRef(restored?.shouldResume ?? false);
  const nftsRef = useRef(nfts);
  
  // Keep ref in sync with state (must be in effect, not during render)
  useEffect(() => {
    nftsRef.current = nfts;
  }, [nfts]);

  const stats = useMemo(() => {
    const total = nfts.length;
    const scanned = nfts.filter((n) => n.status === "ok" || n.status === "error").length;
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
  }, [nfts]);

  const hasPending = useMemo(
    () => nfts.some((n) => n.status === "pending" || n.status === "scanning"),
    [nfts]
  );


  // Persist session whenever it changes
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!submittedTarget || !submittedAddress) return;
    try {
      const payload: ScannerSession = {
        target: submittedTarget,
        resolvedAddress: submittedAddress,
        chain: submittedChain,
        savedAt: Date.now(),
        scanStartedAt: scanStartedAt ?? undefined,
        scanEndedAt: scanEndedAt ?? undefined,
        nfts,
      };
      window.localStorage.setItem(sessionKey(submittedTarget, submittedChain), JSON.stringify(payload));
      window.localStorage.setItem(lastSessionKey, JSON.stringify({ target: submittedTarget, chain: submittedChain }));
    } catch {
      // Ignore storage errors
    }
  }, [submittedTarget, submittedAddress, submittedChain, nfts, scanStartedAt, scanEndedAt]);

  const scanOne = useCallback(async (idx: number, opts?: { force?: boolean; runId?: number }) => {
    const runId = opts?.runId ?? runIdRef.current;
    const force = Boolean(opts?.force);

    // Use ref to get latest nfts state
    const current = nftsRef.current[idx];
    if (!current) return;
    if (!force && (current.status === "ok" || current.status === "error")) return;

    setNfts((prev) => {
      const next = [...prev];
      const it = next[idx];
      if (!it) return prev;
      next[idx] = { ...it, status: "scanning", error: undefined };
      return next;
    });

    try {
      const status = await checkNftStatus(current.chain, current.contract, current.tokenId);
      if (runId !== runIdRef.current || cancelRef.current) return;

      setNfts((prev) => {
        const next = [...prev];
        const it = next[idx];
        if (!it) return prev;
        next[idx] = {
          ...it,
          status: status.ok ? "ok" : "error",
          metadataStatus: status.metadataOk ? "ok" : "error",
          imageStatus: status.imageOk ? "ok" : "error",
          error: status.ok ? undefined : status.error,
        };
        return next;
      });
    } catch {
      if (runId !== runIdRef.current || cancelRef.current) return;
      setNfts((prev) => {
        const next = [...prev];
        const it = next[idx];
        if (!it) return prev;
        next[idx] = {
          ...it,
          status: "error",
          error: "Check failed",
          metadataStatus: "error",
          imageStatus: "error",
        };
        return next;
      });
    }
  }, []);

  const startScan = useCallback(async () => {
    const nftsLength = nftsRef.current.length;
    if (!submittedAddress || nftsLength === 0 || isScanning) return;

    cancelRef.current = false;
    runIdRef.current += 1;
    const runId = runIdRef.current;
    setIsScanning(true);
    if (!scanStartedAt) setScanStartedAt(Date.now());
    setScanEndedAt(null);

    // Scan in array order (first to last as rendered)
    for (let i = 0; i < nftsLength; i++) {
      if (runId !== runIdRef.current || cancelRef.current) break;
      // Always check latest state via ref for current status
      const item = nftsRef.current[i];
      if (!item || item.status === "ok" || item.status === "error") continue;
      await scanOne(i, { runId });
    }

    if (runId === runIdRef.current) {
      setIsScanning(false);
      setScanEndedAt(Date.now());
    }
  }, [submittedAddress, isScanning, scanStartedAt, scanOne]);

  const cancelScan = useCallback(() => {
    cancelRef.current = true;
    runIdRef.current += 1;
    setIsScanning(false);
  }, []);

  const continueScan = useCallback(() => {
    void startScan();
  }, [startScan]);

  const rescanWallet = useCallback(() => {
    if (!submittedAddress || nfts.length === 0) return;
    cancelScan();
    needsAutoScanRef.current = true;
    setNfts((prev) => prev.map(resetNftScan));
    setScanStartedAt(Date.now());
    setScanEndedAt(null);
  }, [submittedAddress, nfts.length, cancelScan]);

  // Auto-start scan when NFTs are loaded and needsAutoScanRef is set
  useEffect(() => {
    if (needsAutoScanRef.current && !isScanning && nftsRef.current.length > 0 && submittedAddress) {
      needsAutoScanRef.current = false;
      // Schedule outside the synchronous effect body to avoid lint warning
      requestAnimationFrame(() => void startScan());
    }
  }, [isScanning, nfts, submittedAddress, startScan]);

  const restoreSession = useCallback((target: string, chain: SupportedChain): boolean => {
    if (typeof window === "undefined") return false;
    try {
      const raw = window.localStorage.getItem(sessionKey(target, chain));
      if (!raw) return false;
      const parsed = JSON.parse(raw) as ScannerSession;
      if (!parsed.resolvedAddress || !Array.isArray(parsed.nfts) || parsed.nfts.length === 0) return false;

      const restoredNfts = parsed.nfts.map((n) =>
        n.status === "scanning" ? { ...n, status: "pending" as const } : n
      );
      
      // Mark that we need to auto-scan after state updates
      needsAutoScanRef.current = restoredNfts.some((n) => n.status === "pending");
      
      setSubmittedTarget(parsed.target);
      setSubmittedAddress(parsed.resolvedAddress);
      setSubmittedChain(parsed.chain);
      setNfts(restoredNfts);
      setScanStartedAt(parsed.scanStartedAt ?? Date.now());
      setScanEndedAt(parsed.scanEndedAt ?? null);
      setLoading(false);
      return true;
    } catch {
      return false;
    }
  }, []);

  const fetchAndScan = useCallback(async (target: string, chain: SupportedChain) => {
    setLoading(true);
    setNfts([]);
    setSubmittedTarget(target);
    setSubmittedAddress("");
    setSubmittedChain(chain);
    setScanStartedAt(Date.now());
    setScanEndedAt(null);

    try {
      const result = await scanNfts(target, chain);
      if (result?.resolvedTarget) {
        setSubmittedTarget(result.resolvedTarget);
        setInput(result.resolvedTarget);
      }
      if (result?.resolvedAddress) {
        setSubmittedAddress(result.resolvedAddress);
      }

      const items: NftItem[] = result.nfts.map((n) => ({
        contract: n.contract?.address ?? "",
        tokenId: n.tokenId,
        chain,
        title: n.title || `#${n.tokenId}`,
        collection: n.collection,
        thumbnailUrl: n.thumbnailUrl,
        status: "pending" as const,
      }));

      // Mark that we need to auto-scan after state updates
      needsAutoScanRef.current = items.length > 0;
      
      setNfts(items);
      setLoading(false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      alert("Error fetching NFTs: " + message);
      setLoading(false);
    }
  }, []);

  const handleScan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidTarget(input)) return;

    const target = input.trim();
    if (restoreSession(target, selectedChain)) {
      // Auto-scan will be triggered by the effect when NFTs are loaded
      return;
    }
    await fetchAndScan(target, selectedChain);
  };

  const inputTrimmed = input.trim();
  const alchemyWalletChains: SupportedChain[] = ["eth", "arb", "op", "base", "polygon"];
  const isChainSupportedForWallet = alchemyWalletChains.includes(selectedChain);
  const canSubmit = isChainSupportedForWallet && isValidTarget(inputTrimmed) && !(loading && nfts.length === 0);

  // Auto-start scan when a new valid address is entered (debounced)
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (autoScanTimerRef.current) clearTimeout(autoScanTimerRef.current);

    const next = inputTrimmed;
    if (!isValidTarget(next)) return;
    if (next.toLowerCase() === submittedTarget.toLowerCase() && selectedChain === submittedChain) return;
    if (loading || isScanning || !isChainSupportedForWallet) return;

    autoScanTimerRef.current = setTimeout(() => {
      if (!restoreSession(next, selectedChain)) {
        void fetchAndScan(next, selectedChain);
      }
      // Auto-scan will be triggered by the effect when NFTs are loaded
    }, 400);

    return () => {
      if (autoScanTimerRef.current) clearTimeout(autoScanTimerRef.current);
    };
  }, [inputTrimmed, submittedTarget, loading, isScanning, selectedChain, isChainSupportedForWallet, submittedChain, restoreSession, fetchAndScan]);

  return (
    <main className="min-h-screen max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8 font-mono">
      <div className="space-y-8 sm:space-y-10">
        <header className="space-y-3">
          <Link href="/" className="inline-flex items-center gap-1 leading-none text-foreground-faint hover:underline">
            <ArrowLeft className="w-4 h-4 shrink-0" />
            <span className="leading-none">Back to docs</span>
          </Link>
          <h1 className="font-bold">NFT Scanner</h1>
          <p className="text-foreground-muted">
            Enter an Ethereum address or ENS name to scan owned NFTs and check if their metadata and images are live.
          </p>
        </header>

        <Section title="Target">
          <form onSubmit={handleScan} className="flex flex-col sm:flex-row gap-3 sm:gap-4">
            <select
              value={selectedChain}
              onChange={(e) => setSelectedChain(e.target.value as SupportedChain)}
              className="sm:w-40 px-0 py-2 bg-transparent border-b border-foreground-faint/30 rounded-none focus:border-foreground focus:outline-none"
            >
              {SUPPORTED_CHAINS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="0x... or vitalik.eth"
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
          {!isChainSupportedForWallet ? (
            <div className="mt-2 text-foreground-faint">
              Wallet NFT listing is not supported on <span className="text-foreground">{selectedChain}</span> yet.
            </div>
          ) : null}
          {inputTrimmed.length > 0 && !isValidTarget(inputTrimmed) ? (
            <div className="mt-2 text-foreground-faint">
              Please enter a valid Ethereum address (0x + 40 hex chars) or an ENS name (e.g. vitalik.eth).
            </div>
          ) : null}
          {submittedAddress && nfts.length > 0 ? (
            <div className="mt-7 space-y-3">
              <div className="h-1 w-full bg-foreground-faint/20">
                <div
                  className="h-full bg-foreground"
                  style={{ width: `${Math.min(100, Math.max(0, stats.progressPct))}%` }}
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 text-foreground-muted">
                <div className="flex flex-wrap gap-x-6 gap-y-3">
                  <button
                    type="button"
                    onClick={rescanWallet}
                    className="text-link hover:underline font-bold disabled:opacity-50"
                    disabled={isScanning || nfts.length === 0}
                  >
                    Rescan wallet
                  </button>
                  {isScanning ? (
                    <button type="button" onClick={cancelScan} className="text-link hover:underline font-bold">
                      Cancel scan
                    </button>
                  ) : hasPending ? (
                    <button type="button" onClick={continueScan} className="text-link hover:underline font-bold">
                      Continue scan
                    </button>
                  ) : null}
                </div>

                <div className="text-foreground font-bold">
                  {stats.progressPct}%
                </div>
              </div>
            </div>
          ) : null}
        </Section>

        {nfts.length > 0 && (
          <div className="space-y-8 sm:space-y-10">
            <Section title="Summary">
              <div className="flex flex-wrap gap-x-8 gap-y-4 text-foreground-muted">
                <div className="space-y-1">
                   <div className="text-foreground-faint">Wallet</div>
                   <div className="text-foreground font-bold truncate max-w-[260px]" title={submittedTarget || submittedAddress}>
                    {submittedTarget && submittedTarget.toLowerCase() !== submittedAddress.toLowerCase()
                      ? submittedTarget
                      : shortAddress(submittedAddress)}
                   </div>
                   {submittedTarget && submittedTarget.toLowerCase() !== submittedAddress.toLowerCase() ? (
                     <div className="text-foreground-faint truncate max-w-[260px]" title={submittedAddress}>
                       {shortAddress(submittedAddress)}
                     </div>
                   ) : null}
                </div>
                <div className="space-y-1">
                   <div className="text-foreground-faint">Progress</div>
                   <div className="text-foreground font-bold">
                    {stats.scanned}/{stats.total}
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

            <Section title={`Results (${stats.scanned}/${nfts.length})`}>
              <div className="border-t border-foreground-faint/20">
                {nfts.map((nft, idx) => {
                  const thumb = normalizeImageUrl(nft.thumbnailUrl);

                  return (
                    <div
                      key={`${nft.contract}-${nft.tokenId}-${idx}`}
                      className="flex flex-col sm:flex-row sm:items-start gap-4 py-4 border-b border-foreground-faint/20 last:border-0"
                    >
                      <div className="w-12 h-12 sm:w-16 sm:h-16 bg-foreground-faint/10 overflow-hidden shrink-0 relative">
                        {thumb ? (
                          <Image
                            src={thumb}
                            alt={nft.title || "NFT"}
                            fill
                            sizes="64px"
                            className="object-cover"
                            unoptimized
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-foreground-faint/30 font-bold">
                            IMG
                          </div>
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
                        
                        <div className="text-foreground-faint flex items-center gap-x-3 min-w-0">
                          <span className="shrink-0 font-mono">{shortAddress(nft.contract)}</span>
                          <span className="min-w-0 truncate" title={`Token #${nft.tokenId}`}>
                            #{nft.tokenId}
                          </span>
                          <a 
                            href={`https://opensea.io/assets/${openSeaChainSlug(nft.chain)}/${nft.contract}/${nft.tokenId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="shrink-0 inline-flex items-center gap-1 text-foreground-faint/70 hover:text-foreground hover:underline transition-colors"
                          >
                            <span>OpenSea</span>
                            <ArrowUpRight className="w-4 h-4" />
                          </a>
                          <a
                            href={`/${nft.chain}/${nft.contract}/${nft.tokenId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="shrink-0 text-foreground-faint/70 hover:text-foreground hover:underline transition-colors"
                          >
                            Metadata
                          </a>
                          <a
                            href={`/${nft.chain}/${nft.contract}/${nft.tokenId}/image?raw=1`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="shrink-0 text-foreground-faint/70 hover:text-foreground hover:underline transition-colors"
                          >
                            Raw image
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
                            <button
                              type="button"
                              className="text-link hover:underline font-bold"
                              onClick={() => {
                                // Cancel any ongoing run and rescan this NFT only
                                cancelScan();
                                setNfts((prev) => {
                                  const next = [...prev];
                                  const it = next[idx];
                                  if (!it) return prev;
                                  next[idx] = resetNftScan(it);
                                  return next;
                                });
                                setTimeout(() => void scanOne(idx, { force: true }), 0);
                              }}
                            >
                              Rescan
                            </button>
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
