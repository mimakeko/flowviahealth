import { mockOperationsAssistantProvider } from "./mock-provider.ts";
import { getOperationsAssistantConfig } from "./provider.ts";
import type {
  AdminDailyBriefingInput,
  OperationsAssistantRequest,
  OperationsAssistantSuggestion,
  OperationsAssistantTask,
} from "./schemas.ts";

export async function getOperationsAssistantSuggestion<TTask extends OperationsAssistantTask>(
  request: OperationsAssistantRequest<TTask>,
): Promise<OperationsAssistantSuggestion> {
  const config = getOperationsAssistantConfig();

  if (config.provider === "none") {
    return {
      audit: {
        accepted: false,
        auditOnly: config.auditOnly,
        mutationAllowed: false,
        smsSendAllowed: false,
      },
      confidence: "deterministic_mock",
      data: {},
      provider: "none",
      safety: {
        canBypassCompliance: false,
        containsPhi: false,
        noPhiMode: config.noPhiMode,
      },
      status: "disabled",
      summary: "Operations Assistant provider is disabled.",
      task: request.task,
    };
  }

  return mockOperationsAssistantProvider.suggest(request, config);
}

export function getOperationsAssistantStatus() {
  const config = getOperationsAssistantConfig();
  const modeLabel = config.enabled ? `${config.provider} mode` : "Disabled / Mock Mode";

  return {
    ...config,
    modeLabel,
    realProviderCallsEnabled: false,
  };
}

export async function getAdminDailyBriefingPreview(input: AdminDailyBriefingInput) {
  return getOperationsAssistantSuggestion({
    input,
    requestedByRole: "admin",
    task: "admin_daily_briefing",
  });
}
