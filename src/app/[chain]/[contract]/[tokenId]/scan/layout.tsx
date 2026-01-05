import type { Metadata } from "next";

type LayoutProps = {
  children: React.ReactNode;
  params: Promise<{ chain: string; contract: string; tokenId: string }>;
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

const shortAddress = (addr: string) => {
  const a = String(addr || "");
  if (a.length <= 16) return a;
  return `${a.slice(0, 8)}…${a.slice(-6)}`;
};

export async function generateMetadata({ params }: LayoutProps): Promise<Metadata> {
  const { chain, contract, tokenId } = await params;
  const chainName = chainDisplayName(chain);
  const title = `Token #${tokenId} Health Check | ${chainName}`;
  const description = `Check if NFT ${shortAddress(contract)} #${tokenId} on ${chainName} has accessible metadata and images.`;
  
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      images: [
        {
          url: `/${chain}/${contract}/${tokenId}/scan/opengraph-image`,
          width: 1200,
          height: 630,
          alt: `Token #${tokenId} Health Check`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [`/${chain}/${contract}/${tokenId}/scan/twitter-image`],
    },
  };
}

export default function ScanLayout({ children }: LayoutProps) {
  return children;
}

