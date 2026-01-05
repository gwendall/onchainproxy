import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "OnChain Scanner",
  description:
    "Scan an Ethereum wallet’s NFTs and check whether token metadata and images are live or down.",
  openGraph: {
    title: "OnChain Scanner",
    description:
      "Scan an Ethereum wallet’s NFTs and check whether token metadata and images are live or down.",
  },
};

export default function ScannerLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}


