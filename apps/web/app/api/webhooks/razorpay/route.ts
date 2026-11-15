import { connection, NextResponse, type NextRequest } from 'next/server';
import { verifyWebhookSignature } from '@/lib/payments/signatures';
import { confirmPayment } from '@/lib/payments/confirm';
import { createAdminClient } from '@/lib/supabase/admin';

/** Razorpay -> us. The signed webhook is the source of truth for payment status. */
export async function POST(req: NextRequest) {
  await connection();
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: 'not configured' }, { status: 500 });
  const raw = await req.text();                                   // raw body: required for the signature check
  if (!verifyWebhookSignature(raw, req.headers.get('x-razorpay-signature') ?? '', secret)) return NextResponse.json({ error: 'bad signature' }, { status: 401 });
  const eventId = req.headers.get('x-razorpay-event-id');
  if (!eventId) return NextResponse.json({ error: 'missing event id' }, { status: 400 });
  let evt: { event?: string; payload?: { payment?: { entity?: { id: string; order_id: string; amount: number; method?: string } } } };
  try { evt = JSON.parse(raw); } catch { return NextResponse.json({ error: 'bad json' }, { status: 400 }); }

  const db = createAdminClient();
  const { data: prev } = await db.from('webhook_events').select('id,processed_at').eq('provider', 'razorpay').eq('provider_event_id', eventId).maybeSingle();
  if (prev?.processed_at) return NextResponse.json({ ok: true, duplicate: true });
  const rowId = prev?.id ?? (await db.from('webhook_events').insert({ provider: 'razorpay', provider_event_id: eventId, payload: evt }).select('id').single()).data?.id;

  try {
    const pay = evt.payload?.payment?.entity;
    if ((evt.event === 'payment.captured' || evt.event === 'order.paid') && pay) {
      const r = await confirmPayment(db, { providerOrderId: pay.order_id, providerPaymentId: pay.id, amountPaise: pay.amount, method: pay.method, raw: pay });
      if (!r.ok) throw new Error(r.error);
    } else if (evt.event === 'payment.failed' && pay) {
      await db.from('payments').update({ status: 'failed' }).eq('provider', 'razorpay').eq('provider_order_id', pay.order_id).neq('status', 'captured');
    }
    await db.from('webhook_events').update({ processed_at: new Date().toISOString() }).eq('id', rowId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    await db.from('webhook_events').update({ error: (e as Error).message }).eq('id', rowId);
    return NextResponse.json({ error: 'processing failed' }, { status: 500 });   // Razorpay retries with backoff
  }
}
