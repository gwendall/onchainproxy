"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { isAddress } from "viem";
import { Drawer } from "vaul";
import { Section } from "@/components/Section";
import { scanNfts, checkNftStatus } from "./actions";
import { ArrowLeft, ArrowUpRight, Database, Box, HardDrive, Server, HelpCircle, Pin, CheckCircle2, AlertCircle, RefreshCw, X, Check, AlertTriangle, Loader2, ImageOff, LayoutGrid, List, Play, Square, RotateCcw, Share2 } from "lucide-react";
import { toPng } from "html-to-image";
import QRCode from "qrcode";
import { SUPPORTED_CHAINS, chainLabel, type SupportedChain } from "@/lib/nft/chain";

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
  // URIs
  metadataUri?: string;
  imageUri?: string;
  // Response time for centralized hosts
  metadataResponseTimeMs?: number;
  metadataIsSlow?: boolean;
  imageResponseTimeMs?: number;
  imageIsSlow?: boolean;
};

const shortAddress = (addr: string) => {
  const a = String(addr || "");
  if (a.length <= 12) return a;
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
};

const shortUri = (uri: string, maxLength = 40) => {
  const u = String(uri || "");
  if (u.length <= maxLength) return u;
  const half = Math.floor((maxLength - 1) / 2);
  return `${u.slice(0, half)}…${u.slice(-half)}`;
};

const mainDomain = (domain: string) => {
  const d = String(domain || "");
  const parts = d.split(".");
  if (parts.length < 2) return d;
  // Return only the last 2 parts (e.g., "example.com")
  return parts.slice(-2).join(".");
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

const storageLabel = (type: StorageType | undefined): string => {
  switch (type) {
    case "onchain": return "On-chain";
    case "ipfs": return "IPFS";
    case "arweave": return "Arweave";
    case "centralized": return "Centralized";
    default: return "Unknown";
  }
};

const storageColor = (type: StorageType | undefined): string => {
  switch (type) {
    case "onchain": return "text-green-500";
    case "ipfs": return "text-blue-500";
    case "arweave": return "text-purple-500";
    case "centralized": return "text-yellow-600";
    default: return "text-foreground-faint";
  }
};

const storageBgColor = (type: StorageType | undefined): string => {
  switch (type) {
    case "onchain": return "bg-green-500/10";
    case "ipfs": return "bg-blue-500/10";
    case "arweave": return "bg-purple-500/10";
    case "centralized": return "bg-yellow-500/10";
    default: return "bg-foreground-faint/10";
  }
};

const storageDescription = (type: StorageType | undefined): string => {
  switch (type) {
    case "onchain": return "Stored directly in the smart contract. Permanent and immutable.";
    case "ipfs": return "Stored on IPFS, a decentralized file system. Depends on pinning.";
    case "arweave": return "Stored on Arweave, a permanent decentralized storage network.";
    case "centralized": return "Stored on a centralized server. May become unavailable.";
    default: return "Storage location unknown.";
  }
};

const ipfsPinLabel = (status: IpfsPinStatus | undefined): string => {
  switch (status) {
    case "pinned": return "Pinned ✓";
    case "available": return "Available";
    case "unavailable": return "Not pinned ⚠";
    default: return "";
  }
};

const ipfsPinDescription = (status: IpfsPinStatus | undefined): string => {
  switch (status) {
    case "pinned": return "Served by a known pinning service. Content should remain available.";
    case "available": return "Accessible on IPFS gateways but may not be pinned. Could disappear.";
    case "unavailable": return "Not accessible on checked gateways. May be unpinned and at risk.";
    default: return "";
  }
};

const StatusIcon = ({ status, isTransient, size = "md" }: { status: "ok" | "error" | "unknown"; isTransient?: boolean; size?: "sm" | "md" }) => {
  const sizeClasses = size === "sm" ? "w-8 h-8" : "w-12 h-12";
  const iconSize = size === "sm" ? "w-4 h-4" : "w-6 h-6";
  
  if (status === "ok") {
    return (
      <div className={`${sizeClasses} rounded-full bg-green-500/20 flex items-center justify-center`}>
        <Check className={`${iconSize} text-green-500`} />
      </div>
    );
  }
  if (isTransient) {
    return (
      <div className={`${sizeClasses} rounded-full bg-yellow-500/20 flex items-center justify-center`}>
        <AlertTriangle className={`${iconSize} text-yellow-500`} />
      </div>
    );
  }
  return (
    <div className={`${sizeClasses} rounded-full bg-red-500/20 flex items-center justify-center`}>
      <X className={`${iconSize} text-red-500`} />
    </div>
  );
};

const NftImage = ({ 
  src, 
  alt, 
  sizes = "200px",
  className = "object-cover"
}: { 
  src: string | undefined; 
  alt: string; 
  sizes?: string;
  className?: string;
}) => {
  const [hasError, setHasError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  
  if (!src || hasError) {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-foreground-faint/5">
        <ImageOff className="w-8 h-8 text-foreground-faint/30" />
      </div>
    );
  }
  
  return (
    <>
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-foreground-faint/5">
          <div className="w-6 h-6 border-2 border-foreground-faint/20 border-t-foreground-faint/50 rounded-full animate-spin" />
        </div>
      )}
      <Image
        src={src}
        alt={alt}
        fill
        sizes={sizes}
        className={`${className} ${isLoading ? 'opacity-0' : 'opacity-100'} transition-opacity duration-200`}
        unoptimized
        onLoad={() => setIsLoading(false)}
        onError={() => {
          setHasError(true);
          setIsLoading(false);
        }}
      />
    </>
  );
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
  const [urlParamScan, setUrlParamScan] = useState<{ target: string; chain: SupportedChain } | null>(null);
  const nftsRef = useRef(nfts);
  const didRestoreRef = useRef(false);
  const [currentTime, setCurrentTime] = useState(0);
  const shareCardRef = useRef<HTMLDivElement>(null);
  const [isGeneratingShare, setIsGeneratingShare] = useState(false);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>("");
  const [validBrokenAssetKeys, setValidBrokenAssetKeys] = useState<Set<string>>(new Set());
  const [selectedNftIdx, setSelectedNftIdx] = useState<number | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [showErrorsOnly, setShowErrorsOnly] = useState(false);
  const [viewMode, setViewMode] = useState<"grid" | "list">(() => {
    if (typeof window === "undefined") return "list";
    const saved = window.localStorage.getItem("onchainproxy:scanner:viewMode");
    return saved === "grid" || saved === "list" ? saved : "list";
  });
  
  const selectedNft = selectedNftIdx !== null ? nfts[selectedNftIdx] : null;
  
  const filteredNfts = useMemo(() => {
    if (!showErrorsOnly) return nfts.map((nft, idx) => ({ nft, idx }));
    return nfts
      .map((nft, idx) => ({ nft, idx }))
      .filter(({ nft }) => 
        (nft.status === "error") || 
        (nft.metadataStatus === "error") || 
        (nft.imageStatus === "error")
      );
  }, [nfts, showErrorsOnly]);

  // Persist viewMode to localStorage
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("onchainproxy:scanner:viewMode", viewMode);
  }, [viewMode]);
  
  // Generate QR code for share card (includes wallet address/ENS as query param)
  useEffect(() => {
    const baseUrl = "https://onchainproxy.io/scanner";
    const qrUrl = submittedTarget 
      ? `${baseUrl}?w=${encodeURIComponent(submittedTarget)}`
      : baseUrl;
    QRCode.toDataURL(qrUrl, {
      width: 64,
      margin: 1,
      color: { dark: "#000000", light: "#ffffff" },
    }).then(setQrCodeDataUrl).catch(() => {});
  }, [submittedTarget]);
  
  // Keep ref in sync with state - update synchronously in the setter
  // The useEffect is kept as a fallback for external state changes
  useEffect(() => {
    nftsRef.current = nfts;
  }, [nfts]);
  
  // Wrapper to update both state and ref synchronously
  const setNftsSync = useCallback((updater: React.SetStateAction<NftItem[]>) => {
    setNfts((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      nftsRef.current = next; // Update ref synchronously
      return next;
    });
  }, []);

  // Update current time every second while scanning for live ETA
  useEffect(() => {
    if (!isScanning) return;
    const interval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, [isScanning]);

  // Check URL query params and restore session from localStorage after hydration (runs once)
  useEffect(() => {
    if (didRestoreRef.current) return;
    didRestoreRef.current = true;
    
    // Schedule outside synchronous effect to satisfy lint rule
    requestAnimationFrame(() => {
      // First check for URL query param
      const urlParams = new URLSearchParams(window.location.search);
      const walletParam = urlParams.get("w");
      
      if (walletParam && isValidTarget(walletParam)) {
        // Valid wallet in URL - set input and mark for auto-scan
        setInput(walletParam);
        setUrlParamScan({ target: walletParam, chain: selectedChain });
        return;
      }
      
      // No valid URL param, try to restore from localStorage
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
  }, [selectedChain]);

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
    if (!force && (current.status === "ok" || current.status === "error" || current.status === "scanning")) return;

    setNftsSync((prev) => {
      const next = [...prev];
      const it = next[idx];
      if (!it) return prev;
      next[idx] = { ...it, status: "scanning", error: undefined, errorSource: undefined, isTransient: undefined };
      return next;
    });

    try {
      const status = await checkNftStatus(current.chain, current.contract, current.tokenId);
      if (runId !== runIdRef.current || cancelRef.current) return;

      setNftsSync((prev) => {
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
          metadataUri: status.metadataUri,
          imageUri: status.imageUri,
          metadataResponseTimeMs: status.metadataResponseTimeMs,
          metadataIsSlow: status.metadataIsSlow,
          imageResponseTimeMs: status.imageResponseTimeMs,
          imageIsSlow: status.imageIsSlow,
        };
        return next;
      });
    } catch {
      if (runId !== runIdRef.current || cancelRef.current) return;
      setNftsSync((prev) => {
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
  }, [setNftsSync]);

  const startScan = useCallback(async () => {
    const nftsLength = nftsRef.current.length;
    if (!submittedAddress || nftsLength === 0 || isScanning) return;

    cancelRef.current = false;
    runIdRef.current += 1;
    const runId = runIdRef.current;
    setIsScanning(true);
    if (!scanStartedAt) setScanStartedAt(Date.now());
    setScanEndedAt(null);

    // Keep scanning until no more pending items (handles rescan requests during scan)
    let foundPending = true;
    while (foundPending && runId === runIdRef.current && !cancelRef.current) {
      foundPending = false;
      for (let i = 0; i < nftsLength; i++) {
        if (runId !== runIdRef.current || cancelRef.current) break;
        const item = nftsRef.current[i];
        // Skip if already processed or currently being scanned
        if (!item || item.status === "ok" || item.status === "error" || item.status === "scanning") continue;
        foundPending = true;
        await scanOne(i, { runId });
      }
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

  // Share/download report as image
  const shareReport = useCallback(async () => {
    if (!shareCardRef.current || isGeneratingShare) return;
    
    setIsGeneratingShare(true);
    try {
      // Pre-check which broken asset images can actually load
      const brokenAssets = nfts.filter(
        (n) => (n.imageStatus === "error" || n.metadataStatus === "error")
      );
      
      const validKeys = new Set<string>();
      await Promise.all(
        brokenAssets.slice(0, 10).map(async (nft) => {
          const key = `${nft.contract}-${nft.tokenId}`;
          const url = `/${submittedChain}/${nft.contract}/${nft.tokenId}/image?w=128&h=128`;
          try {
            const res = await fetch(url, { method: "HEAD" });
            if (res.ok) {
              validKeys.add(key);
            }
          } catch {
            // Image failed to load, don't add to valid set
          }
        })
      );
      setValidBrokenAssetKeys(validKeys);
      
      // Wait a tick for state to update and re-render
      await new Promise((resolve) => setTimeout(resolve, 100));
      
      // Generate the image (images use same-origin proxy endpoint, no CORS issues)
      const dataUrl = await toPng(shareCardRef.current, {
        quality: 1,
        pixelRatio: 2,
        backgroundColor: "#0a0a0a",
      });
      
      // Convert to blob
      const response = await fetch(dataUrl);
      const blob = await response.blob();
      const file = new File([blob], "onchain-scanner-report.png", { type: "image/png" });
      
      // Try native share first
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          title: "OnChain Scanner Report",
          text: `Check out my wallet's onchain asset health report!`,
          url: "https://onchainproxy.io/scanner",
          files: [file],
        });
      } else {
        // Fallback: download the image
        const link = document.createElement("a");
        link.href = dataUrl;
        link.download = "onchain-scanner-report.png";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    } catch (error) {
      // User cancelled share - this is normal behavior
      if (error instanceof Error && error.name === "AbortError") {
        return;
      }
      console.error("Share failed:", error instanceof Error ? error.message : error);
    } finally {
      setIsGeneratingShare(false);
    }
  }, [isGeneratingShare, nfts, submittedChain]);

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

  // Auto-scan from URL param (runs after component mounts and fetchAndScan is available)
  useEffect(() => {
    if (urlParamScan && !loading && !isScanning) {
      const { target, chain } = urlParamScan;
      setUrlParamScan(null);
      // Try to restore session first, otherwise start fresh scan
      if (!restoreSession(target, chain)) {
        void fetchAndScan(target, chain);
      }
    }
  }, [urlParamScan, loading, isScanning, restoreSession, fetchAndScan]);

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
  const canSubmit = isChainSupportedForWallet && isValidTarget(inputTrimmed) && !loading && !isScanning;


  return (
    <main className="min-h-screen max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8 font-mono">
      <div className="space-y-8 sm:space-y-10">
        <header className="space-y-3">
          <Link href="/" className="inline-flex items-center gap-1 leading-none text-foreground-faint hover:underline">
            <ArrowLeft className="w-4 h-4 shrink-0" />
            <span className="leading-none">Back to docs</span>
          </Link>
          <h1 className="font-bold">Onchain Scanner</h1>
          <p className="text-foreground-muted">
            Enter an Ethereum address or ENS name to scan owned assets and check if their metadata and images are live.
          </p>
        </header>

        <Section title="Target">
          <form onSubmit={handleScan} className="flex flex-col sm:flex-row gap-3 sm:gap-4">
            <div className="relative inline-grid grid-cols-1">
              <select
                value={selectedChain}
                onChange={(e) => setSelectedChain(e.target.value as SupportedChain)}
                className="col-start-1 row-start-1 pl-4 pr-8 py-2.5 bg-foreground/10 border border-transparent rounded-lg focus:border-foreground focus:outline-none transition-colors cursor-pointer appearance-none"
              >
                {SUPPORTED_CHAINS.map((c) => (
                  <option key={c} value={c}>
                    {chainLabel(c)}
                  </option>
                ))}
              </select>
              {/* Hidden text to set width based on selected value */}
              <span className="col-start-1 row-start-1 invisible pl-4 pr-8 py-2.5 whitespace-nowrap" aria-hidden="true">
                {chainLabel(selectedChain)}
              </span>
              {/* Dropdown arrow */}
              <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                <svg className="w-4 h-4 text-foreground-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
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
              className="flex-1 px-4 py-2.5 bg-foreground/10 border border-transparent rounded-lg focus:border-foreground focus:outline-none transition-colors placeholder:text-foreground-faint/50"
            />
            <button
              type="submit"
              disabled={!canSubmit}
              className="w-full sm:w-auto px-6 py-2.5 bg-foreground text-background font-bold rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity inline-flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Fetching...
                </>
              ) : isScanning ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Scanning...
                </>
              ) : (
                "Scan"
              )}
            </button>
          </form>
          {!isChainSupportedForWallet ? (
            <div className="mt-2 text-foreground-faint">
              Wallet asset listing is not supported on <span className="text-foreground">{selectedChain}</span> yet.
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

              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  {isScanning ? (
                    <button 
                      type="button" 
                      onClick={cancelScan} 
                      className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-colors"
                    >
                      <Square className="w-3.5 h-3.5" />
                      Cancel
                    </button>
                  ) : hasPending ? (
                    <button 
                      type="button" 
                      onClick={continueScan} 
                      className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-green-500/10 text-green-500 hover:bg-green-500/20 transition-colors"
                    >
                      <Play className="w-3.5 h-3.5" />
                      Continue
                    </button>
                  ) : stats.scanned === stats.total && stats.total > 0 ? (
                    <button
                      type="button"
                      onClick={rescanWallet}
                      className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-foreground/10 text-foreground hover:bg-foreground/15 transition-colors"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      Rescan
                    </button>
                  ) : null}
                </div>

                <div className="flex items-center gap-4 text-foreground-muted">
                  {isScanning && eta ? (
                    <div className="text-foreground-faint text-sm">
                      <span title={`${eta.speed} items/s`}>~{formatDuration(eta.remaining)} left</span>
                    </div>
                  ) : null}
                  <div className="text-foreground-faint">
                    {stats.scanned}/{stats.total}
                  </div>
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
            {/* Wallet Health Report */}
            <div className="rounded-xl border border-foreground-faint/20 overflow-hidden">
              {/* Health Score Header */}
              <div className={`p-5 ${
                stats.scanned === 0 
                  ? "bg-foreground-faint/5" 
                  : stats.brokenAssetsPct === 0 
                    ? "bg-green-500/10" 
                    : stats.brokenAssetsPct < 10 
                      ? "bg-yellow-500/10" 
                      : stats.brokenAssetsPct < 30 
                        ? "bg-orange-500/10" 
                        : "bg-red-500/10"
              }`}>
                <div className="flex items-center justify-between gap-4 mb-3">
                  <div>
                    <div className="text-foreground-faint text-sm mb-1">Wallet on {chainLabel(submittedChain)}</div>
                    <div className="font-bold text-lg truncate max-w-[280px]" title={submittedTarget || submittedAddress}>
                      {submittedTarget && submittedTarget.toLowerCase() !== submittedAddress.toLowerCase()
                        ? submittedTarget
                        : shortAddress(submittedAddress)}
                    </div>
                    {submittedTarget && submittedTarget.toLowerCase() !== submittedAddress.toLowerCase() && (
                      <div className="text-foreground-faint text-sm truncate max-w-[280px]" title={submittedAddress}>
                        {shortAddress(submittedAddress)}
                      </div>
                    )}
                  </div>
                  {stats.scanned > 0 && (
                    <div className="text-right">
                      <div className={`text-3xl font-bold ${
                        stats.brokenAssetsPct === 0 
                          ? "text-green-500" 
                          : stats.brokenAssetsPct < 10 
                            ? "text-yellow-500" 
                            : stats.brokenAssetsPct < 30 
                              ? "text-orange-500" 
                              : "text-red-500"
                      }`}>
                        {100 - stats.brokenAssetsPct}%
                      </div>
                      <div className="text-foreground-faint text-sm">
                        {stats.brokenAssetsPct === 0 
                          ? "All assets healthy" 
                          : stats.brokenAssetsPct < 10 
                            ? "Good health" 
                            : stats.brokenAssetsPct < 30 
                              ? "Some issues" 
                              : "Needs attention"}
                      </div>
                    </div>
                  )}
                </div>
                
                {/* Quick Stats */}
                <div className="flex flex-wrap gap-4 text-sm">
                  <div className="flex items-center gap-1.5">
                    <span className="text-foreground-faint">
                      {stats.scanned}/{stats.total} scanned
                      {stats.scanned < stats.total && (
                        <span className="text-foreground-faint/60"> (in progress)</span>
                      )}
                    </span>
                  </div>
                  {stats.brokenAssets > 0 && (
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-red-500" />
                      <span className="text-red-500 font-medium">{stats.brokenAssets} broken</span>
                    </div>
                  )}
                  {stats.transientErrors > 0 && (
                    <div className="flex items-center gap-1.5" title="Temporary errors that may resolve on retry">
                      <span className="w-2 h-2 rounded-full bg-yellow-500" />
                      <span className="text-yellow-500 font-medium">{stats.transientErrors} uncertain</span>
                    </div>
                  )}
                  {(stats.metadataIpfsUnavailable > 0 || stats.imageIpfsUnavailable > 0) && (
                    <div className="flex items-center gap-1.5" title="IPFS assets that may no longer be pinned">
                      <span className="w-2 h-2 rounded-full bg-orange-500" />
                      <span className="text-orange-500 font-medium">
                        {stats.metadataIpfsUnavailable + stats.imageIpfsUnavailable} unpinned IPFS
                      </span>
                    </div>
                  )}
                </div>
              </div>
              
              {/* Detailed Breakdown */}
              {stats.scanned > 0 && (
                <div className="p-5 bg-foreground/5 space-y-4">
                  {/* Status Breakdown */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-foreground-faint text-xs uppercase tracking-wider mb-2">Metadata</div>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="whitespace-nowrap">
                          <span className="text-green-500 font-bold">{stats.metadataLive}</span>
                          <span className="text-foreground-faint text-sm ml-1">ok</span>
                        </span>
                        {stats.metadataDown > 0 && (
                          <span className="whitespace-nowrap">
                            <span className="text-foreground-faint/30">•</span>
                            <span className="text-red-500 font-bold ml-1">{stats.metadataDown}</span>
                            <span className="text-foreground-faint text-sm ml-1">broken</span>
                          </span>
                        )}
                        {stats.metadataUnknown > 0 && (
                          <span className="whitespace-nowrap">
                            <span className="text-foreground-faint/30">•</span>
                            <span className="text-yellow-500 font-bold ml-1">{stats.metadataUnknown}</span>
                            <span className="text-foreground-faint text-sm ml-1">uncertain</span>
                          </span>
                        )}
                      </div>
                    </div>
                    <div>
                      <div className="text-foreground-faint text-xs uppercase tracking-wider mb-2">Images</div>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="whitespace-nowrap">
                          <span className="text-green-500 font-bold">{stats.imageLive}</span>
                          <span className="text-foreground-faint text-sm ml-1">ok</span>
                        </span>
                        {stats.imageDown > 0 && (
                          <span className="whitespace-nowrap">
                            <span className="text-foreground-faint/30">•</span>
                            <span className="text-red-500 font-bold ml-1">{stats.imageDown}</span>
                            <span className="text-foreground-faint text-sm ml-1">broken</span>
                          </span>
                        )}
                        {stats.imageUnknown > 0 && (
                          <span className="whitespace-nowrap">
                            <span className="text-foreground-faint/30">•</span>
                            <span className="text-yellow-500 font-bold ml-1">{stats.imageUnknown}</span>
                            <span className="text-foreground-faint text-sm ml-1">uncertain</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  {/* Storage Distribution */}
                  <div className="pt-3 border-t border-foreground-faint/10">
                    <div className="text-foreground-faint text-xs uppercase tracking-wider mb-3">Storage</div>
                    <div className="flex flex-wrap gap-2">
                      {stats.metadataOnchain + stats.imageOnchain > 0 && (
                        <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-green-500/10 text-green-500 text-sm">
                          <Database className="w-3.5 h-3.5" />
                          {stats.metadataOnchain + stats.imageOnchain} on-chain
                        </span>
                      )}
                      {stats.metadataIpfs + stats.imageIpfs > 0 && (
                        <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded text-sm ${
                          stats.metadataIpfsUnavailable + stats.imageIpfsUnavailable > 0
                            ? "bg-orange-500/10 text-orange-500"
                            : "bg-blue-500/10 text-blue-500"
                        }`}>
                          <Box className="w-3.5 h-3.5" />
                          {stats.metadataIpfs + stats.imageIpfs} IPFS
                        </span>
                      )}
                      {stats.metadataArweave + stats.imageArweave > 0 && (
                        <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-purple-500/10 text-purple-500 text-sm">
                          <HardDrive className="w-3.5 h-3.5" />
                          {stats.metadataArweave + stats.imageArweave} Arweave
                        </span>
                      )}
                      {stats.metadataCentralized + stats.imageCentralized > 0 && (
                        <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-yellow-500/10 text-yellow-600 text-sm">
                          <Server className="w-3.5 h-3.5" />
                          {stats.metadataCentralized + stats.imageCentralized} centralized
                        </span>
                      )}
                    </div>
                  </div>
                  
                  {/* IPFS Warning */}
                  {(stats.metadataIpfsUnavailable > 0 || stats.imageIpfsUnavailable > 0) && (
                    <div className="p-3 rounded-lg bg-orange-500/10 border border-orange-500/20">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="w-4 h-4 text-orange-500 mt-0.5 flex-shrink-0" />
                        <div>
                          <div className="text-orange-500 font-medium text-sm">
                            {stats.metadataIpfsUnavailable + stats.imageIpfsUnavailable} IPFS assets may be unpinned
                          </div>
                          <div className="text-orange-500/70 text-xs mt-0.5">
                            These assets are not on a pinning service and could become unavailable if no one is hosting them.
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {/* Share Button */}
                  {stats.scanned === stats.total && stats.total > 0 && (
                    <div className="pt-4 border-t border-foreground-faint/10">
                      <button
                        type="button"
                        onClick={shareReport}
                        disabled={isGeneratingShare}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg bg-foreground text-background hover:bg-foreground/90 transition-colors disabled:opacity-50"
                      >
                        {isGeneratingShare ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Generating...
                          </>
                        ) : (
                          <>
                            <Share2 className="w-4 h-4" />
                            Share Report
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            <Section 
              title={`Results (${stats.scanned}/${nfts.length})`}
              rightElement={nfts.length > 0 ? (
                <div className="flex items-center gap-2">
                  <div className="flex items-center rounded overflow-hidden border border-foreground-faint/20">
                    <button
                      type="button"
                      onClick={() => setViewMode("list")}
                      className={`p-1.5 transition-colors ${
                        viewMode === "list" 
                          ? "bg-foreground text-background" 
                          : "bg-transparent text-foreground-muted hover:bg-foreground-faint/10"
                      }`}
                      title="List view"
                    >
                      <List className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewMode("grid")}
                      className={`p-1.5 transition-colors ${
                        viewMode === "grid" 
                          ? "bg-foreground text-background" 
                          : "bg-transparent text-foreground-muted hover:bg-foreground-faint/10"
                      }`}
                      title="Grid view"
                    >
                      <LayoutGrid className="w-4 h-4" />
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowErrorsOnly(!showErrorsOnly)}
                    className={`px-3 py-1.5 text-sm font-bold rounded transition-colors whitespace-nowrap ${
                      showErrorsOnly 
                        ? "bg-red-500 text-white" 
                        : "bg-foreground-faint/10 text-foreground-muted hover:bg-foreground-faint/20"
                    }`}
                  >
                    Errors only
                  </button>
                </div>
              ) : undefined}
            >
              {nfts.length === 0 ? (
                <div className="py-12 text-center text-foreground-muted">
                  <ImageOff className="w-12 h-12 mx-auto mb-3 text-foreground-faint/30" />
                  <p>No assets found in this wallet.</p>
                </div>
              ) : filteredNfts.length === 0 ? (
                <div className="py-12 text-center text-foreground-muted">
                  <Check className="w-12 h-12 mx-auto mb-3 text-green-500/50" />
                  <p>No errors found. All scanned assets are healthy!</p>
                </div>
              ) : viewMode === "grid" ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {filteredNfts.map(({ nft, idx }) => {
                  const thumb = normalizeImageUrl(nft.thumbnailUrl);

                  return (
                    <button
                      key={`${nft.contract}-${nft.tokenId}-${idx}`}
                      type="button"
                      onClick={() => {
                        setSelectedNftIdx(idx);
                        setDrawerOpen(true);
                      }}
                      className="group text-left bg-foreground-faint/5 hover:bg-foreground-faint/10 transition-colors rounded-lg overflow-hidden"
                    >
                      <div className="aspect-square bg-foreground-faint/10 overflow-hidden relative">
                        <NftImage
                          src={thumb}
                          alt={nft.title || "Asset"}
                          sizes="200px"
                        />
                        {/* Status overlay */}
                        {nft.status === "scanning" && (
                          <div className="absolute inset-0 bg-background/60 flex items-center justify-center">
                            <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
                          </div>
                        )}
                      </div>

                      <div className="p-2 space-y-1">
                        <div className="font-bold text-sm truncate" title={nft.title}>
                          {nft.title || `#${nft.tokenId}`}
                        </div>
                        {nft.collection ? (
                          <div className="text-foreground-muted text-xs truncate" title={nft.collection}>
                            {nft.collection}
                          </div>
                        ) : null}
                        
                        {/* Status indicators */}
                        <div className="flex items-center gap-2 pt-1">
                          {nft.status === "pending" ? (
                            <span className="text-foreground-faint/50 text-[10px]">QUEUED</span>
                          ) : nft.status === "scanning" ? (
                            <span className="text-blue-500 text-[10px] animate-pulse">SCANNING</span>
                          ) : (
                            <>
                              <span className={`text-[10px] font-bold ${
                                nft.metadataStatus === "ok" ? "text-green-600" : nft.isTransient ? "text-yellow-600" : "text-red-500"
                              }`}>
                                META
                              </span>
                              <span className={`text-[10px] font-bold ${
                                nft.imageStatus === "ok" ? "text-green-600" : nft.imageError ? "text-yellow-600" : "text-red-500"
                              }`}>
                                IMG
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
              ) : (
              <div className="divide-y divide-foreground-faint/10">
                {filteredNfts.map(({ nft, idx }) => {
                  const thumb = normalizeImageUrl(nft.thumbnailUrl);

                  return (
                    <button
                      key={`${nft.contract}-${nft.tokenId}-${idx}`}
                      type="button"
                      onClick={() => {
                        setSelectedNftIdx(idx);
                        setDrawerOpen(true);
                      }}
                      className="w-full flex items-center gap-4 px-3 py-3 text-left hover:bg-foreground-faint/5 transition-colors"
                    >
                      {/* Thumbnail */}
                      <div className="w-12 h-12 sm:w-14 sm:h-14 bg-foreground-faint/10 overflow-hidden shrink-0 relative rounded">
                        <NftImage
                          src={thumb}
                          alt={nft.title || "Asset"}
                          sizes="56px"
                        />
                        {nft.status === "scanning" && (
                          <div className="absolute inset-0 bg-background/60 flex items-center justify-center">
                            <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                          </div>
                        )}
                      </div>

                      {/* Title & Collection */}
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-sm truncate" title={nft.title}>
                          {nft.title || `#${nft.tokenId}`}
                        </div>
                        {nft.collection ? (
                          <div className="text-foreground-muted text-xs truncate" title={nft.collection}>
                            {nft.collection}
                          </div>
                        ) : null}
                      </div>

                      {/* Audit data */}
                      <div className="shrink-0 flex items-center gap-3">
                        {nft.status === "pending" ? (
                          <span className="text-foreground-faint/50 text-xs">QUEUED</span>
                        ) : nft.status === "scanning" ? (
                          <span className="text-blue-500 text-xs animate-pulse">SCANNING</span>
                        ) : (
                          <>
                            {/* Metadata */}
                            <div className="flex items-center gap-1.5">
                              <div className={`flex items-center justify-center w-6 h-6 rounded ${
                                nft.metadataStatus === "error" && !nft.isTransient ? "bg-red-500/10 text-red-500" :
                                nft.metadataStorage === "onchain" ? "bg-green-500/10 text-green-600" :
                                nft.metadataStorage === "ipfs" ? "bg-blue-500/10 text-blue-600" :
                                nft.metadataStorage === "arweave" ? "bg-purple-500/10 text-purple-600" :
                                nft.metadataStorage === "centralized" ? "bg-yellow-500/10 text-yellow-600" :
                                "bg-foreground-faint/10 text-foreground-faint"
                              }`}>
                                <StorageIcon type={nft.metadataStorage} />
                              </div>
                              <span className={`text-xs font-bold ${
                                nft.metadataStatus === "ok" ? "text-green-600" : nft.isTransient ? "text-yellow-600" : "text-red-500"
                              }`}>
                                META
                              </span>
                            </div>

                            {/* Image */}
                            <div className="flex items-center gap-1.5">
                              <div className={`flex items-center justify-center w-6 h-6 rounded ${
                                nft.imageStatus === "error" && !nft.imageError ? "bg-red-500/10 text-red-500" :
                                nft.imageStorage === "onchain" ? "bg-green-500/10 text-green-600" :
                                nft.imageStorage === "ipfs" ? "bg-blue-500/10 text-blue-600" :
                                nft.imageStorage === "arweave" ? "bg-purple-500/10 text-purple-600" :
                                nft.imageStorage === "centralized" ? "bg-yellow-500/10 text-yellow-600" :
                                "bg-foreground-faint/10 text-foreground-faint"
                              }`}>
                                <StorageIcon type={nft.imageStorage} />
                              </div>
                              <span className={`text-xs font-bold ${
                                nft.imageStatus === "ok" ? "text-green-600" : nft.imageError ? "text-yellow-600" : "text-red-500"
                              }`}>
                                IMG
                              </span>
                            </div>
                          </>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
              )}
            </Section>
          </div>
        )}
      </div>

      {/* NFT Detail Drawer */}
      <Drawer.Root open={drawerOpen} onOpenChange={setDrawerOpen}>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 bg-black/40 z-40" />
          <Drawer.Content className="fixed bottom-0 left-0 right-0 z-50 bg-background flex flex-col rounded-t-2xl max-h-[90vh]">
            <div className="p-4 pb-0">
              <div className="mx-auto w-12 h-1.5 flex-shrink-0 rounded-full bg-foreground-faint/30 mb-4" />
            </div>
            
            {selectedNft && selectedNftIdx !== null && (
              <div className="flex-1 overflow-y-auto px-4 pb-8 font-mono">
                <div className="max-w-2xl mx-auto">
                {/* Header */}
                <div className="flex gap-4 mb-6">
                  <div className="w-24 h-24 sm:w-32 sm:h-32 bg-foreground-faint/10 overflow-hidden shrink-0 relative rounded-lg">
                    <NftImage
                      src={normalizeImageUrl(selectedNft.thumbnailUrl)}
                      alt={selectedNft.title || "Asset"}
                      sizes="128px"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <Drawer.Title className="font-bold text-lg truncate">{selectedNft.title || `#${selectedNft.tokenId}`}</Drawer.Title>
                    {selectedNft.collection && (
                      <div className="text-foreground-muted truncate">{selectedNft.collection}</div>
                    )}
                    <div className="text-foreground-faint text-xs mt-2 space-y-0.5">
                      <div className="truncate" title={selectedNft.contract}>{shortAddress(selectedNft.contract)}</div>
                      <div>#{selectedNft.tokenId}</div>
                    </div>
                  </div>
                </div>

                {/* General Links */}
                <div className="flex flex-wrap gap-3 mb-6">
                  <a
                    href={`https://opensea.io/assets/${openSeaChainSlug(selectedNft.chain)}/${selectedNft.contract}/${selectedNft.tokenId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-foreground-faint hover:text-foreground hover:underline transition-colors text-sm"
                  >
                    <span>OpenSea</span>
                    <ArrowUpRight className="w-4 h-4" />
                  </a>
                  <Link
                    href={`/${selectedNft.chain}/${selectedNft.contract}/${selectedNft.tokenId}/scan`}
                    className="inline-flex items-center gap-1 text-foreground-faint hover:text-foreground hover:underline transition-colors text-sm"
                  >
                    <span>Full Details</span>
                    <ArrowUpRight className="w-4 h-4" />
                  </Link>
                </div>

                {/* Status */}
                {selectedNft.status === "pending" ? (
                  <div className="text-foreground-faint text-center py-8">Waiting in queue...</div>
                ) : selectedNft.status === "scanning" ? (
                  <div className="flex items-center justify-center gap-3 py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
                    <span className="text-foreground-muted">Scanning...</span>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Metadata Section */}
                    <div className={`p-4 rounded-lg border ${
                      selectedNft.metadataStatus === "ok" 
                        ? "border-green-500/30 bg-green-500/5" 
                        : selectedNft.isTransient
                        ? "border-yellow-500/30 bg-yellow-500/5"
                        : "border-red-500/30 bg-red-500/5"
                    }`}>
                      <div className="flex items-center justify-between gap-3 mb-3">
                        <div className="flex items-center gap-3">
                          <StatusIcon 
                            status={selectedNft.metadataStatus === "ok" ? "ok" : "error"} 
                            isTransient={selectedNft.isTransient}
                            size="sm"
                          />
                          <div>
                            <div className="font-bold">Metadata</div>
                            <div className={`text-xs ${
                              selectedNft.metadataStatus === "ok" ? "text-green-500" : selectedNft.isTransient ? "text-yellow-500" : "text-red-500"
                            }`}>
                              {selectedNft.metadataStatus === "ok" ? "Accessible" : selectedNft.isTransient ? "Temporarily unavailable" : "Inaccessible"}
                            </div>
                          </div>
                        </div>
                        <a
                          href={`/${selectedNft.chain}/${selectedNft.contract}/${selectedNft.tokenId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold rounded bg-foreground/10 hover:bg-foreground/20 transition-colors"
                        >
                          <span>View JSON</span>
                          <ArrowUpRight className="w-3 h-3" />
                        </a>
                      </div>
                      
                      {selectedNft.metadataStorage && (
                        <div className={`p-2 rounded text-xs ${storageBgColor(selectedNft.metadataStorage)} mb-2`}>
                          <div className="flex items-center gap-2">
                            <span className={`font-bold flex items-center gap-1 ${storageColor(selectedNft.metadataStorage)}`}>
                              <StorageIcon type={selectedNft.metadataStorage} className="w-3 h-3" />
                              {storageLabel(selectedNft.metadataStorage)}
                            </span>
                            {selectedNft.metadataStorage === "centralized" && selectedNft.metadataCentralizedDomain && (
                              <span className="text-foreground-muted" title={selectedNft.metadataCentralizedDomain}>({mainDomain(selectedNft.metadataCentralizedDomain)})</span>
                            )}
                            {selectedNft.metadataStorage === "centralized" && selectedNft.metadataResponseTimeMs !== undefined && (
                              <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                                selectedNft.metadataIsSlow 
                                  ? "bg-orange-500/20 text-orange-500" 
                                  : "bg-foreground/10 text-foreground-muted"
                              }`} title={selectedNft.metadataIsSlow ? "Server response is slow (>1s)" : "Server response time"}>
                                {selectedNft.metadataResponseTimeMs}ms{selectedNft.metadataIsSlow && " 🐢"}
                              </span>
                            )}
                            {selectedNft.metadataStorage === "ipfs" && selectedNft.metadataIpfsPinStatus && (
                              <span className={`text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1 ${
                                selectedNft.metadataIpfsPinStatus === "pinned" 
                                  ? "bg-green-500/20 text-green-500"
                                  : selectedNft.metadataIpfsPinStatus === "available"
                                  ? "bg-blue-500/20 text-blue-500"
                                  : "bg-orange-500/20 text-orange-500"
                              }`}>
                                <IpfsPinIcon status={selectedNft.metadataIpfsPinStatus} className="w-2.5 h-2.5" />
                                {ipfsPinLabel(selectedNft.metadataIpfsPinStatus)}
                              </span>
                            )}
                          </div>
                          <div className="text-foreground-muted mt-1 text-[10px]">
                            {storageDescription(selectedNft.metadataStorage)}
                          </div>
                        </div>
                      )}
                      
                      {selectedNft.metadataUri && (
                        <a
                          href={selectedNft.metadataUri}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block text-xs font-mono text-foreground-muted hover:text-foreground bg-foreground/5 hover:bg-foreground/10 px-2 py-1.5 rounded mb-2 truncate transition-colors"
                          title={selectedNft.metadataUri}
                        >
                          {shortUri(selectedNft.metadataUri)}
                        </a>
                      )}
                      
                      {selectedNft.error && selectedNft.metadataStatus !== "ok" && (
                        <div className="text-xs text-foreground-muted bg-red-500/10 p-2 rounded">
                          {selectedNft.errorSource && <span className="text-foreground-faint">[{selectedNft.errorSource}] </span>}
                          {selectedNft.error}
                        </div>
                      )}
                    </div>

                    {/* Image Section */}
                    <div className={`p-4 rounded-lg border ${
                      selectedNft.imageStatus === "ok" 
                        ? "border-green-500/30 bg-green-500/5" 
                        : selectedNft.imageError
                        ? "border-yellow-500/30 bg-yellow-500/5"
                        : "border-red-500/30 bg-red-500/5"
                    }`}>
                      <div className="flex items-center justify-between gap-3 mb-3">
                        <div className="flex items-center gap-3">
                          <StatusIcon 
                            status={selectedNft.imageStatus === "ok" ? "ok" : "error"} 
                            isTransient={!!selectedNft.imageError}
                            size="sm"
                          />
                          <div>
                            <div className="font-bold">Image</div>
                            <div className={`text-xs ${
                              selectedNft.imageStatus === "ok" ? "text-green-500" : selectedNft.imageError ? "text-yellow-500" : "text-red-500"
                            }`}>
                              {selectedNft.imageStatus === "ok" 
                                ? "Accessible" 
                                : selectedNft.imageError 
                                ? "Temporarily unavailable" 
                                : selectedNft.metadataStatus === "ok"
                                ? "No image in metadata"
                                : "Cannot check"}
                            </div>
                          </div>
                        </div>
                        <a
                          href={`/${selectedNft.chain}/${selectedNft.contract}/${selectedNft.tokenId}/image`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold rounded bg-foreground/10 hover:bg-foreground/20 transition-colors"
                        >
                          <span>View Image</span>
                          <ArrowUpRight className="w-3 h-3" />
                        </a>
                      </div>
                      
                      {selectedNft.imageStorage && (
                        <div className={`p-2 rounded text-xs ${storageBgColor(selectedNft.imageStorage)} mb-2`}>
                          <div className="flex items-center gap-2">
                            <span className={`font-bold flex items-center gap-1 ${storageColor(selectedNft.imageStorage)}`}>
                              <StorageIcon type={selectedNft.imageStorage} className="w-3 h-3" />
                              {storageLabel(selectedNft.imageStorage)}
                            </span>
                            {selectedNft.imageStorage === "centralized" && selectedNft.imageCentralizedDomain && (
                              <span className="text-foreground-muted" title={selectedNft.imageCentralizedDomain}>({mainDomain(selectedNft.imageCentralizedDomain)})</span>
                            )}
                            {selectedNft.imageStorage === "centralized" && selectedNft.imageResponseTimeMs !== undefined && (
                              <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                                selectedNft.imageIsSlow 
                                  ? "bg-orange-500/20 text-orange-500" 
                                  : "bg-foreground/10 text-foreground-muted"
                              }`} title={selectedNft.imageIsSlow ? "Server response is slow (>1s)" : "Server response time"}>
                                {selectedNft.imageResponseTimeMs}ms{selectedNft.imageIsSlow && " 🐢"}
                              </span>
                            )}
                            {selectedNft.imageStorage === "ipfs" && selectedNft.imageIpfsPinStatus && (
                              <span className={`text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1 ${
                                selectedNft.imageIpfsPinStatus === "pinned" 
                                  ? "bg-green-500/20 text-green-500"
                                  : selectedNft.imageIpfsPinStatus === "available"
                                  ? "bg-blue-500/20 text-blue-500"
                                  : "bg-orange-500/20 text-orange-500"
                              }`}>
                                <IpfsPinIcon status={selectedNft.imageIpfsPinStatus} className="w-2.5 h-2.5" />
                                {ipfsPinLabel(selectedNft.imageIpfsPinStatus)}
                              </span>
                            )}
                          </div>
                          <div className="text-foreground-muted mt-1 text-[10px]">
                            {storageDescription(selectedNft.imageStorage)}
                          </div>
                        </div>
                      )}
                      
                      {selectedNft.imageUri && (
                        <a
                          href={selectedNft.imageUri}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block text-xs font-mono text-foreground-muted hover:text-foreground bg-foreground/5 hover:bg-foreground/10 px-2 py-1.5 rounded mb-2 truncate transition-colors"
                          title={selectedNft.imageUri}
                        >
                          {shortUri(selectedNft.imageUri)}
                        </a>
                      )}
                      
                      {/* Image Details */}
                      {(selectedNft.imageFormat || selectedNft.imageSizeBytes) && (
                        <div className="flex flex-wrap gap-3 text-xs mb-2">
                          {selectedNft.imageFormat && selectedNft.imageFormat !== "unknown" && (
                            <div>
                              <span className="text-foreground-faint">Format: </span>
                              <span className="text-foreground font-mono uppercase">{selectedNft.imageFormat}</span>
                            </div>
                          )}
                          {selectedNft.imageSizeBytes && (
                            <div>
                              <span className="text-foreground-faint">Size: </span>
                              <span className="text-foreground">{formatBytes(selectedNft.imageSizeBytes)}</span>
                            </div>
                          )}
                        </div>
                      )}
                      
                      {selectedNft.imageError && (
                        <div className="text-xs text-foreground-muted bg-yellow-500/10 p-2 rounded">
                          {selectedNft.imageError}
                        </div>
                      )}
                    </div>

                    {/* Rescan Button */}
                    <button
                      onClick={() => {
                        setNfts((prev) => {
                          const next = [...prev];
                          const it = next[selectedNftIdx];
                          if (!it) return prev;
                          next[selectedNftIdx] = resetNftScan(it);
                          return next;
                        });
                        cancelRef.current = false;
                        setTimeout(() => void scanOne(selectedNftIdx, { force: true }), 0);
                      }}
                      className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-foreground text-background font-bold rounded hover:opacity-90 transition-opacity"
                    >
                      <RefreshCw className="w-4 h-4" />
                      Rescan
                    </button>
                  </div>
                )}
                </div>
              </div>
            )}
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
      
      {/* Hidden Share Card for Image Generation */}
      <div className="fixed -left-[9999px] -top-[9999px]">
        <div
          ref={shareCardRef}
          className="w-[600px] p-8 bg-[#0a0a0a] text-white"
          style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="text-2xl font-bold">Wallet Health Report</div>
            <div className={`text-4xl font-bold ${
              stats.brokenAssetsPct === 0 
                ? "text-green-500" 
                : stats.brokenAssetsPct < 10 
                  ? "text-yellow-500" 
                  : stats.brokenAssetsPct < 30 
                    ? "text-orange-500" 
                    : "text-red-500"
            }`}>
              {stats.scanned > 0 ? `${100 - stats.brokenAssetsPct}%` : "—"}
            </div>
          </div>
          
          {/* Wallet Address */}
          <div className="mb-6 p-4 rounded-lg bg-white/5">
            <div className="text-gray-400 text-sm mb-1">Wallet on {chainLabel(submittedChain)}</div>
            <div className="text-xl font-bold truncate">
              {submittedTarget && submittedTarget.toLowerCase() !== submittedAddress.toLowerCase()
                ? submittedTarget
                : shortAddress(submittedAddress)}
            </div>
            {submittedTarget && submittedTarget.toLowerCase() !== submittedAddress.toLowerCase() && (
              <div className="text-gray-500 text-sm">{shortAddress(submittedAddress)}</div>
            )}
          </div>
          
          {/* Stats Grid */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="p-4 rounded-lg bg-white/5">
              <div className="text-gray-400 text-sm mb-2">Assets Scanned</div>
              <div className="text-2xl font-bold">{stats.scanned}</div>
            </div>
            <div className="p-4 rounded-lg bg-white/5">
              <div className="text-gray-400 text-sm mb-2">Issues Found</div>
              <div className={`text-2xl font-bold ${stats.brokenAssets > 0 ? "text-red-500" : "text-green-500"}`}>
                {stats.brokenAssets}
              </div>
            </div>
          </div>
          
          {/* Health Breakdown */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="p-4 rounded-lg bg-white/5">
              <div className="text-gray-400 text-sm mb-2">Metadata</div>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="whitespace-nowrap">
                  <span className="text-green-500 font-bold">{stats.metadataLive}</span>
                  <span className="text-gray-500 ml-1">ok</span>
                </span>
                {stats.metadataDown > 0 && (
                  <span className="whitespace-nowrap">
                    <span className="text-gray-600">•</span>
                    <span className="text-red-500 font-bold ml-1">{stats.metadataDown}</span>
                    <span className="text-gray-500 ml-1">broken</span>
                  </span>
                )}
                {stats.metadataUnknown > 0 && (
                  <span className="whitespace-nowrap">
                    <span className="text-gray-600">•</span>
                    <span className="text-yellow-500 font-bold ml-1">{stats.metadataUnknown}</span>
                    <span className="text-gray-500 ml-1">uncertain</span>
                  </span>
                )}
              </div>
            </div>
            <div className="p-4 rounded-lg bg-white/5">
              <div className="text-gray-400 text-sm mb-2">Images</div>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="whitespace-nowrap">
                  <span className="text-green-500 font-bold">{stats.imageLive}</span>
                  <span className="text-gray-500 ml-1">ok</span>
                </span>
                {stats.imageDown > 0 && (
                  <span className="whitespace-nowrap">
                    <span className="text-gray-600">•</span>
                    <span className="text-red-500 font-bold ml-1">{stats.imageDown}</span>
                    <span className="text-gray-500 ml-1">broken</span>
                  </span>
                )}
                {stats.imageUnknown > 0 && (
                  <span className="whitespace-nowrap">
                    <span className="text-gray-600">•</span>
                    <span className="text-yellow-500 font-bold ml-1">{stats.imageUnknown}</span>
                    <span className="text-gray-500 ml-1">uncertain</span>
                  </span>
                )}
              </div>
            </div>
          </div>
          
          {/* Storage Distribution */}
          <div className="p-4 rounded-lg bg-white/5 mb-4">
            <div className="text-gray-400 text-sm mb-3">Storage Distribution</div>
            <div className="flex flex-wrap gap-2">
              {stats.metadataOnchain + stats.imageOnchain > 0 && (
                <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-green-500/10 text-green-500 text-sm">
                  <Database className="w-3.5 h-3.5" />
                  {stats.metadataOnchain + stats.imageOnchain} on-chain
                </span>
              )}
              {stats.metadataIpfs + stats.imageIpfs > 0 && (
                <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded text-sm ${
                  stats.metadataIpfsUnavailable + stats.imageIpfsUnavailable > 0
                    ? "bg-orange-500/10 text-orange-500"
                    : "bg-blue-500/10 text-blue-500"
                }`}>
                  <Box className="w-3.5 h-3.5" />
                  {stats.metadataIpfs + stats.imageIpfs} IPFS
                </span>
              )}
              {stats.metadataArweave + stats.imageArweave > 0 && (
                <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-purple-500/10 text-purple-500 text-sm">
                  <HardDrive className="w-3.5 h-3.5" />
                  {stats.metadataArweave + stats.imageArweave} Arweave
                </span>
              )}
              {stats.metadataCentralized + stats.imageCentralized > 0 && (
                <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-yellow-500/10 text-yellow-600 text-sm">
                  <Server className="w-3.5 h-3.5" />
                  {stats.metadataCentralized + stats.imageCentralized} centralized
                </span>
              )}
            </div>
          </div>
          
          {/* IPFS Warning */}
          {(stats.metadataIpfsUnavailable + stats.imageIpfsUnavailable > 0) && (
            <div className="p-4 rounded-lg bg-orange-500/10 border border-orange-500/30 mb-4">
              <div className="flex items-center gap-2 text-orange-400">
                <span className="text-lg">⚠️</span>
                <div>
                  <div className="font-medium">
                    {stats.metadataIpfsUnavailable + stats.imageIpfsUnavailable} IPFS assets may be unpinned
                  </div>
                  <div className="text-orange-400/70 text-sm">These assets could become unavailable</div>
                </div>
              </div>
            </div>
          )}
          
          {/* Broken Assets Gallery - only show images that passed validation */}
          {(() => {
            const allBroken = nfts.filter(
              (n) => (n.imageStatus === "error" || n.metadataStatus === "error")
            );
            // Filter to only show validated images
            const validBroken = allBroken.filter(
              (n) => validBrokenAssetKeys.has(`${n.contract}-${n.tokenId}`)
            );
            const maxShow = 5;
            const shown = validBroken.slice(0, maxShow);
            // Count remaining as all broken minus shown (not just validated ones)
            const totalBroken = allBroken.length;
            const remaining = totalBroken - shown.length;
            
            // Don't show section if no validated images
            if (shown.length === 0) return null;
            
            return (
              <div className="mb-8">
                <div className="text-gray-400 text-sm mb-3">Broken Assets</div>
                <div className="flex gap-2">
                  {shown.map((nft, i) => (
                    <div
                      key={`${nft.contract}-${nft.tokenId}-${i}`}
                      className="w-14 h-14 rounded-lg overflow-hidden bg-white/5 border border-white/10 shrink-0"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`/${submittedChain}/${nft.contract}/${nft.tokenId}/image?w=128&h=128`}
                        alt=""
                        className="w-full h-full object-cover opacity-70 scale-110"
                      />
                    </div>
                  ))}
                  {remaining > 0 && (
                    <div className="w-14 h-14 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
                      <span className="text-gray-400 text-xs font-medium">+{remaining}</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}
          
          {/* Footer / CTA */}
          <div className="flex items-center justify-between pt-6 border-t border-white/10">
            <div>
              <div className="text-lg font-bold text-white">OnChain Scanner</div>
              <div className="text-gray-400 text-sm">onchainproxy.io/scanner</div>
            </div>
            {qrCodeDataUrl && (
              <div className="w-12 h-12 shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qrCodeDataUrl} alt="QR Code" className="w-full h-full" />
              </div>
            )}
          </div>
          
          {/* Disclaimer */}
          <div className="text-gray-600 text-[10px] text-center mt-4">
            Availability snapshot only. Results may be incomplete or inaccurate. Not a value or quality assessment.
          </div>
        </div>
      </div>
    </main>
  );
}

