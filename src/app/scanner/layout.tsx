import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "OnChainScanner",
  description:
    "Scan an Ethereum wallet's onchain assets and check whether token metadata and images are live or down.",
  alternates: {
    canonical: "/scanner",
  },
  openGraph: {
    title: "OnChainScanner",
    description:
      "Scan an Ethereum wallet's onchain assets and check whether token metadata and images are live or down.",
    url: "/scanner",
    type: "website",
    images: [
      {
        url: "/scanner/opengraph-image",
        width: 1200,
        height: 630,
        alt: "OnChainScanner",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "OnChainScanner",
    description:
      "Scan an Ethereum wallet's onchain assets and check whether token metadata and images are live or down.",
    images: [
      {
        url: "/scanner/twitter-image",
        width: 1200,
        height: 630,
        alt: "OnChainScanner",
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
