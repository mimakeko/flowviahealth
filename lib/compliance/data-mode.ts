export const FLOWVIA_DATA_MODES = {
  FAKE_DATA_ONLY: "fake",
  PERSONAL_TEST_ONLY: "personal_test",
  PHI_BLOCKED: "phi_blocked",
  PHI_ALLOWED: "phi_allowed",
} as const;

export type FlowviaDataMode = (typeof FLOWVIA_DATA_MODES)[keyof typeof FLOWVIA_DATA_MODES];

export type FlowviaDataModeStatus = {
  blockers: string[];
  envValue: string;
  isPhiAllowed: boolean;
  isProductionLike: boolean;
  mode: FlowviaDataMode;
  noPhiRequired: boolean;
  safeLabel: string;
  warningLabel: string;
};

const allowedActiveModes = new Set<string>([
  FLOWVIA_DATA_MODES.FAKE_DATA_ONLY,
  FLOWVIA_DATA_MODES.PERSONAL_TEST_ONLY,
  FLOWVIA_DATA_MODES.PHI_BLOCKED,
]);

function currentEnvValue() {
  return (process.env.FLOWVIA_DATA_MODE || FLOWVIA_DATA_MODES.PHI_BLOCKED).trim().toLowerCase();
}

function isProductionLikeRuntime() {
  return process.env.NODE_ENV === "production" || ["production", "preview"].includes((process.env.VERCEL_ENV || "").toLowerCase());
}

function labelForMode(mode: FlowviaDataMode) {
  if (mode === FLOWVIA_DATA_MODES.FAKE_DATA_ONLY) return "fake data only";
  if (mode === FLOWVIA_DATA_MODES.PERSONAL_TEST_ONLY) return "personal-number testing only";
  if (mode === FLOWVIA_DATA_MODES.PHI_ALLOWED) return "PHI allowed";
  return "PHI blocked";
}

export function getFlowviaDataModeStatus(): FlowviaDataModeStatus {
  const envValue = currentEnvValue();
  const isProductionLike = isProductionLikeRuntime();
  const mode = (allowedActiveModes.has(envValue) ? envValue : FLOWVIA_DATA_MODES.PHI_BLOCKED) as FlowviaDataMode;
  const blockers: string[] = [];

  if (envValue === FLOWVIA_DATA_MODES.PHI_ALLOWED) {
    blockers.push("PHI_ALLOWED is a future mode and is not enabled for this pilot.");
    blockers.push("Vendor BAAs, stronger auth, backup/restore, retention/deletion, incident response, and audit review controls must be cleared first.");
  } else if (!allowedActiveModes.has(envValue)) {
    blockers.push(`FLOWVIA_DATA_MODE=${envValue || "unset"} is not supported; failing closed to phi_blocked.`);
  }

  if (isProductionLike && mode !== FLOWVIA_DATA_MODES.PHI_BLOCKED) {
    blockers.push("Production-like environments must keep FLOWVIA_DATA_MODE=phi_blocked until PHI controls are approved.");
  }

  return {
    blockers,
    envValue,
    isPhiAllowed: false,
    isProductionLike,
    mode,
    noPhiRequired: true,
    safeLabel: labelForMode(mode),
    warningLabel: "Pilot mode: fake data / personal-number testing only / no PHI",
  };
}

export function assertPhiUseBlocked() {
  const status = getFlowviaDataModeStatus();
  if (status.blockers.length > 0) {
    throw new Error(`Flowvia data mode is blocked: ${status.blockers.join(" ")}`);
  }
  return status;
}
