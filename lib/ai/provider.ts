import type {
  OperationsAssistantConfig,
  OperationsAssistantProviderName,
  OperationsAssistantRequest,
  OperationsAssistantSuggestion,
  OperationsAssistantTask,
} from "./schemas.ts";

export type OperationsAssistantProvider = Readonly<{
  name: OperationsAssistantProviderName;
  suggest<TTask extends OperationsAssistantTask>(
    request: OperationsAssistantRequest<TTask>,
    config: OperationsAssistantConfig,
  ): Promise<OperationsAssistantSuggestion>;
}>;

function booleanEnv(value: string | undefined, defaultValue: boolean) {
  if (value === undefined || value === "") return defaultValue;
  return value.trim().toLowerCase() === "true";
}

function providerEnv(value: string | undefined): OperationsAssistantProviderName {
  const normalized = (value || "mock").trim().toLowerCase();
  if (normalized === "none" || normalized === "openai") return normalized;
  return "mock";
}

export function getOperationsAssistantConfig(): OperationsAssistantConfig {
  return {
    auditOnly: booleanEnv(process.env.FLOWVIA_AI_AUDIT_ONLY, true),
    enabled: booleanEnv(process.env.FLOWVIA_AI_ENABLED, false),
    noPhiMode: booleanEnv(process.env.FLOWVIA_AI_NO_PHI_MODE, true),
    provider: providerEnv(process.env.FLOWVIA_AI_PROVIDER),
  };
}
