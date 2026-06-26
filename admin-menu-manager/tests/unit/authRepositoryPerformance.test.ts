import { describe, expect, it } from "vitest";
import { D1AuthRepository } from "../../server/auth/d1AuthRepository";

type D1Call = {
  sql: string;
  values: unknown[];
};

function createD1Stub(runChanges = 1) {
  const calls: D1Call[] = [];
  const db = {
    prepare(sql: string) {
      const call: D1Call = { sql, values: [] };
      calls.push(call);
      return {
        bind(...values: unknown[]) {
          call.values = values;
          return {
            async run() {
              return { success: true, meta: { changes: runChanges } };
            },
            async first() {
              throw new Error("Unexpected D1 first() call");
            }
          };
        }
      };
    }
  } as unknown as D1Database;
  return { db, calls };
}

describe("D1 auth repository performance paths", () => {
  it("creates a session without re-reading the inserted row", async () => {
    const { db, calls } = createD1Stub();
    const repository = new D1AuthRepository(db);

    const session = await repository.createSession({
      id: "session-1",
      userId: "user-1",
      tokenHash: "token-hash",
      csrfTokenHash: "csrf-hash",
      now: "2026-06-26T00:00:00.000Z",
      expiresAt: "2026-06-26T08:00:00.000Z"
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.sql).toContain("INSERT INTO sessions");
    expect(session).toMatchObject({
      id: "session-1",
      userId: "user-1",
      tokenHash: "token-hash",
      csrfTokenHash: "csrf-hash",
      createdAt: "2026-06-26T00:00:00.000Z",
      lastTouchedAt: "2026-06-26T00:00:00.000Z",
      expiresAt: "2026-06-26T08:00:00.000Z",
      revokedAt: null
    });
  });

  it("updates auth state without a pre-read merge query", async () => {
    const { db, calls } = createD1Stub();
    const repository = new D1AuthRepository(db);

    await repository.updateUserAuthState("user-1", {
      loginFailedCount: 0,
      lockedUntil: null,
      updatedAt: "2026-06-26T00:00:00.000Z"
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.sql).toContain("UPDATE users");
    expect(calls[0]?.sql).not.toContain("SELECT");
    expect(calls[0]?.values).toEqual([0, null, "2026-06-26T00:00:00.000Z", "user-1"]);
  });

  it("revokes a valid logout session with one guarded update", async () => {
    const { db, calls } = createD1Stub(1);
    const repository = new D1AuthRepository(db);

    const revoked = await repository.revokeSessionByTokenAndCsrfHash({
      tokenHash: "token-hash",
      csrfTokenHash: "csrf-hash",
      revokedAt: "2026-06-26T00:00:00.000Z",
      now: "2026-06-26T00:00:00.000Z"
    });

    expect(revoked).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.sql).toContain("UPDATE sessions");
    expect(calls[0]?.sql).toContain("csrf_token_hash");
    expect(calls[0]?.sql).toContain("users.is_active = 1");
    expect(calls[0]?.values).toEqual([
      "2026-06-26T00:00:00.000Z",
      "token-hash",
      "csrf-hash",
      "2026-06-26T00:00:00.000Z"
    ]);
  });
});
