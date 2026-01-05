# OnChainProxy

Stable, cache-friendly URLs for on-chain asset metadata and images. Designed for thumbnails, wallets, and UI.

Repo: `https://github.com/gwendall/onchainproxy` (MIT License)

## Deploy

- Vercel: `https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fgwendall%2Fonchainproxy`
- Railway: `https://railway.app/new` (Deploy → Deploy from GitHub → select `gwendall/onchainproxy`)

You can also use the hosted instance (this site). We might add rate limiting later; for now, feel free to use it.

## Supported chains

Use any of these in the path as `/:chain`:

- `eth`
- `base`
- `arb`
- `op`
- `polygon`
- `zksync`
- `linea`
- `scroll`
- `polygon-zkevm`

All chains are treated identically: read-only RPC, on-chain metadata resolution, and cacheable HTTP responses.

Tip: you can still override RPC per-request with `?rpcUrl=...`.

## Why OnChainProxy exists

Fetching on-chain images is slow, flaky, and inconsistent (IPFS gateways, huge images, random hosts, on-chain data URLs).
The naive solution is an indexer + a database. This is the opposite: a tiny origin that resolves the freshest tokenURI/uri
from chain RPC at request time, then lets caching do the heavy lifting.

## At a broader level

If digital art and on-chain assets are meant to last, their interfaces need to be more resilient than the platforms that serve them.
Today, much of this UX still depends on centralized services sitting between users and the chain. OnChainProxy is a small step toward
reducing that dependency - by making on-chain data directly consumable over cacheable HTTP, without introducing new state or infrastructure.

Non-goals: indexing, persistence, analytics, ownership history, or marketplace APIs.

## What it does

- Resolves on-chain metadata at request time (read-only EVM JSON-RPC calls).
- Normalizes URIs (IPFS + data URLs) into a cacheable HTTP response.
- Uniformizes images for UI: returns WebP thumbnails when possible (size/quality) so interfaces stay fast and consistent.
- Gives you stable image URLs for `<img>`, `<picture>`, and APIs.
- Acts like a “hidden CDN”: ETag + Cache-Control enable fast edge/browser caching.

## Endpoints

Use OnChainProxy as the src for images or as a metadata fetcher - it resolves on-chain tokenURI at request time and returns a cacheable HTTP response.

By default, the image endpoint returns WebP when possible (UI-friendly thumbnails). Use `raw=1` to keep the original bytes (no resize / no WebP).

- **Metadata**
  - `GET /:chain/:contract/:tokenId`
  - Returns JSON metadata (and the resolved image URL).
  - Query params: `rpcUrl`, `debug=1`

- **Image**
  - `GET /:chain/:contract/:tokenId/image`
  - Returns WebP when possible (thumbnail-optimized).
  - Query params: `raw=1`, `svg=1`, `w`, `h`, `q`, `rpcUrl`, `debug=1`, `json=1`

Cache-friendly responses: `ETag` + `Cache-Control`.

## Notes (formats)

- Standards: ERC-721 and ERC-1155 (via tokenURI/uri).
- Special cases: legacy contracts like CryptoPunks are supported too.

## Example (CryptoPunks)

- `GET /eth/0xb47e3cd837ddf8e4c57f05d70ab865de6e193bbb/2113`
- `GET /eth/0xb47e3cd837ddf8e4c57f05d70ab865de6e193bbb/2113/image?w=512&h=512&q=70`

## Query params

**GET /:chain/:contract/:tokenId**

- `chain`: one of `eth, base, arb, op, polygon, zksync, linea, scroll, polygon-zkevm`
- `rpcUrl`: override the chain RPC URL (optional)
- `debug=1`: extra error details (dev only)

**GET /:chain/:contract/:tokenId/image**

- `chain`: one of `eth, base, arb, op, polygon, zksync, linea, scroll, polygon-zkevm`
- `raw=1`: return the original image (no resize / no WebP)
- SVG behavior: by default, SVGs are rasterized to WebP (so `w/h/q` applies). `svg=1` keeps SVG as SVG (vector) while still proxying from this origin (no redirect).
- `w`, `h`: max resize bounds (default 512, min 16, max 2048)
- `q`: WebP quality (default 70, min 30, max 90)
- `rpcUrl`: override the chain RPC URL (optional)
- `json=1`: return JSON on error (otherwise SVG fallback)
- `debug=1`: extra error details (dev only)

## Config (env)

- `ONCHAIN_RPC_URLS` / `ONCHAIN_RPC_URL`: global RPC fallback (optional)
- Per-chain: `ONCHAIN_RPC_URLS_ETH`, `ONCHAIN_RPC_URLS_BASE`, etc. (optional)
- `IPFS_GATEWAY`: IPFS gateway base (default `https://ipfs.io/ipfs`)
- `NEXT_PUBLIC_SITE_URL` / `SITE_URL`: base URL used in metadata (default `http://localhost:3000`)
