# OnChainProxy

Developer-friendly endpoints to fetch **on-chain asset metadata** and **images** without worrying about IPFS, CORS, remote domains, or flaky RPCs.

Currently: **Ethereum + major L2s**.

It:
- resolves `tokenURI()` / `uri()` (ERC-721 + ERC-1155)
- follows IPFS URLs
- serves images as-is (SVG/GIF/etc) or as **optimized WebP** (optional resize)

## Why use it

- **One stable URL** per token for both metadata and image.
- **No client-side IPFS/CORS headaches**: your app always talks to the same origin.
- **Cache-friendly responses** (ETag + Cache-Control), so repeated requests get fast.

## How it works (high level)

- Resolves `tokenURI()` (ERC-721) or `uri()` (ERC-1155) on the selected chain via JSON-RPC `eth_call` (tries multiple RPCs).
- Fetches and parses the token metadata JSON (supports `data:` and IPFS).
- Extracts the best `image*` field, resolves IPFS, then either:
  - returns the original (`raw=1`)
  - or proxies it and optionally resizes to WebP (`w/h/q`)

## Quickstart (local)

```bash
pnpm install
pnpm dev
```

## Endpoints (HTTP)

- **Metadata**
  - `GET /:chain/:contract/:tokenId`
  - Returns: JSON (includes resolved `metadataUrl`, parsed `metadata`, and `imageUrl` when available)
  - Path:
    - `chain`: one of `eth`, `base`, `arb`, `op`, `polygon`, `zksync`, `linea`, `scroll`, `polygon-zkevm`
  - Query:
    - `rpcUrl`: override the RPC URL (optional)
    - `debug=1`: extra error details (dev only)

- **Image**
  - `GET /:chain/:contract/:tokenId/image`
  - Returns: `image/webp` **when possible** (thumbnail-optimized). Falls back to the original format when WebP transform is not available.
  - Path:
    - `chain`: one of `eth`, `base`, `arb`, `op`, `polygon`, `zksync`, `linea`, `scroll`, `polygon-zkevm`
  - Query:
    - `raw=1`: return the original image (no resize / no WebP). For remote URLs this is a 302 redirect; for `data:` URLs this returns the raw bytes.
    - `svg=1`: **SVG escape hatch**. Keep SVG as SVG (vector) while still proxying it from this origin (no WebP rasterization). This exists for the niche case where you want same-origin SVG bytes without a redirect. (If you don’t care, ignore it.)
    - `w`, `h`: max resize bounds (default 512, min 16, max 2048)
    - `q`: WebP quality (default 70, min 30, max 90)
    - `rpcUrl`: override the RPC URL (optional)
    - `debug=1`: extra error details (dev only)

## Special cases

- **CryptoPunks (pre-ERC721)**
  - You can use either contract address in the URL:
    - **CryptoPunks (original)**: `0xb47e3cd837ddf8e4c57f05d70ab865de6e193bbb`
    - **CryptoPunksData (helper)**: `0x16f5a35647d6f03d5d3da7b35409d65ba03af3b2`
  - Under the hood, OnChainProxy always reads the SVG + attributes from **CryptoPunksData**.
  - Example:
    - `GET /eth/0xb47e3cd837ddf8e4c57f05d70ab865de6e193bbb/0`
    - `GET /eth/0xb47e3cd837ddf8e4c57f05d70ab865de6e193bbb/0/image?w=512`
    - `GET /eth/0x16f5a35647d6f03d5d3da7b35409d65ba03af3b2/0`

## Examples (CryptoPunks)

```bash
curl 'http://localhost:3000/eth/0xb47e3cd837ddf8e4c57f05d70ab865de6e193bbb/2113'
curl 'http://localhost:3000/eth/0xb47e3cd837ddf8e4c57f05d70ab865de6e193bbb/2113/image?w=512&h=512&q=70'
curl -I 'http://localhost:3000/eth/0xb47e3cd837ddf8e4c57f05d70ab865de6e193bbb/2113/image?w=512&h=512&q=70'
```

## Caching (what to expect)

Responses are cache-friendly:
- `Cache-Control` for browser + CDN caching
- `ETag` + 304 support

## Config (env)

- **Per-chain (preferred)**:
  - **`ONCHAIN_RPC_URLS_ETH`**, **`ONCHAIN_RPC_URL_ETH`**
  - **`ONCHAIN_RPC_URLS_ARB`**, **`ONCHAIN_RPC_URL_ARB`**
  - **`ONCHAIN_RPC_URLS_OP`**, **`ONCHAIN_RPC_URL_OP`**
  - **`ONCHAIN_RPC_URLS_BASE`**, **`ONCHAIN_RPC_URL_BASE`**
  - **`ONCHAIN_RPC_URLS_POLYGON`**, **`ONCHAIN_RPC_URL_POLYGON`**
  - **`ONCHAIN_RPC_URLS_ZKSYNC`**, **`ONCHAIN_RPC_URL_ZKSYNC`**
  - **`ONCHAIN_RPC_URLS_LINEA`**, **`ONCHAIN_RPC_URL_LINEA`**
  - **`ONCHAIN_RPC_URLS_SCROLL`**, **`ONCHAIN_RPC_URL_SCROLL`**
  - **`ONCHAIN_RPC_URLS_POLYGON_ZKEVM`**, **`ONCHAIN_RPC_URL_POLYGON_ZKEVM`**
- **Global (backwards-compatible fallback)**:
  - **`ONCHAIN_RPC_URLS`**: comma-separated RPC URLs (applies to all chains)
  - **`ONCHAIN_RPC_URL`**: single RPC URL (applies to all chains)
- **`IPFS_GATEWAY`**: IPFS gateway base (default `https://ipfs.io/ipfs`)
- **`NEXT_PUBLIC_SITE_URL`** or **`SITE_URL`**: base URL used for metadata (default `http://localhost:3000`)
