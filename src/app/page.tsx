import { Section } from "@/components/Section";
import { SUPPORTED_CHAINS } from "@/lib/nft/chain";
import { Square } from "lucide-react";

export default function Home() {
  const chain = "eth";
  const punksOriginalContract = "0xb47e3cd837ddf8e4c57f05d70ab865de6e193bbb";
  const punkTokenId = "2113";
  const repoUrl = "https://github.com/gwendall/onchainproxy";
  const vercelDeployUrl = "https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fgwendall%2Fonchainproxy";
  const railwayDeployUrl = "https://railway.app/new";

  const appsBuiltWithOnchainProxy = [
    {
      title: "OnChainScanner",
      href: "/scanner",
      description: "Scan a wallet’s NFTs and check which metadata/images are live vs down.",
    },
  ] as const;

  const metadataParams = ["rpcUrl", "debug=1"] as const;
  const imageParams = ["raw=1", "svg=1", "w", "h", "q", "rpcUrl", "debug=1", "json=1"] as const;

  return (
    <main className="min-h-screen max-w-2xl mx-auto px-6 py-8 font-mono">
      <div className="space-y-10">
        <header className="space-y-3">
          <h1 className="font-bold">OnChainProxy</h1>
          <p className="text-foreground-muted">
            Stable, cache-friendly URLs for on-chain asset metadata and images. Designed for thumbnails, wallets, and UI.
          </p>
          <p className="text-foreground-muted">Built for the EVM. Supports Ethereum and major EVM L2s.</p>
        </header>

        <Section title="Deploy">
          <div className="space-y-3 text-foreground-muted">
            <p className="text-foreground-faint">
              This is a reference implementation. Self-hosting is recommended for production use.
            </p>
            <div className="flex flex-wrap gap-3">
              <a
                href={vercelDeployUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-2 rounded border border-foreground-faint/30 text-foreground hover:underline font-bold"
              >
                Deploy to Vercel
              </a>
              <a
                href={railwayDeployUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-2 rounded border border-foreground-faint/30 text-foreground hover:underline font-bold"
              >
                Deploy to Railway
              </a>
            </div>
            <p className="text-foreground-faint">
              Open source on{" "}
              <a href={repoUrl} target="_blank" rel="noopener noreferrer" className="text-link hover:underline font-bold">
                gwendall/onchainproxy
              </a>{" "}
              (MIT).
            </p>
            <p className="text-foreground-faint">
              You can also use the hosted instance you’re on right now. I might add rate limiting / paid hosted option later; for now, feel free to use it.
            </p>
            <p className="text-foreground-faint">
              Railway note: click “Deploy”, then pick “Deploy from GitHub” and select{" "}
              <span className="text-foreground">gwendall/onchainproxy</span>.
            </p>
          </div>
        </Section>

        <Section title="Supported chains">
          <p className="text-foreground-muted">
            Use any of these in the path as <span className="text-foreground">/:chain</span>:
          </p>
          <div className="flex flex-wrap gap-2">
            {SUPPORTED_CHAINS.map((c) => (
              <span
                key={c}
                className="px-2 py-1 rounded border border-foreground-faint/30 text-foreground"
              >
                {c}
              </span>
            ))}
          </div>
          <p className="text-foreground-faint">
            All chains are treated identically: read-only RPC, on-chain metadata resolution, and cacheable HTTP responses.
          </p>
          <p className="text-foreground-faint">
            Tip: you can still override RPC per-request with <span className="text-foreground">?rpcUrl=...</span>.
          </p>
        </Section>

        <Section title="Why OnChainProxy exists">
          <p className="text-foreground-muted">
            Fetching on-chain images is slow, flaky, and inconsistent (IPFS gateways, huge images, random hosts, on-chain data
            URLs). The naive solution is an indexer + a database. This is the opposite: a tiny origin that resolves the
            freshest tokenURI/uri from chain RPC at request time, then lets caching
            do the heavy lifting.
          </p>
        </Section>

        <Section title="At a broader level">
          <p className="text-foreground-muted">
            If digital art and on-chain assets are meant to last, their interfaces need to be more resilient
            than the platforms that serve them. Today, much of this UX still depends on centralized services sitting
            between users and the chain. OnChainProxy is a small step toward reducing that dependency - by making on-chain
            data directly consumable over cacheable HTTP, without introducing new state or infrastructure.
          </p>
          <p className="text-foreground-muted">
            Non-goals: indexing, persistence, analytics, ownership history, or marketplace APIs.
          </p>
        </Section>

        <Section title="What it does">
          <ul className="list-disc pl-5 space-y-1 text-foreground-muted">
            <li>Resolves on-chain metadata at request time (read-only EVM JSON-RPC calls).</li>
            <li>Normalizes URIs (IPFS + data URLs) into a cacheable HTTP response.</li>
            <li>
              Uniformizes images for UI: returns WebP thumbnails when possible (size/quality) so interfaces stay fast and
              consistent.
            </li>
            <li>
              Gives you stable image URLs for <span className="text-foreground">&lt;img&gt;</span>,{" "}
              <span className="text-foreground">&lt;picture&gt;</span>, and APIs.
            </li>
            <li>Acts like a “hidden CDN”: ETag + Cache-Control enable fast edge/browser caching.</li>
          </ul>
        </Section>

        <Section title="Endpoints">
          <p className="text-foreground-muted">
            Use OnChainProxy as the src for images or as a metadata fetcher - it resolves on-chain tokenURI at request time and
            returns a cacheable HTTP response.
          </p>
          <p className="text-foreground-muted">
            By default, the image endpoint returns <span className="text-foreground">WebP</span> when possible (UI-friendly
            thumbnails). Use <span className="text-foreground">raw=1</span> to keep the original bytes (no resize / no WebP).
          </p>

          <div className="space-y-2 text-foreground-muted">
            <div>
              <div>
                <span className="text-foreground">GET</span>{" "}
                <span className="text-foreground">/:chain/:contract/:tokenId</span>
              </div>
              <div className="text-foreground-faint">Returns JSON metadata (and the resolved image URL).</div>
              <div className="mt-1 text-foreground-faint">
                Query params:{" "}
                <span className="text-foreground">
                  {metadataParams.join(", ")}
                </span>
              </div>
            </div>

            <div>
              <div>
                <span className="text-foreground">GET</span>{" "}
                <span className="text-foreground">/:chain/:contract/:tokenId/image</span>
              </div>
              <div className="text-foreground-faint">Returns WebP when possible (thumbnail-optimized).</div>
              <div className="mt-1 text-foreground-faint">
                Query params:{" "}
                <span className="text-foreground">
                  {imageParams.join(", ")}
                </span>
              </div>
            </div>
          </div>

          <p className="text-foreground-faint">
            Cache-friendly responses: <span className="text-foreground">ETag</span> +{" "}
            <span className="text-foreground">Cache-Control</span>.
          </p>
        </Section>

        <Section title="Notes (formats)">
          <ul className="list-disc pl-5 space-y-1 text-foreground-muted">
            <li>Standards: ERC-721 and ERC-1155 (via tokenURI/uri).</li>
            <li>Special cases: legacy contracts like CryptoPunks are supported too.</li>
          </ul>
        </Section>

        <Section title="Example (CryptoPunks)">
          <ul className="list-disc pl-5 space-y-1 text-foreground-muted">
            <li>
              <a
                href={`/${chain}/${punksOriginalContract}/${punkTokenId}`}
                className="text-link hover:underline font-bold"
              >
                /{chain}/{punksOriginalContract}/{punkTokenId}
              </a>
            </li>
            <li>
              <a
                href={`/${chain}/${punksOriginalContract}/${punkTokenId}/image?w=512&h=512&q=70`}
                className="text-link hover:underline font-bold"
              >
                /{chain}/{punksOriginalContract}/{punkTokenId}/image?w=512&h=512&q=70
              </a>
            </li>
          </ul>
          <p className="mt-3 text-foreground-faint">
            For L2s, just swap <span className="text-foreground">/{chain}/</span> with e.g.{" "}
            <span className="text-foreground">/base/</span>, <span className="text-foreground">/arb/</span>,{" "} 
            <span className="text-foreground">/op/</span>,<span className="text-foreground">/polygon/</span>, etc.
          </p>
        </Section>

        <Section title="Query params">
          <div className="space-y-4 text-foreground-muted">
            <div>
              <div className="text-foreground">GET /:chain/:contract/:tokenId</div>
              <ul className="mt-1 list-disc pl-5 space-y-1">
                <li>
                  <span className="text-foreground">chain</span>: one of{" "}
                  <span className="text-foreground">{SUPPORTED_CHAINS.join(", ")}</span>.
                </li>
                <li>
                  <span className="text-foreground">rpcUrl</span>: override the chain RPC URL (optional)
                </li>
                <li>
                  <span className="text-foreground">debug=1</span>: extra error details (dev only)
                </li>
              </ul>
            </div>

            <div>
              <div className="text-foreground">GET /:chain/:contract/:tokenId/image</div>
              <ul className="mt-1 list-disc pl-5 space-y-1">
                <li>
                  <span className="text-foreground">chain</span>: one of{" "}
                  <span className="text-foreground">{SUPPORTED_CHAINS.join(", ")}</span>.
                </li>
                <li>
                  <span className="text-foreground">raw=1</span>: return the original image (no resize / no WebP)
                </li>
                <li>
                  By default, SVGs are rasterized to WebP (so <span className="text-foreground">w/h/q</span> applies).{" "}
                  <span className="text-foreground">svg=1</span> is an escape hatch to keep SVG as SVG (vector) while still
                  proxying from this origin (no redirect).
                </li>
                <li>
                  <span className="text-foreground">w</span>, <span className="text-foreground">h</span>: max resize bounds
                  (default 512, min 16, max 2048)
                </li>
                <li>
                  <span className="text-foreground">q</span>: WebP quality (default 70, min 30, max 90)
                </li>
                <li>
                  <span className="text-foreground">rpcUrl</span>: override the chain RPC URL (optional)
                </li>
                <li>
                  <span className="text-foreground">json=1</span>: return JSON on error (otherwise SVG fallback)
                </li>
                <li>
                  <span className="text-foreground">debug=1</span>: extra error details (dev only)
                </li>
              </ul>
            </div>
          </div>
        </Section>

        <Section title="Config (env)">
          <ul className="list-disc pl-5 space-y-1 text-foreground-muted">
            <li>
              <span className="text-foreground">ONCHAIN_RPC_URLS</span> /{" "}
              <span className="text-foreground">ONCHAIN_RPC_URL</span>: global RPC fallback (optional)
            </li>
            <li>
              Per-chain: <span className="text-foreground">ONCHAIN_RPC_URLS_ETH</span>,{" "}
              <span className="text-foreground">ONCHAIN_RPC_URLS_BASE</span>, etc. (optional)
            </li>
            <li>
              <span className="text-foreground">IPFS_GATEWAY</span>: IPFS gateway base (default{" "}
              <span className="text-foreground">https://ipfs.io/ipfs</span>)
            </li>
            <li>
              <span className="text-foreground">NEXT_PUBLIC_SITE_URL</span> /{" "}
              <span className="text-foreground">SITE_URL</span>: base URL used in metadata (default{" "}
              <span className="text-foreground">http://localhost:3000</span>)
            </li>
          </ul>
        </Section>

        <Section title="Apps built with OnChainProxy">
          <div className="space-y-4 text-foreground-muted">
            {appsBuiltWithOnchainProxy.map((app) => (
              <div key={app.href} className="space-y-2">
                <a
                  href={app.href}
                  className="inline-flex items-center gap-2 leading-none text-link hover:underline font-bold"
                >
                  <Square className="w-4 h-4 shrink-0 text-foreground-faint" />
                  <span className="leading-none">{app.title}</span>
                </a>
                <p className="text-foreground-faint">{app.description}</p>
              </div>
            ))}
          </div>
        </Section>

        <footer className="text-foreground-muted">
          Made by{" "}
          <a
            href="https://gwendall.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-link hover:underline font-bold"
          >
            Gwendall
          </a>
          .{" "}
          <a
            href={repoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-link hover:underline font-bold"
          >
            Open source
          </a>{" "}
          <span className="text-foreground-faint">(MIT License)</span>.
        </footer>
      </div>
    </main>
  );
}
