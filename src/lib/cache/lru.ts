export type LruOptions = {
  maxEntries: number;
};

type Entry<V> = {
  value: V;
  expiresAtMs: number;
};

// Minimal LRU with TTL (per process / per lambda instance).
// Note: this is best-effort caching; CDN caching is still the primary layer.
export class LruTtlCache<K, V> {
  private readonly maxEntries: number;
  private readonly map: Map<K, Entry<V>>;

  public constructor(options: LruOptions) {
    this.maxEntries = options.maxEntries;
    this.map = new Map<K, Entry<V>>();
  }

  public get(key: K, nowMs: number): V | undefined {
    const entry = this.map.get(key);
    if (!entry) return undefined;
    if (entry.expiresAtMs <= nowMs) {
      this.map.delete(key);
      return undefined;
    }
    // refresh recency
    this.map.delete(key);
    this.map.set(key, entry);
    return entry.value;
  }

  public set(key: K, value: V, ttlMs: number, nowMs: number): void {
    const expiresAtMs = nowMs + ttlMs;
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, { value, expiresAtMs });

    while (this.map.size > this.maxEntries) {
      const oldest = this.map.keys().next().value as K | undefined;
      if (oldest === undefined) break;
      this.map.delete(oldest);
    }
  }
}


