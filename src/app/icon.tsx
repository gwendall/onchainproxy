import { ImageResponse } from "next/og";

export const runtime = "edge";

export const size = {
  width: 512,
  height: 512,
};

export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#000000",
        }}
      >
        <div
          style={{
            width: 96,
            height: 96,
            background: "#ffffff",
            borderRadius: 12,
          }}
        />
      </div>
    ),
    {
      width: size.width,
      height: size.height,
    },
  );
}


