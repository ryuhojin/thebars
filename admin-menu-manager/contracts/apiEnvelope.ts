import { z } from "zod";

export const responseMetaSchema = z.object({
  requestId: z.string().min(1)
});

export const apiErrorSchema = z.object({
  code: z.string().regex(/^[A-Z0-9_]+$/),
  message: z.string().min(1),
  fieldErrors: z.record(z.string(), z.array(z.string())).default({}),
  details: z.record(z.string(), z.unknown()).optional()
});

export function apiSuccessSchema<TSchema extends z.ZodTypeAny>(dataSchema: TSchema) {
  return z.object({
    data: dataSchema,
    meta: responseMetaSchema
  });
}

export const apiFailureSchema = z.object({
  error: apiErrorSchema,
  meta: responseMetaSchema
});

export type ResponseMeta = z.infer<typeof responseMetaSchema>;
export type ApiError = z.infer<typeof apiErrorSchema>;
export type ApiFailure = z.infer<typeof apiFailureSchema>;
export type ApiSuccess<TData> = {
  data: TData;
  meta: ResponseMeta;
};

export function ok<TData>(data: TData, requestId: string): ApiSuccess<TData> {
  return {
    data,
    meta: { requestId }
  };
}

export function fail(error: ApiError, requestId: string): ApiFailure {
  return {
    error,
    meta: { requestId }
  };
}
