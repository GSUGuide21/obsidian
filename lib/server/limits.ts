// Rate limiting: token buckets per member, kept in memory.
// Loaded by Node's type stripping (see server.mts): imports from the app are by
// path with their extension, and `import type` only from lib/chat/types.

// ---------------------------------------------------------------------------
// Rate limiting: token buckets per member, kept in memory.
// ---------------------------------------------------------------------------

export function limiter(capacity: number, refillPerSecond: number) {
  const buckets = new Map<string, { tokens: number; at: number }>();
  const take = (key: string) => {
    const now = Date.now();
    const bucket = buckets.get(key) ?? { tokens: capacity, at: now };
    bucket.tokens = Math.min(capacity, bucket.tokens + ((now - bucket.at) / 1000) * refillPerSecond);
    bucket.at = now;
    buckets.set(key, bucket);
    if (bucket.tokens < 1) return false;
    bucket.tokens -= 1;
    return true;
  };
  // Forget idle buckets (they'd be full again anyway).
  setInterval(() => {
    const cutoff = Date.now() - (capacity / refillPerSecond) * 1000;
    for (const [key, bucket] of buckets) if (bucket.at < cutoff) buckets.delete(key);
  }, 60_000).unref();
  return take;
}

export const canSend = limiter(8, 1);

 // bursts of 8, then one message a second
export const canJoin = limiter(10, 0.2);

export const canType = limiter(20, 2);

export const canRead = limiter(30, 5);

 // history pages and lookups
export const canReact = limiter(15, 2);

 // reactions and poll votes
export const canMark = limiter(20, 2);
