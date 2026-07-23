import { NextResponse } from "next/server";
import { isAuthorizedRequest } from "@/lib/adminAuth";
import { getRecentWebhookEvents } from "@/lib/webhookEvents";

export async function GET(request: Request) {
  if (!isAuthorizedRequest(request)) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const events = await getRecentWebhookEvents(300);
  return NextResponse.json({ events }, { status: 200 });
}
