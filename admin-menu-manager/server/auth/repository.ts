export type AuthUserRecord = {
  id: string;
  username: string;
  normalizedUsername: string;
  passwordHash: string;
  isSystemAdmin: boolean;
  isActive: boolean;
  forcedPasswordChange: boolean;
  loginFailedCount: number;
  lockedUntil: string | null;
  createdAt: string;
  updatedAt: string;
  passwordChangedAt: string | null;
};

export type AuthSessionRecord = {
  id: string;
  userId: string;
  tokenHash: string;
  csrfTokenHash: string;
  createdAt: string;
  lastTouchedAt: string;
  expiresAt: string;
  revokedAt: string | null;
};

export type SessionWithUser = {
  session: AuthSessionRecord;
  user: AuthUserRecord;
};

export type UserStatusSummary = {
  totalUsers: number;
  activeUsers: number;
  inactiveUsers: number;
  lockedUsers: number;
};

export type ManagedUserRecord = AuthUserRecord & {
  lastLoginAt: string | null;
  activeSessionCount: number;
};

export type CreateUserInput = {
  id: string;
  username: string;
  normalizedUsername: string;
  passwordHash: string;
  isSystemAdmin: boolean;
  forcedPasswordChange: boolean;
  now: string;
};

export type CreateSessionInput = {
  id: string;
  userId: string;
  tokenHash: string;
  csrfTokenHash: string;
  now: string;
  expiresAt: string;
};

export interface AuthRepository {
  countSystemAdmins(): Promise<number>;
  findFirstSystemAdmin(): Promise<AuthUserRecord | null>;
  findUserById(userId: string): Promise<AuthUserRecord | null>;
  findUserByUsername(normalizedUsername: string): Promise<AuthUserRecord | null>;
  createUser(input: CreateUserInput): Promise<AuthUserRecord>;
  updateUserAuthState(
    userId: string,
    updates: Partial<Pick<AuthUserRecord, "loginFailedCount" | "lockedUntil" | "isActive" | "forcedPasswordChange">> & {
      updatedAt: string;
    }
  ): Promise<void>;
  replacePassword(userId: string, passwordHash: string, forcedPasswordChange: boolean, now: string): Promise<AuthUserRecord>;
  createSession(input: CreateSessionInput): Promise<AuthSessionRecord>;
  findSessionByTokenHash(tokenHash: string): Promise<SessionWithUser | null>;
  touchSession(sessionId: string, lastTouchedAt: string, expiresAt: string): Promise<void>;
  revokeSession(sessionId: string, revokedAt: string): Promise<void>;
  revokeSessionsForUser(userId: string, revokedAt: string): Promise<void>;
  readUserStatusSummary(nowIso: string): Promise<UserStatusSummary>;
  listManagedUsers(nowIso: string): Promise<ManagedUserRecord[]>;
}
