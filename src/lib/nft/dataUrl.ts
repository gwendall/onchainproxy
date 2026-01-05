export type DecodedDataUrl = {
  mime: string;
  body: Buffer;
};

// Robust data: URL parser.
// Supports: data:[<mime>][;charset=<x>][;base64],<data>
export const decodeDataUrlToBuffer = (dataUrl: string): DecodedDataUrl | null => {
  if (!dataUrl.startsWith("data:")) return null;
  const commaIdx = dataUrl.indexOf(",");
  if (commaIdx === -1) return null;

  const meta = dataUrl.slice("data:".length, commaIdx);
  const dataPart = dataUrl.slice(commaIdx + 1);

  const parts = meta.split(";").map((s) => s.trim()).filter(Boolean);
  const first = parts[0] || "";
  const mime = first.includes("/") ? first : "application/octet-stream";
  const isBase64 = parts.some((p) => p.toLowerCase() === "base64");

  try {
    const body = isBase64
      ? Buffer.from(dataPart, "base64")
      : Buffer.from(decodeURIComponent(dataPart), "utf8");
    return { mime, body };
  } catch {
    return null;
  }
};



