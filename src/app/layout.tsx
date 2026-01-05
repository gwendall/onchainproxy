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
  themeColor: "#000000",
};

export const metadata: Metadata = {
  metadataBase: siteUrl,
  title: {
    default: "NFTProxy",
    template: "%s | NFTProxy",
  },
  description: "Stable, cache-friendly URLs for NFT images and metadata.",
  applicationName: "NFTProxy",
  keywords: [
    "Ethereum",
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
    title: "NFTProxy",
    description: "Stable, cache-friendly URLs for NFT images and metadata.",
    url: "/",
    siteName: "NFTProxy",
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "NFTProxy",
    description: "Stable, cache-friendly URLs for NFT images and metadata.",
    creator: "@gwendall",
  },
  icons: {
    icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
    shortcut: ["/favicon.svg"],
    apple: [{ url: "/apple-icon", type: "image/png" }],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
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
