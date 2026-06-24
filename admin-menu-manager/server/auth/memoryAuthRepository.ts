import type {
  AuthRepository,
  AuthSessionRecord,
  AuthUserRecord,
  CreateSessionInput,
  CreateUserInput,
  ManagedUserRecord,
  SessionWithUser,
  UserStatusSummary
} from "./repository";

export class MemoryAuthRepository implements AuthRepository {
  private readonly users = new Map<string, AuthUserRecord>();
  private readonly sessions = new Map<string, AuthSessionRecord>();

  reset() {
    this.users.clear();
    this.sessions.clear();
  }

  async countSystemAdmins(): Promise<number> {
    return [...this.users.values()].filter((user) => user.isSystemAdmin).length;
  }

  async findFirstSystemAdmin(): Promise<AuthUserRecord | null> {
    return [...this.users.values()].find((user) => user.isSystemAdmin) ?? null;
  }

  async findUserById(userId: string): Promise<AuthUserRecord | null> {
    return this.users.get(userId) ?? null;
  }

  async findUserByUsername(normalizedUsername: string): Promise<AuthUserRecord | null> {
    return [...this.users.values()].find((user) => user.normalizedUsername === normalizedUsername) ?? null;
  }

  async createUser(input: CreateUserInput): Promise<AuthUserRecord> {
    if (await this.findUserByUsername(input.normalizedUsername)) {
      throw new Error("UNIQUE_NORMALIZED_USERNAME");
    }
    const user: AuthUserRecord = {
      id: input.id,
      username: input.username,
      normalizedUsername: input.normalizedUsername,
      passwordHash: input.passwordHash,
      isSystemAdmin: input.isSystemAdmin,
      isActive: true,
      forcedPasswordChange: input.forcedPasswordChange,
      loginFailedCount: 0,
      lockedUntil: null,
      createdAt: input.now,
      updatedAt: input.now,
      passwordChangedAt: input.forcedPasswordChange ? null : input.now
    };
    this.users.set(user.id, user);
    return { ...user };
  }

  async updateUserAuthState(
    userId: string,
    updates: Partial<Pick<AuthUserRecord, "loginFailedCount" | "lockedUntil" | "isActive" | "forcedPasswordChange">> & {
      updatedAt: string;
    }
  ): Promise<void> {
    const user = this.users.get(userId);
    if (!user) return;
    this.users.set(userId, { ...user, ...updates });
  }

  async replacePassword(userId: string, passwordHash: string, forcedPasswordChange: boolean, now: string): Promise<AuthUserRecord> {
    const user = this.users.get(userId);
    if (!user) throw new Error("USER_NOT_FOUND");
    const updated = {
      ...user,
      passwordHash,
      forcedPasswordChange,
      loginFailedCount: 0,
      lockedUntil: null,
      updatedAt: now,
      passwordChangedAt: now
    };
    this.users.set(userId, updated);
    return { ...updated };
  }

  async createSession(input: CreateSessionInput): Promise<AuthSessionRecord> {
    const session: AuthSessionRecord = {
      id: input.id,
      userId: input.userId,
      tokenHash: input.tokenHash,
      csrfTokenHash: input.csrfTokenHash,
      createdAt: input.now,
      lastTouchedAt: input.now,
      expiresAt: input.expiresAt,
      revokedAt: null
    };
    this.sessions.set(session.id, session);
    return { ...session };
  }

  async findSessionByTokenHash(tokenHash: string): Promise<SessionWithUser | null> {
    const session = [...this.sessions.values()].find((item) => item.tokenHash === tokenHash) ?? null;
    if (!session) return null;
    const user = this.users.get(session.userId);
    if (!user) return null;
    return { session: { ...session }, user: { ...user } };
  }

  async touchSession(sessionId: string, lastTouchedAt: string, expiresAt: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    this.sessions.set(sessionId, { ...session, lastTouchedAt, expiresAt });
  }

  async revokeSession(sessionId: string, revokedAt: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    this.sessions.set(sessionId, { ...session, revokedAt });
  }

  async revokeSessionsForUser(userId: string, revokedAt: string): Promise<void> {
    for (const session of this.sessions.values()) {
      if (session.userId === userId && !session.revokedAt) {
        this.sessions.set(session.id, { ...session, revokedAt });
      }
    }
  }

  async readUserStatusSummary(nowIso: string): Promise<UserStatusSummary> {
    const users = [...this.users.values()];
    return {
      totalUsers: users.length,
      activeUsers: users.filter((user) => user.isActive).length,
      inactiveUsers: users.filter((user) => !user.isActive).length,
      lockedUsers: users.filter((user) => user.lockedUntil !== null && user.lockedUntil > nowIso).length
    };
  }

  async listManagedUsers(nowIso: string): Promise<ManagedUserRecord[]> {
    return [...this.users.values()]
      .map((user) => {
        const userSessions = [...this.sessions.values()].filter((session) => session.userId === user.id);
        const lastLoginAt =
          userSessions
            .map((session) => session.createdAt)
            .sort()
            .at(-1) ?? null;
        const activeSessionCount = userSessions.filter(
          (session) => !session.revokedAt && session.expiresAt > nowIso
        ).length;
        return {
          ...user,
          lastLoginAt,
          activeSessionCount
        };
      })
      .sort((left, right) => left.normalizedUsername.localeCompare(right.normalizedUsername));
  }
}
