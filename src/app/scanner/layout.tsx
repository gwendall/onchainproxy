import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "OnChain Scanner",
  description:
    "Scan an Ethereum wallet’s NFTs and check whether token metadata and images are live or down.",
  alternates: {
    canonical: "/scanner",
  },
  openGraph: {
    title: "OnChain Scanner",
    description:
      "Scan an Ethereum wallet’s NFTs and check whether token metadata and images are live or down.",
    url: "/scanner",
    type: "website",
    images: [
      {
        // Reuse the global OG image (metadataBase from root layout makes this absolute)
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "OnChain Scanner",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "OnChain Scanner",
    description:
      "Scan an Ethereum wallet’s NFTs and check whether token metadata and images are live or down.",
    images: [
      {
        url: "/twitter-image",
        width: 1200,
        height: 630,
        alt: "OnChain Scanner",
      },
    ],
  },
};

export default function ScannerLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}


