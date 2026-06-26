import { z } from "zod";

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9]{4,20}$/, "아이디는 영문 소문자와 숫자 4~20자여야 합니다.");

export const passwordSchema = z
  .string()
  .min(10, "비밀번호는 10자 이상이어야 합니다.")
  .regex(/[A-Za-z]/, "영문을 1자 이상 포함해야 합니다.")
  .regex(/[0-9]/, "숫자를 1자 이상 포함해야 합니다.")
  .regex(/[^A-Za-z0-9]/, "특수문자를 1자 이상 포함해야 합니다.");

const passwordConfirmSchema = z
  .object({
    password: passwordSchema,
    passwordConfirm: z.string()
  })
  .refine((value) => value.password === value.passwordConfirm, {
    path: ["passwordConfirm"],
    message: "비밀번호 확인이 일치하지 않습니다."
  });

const newPasswordConfirmSchema = z
  .object({
    newPassword: passwordSchema,
    newPasswordConfirm: z.string()
  })
  .refine((value) => value.newPassword === value.newPasswordConfirm, {
    path: ["newPasswordConfirm"],
    message: "새 비밀번호 확인이 일치하지 않습니다."
  });

export const setupRequestSchema = z
  .object({
    setupToken: z.string().min(1),
    username: usernameSchema
  })
  .and(passwordConfirmSchema);

export const recoveryRequestSchema = z
  .object({
    recoveryToken: z.string().min(1)
  })
  .and(newPasswordConfirmSchema);

export const loginRequestSchema = z.object({
  username: usernameSchema,
  password: z.string().min(1)
});

export const changePasswordRequestSchema = z
  .object({
    currentPassword: z.string().min(1)
  })
  .and(newPasswordConfirmSchema);

export const authUserSchema = z.object({
  id: z.string().min(1),
  username: usernameSchema,
  isSystemAdmin: z.boolean(),
  forcedPasswordChange: z.boolean()
});

export const setupResponseSchema = z.object({
  setupComplete: z.literal(true),
  user: authUserSchema
});

export const loginResponseSchema = z.object({
  user: authUserSchema,
  csrfToken: z.string().min(32),
  expiresAt: z.string().datetime(),
  nextPath: z.enum(["/dashboard", "/change-password"])
});

export const sessionResponseSchema = z.object({
  authenticated: z.literal(true),
  user: authUserSchema,
  csrfToken: z.string().min(32),
  expiresAt: z.string().datetime()
});

export const changePasswordResponseSchema = z.object({
  passwordChanged: z.literal(true),
  user: authUserSchema
});

export const logoutResponseSchema = z.object({
  loggedOut: z.literal(true)
});

export const recoveryResponseSchema = z.object({
  recovered: z.literal(true)
});

export type SetupRequest = z.infer<typeof setupRequestSchema>;
export type RecoveryRequest = z.infer<typeof recoveryRequestSchema>;
export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type ChangePasswordRequest = z.infer<typeof changePasswordRequestSchema>;
export type AuthUser = z.infer<typeof authUserSchema>;
export type LoginResponse = z.infer<typeof loginResponseSchema>;
export type SessionResponse = z.infer<typeof sessionResponseSchema>;
