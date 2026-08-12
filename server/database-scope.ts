import { createHash } from "node:crypto";

const POSTGRES_IDENTIFIER_MAX_LENGTH = 63;

export type DatabaseScope = {
  applicationSchema: string;
  migrationSchema: string;
  preview: boolean;
};

export function resolveDatabaseScope(environment: NodeJS.ProcessEnv = process.env): DatabaseScope {
  if (environment.IS_PULL_REQUEST?.toLowerCase() !== "true") {
    return {
      applicationSchema: "public",
      migrationSchema: "drizzle",
      preview: false,
    };
  }

  const serviceName = environment.RENDER_SERVICE_NAME?.trim();

  if (!serviceName) {
    throw new Error("RENDER_SERVICE_NAME is required for Render pull request previews");
  }

  const hash = createHash("sha256").update(serviceName).digest("hex").slice(0, 8);
  const normalizedName =
    serviceName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "service";
  const prefix = "preview_";
  const maxNameLength = POSTGRES_IDENTIFIER_MAX_LENGTH - prefix.length - hash.length - 1;
  const schema = `${prefix}${normalizedName.slice(0, maxNameLength)}_${hash}`;

  return {
    applicationSchema: schema,
    migrationSchema: schema,
    preview: true,
  };
}

export function quotePostgresIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}
