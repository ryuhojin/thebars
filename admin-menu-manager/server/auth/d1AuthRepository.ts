import type {
  AuthRepository,
  AuthSessionRecord,
  AuthUserRecord,
  CreateSessionInput,
  CreateUserInput,
  ManagedUserRecord,
  RevokeSessionByTokenAndCsrfInput,
  SessionWithUser,
  UserStatusSummary
} from "./repository";

type UserRow = {
  id: string;
  username: string;
  normalized_username: string;
  password_hash: string;
  is_system_admin: number;
  is_active: number;
  forced_password_change: number;
  login_failed_count: number;
  locked_until: string | null;
  created_at: string;
  updated_at: string;
  password_changed_at: string | null;
};

type SessionRow = {
  id: string;
  user_id: string;
  token_hash: string;
  csrf_token_hash: string;
  created_at: string;
  last_touched_at: string;
  expires_at: string;
  revoked_at: string | null;
};

type CountRow = {
  count: number;
};

type ManagedUserRow = UserRow & {
  last_login_at: string | null;
  active_session_count: number | null;
};

export class D1AuthRepository implements AuthRepository {
  constructor(private readonly db: D1Database) {}

  async countSystemAdmins(): Promise<number> {
    const row = await this.db.prepare("SELECT COUNT(*) AS count FROM users WHERE is_system_admin = 1").first<CountRow>();
    return row?.count ?? 0;
  }

  async findFirstSystemAdmin(): Promise<AuthUserRecord | null> {
    const row = await this.db
      .prepare("SELECT * FROM users WHERE is_system_admin = 1 ORDER BY created_at ASC LIMIT 1")
      .first<UserRow>();
    return row ? mapUser(row) : null;
  }

  async findUserById(userId: string): Promise<AuthUserRecord | null> {
    const row = await this.db.prepare("SELECT * FROM users WHERE id = ?").bind(userId).first<UserRow>();
    return row ? mapUser(row) : null;
  }

  async findUserByUsername(normalizedUsername: string): Promise<AuthUserRecord | null> {
    const row = await this.db
      .prepare("SELECT * FROM users WHERE normalized_username = ?")
      .bind(normalizedUsername)
      .first<UserRow>();
    return row ? mapUser(row) : null;
  }

  async createUser(input: CreateUserInput): Promise<AuthUserRecord> {
    await this.db
      .prepare(
        `INSERT INTO users (
          id, username, normalized_username, password_hash, is_system_admin, is_active,
          forced_password_change, login_failed_count, locked_until, created_at, updated_at, password_changed_at
        ) VALUES (?, ?, ?, ?, ?, 1, ?, 0, NULL, ?, ?, ?)`
      )
      .bind(
        input.id,
        input.username,
        input.normalizedUsername,
        input.passwordHash,
        input.isSystemAdmin ? 1 : 0,
        input.forcedPasswordChange ? 1 : 0,
        input.now,
        input.now,
        input.forcedPasswordChange ? null : input.now
      )
      .run();
    const user = await this.findUserById(input.id);
    if (!user) throw new Error("USER_INSERT_FAILED");
    return user;
  }

  async updateUserAuthState(
    userId: string,
    updates: {
      loginFailedCount?: number;
      lockedUntil?: string | null;
      isActive?: boolean;
      forcedPasswordChange?: boolean;
      updatedAt: string;
    }
  ): Promise<void> {
    const assignments: string[] = [];
    const values: unknown[] = [];
    if (Object.hasOwn(updates, "loginFailedCount")) {
      assignments.push("login_failed_count = ?");
      values.push(updates.loginFailedCount);
    }
    if (Object.hasOwn(updates, "lockedUntil")) {
      assignments.push("locked_until = ?");
      values.push(updates.lockedUntil ?? null);
    }
    if (Object.hasOwn(updates, "isActive")) {
      assignments.push("is_active = ?");
      values.push(updates.isActive ? 1 : 0);
    }
    if (Object.hasOwn(updates, "forcedPasswordChange")) {
      assignments.push("forced_password_change = ?");
      values.push(updates.forcedPasswordChange ? 1 : 0);
    }
    assignments.push("updated_at = ?");
    values.push(updates.updatedAt);
    await this.db
      .prepare(
        `UPDATE users
         SET ${assignments.join(", ")}
         WHERE id = ?`
      )
      .bind(...values, userId)
      .run();
  }

  async replacePassword(userId: string, passwordHash: string, forcedPasswordChange: boolean, now: string): Promise<AuthUserRecord> {
    await this.db
      .prepare(
        `UPDATE users
         SET password_hash = ?, forced_password_change = ?, login_failed_count = 0,
             locked_until = NULL, updated_at = ?, password_changed_at = ?
         WHERE id = ?`
      )
      .bind(passwordHash, forcedPasswordChange ? 1 : 0, now, now, userId)
      .run();
    const user = await this.findUserById(userId);
    if (!user) throw new Error("USER_NOT_FOUND");
    return user;
  }

  async createSession(input: CreateSessionInput): Promise<AuthSessionRecord> {
    await this.db
      .prepare(
        `INSERT INTO sessions (
          id, user_id, token_hash, csrf_token_hash, created_at, last_touched_at, expires_at, revoked_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL)`
      )
      .bind(input.id, input.userId, input.tokenHash, input.csrfTokenHash, input.now, input.now, input.expiresAt)
      .run();
    return {
      id: input.id,
      userId: input.userId,
      tokenHash: input.tokenHash,
      csrfTokenHash: input.csrfTokenHash,
      createdAt: input.now,
      lastTouchedAt: input.now,
      expiresAt: input.expiresAt,
      revokedAt: null
    };
  }

  async findSessionByTokenHash(tokenHash: string): Promise<SessionWithUser | null> {
    const row = await this.db
      .prepare(
        `SELECT
          sessions.id AS session_id, sessions.user_id, sessions.token_hash, sessions.csrf_token_hash,
          sessions.created_at AS session_created_at, sessions.last_touched_at, sessions.expires_at, sessions.revoked_at,
          users.id AS user_id_joined, users.username, users.normalized_username, users.password_hash,
          users.is_system_admin, users.is_active, users.forced_password_change, users.login_failed_count,
          users.locked_until, users.created_at AS user_created_at, users.updated_at, users.password_changed_at
         FROM sessions
         JOIN users ON users.id = sessions.user_id
         WHERE sessions.token_hash = ?
         LIMIT 1`
      )
      .bind(tokenHash)
      .first<Record<string, unknown>>();
    if (!row) return null;
    return {
      session: {
        id: row.session_id as string,
        userId: row.user_id as string,
        tokenHash: row.token_hash as string,
        csrfTokenHash: row.csrf_token_hash as string,
        createdAt: row.session_created_at as string,
        lastTouchedAt: row.last_touched_at as string,
        expiresAt: row.expires_at as string,
        revokedAt: (row.revoked_at as string | null) ?? null
      },
      user: mapUser({
        id: row.user_id_joined as string,
        username: row.username as string,
        normalized_username: row.normalized_username as string,
        password_hash: row.password_hash as string,
        is_system_admin: row.is_system_admin as number,
        is_active: row.is_active as number,
        forced_password_change: row.forced_password_change as number,
        login_failed_count: row.login_failed_count as number,
        locked_until: (row.locked_until as string | null) ?? null,
        created_at: row.user_created_at as string,
        updated_at: row.updated_at as string,
        password_changed_at: (row.password_changed_at as string | null) ?? null
      })
    };
  }

  async touchSession(sessionId: string, lastTouchedAt: string, expiresAt: string): Promise<void> {
    await this.db
      .prepare("UPDATE sessions SET last_touched_at = ?, expires_at = ? WHERE id = ?")
      .bind(lastTouchedAt, expiresAt, sessionId)
      .run();
  }

  async revokeSessionByTokenAndCsrfHash(input: RevokeSessionByTokenAndCsrfInput): Promise<boolean> {
    const result = await this.db
      .prepare(
        `UPDATE sessions
         SET revoked_at = ?
         WHERE token_hash = ?
           AND csrf_token_hash = ?
           AND revoked_at IS NULL
           AND expires_at >= ?
           AND EXISTS (
             SELECT 1
             FROM users
             WHERE users.id = sessions.user_id
               AND users.is_active = 1
           )`
      )
      .bind(input.revokedAt, input.tokenHash, input.csrfTokenHash, input.now)
      .run();
    return typeof result.meta.changes === "number" && result.meta.changes > 0;
  }

  async revokeSession(sessionId: string, revokedAt: string): Promise<void> {
    await this.db.prepare("UPDATE sessions SET revoked_at = ? WHERE id = ?").bind(revokedAt, sessionId).run();
  }

  async revokeSessionsForUser(userId: string, revokedAt: string): Promise<void> {
    await this.db
      .prepare("UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL")
      .bind(revokedAt, userId)
      .run();
  }

  async readUserStatusSummary(nowIso: string): Promise<UserStatusSummary> {
    const row = await this.db
      .prepare(
        `SELECT
          COUNT(*) AS totalUsers,
          SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) AS activeUsers,
          SUM(CASE WHEN is_active = 0 THEN 1 ELSE 0 END) AS inactiveUsers,
          SUM(CASE WHEN locked_until IS NOT NULL AND locked_until > ? THEN 1 ELSE 0 END) AS lockedUsers
         FROM users`
      )
      .bind(nowIso)
      .first<UserStatusSummary>();
    return {
      totalUsers: row?.totalUsers ?? 0,
      activeUsers: row?.activeUsers ?? 0,
      inactiveUsers: row?.inactiveUsers ?? 0,
      lockedUsers: row?.lockedUsers ?? 0
    };
  }

  async listManagedUsers(nowIso: string): Promise<ManagedUserRecord[]> {
    const rows = await this.db
      .prepare(
        `SELECT
          users.*,
          MAX(sessions.created_at) AS last_login_at,
          SUM(CASE WHEN sessions.revoked_at IS NULL AND sessions.expires_at > ? THEN 1 ELSE 0 END) AS active_session_count
         FROM users
         LEFT JOIN sessions ON sessions.user_id = users.id
         GROUP BY users.id
         ORDER BY users.normalized_username ASC`
      )
      .bind(nowIso)
      .all<ManagedUserRow>();
    return (rows.results ?? []).map((row) => ({
      ...mapUser(row),
      lastLoginAt: row.last_login_at,
      activeSessionCount: row.active_session_count ?? 0
    }));
  }
}

function mapUser(row: UserRow): AuthUserRecord {
  return {
    id: row.id,
    username: row.username,
    normalizedUsername: row.normalized_username,
    passwordHash: row.password_hash,
    isSystemAdmin: row.is_system_admin === 1,
    isActive: row.is_active === 1,
    forcedPasswordChange: row.forced_password_change === 1,
    loginFailedCount: row.login_failed_count,
    lockedUntil: row.locked_until,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    passwordChangedAt: row.password_changed_at
  };
}

function mapSession(row: SessionRow): AuthSessionRecord {
  return {
    id: row.id,
    userId: row.user_id,
    tokenHash: row.token_hash,
    csrfTokenHash: row.csrf_token_hash,
    createdAt: row.created_at,
    lastTouchedAt: row.last_touched_at,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at
  };
}
