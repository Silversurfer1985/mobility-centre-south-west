import { NextResponse } from "next/server";
import Stripe from "stripe";
import { appendWebhookEvent, getNextAttemptForEvent } from "@/lib/webhookEvents";
import { processStripeEvent } from "@/lib/stripeWebhookProcessor";

export async function POST(request: Request) {
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!stripeSecretKey || !webhookSecret) {
    return NextResponse.json(
      { message: "Webhook not configured." },
      { status: 500 },
    );
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json(
      { message: "Missing stripe-signature header." },
      { status: 400 },
    );
  }

  const stripe = new Stripe(stripeSecretKey);
  const payload = await request.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid signature";
    return NextResponse.json({ message }, { status: 400 });
  }

  const attempt = await getNextAttemptForEvent(event.id);

  try {
    const result = await processStripeEvent(stripe, event);
    await appendWebhookEvent({
      id: `${event.id}-${attempt}`,
      eventId: event.id,
      eventType: event.type,
      status: result.status,
      message: result.message,
      receivedAt: new Date().toISOString(),
      processedAt: new Date().toISOString(),
      attempt,
      isReplay: false,
      sessionId: result.sessionId,
      customerEmail: result.customerEmail,
    });

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Webhook processing failed";

    await appendWebhookEvent({
      id: `${event.id}-${attempt}`,
      eventId: event.id,
      eventType: event.type,
      status: "failed",
      message,
      receivedAt: new Date().toISOString(),
      processedAt: new Date().toISOString(),
      attempt,
      isReplay: false,
    });

    return NextResponse.json({ message }, { status: 500 });
  }
}
