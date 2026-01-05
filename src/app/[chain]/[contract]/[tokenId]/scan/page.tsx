"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, ArrowUpRight, RefreshCw, Check, X, AlertTriangle, Loader2 } from "lucide-react";
import { Section } from "@/components/Section";
import { checkNftStatus } from "@/app/scanner/actions";
import { normalizeChain } from "@/lib/nft/chain";
import { use } from "react";

type ErrorSource = "rpc" | "contract" | "metadata_fetch" | "parsing" | "image_fetch" | "unknown";

type ScanResult = {
  status: "idle" | "scanning" | "done";
  metadataOk?: boolean;
  imageOk?: boolean;
  error?: string;
  errorSource?: ErrorSource;
  isTransient?: boolean;
  imageError?: string;
  scannedAt?: number;
};

const shortAddress = (addr: string) => {
  const a = String(addr || "");
  if (a.length <= 12) return a;
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
};

const openSeaChainSlug = (chain: string) => {
  switch (chain) {
    case "eth": return "ethereum";
    case "polygon": return "matic";
    case "arb": return "arbitrum";
    case "op": return "optimism";
    case "base": return "base";
    default: return "ethereum";
  }
};

const chainDisplayName = (chain: string) => {
  switch (chain) {
    case "eth": return "Ethereum";
    case "arb": return "Arbitrum";
    case "op": return "Optimism";
    case "base": return "Base";
    case "polygon": return "Polygon";
    case "zksync": return "zkSync Era";
    case "linea": return "Linea";
    case "scroll": return "Scroll";
    case "polygon-zkevm": return "Polygon zkEVM";
    default: return chain;
  }
};

const StatusIcon = ({ status, isTransient }: { status: "ok" | "error" | "unknown"; isTransient?: boolean }) => {
  if (status === "ok") {
    return (
      <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center">
        <Check className="w-6 h-6 text-green-500" />
      </div>
    );
  }
  if (isTransient) {
    return (
      <div className="w-12 h-12 rounded-full bg-yellow-500/20 flex items-center justify-center">
        <AlertTriangle className="w-6 h-6 text-yellow-500" />
      </div>
    );
  }
  return (
    <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center">
      <X className="w-6 h-6 text-red-500" />
    </div>
  );
};

export default function TokenScanPage({
  params,
}: {
  params: Promise<{ chain: string; contract: string; tokenId: string }>;
}) {
  const { chain: rawChain, contract: rawContract, tokenId: rawTokenId } = use(params);
  
  const chain = normalizeChain(rawChain);
  const contract = decodeURIComponent(rawContract).trim();
  const tokenId = decodeURIComponent(rawTokenId).trim();

  const [result, setResult] = useState<ScanResult>({ status: "idle" });
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  const runScan = useCallback(async () => {
    if (!chain) return;
    
    setResult({ status: "scanning" });
    
    try {
      const status = await checkNftStatus(chain, contract, tokenId);
      setResult({
        status: "done",
        metadataOk: status.metadataOk,
        imageOk: status.imageOk,
        error: status.error,
        errorSource: status.errorSource,
        isTransient: status.isTransient,
        imageError: status.imageError,
        scannedAt: Date.now(),
      });
    } catch (e) {
      setResult({
        status: "done",
        metadataOk: false,
        imageOk: false,
        error: e instanceof Error ? e.message : "Scan failed",
        errorSource: "unknown",
        isTransient: true,
        scannedAt: Date.now(),
      });
    }
  }, [chain, contract, tokenId]);

  // Fetch image URL from metadata endpoint
  useEffect(() => {
    if (!chain) return;
    fetch(`/${chain}/${contract}/${tokenId}`)
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        if (data?.imageUrl) {
          setImageUrl(data.imageUrl);
        }
      })
      .catch(() => {});
  }, [chain, contract, tokenId]);

  // Auto-scan on mount
  useEffect(() => {
    requestAnimationFrame(() => runScan());
  }, [runScan]);

  if (!chain) {
    return (
      <main className="min-h-screen max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8 font-mono">
        <div className="space-y-8">
          <header className="space-y-3">
            <Link href="/scanner" className="inline-flex items-center gap-1 leading-none text-foreground-faint hover:underline">
              <ArrowLeft className="w-4 h-4 shrink-0" />
              <span>Back to scanner</span>
            </Link>
            <h1 className="font-bold text-red-500">Invalid Chain</h1>
            <p className="text-foreground-muted">
              The chain &quot;{rawChain}&quot; is not supported.
            </p>
          </header>
        </div>
      </main>
    );
  }

  const overallStatus = result.status === "done" 
    ? (result.metadataOk && result.imageOk ? "ok" : result.isTransient ? "uncertain" : "broken")
    : "pending";

  return (
    <main className="min-h-screen max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8 font-mono">
      <div className="space-y-8 sm:space-y-10">
        <header className="space-y-3">
          <Link href="/scanner" className="inline-flex items-center gap-1 leading-none text-foreground-faint hover:underline">
            <ArrowLeft className="w-4 h-4 shrink-0" />
            <span>Back to scanner</span>
          </Link>
          <h1 className="font-bold">Token Health Check</h1>
          <p className="text-foreground-muted">
            Checking if this token&apos;s metadata and image are accessible.
          </p>
        </header>

        <Section title="Token">
          <div className="flex flex-col sm:flex-row gap-6">
            {/* Token Image */}
            <div className="w-32 h-32 sm:w-40 sm:h-40 bg-foreground-faint/10 overflow-hidden shrink-0 relative rounded-lg">
              {imageUrl ? (
                <Image
                  src={imageUrl}
                  alt={`Token #${tokenId}`}
                  fill
                  sizes="160px"
                  className="object-cover"
                  unoptimized
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-foreground-faint/30 font-bold text-lg">
                  NFT
                </div>
              )}
            </div>

            {/* Token Info */}
            <div className="flex-1 space-y-3">
              <div className="space-y-1">
                <div className="text-foreground-faint text-sm">Chain</div>
                <div className="text-foreground font-bold">{chainDisplayName(chain)}</div>
              </div>
              <div className="space-y-1">
                <div className="text-foreground-faint text-sm">Contract</div>
                <div className="text-foreground font-mono" title={contract}>{shortAddress(contract)}</div>
              </div>
              <div className="space-y-1">
                <div className="text-foreground-faint text-sm">Token ID</div>
                <div className="text-foreground font-mono truncate max-w-[200px]" title={tokenId}>#{tokenId}</div>
              </div>
              <div className="flex flex-wrap gap-3 pt-2">
                <a
                  href={`https://opensea.io/assets/${openSeaChainSlug(chain)}/${contract}/${tokenId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-foreground-faint hover:text-foreground hover:underline transition-colors"
                >
                  <span>OpenSea</span>
                  <ArrowUpRight className="w-4 h-4" />
                </a>
                <a
                  href={`/${chain}/${contract}/${tokenId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-foreground-faint hover:text-foreground hover:underline transition-colors"
                >
                  <span>Metadata</span>
                  <ArrowUpRight className="w-4 h-4" />
                </a>
                <a
                  href={`/${chain}/${contract}/${tokenId}/image`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-foreground-faint hover:text-foreground hover:underline transition-colors"
                >
                  <span>Image</span>
                  <ArrowUpRight className="w-4 h-4" />
                </a>
              </div>
            </div>
          </div>
        </Section>

        <Section title="Health Status">
          {result.status === "scanning" ? (
            <div className="flex items-center gap-4 py-8">
              <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
              <div className="text-foreground-muted">Scanning token...</div>
            </div>
          ) : result.status === "done" ? (
            <div className="space-y-6">
              {/* Overall Status */}
              <div className={`p-6 rounded-lg border-2 ${
                overallStatus === "ok" 
                  ? "border-green-500/30 bg-green-500/5" 
                  : overallStatus === "uncertain"
                  ? "border-yellow-500/30 bg-yellow-500/5"
                  : "border-red-500/30 bg-red-500/5"
              }`}>
                <div className="flex items-center gap-4">
                  {overallStatus === "ok" ? (
                    <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center">
                      <Check className="w-8 h-8 text-green-500" />
                    </div>
                  ) : overallStatus === "uncertain" ? (
                    <div className="w-16 h-16 rounded-full bg-yellow-500/20 flex items-center justify-center">
                      <AlertTriangle className="w-8 h-8 text-yellow-500" />
                    </div>
                  ) : (
                    <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center">
                      <X className="w-8 h-8 text-red-500" />
                    </div>
                  )}
                  <div>
                    <div className={`text-xl font-bold ${
                      overallStatus === "ok" 
                        ? "text-green-500" 
                        : overallStatus === "uncertain"
                        ? "text-yellow-500"
                        : "text-red-500"
                    }`}>
                      {overallStatus === "ok" 
                        ? "Healthy" 
                        : overallStatus === "uncertain"
                        ? "Uncertain"
                        : "Issues Detected"}
                    </div>
                    <div className="text-foreground-muted text-sm">
                      {overallStatus === "ok" 
                        ? "Both metadata and image are accessible." 
                        : overallStatus === "uncertain"
                        ? "There may be temporary issues. Try again later."
                        : "This token has accessibility issues."}
                    </div>
                  </div>
                </div>
              </div>

              {/* Detailed Results */}
              <div className="grid sm:grid-cols-2 gap-4">
                {/* Metadata Status */}
                <div className="p-4 rounded-lg bg-foreground-faint/5 border border-foreground-faint/10">
                  <div className="flex items-center gap-3">
                    <StatusIcon 
                      status={result.metadataOk ? "ok" : "error"} 
                      isTransient={result.isTransient} 
                    />
                    <div>
                      <div className="font-bold">Metadata</div>
                      <div className={`text-sm ${
                        result.metadataOk 
                          ? "text-green-500" 
                          : result.isTransient 
                          ? "text-yellow-500" 
                          : "text-red-500"
                      }`}>
                        {result.metadataOk 
                          ? "Accessible" 
                          : result.isTransient 
                          ? "Temporarily unavailable" 
                          : "Inaccessible"}
                      </div>
                    </div>
                  </div>
                  {result.error && !result.metadataOk && (
                    <div className="mt-3 text-sm text-foreground-muted bg-foreground-faint/10 p-2 rounded">
                      {result.errorSource && <span className="text-foreground-faint">[{result.errorSource}] </span>}
                      {result.error}
                    </div>
                  )}
                </div>

                {/* Image Status */}
                <div className="p-4 rounded-lg bg-foreground-faint/5 border border-foreground-faint/10">
                  <div className="flex items-center gap-3">
                    <StatusIcon 
                      status={result.imageOk ? "ok" : "error"} 
                      isTransient={!!result.imageError} 
                    />
                    <div>
                      <div className="font-bold">Image</div>
                      <div className={`text-sm ${
                        result.imageOk 
                          ? "text-green-500" 
                          : result.imageError 
                          ? "text-yellow-500" 
                          : "text-red-500"
                      }`}>
                        {result.imageOk 
                          ? "Accessible" 
                          : result.imageError 
                          ? "Temporarily unavailable" 
                          : result.metadataOk 
                          ? "No image in metadata"
                          : "Cannot check (metadata failed)"}
                      </div>
                    </div>
                  </div>
                  {result.imageError && (
                    <div className="mt-3 text-sm text-foreground-muted bg-foreground-faint/10 p-2 rounded">
                      {result.imageError}
                    </div>
                  )}
                </div>
              </div>

              {/* Rescan Button */}
              <div className="flex items-center gap-4">
                <button
                  onClick={runScan}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-foreground text-background font-bold rounded hover:opacity-90 transition-opacity"
                >
                  <RefreshCw className="w-4 h-4" />
                  Rescan
                </button>
                {result.scannedAt && (
                  <div className="text-foreground-faint text-sm">
                    Last scanned: {new Date(result.scannedAt).toLocaleTimeString()}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="py-8 text-foreground-muted">
              Click the button below to start scanning.
            </div>
          )}
        </Section>
      </div>
    </main>
  );
}

