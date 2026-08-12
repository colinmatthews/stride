import { describe, expect, it } from "vitest";
import { resolveDatabaseScope } from "./database-scope.js";

describe("resolveDatabaseScope", () => {
  it("uses the existing production schemas outside a pull request preview", () => {
    expect(resolveDatabaseScope({})).toEqual({
      applicationSchema: "public",
      migrationSchema: "drizzle",
      preview: false,
    });
  });

  it("creates a stable isolated schema for a Render pull request service", () => {
    const environment = {
      IS_PULL_REQUEST: "true",
      RENDER_SERVICE_NAME: "stride-course-pr-84-jts3",
    };

    const first = resolveDatabaseScope(environment);
    const second = resolveDatabaseScope(environment);

    expect(first).toEqual(second);
    expect(first.preview).toBe(true);
    expect(first.applicationSchema).toMatch(/^preview_stride_course_pr_84_jts3_[a-f0-9]{8}$/);
    expect(first.migrationSchema).toBe(first.applicationSchema);
  });

  it("separates different Render preview services", () => {
    const first = resolveDatabaseScope({
      IS_PULL_REQUEST: "true",
      RENDER_SERVICE_NAME: "stride-course-pr-84",
    });
    const second = resolveDatabaseScope({
      IS_PULL_REQUEST: "true",
      RENDER_SERVICE_NAME: "stride-course-pr-84-jts3",
    });

    expect(first.applicationSchema).not.toBe(second.applicationSchema);
  });

  it("keeps generated identifiers valid and within PostgreSQL's length limit", () => {
    const scope = resolveDatabaseScope({
      IS_PULL_REQUEST: "TRUE",
      RENDER_SERVICE_NAME: `Feature/An extremely long service name ${"x".repeat(100)}`,
    });

    expect(scope.applicationSchema).toMatch(/^[a-z][a-z0-9_]*$/);
    expect(scope.applicationSchema.length).toBeLessThanOrEqual(63);
  });

  it("requires Render's service identity for a pull request preview", () => {
    expect(() => resolveDatabaseScope({ IS_PULL_REQUEST: "true" })).toThrow(
      "RENDER_SERVICE_NAME is required",
    );
  });
});
