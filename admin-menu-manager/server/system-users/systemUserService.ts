import type {
  CreateSystemUserRequest,
  CreateSystemUserResponse,
  SystemUser,
  SystemUserCommandResponse,
  SystemUserDetail,
  SystemUserListQuery,
  SystemUserListResponse,
  SystemUserStatus
} from "../../contracts/systemUsers";
import {
  createSystemUserResponseSchema,
  systemUserCommandResponseSchema,
  systemUserListResponseSchema
} from "../../contracts/systemUsers";
import { nowIso } from "../auth/crypto";
import { AuthServiceError } from "../auth/errors";
import type { AuthRepository, AuthUserRecord, ManagedUserRecord } from "../auth/repository";
import { Pbkdf2PasswordHasher, type PasswordHasher } from "../auth/passwordHasher";

export type SystemUserServiceOptions = {
  now?: () => Date;
  passwordHasher?: PasswordHasher;
  temporaryPasswordGenerator?: () => string;
};

export class SystemUserService {
  private readonly now: () => Date;
  private readonly passwordHasher: PasswordHasher;
  private readonly temporaryPasswordGenerator: () => string;

  constructor(
    private readonly repository: AuthRepository,
    options: SystemUserServiceOptions = {}
  ) {
    this.now = options.now ?? (() => new Date());
    this.passwordHasher = options.passwordHasher ?? new Pbkdf2PasswordHasher();
    this.temporaryPasswordGenerator = options.temporaryPasswordGenerator ?? createTemporaryPassword;
  }

  async listUsers(actor: AuthUserRecord, query: SystemUserListQuery): Promise<SystemUserListResponse> {
    assertSystemAdmin(actor);
    const now = nowIso(this.now());
    const allUsers = await this.repository.listManagedUsers(now);
    const filtered = allUsers.filter((user) => matchesQuery(user, query.q) && matchesStatus(user, query.status, now));
    const totalPages = Math.max(1, Math.ceil(filtered.length / query.pageSize));
    const page = Math.min(query.page, totalPages);
    const items = filtered.slice((page - 1) * query.pageSize, page * query.pageSize).map((user) => toSystemUser(user, now));
    const summary = {
      totalUsers: allUsers.length,
      activeUsers: allUsers.filter((user) => user.isActive).length,
      inactiveUsers: allUsers.filter((user) => !user.isActive).length,
      lockedUsers: allUsers.filter((user) => isLocked(user, now)).length,
      forcedPasswordUsers: allUsers.filter((user) => user.forcedPasswordChange).length
    };
    return systemUserListResponseSchema.parse({
      items,
      summary,
      pagination: {
        page,
        pageSize: query.pageSize,
        totalItems: filtered.length,
        totalPages
      }
    });
  }

  async readUser(actor: AuthUserRecord, userId: string): Promise<SystemUserDetail> {
    assertSystemAdmin(actor);
    return this.readManagedUser(userId);
  }

  async createUser(actor: AuthUserRecord, input: CreateSystemUserRequest): Promise<CreateSystemUserResponse> {
    assertSystemAdmin(actor);
    const temporaryPassword = this.temporaryPasswordGenerator();
    const now = nowIso(this.now());
    try {
      const created = await this.repository.createUser({
        id: crypto.randomUUID(),
        username: input.username,
        normalizedUsername: input.username,
        passwordHash: await this.passwordHasher.hash(temporaryPassword),
        isSystemAdmin: false,
        forcedPasswordChange: true,
        now
      });
      return createSystemUserResponseSchema.parse({
        user: toSystemUserDetail({ ...created, lastLoginAt: null, activeSessionCount: 0 }, now),
        temporaryPassword,
        oneTimeNotice: true
      });
    } catch (error) {
      if (isUsernameUniqueError(error)) {
        throw new AuthServiceError(409, "USERNAME_ALREADY_EXISTS", "이미 사용 중인 아이디입니다.", {
          username: ["이미 사용 중인 아이디입니다."]
        });
      }
      throw error;
    }
  }

  async activateUser(actor: AuthUserRecord, userId: string): Promise<SystemUserCommandResponse> {
    assertSystemAdmin(actor);
    const target = await this.requireMutableUser(userId);
    await this.repository.updateUserAuthState(target.id, {
      isActive: true,
      updatedAt: nowIso(this.now())
    });
    return systemUserCommandResponseSchema.parse({ user: await this.readManagedUser(userId) });
  }

  async deactivateUser(actor: AuthUserRecord, userId: string): Promise<SystemUserCommandResponse> {
    assertSystemAdmin(actor);
    const target = await this.requireMutableUser(userId);
    const now = nowIso(this.now());
    await this.repository.updateUserAuthState(target.id, {
      isActive: false,
      updatedAt: now
    });
    await this.repository.revokeSessionsForUser(target.id, now);
    return systemUserCommandResponseSchema.parse({ user: await this.readManagedUser(userId) });
  }

  async unlockUser(actor: AuthUserRecord, userId: string): Promise<SystemUserCommandResponse> {
    assertSystemAdmin(actor);
    const target = await this.requireMutableUser(userId);
    await this.repository.updateUserAuthState(target.id, {
      loginFailedCount: 0,
      lockedUntil: null,
      updatedAt: nowIso(this.now())
    });
    return systemUserCommandResponseSchema.parse({ user: await this.readManagedUser(userId) });
  }

  async resetPassword(actor: AuthUserRecord, userId: string): Promise<CreateSystemUserResponse> {
    assertSystemAdmin(actor);
    const target = await this.requireMutableUser(userId);
    const temporaryPassword = this.temporaryPasswordGenerator();
    const now = nowIso(this.now());
    const updated = await this.repository.replacePassword(
      target.id,
      await this.passwordHasher.hash(temporaryPassword),
      true,
      now
    );
    const managedUsers = await this.repository.listManagedUsers(now);
    const managed = managedUsers.find((user) => user.id === updated.id) ?? { ...updated, lastLoginAt: null, activeSessionCount: 0 };
    return createSystemUserResponseSchema.parse({
      user: toSystemUserDetail(managed, now),
      temporaryPassword,
      oneTimeNotice: true
    });
  }

  private async requireMutableUser(userId: string): Promise<AuthUserRecord> {
    const target = await this.repository.findUserById(userId);
    if (!target) {
      throw new AuthServiceError(404, "USER_NOT_FOUND", "사용자를 찾을 수 없습니다.");
    }
    if (target.isSystemAdmin) {
      throw new AuthServiceError(409, "SYSTEM_ADMIN_USER_IMMUTABLE", "시스템 관리자 계정은 이 화면에서 변경할 수 없습니다.");
    }
    return target;
  }

  private async readManagedUser(userId: string): Promise<SystemUserDetail> {
    const now = nowIso(this.now());
    const users = await this.repository.listManagedUsers(now);
    const user = users.find((item) => item.id === userId);
    if (!user) {
      throw new AuthServiceError(404, "USER_NOT_FOUND", "사용자를 찾을 수 없습니다.");
    }
    return toSystemUserDetail(user, now);
  }
}

export function toSystemUser(user: ManagedUserRecord, now: string): SystemUser {
  const locked = isLocked(user, now);
  const status: SystemUserStatus = !user.isActive ? "inactive" : locked ? "locked" : "active";
  return {
    id: user.id,
    username: user.normalizedUsername,
    isSystemAdmin: user.isSystemAdmin,
    status,
    isActive: user.isActive,
    isLocked: locked,
    forcedPasswordChange: user.forcedPasswordChange,
    lockedUntil: locked ? user.lockedUntil : null,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    membershipsLabel: user.isSystemAdmin ? "시스템 전체" : "소속 바 배정 대기"
  };
}

function toSystemUserDetail(user: ManagedUserRecord, now: string): SystemUserDetail {
  return {
    ...toSystemUser(user, now),
    activeSessionCount: user.activeSessionCount
  };
}

function assertSystemAdmin(actor: AuthUserRecord): void {
  if (!actor.isSystemAdmin) {
    throw new AuthServiceError(403, "SYSTEM_ADMIN_REQUIRED", "시스템 관리자만 사용할 수 있습니다.");
  }
}

function matchesQuery(user: ManagedUserRecord, query: string): boolean {
  if (!query) return true;
  const normalizedQuery = query.toLowerCase();
  return user.normalizedUsername.includes(normalizedQuery) || user.id.includes(normalizedQuery);
}

function matchesStatus(user: ManagedUserRecord, status: SystemUserListQuery["status"], now: string): boolean {
  if (status === "all") return true;
  if (status === "forced_password_change") return user.forcedPasswordChange;
  if (status === "locked") return isLocked(user, now);
  if (status === "inactive") return !user.isActive;
  return user.isActive && !isLocked(user, now);
}

function isLocked(user: AuthUserRecord, now: string): boolean {
  return user.lockedUntil !== null && user.lockedUntil > now;
}

function isUsernameUniqueError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.message === "UNIQUE_NORMALIZED_USERNAME" || error.message.includes("users.normalized_username"))
  );
}

function createTemporaryPassword(): string {
  const alphabet = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  const randomPart = [...bytes].map((byte) => alphabet[byte % alphabet.length]).join("");
  return `Tmp-${randomPart}!1`;
}
