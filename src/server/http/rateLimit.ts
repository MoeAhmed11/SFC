// Rate limiting for sensitive HTTP endpoints (PILOT_READINESS.md item 5:
// login, token-consuming routes). Fixed-window counter keyed by an arbitrary
// string (typically IP + route, or IP + token for token-scoped routes).
//
// Storage: in-process Map. This means limits are per-server-instance, not
// shared across a horizontally-scaled deployment — the same limitation the
// notification queue already has with no Redis available in this
// environment (see IMPLEMENTATION_PLAN.md). The RateLimiter INTERFACE is
// deliberately storage-agnostic so a Redis-backed implementation can replace
// InMemoryRateLimiter later without changing any call site.
//
// Fixed-window (not sliding/token-bucket) is a deliberate simplicity choice
// for this stage: it can allow a short burst right at a window boundary, but
// it is trivial to reason about, memory-bounded, and sufficient to blunt
// credential-stuffing and token-guessing attempts, which is the actual threat
// being mitigated here (Section 4 FR-04: "rate-limit sensitive endpoints").

export interface RateLimitResult {
  allowed: boolean;
  // Seconds until the caller may retry, only meaningful when allowed=false.
  retryAfterSeconds: number;
}

export interface RateLimiter {
  check(key: string, limit: number, windowSeconds: number): RateLimitResult;
}

interface WindowState {
  count: number;
  windowStartMs: number;
}

export class InMemoryRateLimiter implements RateLimiter {
  private readonly windows = new Map<string, WindowState>();

  check(key: string, limit: number, windowSeconds: number): RateLimitResult {
    const now = Date.now();
    const windowMs = windowSeconds * 1000;
    const existing = this.windows.get(key);

    if (!existing || now - existing.windowStartMs >= windowMs) {
      // New window (first request for this key, or the previous window expired).
      this.windows.set(key, { count: 1, windowStartMs: now });
      return { allowed: true, retryAfterSeconds: 0 };
    }

    if (existing.count < limit) {
      existing.count += 1;
      return { allowed: true, retryAfterSeconds: 0 };
    }

    const elapsedMs = now - existing.windowStartMs;
    const retryAfterSeconds = Math.max(1, Math.ceil((windowMs - elapsedMs) / 1000));
    return { allowed: false, retryAfterSeconds };
  }

  // Periodically drop stale windows so long-running processes don't leak
  // memory for keys that are no longer active. Safe to call on a timer or
  // opportunistically; not required for correctness.
  sweepExpired(maxAgeSeconds: number): void {
    const cutoff = Date.now() - maxAgeSeconds * 1000;
    for (const [key, state] of this.windows) {
      if (state.windowStartMs < cutoff) this.windows.delete(key);
    }
  }

  // Test/debug helper: clears all state.
  reset(): void {
    this.windows.clear();
  }
}

// Single process-wide instance. Rate limits are meaningful across requests
// within one server process, so this must not be re-created per request.
export const defaultRateLimiter: RateLimiter = new InMemoryRateLimiter();
