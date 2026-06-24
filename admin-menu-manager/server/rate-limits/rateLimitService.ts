import { AuthServiceError } from "../auth/errors";
import { addMilliseconds, nowIso, sha256Hex } from "../auth/crypto";
import type { RateLimitRepository, RateLimitScope } from "./repository";

export type RateLimitRule = {
  maxAttempts: number;
  windowMs: number;
};

export type RateLimitConfig = {
  enabled?: boolean;
  scopes?: Partial<Record<RateLimitScope, RateLimitRule>>;
};

export type RateLimitDecision = {
  allowed: boolean;
  attempts: number;
  retryAfterSeconds: number;
};

const defaultRateLimitRules: Record<RateLimitScope, RateLimitRule> = {
  "auth.login": { maxAttempts: 60, windowMs: 15 * 60 * 1000 },
  "auth.setup": { maxAttempts: 5, windowMs: 60 * 60 * 1000 },
  "auth.recovery": { maxAttempts: 5, windowMs: 60 * 60 * 1000 },
  "publication.publish": { maxAttempts: 10, windowMs: 60 * 1000 },
  "order.settle": { maxAttempts: 30, windowMs: 60 * 1000 }
};

export class RateLimitService {
  constructor(
    private readonly repository: RateLimitRepository,
    private readonly config: RateLimitConfig = {},
    private readonly now: () => Date = () => new Date()
  ) {}

  async enforce(scope: RateLimitScope, keyParts: string[]): Promise<RateLimitDecision> {
    if (this.config.enabled === false) {
      return { allowed: true, attempts: 0, retryAfterSeconds: 0 };
    }
    const rule = this.config.scopes?.[scope] ?? defaultRateLimitRules[scope];
    const now = this.now();
    const nowText = nowIso(now);
    const keyHash = await sha256Hex([scope, ...keyParts].join("\n"));
    const current = await this.repository.findBucket(scope, keyHash);
    const expired = !current || new Date(current.windowExpiresAt).getTime() <= now.getTime();
    const nextAttempts = expired ? 1 : current.attempts + 1;
    const windowStart = expired ? nowText : current.windowStart;
    const windowExpiresAt = expired ? nowIso(addMilliseconds(now, rule.windowMs)) : current.windowExpiresAt;

    if (!expired && current.attempts >= rule.maxAttempts) {
      const retryAfterSeconds = retryAfter(windowExpiresAt, now);
      throw new AuthServiceError(429, "RATE_LIMITED", "요청이 너무 많습니다. 잠시 후 다시 시도하세요.", {}, {
        retryAfterSeconds,
        scope
      });
    }

    await this.repository.upsertBucket({
      id: crypto.randomUUID(),
      scope,
      keyHash,
      windowStart,
      windowExpiresAt,
      attempts: nextAttempts,
      now: nowText
    });
    return {
      allowed: true,
      attempts: nextAttempts,
      retryAfterSeconds: retryAfter(windowExpiresAt, now)
    };
  }
}

function retryAfter(windowExpiresAt: string, now: Date): number {
  return Math.max(1, Math.ceil((new Date(windowExpiresAt).getTime() - now.getTime()) / 1000));
}
