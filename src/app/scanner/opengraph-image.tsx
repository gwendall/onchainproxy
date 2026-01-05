import { ImageResponse } from "next/og";

export const runtime = "nodejs";

export const alt = "OnChainScanner";
export const size = {
  width: 1200,
  height: 630,
};

export const contentType = "image/png";

const ScanLogo = () => {
  const stroke = "white";
  return (
    <svg
      width="84"
      height="84"
      viewBox="0 0 70 70"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ transform: "translateY(3px)" }}
    >
      {/* Minimal rounded outline */}
      <rect x="8" y="8" width="54" height="54" rx="10" stroke={stroke} strokeWidth="4" />

      {/* Corner brackets (scan marks) */}
      <path d="M18 28V18H28" stroke={stroke} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M42 18H52V28" stroke={stroke} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M52 42V52H42" stroke={stroke} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M28 52H18V42" stroke={stroke} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />

      {/* Scan line */}
      <path d="M22 35H48" stroke={stroke} strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
};

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          background: "black",
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "30px",
          }}
        >
          <ScanLogo />
          <div
            style={{
              color: "white",
              fontSize: "96px",
              fontWeight: 700,
              letterSpacing: "-0.05em",
              fontFamily:
                '"Geist Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
            }}
          >
            OnChainScanner
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
