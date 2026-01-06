"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { isAddress } from "viem";
import { Section } from "@/components/Section";
import { scanNfts, checkNftStatus } from "./actions";
import { ArrowLeft, ArrowUpRight, Database, Box, HardDrive, Server, HelpCircle, Pin, CheckCircle2, AlertCircle, RefreshCw } from "lucide-react";
import { SUPPORTED_CHAINS, type SupportedChain } from "@/lib/nft/chain";

type ErrorSource = "rpc" | "contract" | "metadata_fetch" | "parsing" | "image_fetch" | "unknown";
type StorageType = "onchain" | "ipfs" | "arweave" | "centralized" | "unknown";
type ImageFormat = "png" | "jpeg" | "gif" | "webp" | "svg" | "bmp" | "avif" | "unknown";
type IpfsPinStatus = "pinned" | "available" | "unavailable" | "unknown";

type NftItem = {
  contract: string;
  tokenId: string;
  chain: string;
  title?: string;
  collection?: string;
  thumbnailUrl?: string;
  status?: "pending" | "scanning" | "ok" | "error";
  error?: string;
  errorSource?: ErrorSource;
  isTransient?: boolean;
  metadataStatus?: "ok" | "error";
  imageStatus?: "ok" | "error";
  imageError?: string;
  // Audit data
  metadataStorage?: StorageType;
  imageStorage?: StorageType;
  imageFormat?: ImageFormat;
  imageSizeBytes?: number;
  metadataCentralizedDomain?: string;
  imageCentralizedDomain?: string;
  // IPFS pin status
  metadataIpfsPinStatus?: IpfsPinStatus;
  imageIpfsPinStatus?: IpfsPinStatus;
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

const StorageIcon = ({ type, className = "w-3 h-3" }: { type: StorageType | undefined; className?: string }) => {
  switch (type) {
    case "onchain": return <Database className={className} />;
    case "ipfs": return <Box className={className} />;
    case "arweave": return <HardDrive className={className} />;
    case "centralized": return <Server className={className} />;
    default: return <HelpCircle className={className} />;
  }
};

const IpfsPinIcon = ({ status, className = "w-3 h-3" }: { status: IpfsPinStatus | undefined; className?: string }) => {
  switch (status) {
    case "pinned": return <Pin className={className} />;
    case "available": return <CheckCircle2 className={className} />;
    case "unavailable": return <AlertCircle className={className} />;
    default: return null;
  }
};

const formatDuration = (ms: number): string => {
  if (ms < 1000) return "<1s";
  const totalSeconds = Math.round(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  
  if (hours > 0) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }
  if (minutes > 0) {
    return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
  }
  return `${seconds}s`;
};

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
};

const ipfsPinTooltip = (status: IpfsPinStatus | undefined): string => {
  switch (status) {
    case "pinned": return "Pinned (served by known pinning service)";
    case "available": return "Available on IPFS gateways (may not be pinned)";
    case "unavailable": return "Not available on checked gateways - may be unpinned";
    default: return "";
  }
};

export default function ScannerPage() {
  const [input, setInput] = useState("");
  const [selectedChain, setSelectedChain] = useState<SupportedChain>("eth");
  const [submittedTarget, setSubmittedTarget] = useState("");
  const [submittedAddress, setSubmittedAddress] = useState("");
  const [submittedChain, setSubmittedChain] = useState<SupportedChain>("eth");
  const [nfts, setNfts] = useState<NftItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [scanStartedAt, setScanStartedAt] = useState<number | null>(null);
  const [scanEndedAt, setScanEndedAt] = useState<number | null>(null);
  const cancelRef = useRef(false);
  const runIdRef = useRef(0);
  const needsAutoScanRef = useRef(false);
  const nftsRef = useRef(nfts);
  const didRestoreRef = useRef(false);
  const [currentTime, setCurrentTime] = useState(0);
  
  // Keep ref in sync with state
  useEffect(() => {
    nftsRef.current = nfts;
  }, [nfts]);

  // Update current time every second while scanning for live ETA
  useEffect(() => {
    if (!isScanning) return;
    const interval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, [isScanning]);

  // Restore session from localStorage after hydration (runs once)
  useEffect(() => {
    if (didRestoreRef.current) return;
    didRestoreRef.current = true;
    
    // Schedule outside synchronous effect to satisfy lint rule
    requestAnimationFrame(() => {
      try {
        const lastRaw = window.localStorage.getItem(lastSessionKey);
        if (!lastRaw) return;

        const last = JSON.parse(lastRaw) as { target?: string; chain?: SupportedChain };
        if (!last?.target || !last?.chain) return;

        const raw = window.localStorage.getItem(sessionKey(last.target, last.chain));
        if (!raw) return;

        const parsed = JSON.parse(raw) as ScannerSession;
        if (!parsed.target || !parsed.resolvedAddress || !Array.isArray(parsed.nfts)) return;

        const restoredNfts = parsed.nfts.map((n) =>
          n.status === "scanning" ? { ...n, status: "pending" as const } : n
        );

        setInput(parsed.target);
        setSelectedChain(parsed.chain);
        setSubmittedTarget(parsed.target);
        setSubmittedAddress(parsed.resolvedAddress);
        setSubmittedChain(parsed.chain);
        setNfts(restoredNfts);
        setScanStartedAt(parsed.scanStartedAt ?? null);
        setScanEndedAt(parsed.scanEndedAt ?? null);
        
        // Mark for auto-resume if there are pending items
        needsAutoScanRef.current = restoredNfts.some((n) => n.status === "pending");
      } catch {
        // Ignore restore errors
      }
    });
  }, []);

  const stats = useMemo(() => {
    const total = nfts.length;
    const scanned = nfts.filter((n) => n.status === "ok" || n.status === "error").length;
    const metadataLive = nfts.filter((n) => n.metadataStatus === "ok").length;
    const metadataDown = nfts.filter((n) => n.metadataStatus === "error" && !n.isTransient).length;
    const metadataUnknown = nfts.filter((n) => n.metadataStatus === "error" && n.isTransient).length;
    const imageLive = nfts.filter((n) => n.imageStatus === "ok").length;
    const imageDown = nfts.filter((n) => n.imageStatus === "error" && !n.imageError).length;
    const imageUnknown = nfts.filter((n) => n.imageStatus === "error" && n.imageError).length;
    const errors = nfts.filter((n) => n.status === "error" && !n.isTransient).length;
    const transientErrors = nfts.filter((n) => n.status === "error" && n.isTransient).length;

    const scannedOrTotal = scanned > 0 ? scanned : total;
    const pct = (num: number, den: number, decimals = 0) => {
      if (!den || den <= 0) return 0;
      const value = (num / den) * 100;
      const factor = Math.pow(10, decimals);
      return Math.round(value * factor) / factor;
    };

    const metadataBrokenPct = pct(metadataDown, scannedOrTotal);
    const imageBrokenPct = pct(imageDown, scannedOrTotal);
    const brokenAssets = nfts.filter((n) => 
      (n.metadataStatus === "error" && !n.isTransient) || 
      (n.imageStatus === "error" && !n.imageError)
    ).length;
    const brokenAssetsPct = pct(brokenAssets, scannedOrTotal);

    // Storage stats (only for scanned items)
    const scannedItems = nfts.filter((n) => n.status === "ok" || n.status === "error");
    const metadataOnchain = scannedItems.filter((n) => n.metadataStorage === "onchain").length;
    const metadataIpfs = scannedItems.filter((n) => n.metadataStorage === "ipfs").length;
    const metadataArweave = scannedItems.filter((n) => n.metadataStorage === "arweave").length;
    const metadataCentralized = scannedItems.filter((n) => n.metadataStorage === "centralized").length;
    
    const imageOnchain = scannedItems.filter((n) => n.imageStorage === "onchain").length;
    const imageIpfs = scannedItems.filter((n) => n.imageStorage === "ipfs").length;
    const imageArweave = scannedItems.filter((n) => n.imageStorage === "arweave").length;
    const imageCentralized = scannedItems.filter((n) => n.imageStorage === "centralized").length;
    
    // IPFS pin stats
    const metadataIpfsPinned = scannedItems.filter((n) => n.metadataStorage === "ipfs" && n.metadataIpfsPinStatus === "pinned").length;
    const metadataIpfsAvailable = scannedItems.filter((n) => n.metadataStorage === "ipfs" && n.metadataIpfsPinStatus === "available").length;
    const metadataIpfsUnavailable = scannedItems.filter((n) => n.metadataStorage === "ipfs" && n.metadataIpfsPinStatus === "unavailable").length;
    
    const imageIpfsPinned = scannedItems.filter((n) => n.imageStorage === "ipfs" && n.imageIpfsPinStatus === "pinned").length;
    const imageIpfsAvailable = scannedItems.filter((n) => n.imageStorage === "ipfs" && n.imageIpfsPinStatus === "available").length;
    const imageIpfsUnavailable = scannedItems.filter((n) => n.imageStorage === "ipfs" && n.imageIpfsPinStatus === "unavailable").length;

    return {
      total,
      scanned,
      progressPct: pct(scanned, total, 1),
      metadataLive,
      metadataDown,
      metadataUnknown,
      imageLive,
      imageDown,
      imageUnknown,
      errors,
      transientErrors,
      metadataBrokenPct,
      imageBrokenPct,
      brokenAssets,
      brokenAssetsPct,
      // Storage breakdown
      metadataOnchain,
      metadataIpfs,
      metadataArweave,
      metadataCentralized,
      imageOnchain,
      imageIpfs,
      imageArweave,
      imageCentralized,
      // IPFS pin stats
      metadataIpfsPinned,
      metadataIpfsAvailable,
      metadataIpfsUnavailable,
      imageIpfsPinned,
      imageIpfsAvailable,
      imageIpfsUnavailable,
    };
  }, [nfts]);

  // Calculate ETA based on current scan speed
  const eta = useMemo(() => {
    if (!scanStartedAt || stats.scanned === 0 || stats.scanned >= stats.total) {
      return null;
    }
    
    const elapsed = currentTime - scanStartedAt;
    const avgTimePerItem = elapsed / stats.scanned;
    const remaining = stats.total - stats.scanned;
    const estimatedRemaining = avgTimePerItem * remaining;
    
    return {
      elapsed,
      remaining: estimatedRemaining,
      avgPerItem: avgTimePerItem,
      speed: (1000 / avgTimePerItem).toFixed(1), // items per second
    };
  }, [scanStartedAt, stats.scanned, stats.total, currentTime]);

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
      next[idx] = { ...it, status: "scanning", error: undefined, errorSource: undefined, isTransient: undefined };
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
          error: status.error,
          errorSource: status.errorSource,
          isTransient: status.isTransient,
          imageError: status.imageError,
          metadataStorage: status.metadataStorage,
          imageStorage: status.imageStorage,
          imageFormat: status.imageFormat,
          imageSizeBytes: status.imageSizeBytes,
          metadataCentralizedDomain: status.metadataCentralizedDomain,
          imageCentralizedDomain: status.imageCentralizedDomain,
          metadataIpfsPinStatus: status.metadataIpfsPinStatus,
          imageIpfsPinStatus: status.imageIpfsPinStatus,
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
          errorSource: "unknown",
          isTransient: true,
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

  const [scanError, setScanError] = useState<string | null>(null);

  const fetchAndScan = useCallback(async (target: string, chain: SupportedChain) => {
    setLoading(true);
    setNfts([]);
    setScanError(null);
    setSubmittedTarget(target);
    setSubmittedAddress("");
    setSubmittedChain(chain);
    setScanStartedAt(Date.now());
    setScanEndedAt(null);

    const result = await scanNfts(target, chain);
    
    if (result.error) {
      setScanError(result.error);
      setLoading(false);
      return;
    }
    
    if (result.resolvedTarget) {
      setSubmittedTarget(result.resolvedTarget);
      setInput(result.resolvedTarget);
    }
    if (result.resolvedAddress) {
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
              onChange={(e) => {
                setInput(e.target.value);
                if (scanError) setScanError(null);
              }}
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
          {scanError ? (
            <div className="mt-2 text-red-500">
              {scanError}
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

                <div className="flex items-center gap-4">
                  {isScanning && eta ? (
                    <div className="text-foreground-faint text-sm">
                      <span title={`${eta.speed} items/s`}>~{formatDuration(eta.remaining)} left</span>
                    </div>
                  ) : null}
                  <div className="text-foreground font-bold">
                    {stats.progressPct.toFixed(1)}%
                  </div>
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
                <div className="space-y-1">
                  <div className="text-foreground-faint">Broken Assets</div>
                  <div className="flex items-center gap-2">
                    <span className="text-red-500 font-bold">{stats.brokenAssets}</span>
                    <span className="text-foreground-faint">({stats.brokenAssetsPct}%)</span>
                  </div>
                </div>
                {stats.transientErrors > 0 && (
                  <div className="space-y-1">
                    <div className="text-foreground-faint" title="Errors that may resolve on retry (RPC issues, timeouts)">Uncertain</div>
                    <div className="text-yellow-600 font-bold">{stats.transientErrors}</div>
                  </div>
                )}
                <div className="space-y-1">
                  <div className="text-foreground-faint">Metadata</div>
                  <div className="flex items-center gap-2">
                    <span className="text-green-500">{stats.metadataLive}</span>
                    <span className="text-foreground-faint">/</span>
                    <span className="text-red-500">{stats.metadataDown}</span>
                    {stats.metadataUnknown > 0 && (
                      <>
                        <span className="text-foreground-faint">/</span>
                        <span className="text-yellow-600" title="Transient errors">{stats.metadataUnknown}?</span>
                      </>
                    )}
                  </div>
                </div>
                <div className="space-y-1">
                   <div className="text-foreground-faint">Images</div>
                   <div className="flex items-center gap-2">
                    <span className="text-green-500">{stats.imageLive}</span>
                    <span className="text-foreground-faint">/</span>
                    <span className="text-red-500">{stats.imageDown}</span>
                    {stats.imageUnknown > 0 && (
                      <>
                        <span className="text-foreground-faint">/</span>
                        <span className="text-yellow-600" title="Transient errors">{stats.imageUnknown}?</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
              
              {stats.scanned > 0 && (
                <div className="mt-6 pt-4 border-t border-foreground-faint/20">
                  <div className="text-foreground-faint mb-3">Storage Breakdown</div>
                  <div className="flex flex-wrap gap-x-8 gap-y-4 text-foreground-muted">
                    <div className="space-y-1">
                      <div className="text-foreground-faint text-sm">Metadata</div>
                      <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
                        {stats.metadataOnchain > 0 && (
                          <span className="text-green-500" title="Fully on-chain metadata">
                            {stats.metadataOnchain} on-chain
                          </span>
                        )}
                        {stats.metadataIpfs > 0 && (
                          <span className="text-blue-500" title="Stored on IPFS">
                            {stats.metadataIpfs} IPFS
                            {(stats.metadataIpfsPinned > 0 || stats.metadataIpfsUnavailable > 0) && (
                              <span className="text-foreground-faint ml-1">
                                ({stats.metadataIpfsPinned > 0 && <span title="Pinned">📌{stats.metadataIpfsPinned}</span>}
                                {stats.metadataIpfsAvailable > 0 && <span title="Available but may not be pinned" className="ml-1">✓{stats.metadataIpfsAvailable}</span>}
                                {stats.metadataIpfsUnavailable > 0 && <span title="Unavailable - may be unpinned" className="text-red-500 ml-1">⚠{stats.metadataIpfsUnavailable}</span>})
                              </span>
                            )}
                          </span>
                        )}
                        {stats.metadataArweave > 0 && (
                          <span className="text-purple-500" title="Stored on Arweave">
                            {stats.metadataArweave} Arweave
                          </span>
                        )}
                        {stats.metadataCentralized > 0 && (
                          <span className="text-yellow-600" title="Centralized server">
                            {stats.metadataCentralized} centralized
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-foreground-faint text-sm">Images</div>
                      <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
                        {stats.imageOnchain > 0 && (
                          <span className="text-green-500" title="Fully on-chain image">
                            {stats.imageOnchain} on-chain
                          </span>
                        )}
                        {stats.imageIpfs > 0 && (
                          <span className="text-blue-500" title="Stored on IPFS">
                            {stats.imageIpfs} IPFS
                            {(stats.imageIpfsPinned > 0 || stats.imageIpfsUnavailable > 0) && (
                              <span className="text-foreground-faint ml-1">
                                ({stats.imageIpfsPinned > 0 && <span title="Pinned">📌{stats.imageIpfsPinned}</span>}
                                {stats.imageIpfsAvailable > 0 && <span title="Available but may not be pinned" className="ml-1">✓{stats.imageIpfsAvailable}</span>}
                                {stats.imageIpfsUnavailable > 0 && <span title="Unavailable - may be unpinned" className="text-red-500 ml-1">⚠{stats.imageIpfsUnavailable}</span>})
                              </span>
                            )}
                          </span>
                        )}
                        {stats.imageArweave > 0 && (
                          <span className="text-purple-500" title="Stored on Arweave">
                            {stats.imageArweave} Arweave
                          </span>
                        )}
                        {stats.imageCentralized > 0 && (
                          <span className="text-yellow-600" title="Centralized server">
                            {stats.imageCentralized} centralized
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
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
                        
                        <div className="text-foreground-faint flex items-center gap-x-3 text-xs font-mono">
                          <span className="shrink-0" title={nft.contract}>{shortAddress(nft.contract)}</span>
                          <span className="truncate" title={`Token #${nft.tokenId}`}>
                            #{nft.tokenId}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5">
                          <a 
                            href={`https://opensea.io/assets/${openSeaChainSlug(nft.chain)}/${nft.contract}/${nft.tokenId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="shrink-0 inline-flex items-center gap-1 text-foreground-faint/70 hover:text-foreground hover:underline transition-colors text-xs"
                          >
                            <span>OpenSea</span>
                            <ArrowUpRight className="w-3 h-3" />
                          </a>
                          <a
                            href={`/${nft.chain}/${nft.contract}/${nft.tokenId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="shrink-0 inline-flex items-center gap-1 text-foreground-faint/70 hover:text-foreground hover:underline transition-colors text-xs"
                          >
                            <span>Metadata</span>
                            <ArrowUpRight className="w-3 h-3" />
                          </a>
                          <a
                            href={`/${nft.chain}/${nft.contract}/${nft.tokenId}/image?raw=1`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="shrink-0 inline-flex items-center gap-1 text-foreground-faint/70 hover:text-foreground hover:underline transition-colors text-xs"
                          >
                            <span>Raw image</span>
                            <ArrowUpRight className="w-3 h-3" />
                          </a>
                          <Link
                            href={`/${nft.chain}/${nft.contract}/${nft.tokenId}/scan`}
                            className="shrink-0 inline-flex items-center gap-1 text-foreground-faint/70 hover:text-foreground hover:underline transition-colors text-xs"
                          >
                            <span>Details</span>
                          </Link>
                          {nft.status !== "pending" && nft.status !== "scanning" && (
                            <button
                              type="button"
                              className="shrink-0 inline-flex items-center gap-1 text-foreground-faint/70 hover:text-foreground hover:underline transition-colors text-xs"
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
                              <span>Rescan</span>
                              <RefreshCw className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                        
                        {(nft.error || nft.imageError) ? (
                          <div className="text-sm space-y-0.5">
                            {nft.error && (
                              <div className={nft.isTransient ? "text-yellow-600" : "text-red-500"}>
                                {nft.isTransient && <span title="Transient error - may resolve on retry">⚠ </span>}
                                {nft.errorSource === "rpc" && "RPC: "}
                                {nft.errorSource === "contract" && "Contract: "}
                                {nft.errorSource === "metadata_fetch" && "Metadata: "}
                                {nft.errorSource === "parsing" && "Parse: "}
                                {nft.error}
                              </div>
                            )}
                            {nft.imageError && (
                              <div className="text-yellow-600">
                                Image: {nft.imageError}
                              </div>
                            )}
                          </div>
                        ) : null}
                      </div>

                      <div className="shrink-0 text-right self-end sm:self-auto sm:ml-auto">
                        {nft.status === "pending" ? (
                          <div className="text-foreground-faint opacity-50">QUEUED</div>
                        ) : nft.status === "scanning" ? (
                          <div className="text-blue-500 animate-pulse">SCANNING</div>
                        ) : (
                          <div className="flex flex-wrap justify-end sm:flex-col sm:items-end gap-x-4 gap-y-1">
                            <div className="flex items-center gap-2" title="Metadata Status & Storage">
                              {nft.metadataStorage && (
                                <div className={`flex items-center gap-1 text-xs px-1.5 py-0.5 rounded border ${
                                  nft.metadataStorage === "onchain" ? "bg-green-500/10 border-green-500/20 text-green-600" :
                                  nft.metadataStorage === "ipfs" ? "bg-blue-500/10 border-blue-500/20 text-blue-600" :
                                  nft.metadataStorage === "arweave" ? "bg-purple-500/10 border-purple-500/20 text-purple-600" :
                                  "bg-yellow-500/10 border-yellow-500/20 text-yellow-600"
                                }`}>
                                  <StorageIcon type={nft.metadataStorage} />
                                  <span className="uppercase text-[10px] font-bold">
                                    {nft.metadataStorage === "centralized" && nft.metadataCentralizedDomain 
                                      ? nft.metadataCentralizedDomain 
                                      : nft.metadataStorage}
                                  </span>
                                  {nft.metadataStorage === "ipfs" && nft.metadataIpfsPinStatus && (
                                    <span title={ipfsPinTooltip(nft.metadataIpfsPinStatus)} className={
                                      nft.metadataIpfsPinStatus === "pinned" ? "text-green-600" :
                                      nft.metadataIpfsPinStatus === "available" ? "text-blue-600" :
                                      "text-red-500"
                                    }>
                                      <IpfsPinIcon status={nft.metadataIpfsPinStatus} />
                                    </span>
                                  )}
                                </div>
                              )}
                              <span className={`text-xs font-bold ${
                                nft.metadataStatus === "ok" ? "text-green-600" : nft.isTransient ? "text-yellow-600" : "text-red-500"
                              }`}>
                                META
                              </span>
                            </div>

                            <div className="flex items-center gap-2" title="Image Status & Storage">
                              {nft.imageStorage && (
                                <div className={`flex items-center gap-1 text-xs px-1.5 py-0.5 rounded border ${
                                  nft.imageStorage === "onchain" ? "bg-green-500/10 border-green-500/20 text-green-600" :
                                  nft.imageStorage === "ipfs" ? "bg-blue-500/10 border-blue-500/20 text-blue-600" :
                                  nft.imageStorage === "arweave" ? "bg-purple-500/10 border-purple-500/20 text-purple-600" :
                                  "bg-yellow-500/10 border-yellow-500/20 text-yellow-600"
                                }`}>
                                  <StorageIcon type={nft.imageStorage} />
                                  <span className="uppercase text-[10px] font-bold">
                                    {nft.imageStorage === "centralized" && nft.imageCentralizedDomain 
                                      ? nft.imageCentralizedDomain 
                                      : nft.imageStorage}
                                  </span>
                                  {nft.imageStorage === "ipfs" && nft.imageIpfsPinStatus && (
                                    <span title={ipfsPinTooltip(nft.imageIpfsPinStatus)} className={
                                      nft.imageIpfsPinStatus === "pinned" ? "text-green-600" :
                                      nft.imageIpfsPinStatus === "available" ? "text-blue-600" :
                                      "text-red-500"
                                    }>
                                      <IpfsPinIcon status={nft.imageIpfsPinStatus} />
                                    </span>
                                  )}
                                </div>
                              )}
                              <span className={`text-xs font-bold ${
                                nft.imageStatus === "ok" ? "text-green-600" : nft.imageError ? "text-yellow-600" : "text-red-500"
                              }`}>
                                IMG
                              </span>
                            </div>
                            {(nft.imageFormat || nft.imageSizeBytes) && (
                              <div className="text-xs text-foreground-faint flex items-center gap-1">
                                {nft.imageFormat && nft.imageFormat !== "unknown" && (
                                  <span className="uppercase">{nft.imageFormat}</span>
                                )}
                                {nft.imageSizeBytes && (
                                  <span>({formatBytes(nft.imageSizeBytes)})</span>
                                )}
                              </div>
                            )}
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

