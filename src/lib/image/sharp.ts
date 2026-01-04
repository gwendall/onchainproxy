// NOTE: `sharp` is a native dependency and can be flaky on some CI/runtime setups.
// We lazy-load it to avoid crashing the function at import-time.
type SharpFn = typeof import("sharp");
let sharpFn: SharpFn | null = null;

export const getSharp = async () => {
  if (sharpFn) return sharpFn;
  try {
    const mod = await import("sharp");
    const maybeDefault = (mod as unknown as { default?: unknown }).default;
    sharpFn = (maybeDefault ?? mod) as unknown as SharpFn;
    return sharpFn;
  } catch {
    return null;
  }
};


