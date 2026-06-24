import type { AuthConfig } from "./authService";
import { AuthService } from "./authService";
import { D1AuthRepository } from "./d1AuthRepository";
import { MemoryAuthRepository } from "./memoryAuthRepository";
import { Pbkdf2PasswordHasher, type PasswordHasher } from "./passwordHasher";
import type { AuthRepository } from "./repository";

export type AuthRuntime = {
  service: AuthService;
  config: AuthConfig;
  repository: AuthRepository;
};

const fallbackRepository = new MemoryAuthRepository();

export type AuthRuntimeOptions = {
  repository?: AuthRepository;
  passwordHasher?: PasswordHasher;
  config?: AuthConfig;
  now?: () => Date;
};

export function createAuthRuntime(env?: { DB?: D1Database; SETUP_TOKEN?: string; ADMIN_RECOVERY_TOKEN?: string }, options: AuthRuntimeOptions = {}): AuthRuntime {
  const repository = options.repository ?? (env?.DB ? new D1AuthRepository(env.DB) : fallbackRepository);
  const config: AuthConfig = {
    setupToken: options.config?.setupToken ?? env?.SETUP_TOKEN,
    recoveryToken: options.config?.recoveryToken ?? env?.ADMIN_RECOVERY_TOKEN,
    sessionCookieName: options.config?.sessionCookieName,
    csrfCookieName: options.config?.csrfCookieName
  };
  return {
    repository,
    config,
    service: new AuthService(repository, {
      passwordHasher: options.passwordHasher ?? new Pbkdf2PasswordHasher(),
      config,
      now: options.now
    })
  };
}

export function getFallbackMemoryRepository() {
  return fallbackRepository;
}
