import { notFound } from "next/navigation";
import type { PilotRole } from "./session";

export type FlowviaPilotRole = PilotRole;

export type FlowviaPilotPrincipal = {
  actorId?: string;
  authStatus: "signed_cookie_session";
  role: FlowviaPilotRole;
};

export type FlowviaAccessState = {
  description: string;
  enabled: boolean;
  envVar: "FLOWVIA_PILOT_OPERATIONS_ENABLED" | "FLOWVIA_ADMIN_MESSAGES_ENABLED";
  label: string;
};

function isEnabledByEnv(envVar: FlowviaAccessState["envVar"]) {
  return process.env.NODE_ENV !== "production" || process.env[envVar] === "true";
}

export function getPilotPrincipal(role: FlowviaPilotRole, actorId?: string): FlowviaPilotPrincipal {
  return {
    actorId,
    authStatus: "signed_cookie_session",
    role,
  };
}

export function getPilotOperationsAccessState(): FlowviaAccessState {
  const envVar = "FLOWVIA_PILOT_OPERATIONS_ENABLED";
  return {
    description: "Pilot referral, visit, and therapist worklist operations require the pilot operations environment gate.",
    enabled: isEnabledByEnv(envVar),
    envVar,
    label: "Pilot operations",
  };
}

export function getAdminMessagesAccessState(): FlowviaAccessState {
  const envVar = "FLOWVIA_ADMIN_MESSAGES_ENABLED";
  return {
    description: "The internal SMS message ledger requires the admin messages environment gate.",
    enabled: isEnabledByEnv(envVar),
    envVar,
    label: "Message ledger",
  };
}

export function requirePilotOperationsAccess() {
  if (!getPilotOperationsAccessState().enabled) {
    notFound();
  }
}

export function requireAdminMessagesAccess() {
  if (!getAdminMessagesAccessState().enabled) {
    notFound();
  }
}
