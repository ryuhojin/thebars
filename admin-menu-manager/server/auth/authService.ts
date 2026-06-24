import type {
  AuthUser,
  ChangePasswordRequest,
  LoginRequest,
  LoginResponse,
  RecoveryRequest,
  SessionResponse,
  SetupRequest
} from "../../contracts/auth";
import { constantTimeEqual, addMilliseconds, isBeforeIso, nowIso, randomSecret, sha256Hex } from "./crypto";
import { AuthServiceError } from "./errors";
import { Pbkdf2PasswordHasher, type PasswordHasher } from "./passwordHasher";
import type { AuthRepository, AuthSessionRecord, AuthUserRecord, SessionWithUser } from "./repository";

const SESSION_DURATION_MS = 8 * 60 * 60 * 1000;
const SESSION_TOUCH_THROTTLE_MS = 5 * 60 * 1000;
const LOCK_DURATION_MS = 15 * 60 * 1000;
const MAX_LOGIN_FAILURES = 5;

export type AuthConfig = {
  setupToken?: string;
  recoveryToken?: string;
  sessionCookieName?: string;
  csrfCookieName?: string;
};

export type AuthServiceOptions = {
  repository: AuthRepository;
  passwordHasher?: PasswordHasher;
  config?: AuthConfig;
  now?: () => Date;
};

export type CreatedSession = {
  token: string;
  csrfToken: string;
  expiresAt: string;
};

export type AuthenticatedSession = {
  user: AuthUserRecord;
  session: AuthSessionRecord;
  csrfToken: string;
};

export class AuthService {
  private readonly passwordHasher: PasswordHasher;
  private readonly now: () => Date;
  readonly sessionCookieName: string;
  readonly csrfCookieName: string;

  constructor(
    private readonly repository: AuthRepository,
    options: Omit<AuthServiceOptions, "repository"> = {}
  ) {
    this.passwordHasher = options.passwordHasher ?? new Pbkdf2PasswordHasher();
    this.now = options.now ?? (() => new Date());
    this.sessionCookieName = options.config?.sessionCookieName ?? "bar_session";
    this.csrfCookieName = options.config?.csrfCookieName ?? "bar_csrf";
  }

  async setup(input: SetupRequest, config: AuthConfig = {}): Promise<{ setupComplete: true; user: AuthUser }> {
    await assertConfiguredToken(config.setupToken ?? "", input.setupToken, "SETUP_TOKEN_INVALID");
    if ((await this.repository.countSystemAdmins()) > 0) {
      throw new AuthServiceError(409, "SETUP_ALREADY_COMPLETED", "이미 최초 관리자 설정이 완료되었습니다.");
    }

    const now = nowIso(this.now());
    const passwordHash = await this.passwordHasher.hash(input.password);
    try {
      const user = await this.repository.createUser({
        id: crypto.randomUUID(),
        username: input.username,
        normalizedUsername: input.username,
        passwordHash,
        isSystemAdmin: true,
        forcedPasswordChange: false,
        now
      });
      return { setupComplete: true, user: toAuthUser(user) };
    } catch (error) {
      if (error instanceof Error && error.message === "UNIQUE_NORMALIZED_USERNAME") {
        throw new AuthServiceError(409, "USERNAME_ALREADY_EXISTS", "이미 사용 중인 아이디입니다.", {
          username: ["이미 사용 중인 아이디입니다."]
        });
      }
      throw error;
    }
  }

  async recovery(input: RecoveryRequest, config: AuthConfig = {}): Promise<{ recovered: true }> {
    await assertConfiguredToken(config.recoveryToken ?? "", input.recoveryToken, "RECOVERY_TOKEN_INVALID");
    const user = await this.repository.findFirstSystemAdmin();
    if (!user) throw new AuthServiceError(404, "SYSTEM_ADMIN_NOT_FOUND", "복구할 시스템 관리자가 없습니다.");
    const now = nowIso(this.now());
    const passwordHash = await this.passwordHasher.hash(input.newPassword);
    await this.repository.replacePassword(user.id, passwordHash, false, now);
    return { recovered: true };
  }

  async login(input: LoginRequest): Promise<LoginResponse & CreatedSession> {
    const user = await this.repository.findUserByUsername(input.username);
    if (!user) throw invalidCredentials();

    const now = this.now();
    if (!user.isActive) {
      throw new AuthServiceError(403, "ACCOUNT_INACTIVE", "비활성화된 계정입니다.");
    }
    if (user.lockedUntil && !isBeforeIso(user.lockedUntil, now)) {
      throw lockedError(user.lockedUntil);
    }

    const passwordMatches = await this.passwordHasher.verify(input.password, user.passwordHash);
    if (!passwordMatches) {
      const lockedUntil = await this.recordLoginFailure(user, now);
      if (lockedUntil) throw lockedError(lockedUntil);
      throw invalidCredentials();
    }

    await this.repository.updateUserAuthState(user.id, {
      loginFailedCount: 0,
      lockedUntil: null,
      updatedAt: nowIso(now)
    });
    const createdSession = await this.createSession(user, now);
    return {
      user: toAuthUser(user),
      csrfToken: createdSession.csrfToken,
      expiresAt: createdSession.expiresAt,
      token: createdSession.token,
      nextPath: user.forcedPasswordChange ? "/change-password" : "/dashboard"
    };
  }

  async session(sessionToken: string | null, csrfToken: string | null): Promise<SessionResponse> {
    const authenticated = await this.authenticateSession(sessionToken, csrfToken, {
      allowForcedPasswordChange: true,
      touch: true
    });
    return {
      authenticated: true,
      user: toAuthUser(authenticated.user),
      csrfToken: authenticated.csrfToken,
      expiresAt: authenticated.session.expiresAt
    };
  }

  async requireFeatureSession(sessionToken: string | null, csrfToken: string | null): Promise<AuthenticatedSession> {
    return this.authenticateSession(sessionToken, csrfToken, {
      allowForcedPasswordChange: false,
      touch: true
    });
  }

  async changePassword(
    input: ChangePasswordRequest,
    sessionToken: string | null,
    csrfToken: string | null
  ): Promise<{ passwordChanged: true; user: AuthUser }> {
    const authenticated = await this.authenticateSession(sessionToken, csrfToken, {
      allowForcedPasswordChange: true,
      touch: true
    });
    const passwordMatches = await this.passwordHasher.verify(input.currentPassword, authenticated.user.passwordHash);
    if (!passwordMatches) {
      throw new AuthServiceError(403, "CURRENT_PASSWORD_INVALID", "현재 비밀번호를 확인하세요.", {
        currentPassword: ["현재 비밀번호를 확인하세요."]
      });
    }
    const now = nowIso(this.now());
    const passwordHash = await this.passwordHasher.hash(input.newPassword);
    const user = await this.repository.replacePassword(authenticated.user.id, passwordHash, false, now);
    return { passwordChanged: true, user: toAuthUser(user) };
  }

  async logout(sessionToken: string | null, csrfToken: string | null): Promise<{ loggedOut: true }> {
    if (!sessionToken) return { loggedOut: true };
    const authenticated = await this.authenticateSession(sessionToken, csrfToken, {
      allowForcedPasswordChange: true,
      touch: false
    });
    await this.repository.revokeSession(authenticated.session.id, nowIso(this.now()));
    return { loggedOut: true };
  }

  async createSeedUser(input: {
    username: string;
    password: string;
    isSystemAdmin?: boolean;
    forcedPasswordChange?: boolean;
  }): Promise<AuthUserRecord> {
    const now = nowIso(this.now());
    return this.repository.createUser({
      id: crypto.randomUUID(),
      username: input.username,
      normalizedUsername: input.username,
      passwordHash: await this.passwordHasher.hash(input.password),
      isSystemAdmin: input.isSystemAdmin ?? false,
      forcedPasswordChange: input.forcedPasswordChange ?? true,
      now
    });
  }

  async unlockUserForMaintenance(normalizedUsername: string): Promise<void> {
    const user = await this.repository.findUserByUsername(normalizedUsername);
    if (!user) return;
    await this.repository.updateUserAuthState(user.id, {
      loginFailedCount: 0,
      lockedUntil: null,
      updatedAt: nowIso(this.now())
    });
  }

  async deactivateUserForMaintenance(normalizedUsername: string): Promise<void> {
    const user = await this.repository.findUserByUsername(normalizedUsername);
    if (!user) return;
    const now = nowIso(this.now());
    await this.repository.updateUserAuthState(user.id, {
      isActive: false,
      updatedAt: now
    });
    await this.repository.revokeSessionsForUser(user.id, now);
  }

  private async recordLoginFailure(user: AuthUserRecord, now: Date): Promise<string | null> {
    const nextCount = user.loginFailedCount + 1;
    const lockedUntil = nextCount >= MAX_LOGIN_FAILURES ? nowIso(addMilliseconds(now, LOCK_DURATION_MS)) : null;
    await this.repository.updateUserAuthState(user.id, {
      loginFailedCount: nextCount,
      lockedUntil,
      updatedAt: nowIso(now)
    });
    return lockedUntil;
  }

  private async createSession(user: AuthUserRecord, now: Date): Promise<CreatedSession> {
    const token = randomSecret();
    const csrfToken = randomSecret();
    const expiresAt = nowIso(addMilliseconds(now, SESSION_DURATION_MS));
    await this.repository.createSession({
      id: crypto.randomUUID(),
      userId: user.id,
      tokenHash: await sha256Hex(token),
      csrfTokenHash: await sha256Hex(csrfToken),
      now: nowIso(now),
      expiresAt
    });
    return { token, csrfToken, expiresAt };
  }

  private async authenticateSession(
    sessionToken: string | null,
    csrfToken: string | null,
    options: { allowForcedPasswordChange: boolean; touch: boolean }
  ): Promise<AuthenticatedSession> {
    if (!sessionToken) throw new AuthServiceError(401, "AUTH_REQUIRED", "로그인이 필요합니다.");
    if (!csrfToken) throw new AuthServiceError(403, "CSRF_REQUIRED", "요청 보안 토큰이 필요합니다.");

    const found = await this.repository.findSessionByTokenHash(await sha256Hex(sessionToken));
    if (!found) throw new AuthServiceError(401, "AUTH_REQUIRED", "로그인이 필요합니다.");
    const now = this.now();

    if (found.session.revokedAt || isBeforeIso(found.session.expiresAt, now)) {
      throw new AuthServiceError(401, "SESSION_EXPIRED", "세션이 만료되었습니다.");
    }
    if (!found.user.isActive) {
      await this.repository.revokeSession(found.session.id, nowIso(now));
      throw new AuthServiceError(403, "ACCOUNT_INACTIVE", "비활성화된 계정입니다.");
    }
    if ((await sha256Hex(csrfToken)) !== found.session.csrfTokenHash) {
      throw new AuthServiceError(403, "CSRF_INVALID", "요청 보안 토큰이 올바르지 않습니다.");
    }
    if (found.user.forcedPasswordChange && !options.allowForcedPasswordChange) {
      throw new AuthServiceError(403, "PASSWORD_CHANGE_REQUIRED", "비밀번호 변경이 필요합니다.");
    }

    if (options.touch) {
      const lastTouchedAt = new Date(found.session.lastTouchedAt).getTime();
      if (now.getTime() - lastTouchedAt >= SESSION_TOUCH_THROTTLE_MS) {
        found.session.lastTouchedAt = nowIso(now);
        found.session.expiresAt = nowIso(addMilliseconds(now, SESSION_DURATION_MS));
        await this.repository.touchSession(found.session.id, found.session.lastTouchedAt, found.session.expiresAt);
      }
    }

    return { ...found, csrfToken };
  }
}

export function createAuthService(options: AuthServiceOptions): AuthService {
  return new AuthService(options.repository, options);
}

export function toAuthUser(user: AuthUserRecord): AuthUser {
  return {
    id: user.id,
    username: user.normalizedUsername,
    isSystemAdmin: user.isSystemAdmin,
    forcedPasswordChange: user.forcedPasswordChange
  };
}

async function assertConfiguredToken(expected: string, actual: string, code: string): Promise<void> {
  if (!expected || !(await constantTimeEqual(expected, actual))) {
    throw new AuthServiceError(403, code, "토큰을 확인하세요.");
  }
}

function invalidCredentials(): AuthServiceError {
  return new AuthServiceError(401, "INVALID_CREDENTIALS", "아이디 또는 비밀번호를 확인하세요.");
}

function lockedError(lockedUntil: string): AuthServiceError {
  return new AuthServiceError(429, "ACCOUNT_LOCKED", "로그인 실패가 반복되어 계정이 잠겼습니다.", {}, { lockedUntil });
}
