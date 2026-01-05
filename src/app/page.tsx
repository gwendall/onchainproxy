export default function Home() {
  const meebitsContract = "0x7bd29408f11d2bfc23c34f18275bbf23bb716bc7";
  const meebitsTokenId = "14076";

  return (
    <main className="min-h-screen max-w-2xl mx-auto px-6 py-8 font-mono">
      <header className="mb-12">
        <h1 className="font-bold mb-3">NFT PROXY</h1>
        <p className="text-foreground-muted">
          Lightweight endpoints for NFT metadata + images - designed for thumbnails and UI.
        </p>
        <p className="mt-3 text-foreground-muted">
          The problem: fetching NFT images is slow and flaky (IPFS gateways, huge images, random hosts). The naive
          solution is to build an indexer + a database. This is the opposite: a tiny origin that always returns the
          freshest URI from the chain, then lets caching do the heavy lifting.
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
        <ul className="list-disc pl-5 space-y-1 text-foreground-muted">
          <li>
            <span className="text-foreground">GET</span>{" "}
            <span className="text-foreground">/:contract/:tokenId/metadata</span>
          </li>
          <li>
            <span className="text-foreground">GET</span>{" "}
            <span className="text-foreground">/:contract/:tokenId/image</span>
          </li>
        </ul>
        <p className="text-foreground-faint">Returns cache-friendly responses (ETag + Cache-Control).</p>
      </section>

      <section className="mt-10 space-y-3">
        <h2 className="font-bold">Examples (Meebits)</h2>
        <ul className="list-disc pl-5 space-y-1 text-foreground-muted">
          <li>
            <a
              href={`/${meebitsContract}/${meebitsTokenId}/metadata`}
              className="text-link hover:underline font-bold"
            >
              /{meebitsContract}/{meebitsTokenId}/metadata
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
