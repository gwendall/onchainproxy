import { ImageResponse } from "next/og";

export const runtime = "nodejs";

export const alt = "OnChainProxy";
export const size = {
  width: 1200,
  height: 630,
};

export const contentType = "image/png";

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
            gap: "40px",
          }}
        >
          {/* Logo abstrait: Carré blanc minimaliste */}
          <div
            style={{
              width: "70px",
              height: "70px",
              background: "white",
              borderRadius: "10px",
              transform: "translateY(3px)",
            }}
          />
          {/* Titre */}
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
            OnChainProxy
          </div>
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}
