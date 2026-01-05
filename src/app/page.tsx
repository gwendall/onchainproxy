export default function Home() {
  const chain = "eth";
  const meebitsContract = "0x7bd29408f11d2bfc23c34f18275bbf23bb716bc7";
  const meebitsTokenId = "14076";

  const metadataParams = ["rpcUrl", "debug=1"] as const;
  const imageParams = ["raw=1", "svg=1", "w", "h", "q", "rpcUrl", "debug=1", "json=1"] as const;

  return (
    <main className="min-h-screen max-w-2xl mx-auto px-6 py-8 font-mono">
      <header className="mb-12">
        <h1 className="font-bold mb-3">NFTProxy</h1>
        <p className="text-foreground-muted">
          Stable, cache-friendly URLs for NFT images and metadata.
          Designed for thumbnails, wallets, and UI.
        </p>
        <p className="mt-3 text-foreground-muted">
          Built for the EVM. Currently supports Ethereum only.
        </p>
        <div className="mt-10 space-y-3">
          <h2 className="font-bold">Why NFTProxy exists</h2>
          <p className="text-foreground-muted">
            Fetching NFT images is slow, flaky, and inconsistent (IPFS gateways, huge images, random hosts, on-chain data
            URLs). The naive solution is an indexer + a database. This is the opposite: a tiny origin that resolves the
            freshest <span className="text-foreground">tokenURI/uri</span> from Ethereum at request time, then lets
            caching do the heavy lifting.
          </p>
        </div>

        <div className="mt-10 space-y-3">
          <h2 className="font-bold">Big picture</h2>
          <p className="text-foreground-muted">
            If digital art and on-chain assets are meant to last, their interfaces need to be more resilient
            than the platforms that serve them. Today, much of NFT UX still depends on centralized services sitting
            between users and the chain. NFTProxy is a small step toward reducing that dependency — by making on-chain
            data directly consumable over cacheable HTTP, without introducing new state or infrastructure.
          </p>
          <p className="text-foreground-muted">
            Non-goals: indexing, persistence, analytics, ownership history, or marketplace APIs.
          </p>
        </div>

        <div className="mt-10 space-y-3">
          <h2 className="font-bold">What it does</h2>
          <ul className="list-disc pl-5 space-y-1 text-foreground-muted">
            <li>Resolves on-chain metadata at request time (read-only Ethereum RPC calls).</li>
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
        </div>
      </header>

      <section className="space-y-3">
        <h2 className="font-bold">Endpoints</h2>
        <p className="text-foreground-muted">
          Use NFT Proxy as the src for images or as a metadata fetcher — it resolves on-chain tokenURI at request time and
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
      </section>

      <section className="mt-10 space-y-3">
        <h2 className="font-bold">Examples (Meebits)</h2>
        <ul className="list-disc pl-5 space-y-1 text-foreground-muted">
          <li>
            <a
              href={`/${chain}/${meebitsContract}/${meebitsTokenId}`}
              className="text-link hover:underline font-bold"
            >
              /{chain}/{meebitsContract}/{meebitsTokenId}
            </a>
          </li>
          <li>
            <a
              href={`/${chain}/${meebitsContract}/${meebitsTokenId}/image?w=512&h=512&q=70`}
              className="text-link hover:underline font-bold"
            >
              /{chain}/{meebitsContract}/{meebitsTokenId}/image?w=512&h=512&q=70
            </a>
          </li>
        </ul>
      </section>

      <section className="mt-10 space-y-3">
        <h2 className="font-bold">Query params</h2>

        <div className="space-y-4 text-foreground-muted">
          <div>
            <div className="text-foreground">GET /:chain/:contract/:tokenId</div>
            <ul className="mt-1 list-disc pl-5 space-y-1">
              <li>
                <span className="text-foreground">chain</span>: currently{" "}
                <span className="text-foreground">eth</span> (Ethereum). L2s coming.
              </li>
              <li>
                <span className="text-foreground">rpcUrl</span>: override the Ethereum RPC URL (optional)
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
                <span className="text-foreground">chain</span>: currently{" "}
                <span className="text-foreground">eth</span> (Ethereum). L2s coming.
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
                <span className="text-foreground">w</span>, <span className="text-foreground">h</span>: max resize
                bounds (default 512, min 16, max 2048)
              </li>
              <li>
                <span className="text-foreground">q</span>: WebP quality (default 70, min 30, max 90)
              </li>
              <li>
                <span className="text-foreground">rpcUrl</span>: override the Ethereum RPC URL (optional)
              </li>
              <li>
                <span className="text-foreground">debug=1</span>: extra error details (dev only)
              </li>
              <li>
                <span className="text-foreground">json=1</span>: return JSON on error (otherwise SVG fallback)
              </li>
            </ul>
          </div>
        </div>
      </section>

      <footer className="mt-12 text-foreground-muted">
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
        {/* <a
          href="https://github.com/gwendall/nftproxy"
          target="_blank"
          rel="noopener noreferrer"
          className="text-link hover:underline font-bold"
        >
          Open-source
        </a>
        {" "}(MIT license). */}
      </footer>
    </main>
  );
}
