export default function Home() {
  const meebitsContract = "0x7bd29408f11d2bfc23c34f18275bbf23bb716bc7";
  const meebitsTokenId = "14076";

  const metadataParams = ["rpcUrl", "debug=1"] as const;
  const imageParams = ["raw=1", "w", "h", "q", "rpcUrl", "debug=1", "json=1"] as const;

  return (
    <main className="min-h-screen max-w-2xl mx-auto px-6 py-8 font-mono">
      <header className="mb-12">
        <h1 className="font-bold mb-3">NFT PROXY</h1>
        <p className="text-foreground-muted">
          Lightweight endpoints for Ethereum NFT metadata + images - designed for thumbnails and UI.
        </p>
        <p className="mt-3 text-foreground-muted">
          The problem: fetching NFT images is slow and flaky (IPFS gateways, huge images, random hosts). The naive
          solution is to build an indexer + a database. This is the opposite: a tiny origin that always resolves the
          freshest URI from Ethereum, then lets caching do the heavy lifting.
        </p>
        <ul className="mt-4 list-disc pl-5 space-y-1 text-foreground-muted">
          <li>
            Source of truth is the chain: resolves <span className="text-foreground">tokenURI/uri</span> via read-only
            RPC calls.
          </li>
          <li>
            Extremely lightweight: no indexer, no database - just fetch, normalize, and return a stable URL per token.
          </li>
          <li>Acts like a “hidden CDN”: ETag + Cache-Control enable fast edge/browser caching.</li>
        </ul>
      </header>

      <section className="space-y-3">
        <h2 className="font-bold">Endpoints</h2>

        <div className="space-y-2 text-foreground-muted">
          <div>
            <div>
              <span className="text-foreground">GET</span>{" "}
              <span className="text-foreground">/:contract/:tokenId</span>
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
              <span className="text-foreground">/:contract/:tokenId/image</span>
            </div>
            <div className="text-foreground-faint">Returns the image (or WebP when resized).</div>
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
        <h2 className="font-bold">Query params</h2>

        <div className="space-y-4 text-foreground-muted">
          <div>
            <div className="text-foreground">GET /:contract/:tokenId</div>
            <ul className="mt-1 list-disc pl-5 space-y-1">
              <li>
                <span className="text-foreground">rpcUrl</span>: override the Ethereum RPC URL (optional)
              </li>
              <li>
                <span className="text-foreground">debug=1</span>: extra error details (dev only)
              </li>
            </ul>
          </div>

          <div>
            <div className="text-foreground">GET /:contract/:tokenId/image</div>
            <ul className="mt-1 list-disc pl-5 space-y-1">
              <li>
                <span className="text-foreground">raw=1</span>: return the original image (no resize / no WebP)
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

      <section className="mt-10 space-y-3">
        <h2 className="font-bold">Examples (Meebits)</h2>
        <ul className="list-disc pl-5 space-y-1 text-foreground-muted">
          <li>
            <a
              href={`/${meebitsContract}/${meebitsTokenId}`}
              className="text-link hover:underline font-bold"
            >
              /{meebitsContract}/{meebitsTokenId}
            </a>
          </li>
          <li>
            <a
              href={`/${meebitsContract}/${meebitsTokenId}/image?w=512&h=512&q=70`}
              className="text-link hover:underline font-bold"
            >
              /{meebitsContract}/{meebitsTokenId}/image?w=512&h=512&q=70
            </a>
          </li>
        </ul>
      </section>

      <footer className="mt-12 text-foreground-muted">
        Made by{" "}
        <a
          href="https://x.com/gwendall"
          target="_blank"
          rel="noopener noreferrer"
          className="text-link hover:underline font-bold"
        >
          Gwendall
        </a>
        .
      </footer>
    </main>
  );
}
