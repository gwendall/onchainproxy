export const setCacheControl = (headers: Headers, seconds: number) => {
  headers.set(
    "Cache-Control",
    `public, max-age=${seconds}, s-maxage=${seconds}, immutable, stale-while-revalidate=${seconds * 7}`,
  );
};

export const sendSvgFallback = (status: number, message: string, cacheSeconds = 60) => {
  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">',
    '<rect width="100%" height="100%" fill="#111"/>',
    '<text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#fff" font-family="Arial" font-size="18">',
    message,
    "</text>",
    "</svg>",
  ].join("");

  const headers = new Headers();
  headers.set("Content-Type", "image/svg+xml; charset=utf-8");
  setCacheControl(headers, cacheSeconds);
  return new Response(svg, { status, headers });
};

export const jsonError = (status: number, message: string, cacheSeconds = 60) => {
  const headers = new Headers();
  headers.set("Content-Type", "application/json; charset=utf-8");
  setCacheControl(headers, cacheSeconds);
  return new Response(JSON.stringify({ error: message }), { status, headers });
};

export const clampInt = (
  value: string | null,
  min: number,
  max: number,
  fallback: number,
) => {
  if (typeof value !== "string") return fallback;
  const n = Number.parseInt(value, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.min(max, Math.max(min, n));
};


