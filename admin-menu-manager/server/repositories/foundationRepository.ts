export interface D1PrepareResult {
  first<T = unknown>(): Promise<T | null>;
}

export interface D1LikeDatabase {
  prepare(query: string): D1PrepareResult;
}

export class FoundationRepository {
  constructor(private readonly db: D1LikeDatabase | undefined) {}

  async runSmokeQuery(): Promise<"available" | "missing-binding"> {
    if (!this.db) return "missing-binding";
    const result = await this.db.prepare("SELECT 1 AS ok").first<{ ok: number }>();
    return result?.ok === 1 ? "available" : "missing-binding";
  }
}
