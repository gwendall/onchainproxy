export default function Home() {
  const meebitsContract = "0x7bd29408f11d2bfc23c34f18275bbf23bb716bc7";
  const meebitsTokenId = "14076";

  return (
    <main className="min-h-screen max-w-2xl mx-auto px-6 py-8 font-mono">
      <header className="mb-12">
        <h1 className="font-bold mb-3">NFT PROXY</h1>
        <p className="text-foreground-muted">
          Developer-friendly endpoints to fetch NFT metadata + images (IPFS + caching included).
        </p>
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
        <h2 className="font-bold">Example (Meebits)</h2>
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
    </main>
  );
}
