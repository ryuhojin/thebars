import type {
  RateLimitBucketRecord,
  RateLimitRepository,
  RateLimitScope,
  UpsertRateLimitBucketInput
} from "./repository";

type RateLimitBucketRow = {
  id: string;
  scope: RateLimitScope;
  key_hash: string;
  window_start: string;
  window_expires_at: string;
  attempts: number;
  created_at: string;
  updated_at: string;
};

export class D1RateLimitRepository implements RateLimitRepository {
  constructor(private readonly db: D1Database) {}

  async findBucket(scope: RateLimitScope, keyHash: string): Promise<RateLimitBucketRecord | null> {
    const row = await this.db
      .prepare("SELECT * FROM rate_limit_buckets WHERE scope = ? AND key_hash = ?")
      .bind(scope, keyHash)
      .first<RateLimitBucketRow>();
    return row ? toRecord(row) : null;
  }

  async upsertBucket(input: UpsertRateLimitBucketInput): Promise<RateLimitBucketRecord> {
    await this.db
      .prepare(
        `INSERT INTO rate_limit_buckets (
          id, scope, key_hash, window_start, window_expires_at, attempts, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(scope, key_hash) DO UPDATE SET
          window_start = excluded.window_start,
          window_expires_at = excluded.window_expires_at,
          attempts = excluded.attempts,
          updated_at = excluded.updated_at`
      )
      .bind(
        input.id,
        input.scope,
        input.keyHash,
        input.windowStart,
        input.windowExpiresAt,
        input.attempts,
        input.now,
        input.now
      )
      .run();
    return {
      id: input.id,
      scope: input.scope,
      keyHash: input.keyHash,
      windowStart: input.windowStart,
      windowExpiresAt: input.windowExpiresAt,
      attempts: input.attempts,
      createdAt: input.now,
      updatedAt: input.now
    };
  }
}

function toRecord(row: RateLimitBucketRow): RateLimitBucketRecord {
  return {
    id: row.id,
    scope: row.scope,
    keyHash: row.key_hash,
    windowStart: row.window_start,
    windowExpiresAt: row.window_expires_at,
    attempts: row.attempts,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
