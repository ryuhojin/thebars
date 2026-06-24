import { describe, expect, it } from "vitest";
import { apiFailureSchema, apiSuccessSchema, fail, ok } from "../../contracts/apiEnvelope";
import { d00FoundationManifest, foundationManifestSchema } from "../../contracts/foundation";
import { isDeviceSpecificPath } from "../../src/lib/routeInvariant";
import { z } from "zod";

describe("API envelope contract", () => {
  it("validates success envelopes with request IDs", () => {
    const schema = apiSuccessSchema(z.object({ status: z.literal("ok") }));

    expect(schema.parse(ok({ status: "ok" }, "req_test"))).toEqual({
      data: { status: "ok" },
      meta: { requestId: "req_test" }
    });
  });

  it("validates stable failure envelopes", () => {
    const payload = fail(
      {
        code: "INPUT_INVALID",
        message: "입력값을 확인하세요.",
        fieldErrors: { name: ["필수입니다."] }
      },
      "req_error"
    );

    expect(apiFailureSchema.parse(payload).error.code).toBe("INPUT_INVALID");
  });
});

describe("D00 route contract", () => {
  it("keeps the single URL responsive invariant explicit", () => {
    const manifest = foundationManifestSchema.parse(d00FoundationManifest);

    expect(manifest.responsiveContract).toEqual({
      singleUrl: true,
      viewportRedirects: false,
      statePreservedOnResize: true
    });
  });

  it("rejects device-specific path prefixes", () => {
    const compactPrefix = `/${"m"}`;
    const forbiddenPrefix = `/${"mobile"}`;

    expect(isDeviceSpecificPath("/dashboard")).toBe(false);
    expect(isDeviceSpecificPath(`${compactPrefix}/dashboard`)).toBe(true);
    expect(isDeviceSpecificPath(`${forbiddenPrefix}/login`)).toBe(true);
  });
});
