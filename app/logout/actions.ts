"use server";

import { redirect } from "next/navigation";
import { clearPilotSessionCookie, getCurrentPilotSession, writePilotAuthAudit } from "@/lib/pilot/auth";

export async function logoutAction() {
  const session = await getCurrentPilotSession();

  await clearPilotSessionCookie();

  if (session) {
    await writePilotAuthAudit({
      action: "pilot_logout",
      email: session.email,
      role: session.role,
      success: true,
    });
  }

  redirect("/login?logged_out=1");
}
