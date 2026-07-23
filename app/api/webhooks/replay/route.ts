import { NextResponse } from "next/server";
import Stripe from "stripe";
import { isAuthorizedRequest } from "@/lib/adminAuth";
import { appendWebhookEvent, getNextAttemptForEvent } from "@/lib/webhookEvents";
import { processStripeEvent } from "@/lib/stripeWebhookProcessor";

export async function POST(request: Request) {
  if (!isAuthorizedRequest(request)) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecretKey) {
    return NextResponse.json(
      { message: "Stripe secret key missing." },
      { status: 500 },
    );
  }

  const body = (await request.json()) as { eventId?: string };
  if (!body.eventId) {
    return NextResponse.json({ message: "eventId is required." }, { status: 400 });
  }

  const stripe = new Stripe(stripeSecretKey);
  const event = await stripe.events.retrieve(body.eventId);
  const attempt = await getNextAttemptForEvent(event.id);

  try {
    const result = await processStripeEvent(stripe, event);

    await appendWebhookEvent({
      id: `${event.id}-${attempt}`,
      eventId: event.id,
      eventType: event.type,
      status: result.status,
      message: `Replay succeeded: ${result.message}`,
      receivedAt: new Date().toISOString(),
      processedAt: new Date().toISOString(),
      attempt,
      isReplay: true,
      sessionId: result.sessionId,
      customerEmail: result.customerEmail,
    });

    return NextResponse.json(
      {
        message: "Replay processed.",
      },
      { status: 200 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Replay failed";

    await appendWebhookEvent({
      id: `${event.id}-${attempt}`,
      eventId: event.id,
      eventType: event.type,
      status: "failed",
      message: `Replay failed: ${message}`,
      receivedAt: new Date().toISOString(),
      processedAt: new Date().toISOString(),
      attempt,
      isReplay: true,
    });

    return NextResponse.json({ message }, { status: 500 });
  }
}
