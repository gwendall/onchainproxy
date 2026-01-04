import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

const siteUrl = (() => {
  const raw = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL;
  try {
    return new URL(raw && raw.length > 0 ? raw : "http://localhost:3000");
  } catch {
    return new URL("http://localhost:3000");
  }
})();

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#fafafa",
};

export const metadata: Metadata = {
  metadataBase: siteUrl,
  title: {
    default: "nft-proxy",
    template: "%s | nft-proxy",
  },
  description: "NFT metadata + image proxy with smart caching.",
  applicationName: "nft-proxy",
  keywords: [
    "NFT",
    "ERC721",
    "ERC1155",
    "metadata",
    "image",
    "proxy",
    "cache",
    "IPFS",
    "API",
  ],
  authors: [{ name: "Gwendall" }],
  creator: "Gwendall",
  openGraph: {
    title: "nft-proxy",
    description: "NFT metadata + image proxy with smart caching.",
    url: "/",
    siteName: "nft-proxy",
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "nft-proxy",
    description: "NFT metadata + image proxy with smart caching.",
    creator: "@gwendall",
  },
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
