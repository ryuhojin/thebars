import type {
  RateLimitBucketRecord,
  RateLimitRepository,
  RateLimitScope,
  UpsertRateLimitBucketInput
} from "./repository";

export class MemoryRateLimitRepository implements RateLimitRepository {
  private readonly buckets = new Map<string, RateLimitBucketRecord>();

  reset(): void {
    this.buckets.clear();
  }

  async findBucket(scope: RateLimitScope, keyHash: string): Promise<RateLimitBucketRecord | null> {
    return this.buckets.get(bucketKey(scope, keyHash)) ?? null;
  }

  async upsertBucket(input: UpsertRateLimitBucketInput): Promise<RateLimitBucketRecord> {
    const key = bucketKey(input.scope, input.keyHash);
    const current = this.buckets.get(key);
    const record: RateLimitBucketRecord = {
      id: current?.id ?? input.id,
      scope: input.scope,
      keyHash: input.keyHash,
      windowStart: input.windowStart,
      windowExpiresAt: input.windowExpiresAt,
      attempts: input.attempts,
      createdAt: current?.createdAt ?? input.now,
      updatedAt: input.now
    };
    this.buckets.set(key, record);
    return record;
  }
}

function bucketKey(scope: RateLimitScope, keyHash: string): string {
  return `${scope}:${keyHash}`;
}
