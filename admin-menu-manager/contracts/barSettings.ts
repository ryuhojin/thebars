import { z } from "zod";
import { barNameSchema, barStatusSchema, currencySchema, publicMenuStatusSchema } from "./bars";

export const dayOfWeekSchema = z.number().int().min(0).max(6);
export const timeOfDaySchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "시간은 HH:MM 형식이어야 합니다.");

const optionalText = (max: number, message: string) => z.string().trim().max(max, message);

const optionalHttpUrl = (message: string) =>
  z
    .string()
    .trim()
    .max(500, "URL은 500자 이하여야 합니다.")
    .refine((value) => value === "" || isHttpUrl(value), message);

const requiredHttpUrl = (message: string) =>
  z
    .string()
    .trim()
    .min(1, "링크 URL을 입력하세요.")
    .max(500, "URL은 500자 이하여야 합니다.")
    .refine((value) => isHttpUrl(value), message);

export const phoneNumberDigitsSchema = z
  .string()
  .trim()
  .refine((value) => value === "" || /^0\d{7,10}$/.test(value), "국내 전화번호는 숫자만 8~11자리로 입력하세요.");

export const barBusinessHourInputSchema = z.object({
  id: z.string().min(1).optional(),
  dayOfWeek: dayOfWeekSchema,
  opensAt: timeOfDaySchema,
  closesAt: timeOfDaySchema
});

export const barBusinessHourSchema = barBusinessHourInputSchema.extend({
  id: z.string().min(1),
  sortOrder: z.number().int().nonnegative()
});

export const barLinkInputSchema = z.object({
  id: z.string().min(1).optional(),
  label: z.string().trim().min(1, "링크 이름을 입력하세요.").max(40, "링크 이름은 40자 이하여야 합니다."),
  url: requiredHttpUrl("링크 URL은 http 또는 https만 허용합니다.")
});

export const barLinkSchema = barLinkInputSchema.extend({
  id: z.string().min(1),
  sortOrder: z.number().int().nonnegative()
});

export const updateBarSettingsRequestSchema = z
  .object({
    name: barNameSchema,
    description: optionalText(500, "소개는 500자 이하여야 합니다."),
    address: optionalText(300, "주소는 300자 이하여야 합니다."),
    mapUrl: optionalHttpUrl("지도 URL은 http 또는 https만 허용합니다."),
    phoneNumberDigits: phoneNumberDigitsSchema,
    openingNote: optionalText(300, "영업 안내는 300자 이하여야 합니다."),
    currency: currencySchema,
    businessHours: z.array(barBusinessHourInputSchema).max(28, "영업시간 구간은 28개 이하여야 합니다."),
    links: z.array(barLinkInputSchema).max(5, "자유 링크는 최대 5개까지 등록할 수 있습니다.")
  })
  .superRefine((value, context) => {
    const overlap = findBusinessHourOverlap(value.businessHours);
    if (overlap) {
      context.addIssue({
        code: "custom",
        path: ["businessHours", overlap.index],
        message: "영업시간 구간이 서로 겹칩니다."
      });
    }
  });

export const barSettingsResponseSchema = z.object({
  bar: z.object({
    id: z.string().min(1),
    slug: z.string().min(1),
    encodedSlug: z.string().min(1),
    customerPath: z.string().min(1),
    status: barStatusSchema,
    publicMenuStatus: publicMenuStatusSchema,
    directPublishEnabled: z.boolean()
  }),
  settings: z.object({
    name: barNameSchema,
    description: z.string(),
    address: z.string(),
    mapUrl: z.string(),
    phoneNumberDigits: z.string(),
    phoneNumberDisplay: z.string(),
    openingNote: z.string(),
    currency: currencySchema,
    businessHours: z.array(barBusinessHourSchema),
    links: z.array(barLinkSchema),
    settingsDraftHash: z.string().min(1),
    updatedAt: z.string().datetime()
  })
});

export type DayOfWeek = z.infer<typeof dayOfWeekSchema>;
export type BarBusinessHourInput = z.infer<typeof barBusinessHourInputSchema>;
export type BarBusinessHour = z.infer<typeof barBusinessHourSchema>;
export type BarLinkInput = z.infer<typeof barLinkInputSchema>;
export type BarLink = z.infer<typeof barLinkSchema>;
export type UpdateBarSettingsRequest = z.infer<typeof updateBarSettingsRequestSchema>;
export type BarSettingsResponse = z.infer<typeof barSettingsResponseSchema>;

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function findBusinessHourOverlap(
  ranges: Array<{ dayOfWeek: number; opensAt: string; closesAt: string }>
): { index: number } | null {
  const weekMinutes = 7 * 24 * 60;
  const intervals = ranges.flatMap((range, index) => {
    const start = range.dayOfWeek * 24 * 60 + minutesFromTime(range.opensAt);
    let end = range.dayOfWeek * 24 * 60 + minutesFromTime(range.closesAt);
    if (end <= start) end += 24 * 60;
    if (end <= weekMinutes) return [{ start, end, index }];
    return [
      { start, end: weekMinutes, index },
      { start: 0, end: end - weekMinutes, index }
    ];
  });
  intervals.sort((left, right) => left.start - right.start || left.end - right.end);
  for (let index = 1; index < intervals.length; index += 1) {
    const previous = intervals[index - 1];
    const current = intervals[index];
    if (previous && current && current.start < previous.end) {
      return { index: current.index };
    }
  }
  return null;
}

function minutesFromTime(value: string): number {
  const [hour = "0", minute = "0"] = value.split(":");
  return Number(hour) * 60 + Number(minute);
}
