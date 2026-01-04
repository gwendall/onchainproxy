# nft-proxy

Developer-friendly endpoints to fetch **NFT metadata** and **images** without worrying about IPFS, CORS, remote domains, or flaky RPCs.

It:
- resolves `tokenURI()` / `uri()` (ERC-721 + ERC-1155)
- follows IPFS URLs
- serves images as-is (SVG/GIF/etc) or as **optimized WebP** (optional resize)

## Quickstart (local)

```bash
pnpm install
pnpm dev
```

## Endpoints (HTTP)

- **Metadata**
  - `GET /:contract/:tokenId/metadata`
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
curl 'http://localhost:3000/0x7bd29408f11d2bfc23c34f18275bbf23bb716bc7/14076/metadata'
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
