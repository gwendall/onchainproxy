# nft-proxy

Developer-friendly endpoints to fetch **Ethereum NFT metadata** and **images** without worrying about IPFS, CORS, remote domains, or flaky RPCs.

It:
- resolves `tokenURI()` / `uri()` (ERC-721 + ERC-1155)
- follows IPFS URLs
- serves images as-is (SVG/GIF/etc) or as **optimized WebP** (optional resize)

## Why use it

- **One stable URL** per token for both metadata and image.
- **No client-side IPFS/CORS headaches**: your app always talks to the same origin.
- **Cache-friendly responses** (ETag + Cache-Control), so repeated requests get fast.

## How it works (high level)

- Resolves `tokenURI()` (ERC-721) or `uri()` (ERC-1155) on **Ethereum** via JSON-RPC `eth_call` (tries multiple RPCs).
- Fetches and parses the token metadata JSON (supports `data:` and IPFS).
- Extracts the best `image*` field, resolves IPFS, then either:
  - redirects to the original (`mode=original`)
  - or proxies it and optionally resizes to WebP (`w/h/q`)

## Quickstart (local)

```bash
pnpm install
pnpm dev
```

## Endpoints (HTTP)

- **Metadata**
  - `GET /:contract/:tokenId`
  - Returns: JSON (includes resolved `metadataUrl`, parsed `metadata`, and `imageUrl` when available)
  - Query:
    - `rpcUrl`: override the Ethereum RPC URL (optional)
    - `debug=1`: extra error details (dev only)

- **Image**
  - `GET /:contract/:tokenId/image`
  - Returns: `image/*` (or WebP when resized)
  - Query:
    - `mode=original`: 302 redirect to the source image URL
    - `w`, `h`: max resize bounds (default 512, min 16, max 2048)
    - `q`: WebP quality (default 70, min 30, max 90)
    - `rpcUrl`: override the Ethereum RPC URL (optional)
    - `debug=1`: extra error details (dev only)

## Examples (Meebits)

```bash
curl 'http://localhost:3000/0x7bd29408f11d2bfc23c34f18275bbf23bb716bc7/14076'
curl 'http://localhost:3000/0x7bd29408f11d2bfc23c34f18275bbf23bb716bc7/14076/image?w=512&h=512&q=70'
curl -I 'http://localhost:3000/0x7bd29408f11d2bfc23c34f18275bbf23bb716bc7/14076/image?w=512&h=512&q=70'
```

## Caching (what to expect)

Responses are cache-friendly:
- `Cache-Control` for browser + CDN caching
- `ETag` + 304 support

## Config (env)

- **`NFT_RPC_URLS`**: comma-separated Ethereum RPC URLs (optional)
- **`NFT_RPC_URL`**: single Ethereum RPC URL (optional)
- **`IPFS_GATEWAY`**: IPFS gateway base (default `https://ipfs.io/ipfs`)
- **`NEXT_PUBLIC_SITE_URL`** or **`SITE_URL`**: base URL used for metadata (default `http://localhost:3000`)
