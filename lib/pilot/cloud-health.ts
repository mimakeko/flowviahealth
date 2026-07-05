export const EXPECTED_TELNYX_MESSAGING_PROFILE_ID = "40019f0a-4f48-4749-9d5a-7bb4f0716cbe";
export const EXPECTED_TELNYX_FROM_NUMBER = "+14692933948";

export type DatabasePoolerMode = "session" | "transaction" | "unknown";

export type DatabaseUrlMetadata = Readonly<{
  hasSslRequirement: boolean;
  mode: DatabasePoolerMode;
  parseable: boolean;
  port: string;
  set: boolean;
}>;

export type DatabaseUrlComparison = Readonly<{
  databaseUrl: DatabaseUrlMetadata;
  directUrl: DatabaseUrlMetadata;
  identical: boolean | null;
}>;

export function getCloudDeployTarget() {
  return (
    process.env.FLOWVIA_DEPLOY_TARGET ||
    process.env.FLOWVIA_READINESS_TARGET ||
    process.env.VERCEL_ENV ||
    (process.env.NODE_ENV === "production" ? "production" : "local")
  ).trim().toLowerCase();
}

export function isProductionLikeTarget(target = getCloudDeployTarget()) {
  return ["staging", "production", "preview", "prod"].includes(target);
}

export function getDatabaseUrlMetadata(name: "DATABASE_URL" | "DIRECT_URL"): DatabaseUrlMetadata {
  const value = process.env[name]?.trim();
  if (!value) {
    return {
      hasSslRequirement: false,
      mode: "unknown",
      parseable: false,
      port: "missing",
      set: false,
    };
  }

  try {
    const parsed = new URL(value);
    const port = parsed.port || (parsed.protocol === "postgresql:" || parsed.protocol === "postgres:" ? "5432" : "unknown");
    const host = parsed.hostname.toLowerCase();
    const sslMode = parsed.searchParams.get("sslmode")?.toLowerCase();
    const sslValue = parsed.searchParams.get("ssl")?.toLowerCase();
    const hasSslRequirement = sslMode === "require" || sslValue === "true";
    const mode: DatabasePoolerMode = port === "6543" || (host.includes("pooler") && port !== "5432")
      ? "transaction"
      : port === "5432"
        ? "session"
        : "unknown";

    return {
      hasSslRequirement,
      mode,
      parseable: true,
      port,
      set: true,
    };
  } catch {
    return {
      hasSslRequirement: false,
      mode: "unknown",
      parseable: false,
      port: "unparseable",
      set: true,
    };
  }
}

export function getDatabaseUrlComparison(): DatabaseUrlComparison {
  const databaseUrl = getDatabaseUrlMetadata("DATABASE_URL");
  const directUrl = getDatabaseUrlMetadata("DIRECT_URL");
  const databaseValue = process.env.DATABASE_URL?.trim();
  const directValue = process.env.DIRECT_URL?.trim();

  return {
    databaseUrl,
    directUrl,
    identical: databaseValue && directValue ? databaseValue === directValue : null,
  };
}

export function safeInboundKeywordLabel(body: string | null | undefined) {
  const keyword = (body || "").trim().split(/\s+/)[0]?.replace(/[^a-z]/gi, "").toUpperCase() ?? "";
  if (keyword === "HELP" || keyword === "INFO") return "HELP";
  if (keyword === "START" || keyword === "YES") return keyword;
  if (["STOP", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"].includes(keyword)) return "STOP";
  return "UNKNOWN";
}
