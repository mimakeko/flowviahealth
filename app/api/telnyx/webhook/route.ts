import { NextResponse } from "next/server";
import { verifyTelnyxWebhookSignature } from "@/lib/sms/telnyx";
import { handleTelnyxWebhookEnvelope, type TelnyxWebhookEnvelope } from "@/lib/sms/webhook";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const rawBody = await request.text();

  if (!verifyTelnyxWebhookSignature(rawBody, request.headers)) {
    return NextResponse.json({ error: "Invalid Telnyx webhook signature." }, { status: 401 });
  }

  let envelope: TelnyxWebhookEnvelope;
  try {
    envelope = JSON.parse(rawBody) as TelnyxWebhookEnvelope;
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const result = await handleTelnyxWebhookEnvelope(envelope);
  return NextResponse.json(result);
}
