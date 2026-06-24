export type RateLimitScope =
  | "auth.login"
  | "auth.setup"
  | "auth.recovery"
  | "publication.publish"
  | "order.settle";

export type RateLimitBucketRecord = {
  id: string;
  scope: RateLimitScope;
  keyHash: string;
  windowStart: string;
  windowExpiresAt: string;
  attempts: number;
  createdAt: string;
  updatedAt: string;
};

export type UpsertRateLimitBucketInput = {
  id: string;
  scope: RateLimitScope;
  keyHash: string;
  windowStart: string;
  windowExpiresAt: string;
  attempts: number;
  now: string;
};

export type RateLimitRepository = {
  findBucket(scope: RateLimitScope, keyHash: string): Promise<RateLimitBucketRecord | null>;
  upsertBucket(input: UpsertRateLimitBucketInput): Promise<RateLimitBucketRecord>;
};
