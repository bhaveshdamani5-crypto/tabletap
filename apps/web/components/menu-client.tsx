'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { placeOrder, verifyPayment } from '@/app/actions/guest';
import type { MenuItem, TableContext } from '@/lib/menu/types';
import { formatRupees } from '@/lib/money';
import { computeTotals, unitPrice, PricingError } from '@/lib/orders/pricing';

declare global { interface Window { Razorpay: new (o: Record<string, unknown>) => { open(): void } } }
function loadCheckout() {
  return new Promise<void>((resolve, reject) => {
    if (window.Razorpay) return resolve();
    const s = document.createElement('script'); s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload = () => resolve(); s.onerror = () => reject(new Error('load')); document.body.appendChild(s);
  });
}

function newIdempotencyKey() {
  if (typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
  const bytes = window.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

type Line = { key: string; item: MenuItem; variantId: string | null; optionIds: string[]; label: string; unitPaise: number; qty: number };

const serif = { fontFamily: 'Georgia, "Iowan Old Style", "Times New Roman", serif' };

function VegMark({ veg }: { veg: boolean | null }) {
  if (veg === null) return null;
  const c = veg ? '#3fa35b' : '#d9534f';
  return <span aria-label={veg ? 'Vegetarian' : 'Non-vegetarian'} className="mt-1 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-[3px] border-2" style={{ borderColor: c }}><span className="h-2 w-2 rounded-full" style={{ background: c }} /></span>;
}

export function MenuClient({ ctx, token }: { ctx: TableContext; token: string }) {
  const router = useRouter();
  const [placing, setPlacing] = useState(false);
  const [err, setErr] = useState('');
  const { restaurant: r, table, categories } = ctx;
  const [cart, setCart] = useState<Line[]>([]);
  const [picking, setPicking] = useState<MenuItem | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [query, setQuery] = useState('');
  const accent = r.brandColor;

  const totals = useMemo(() => computeTotals(cart, r.taxRateBps, r.pricesIncludeTax), [cart, r.taxRateBps, r.pricesIncludeTax]);
  const count = cart.reduce((n, l) => n + l.qty, 0);
  const shown = useMemo(() => {
    const t = query.trim().toLowerCase();
    return categories.map((c) => ({ ...c, items: t ? c.items.filter((i) => i.name.toLowerCase().includes(t)) : c.items })).filter((c) => c.items.length);
  }, [categories, query]);

  function add(item: MenuItem, variantId: string | null, optionIds: string[]) {
    const unit = unitPrice(item, { variantId, optionIds });
    const names = [item.variants.find((v) => v.id === variantId)?.name, ...item.groups.flatMap((g) => g.options.filter((o) => optionIds.includes(o.id)).map((o) => o.name))].filter(Boolean);
    const key = [item.id, variantId, ...[...optionIds].sort()].join('|');
    setCart((c) => c.some((l) => l.key === key) ? c.map((l) => l.key === key ? { ...l, qty: l.qty + 1 } : l)
      : [...c, { key, item, variantId, optionIds, label: names.join(', '), unitPaise: unit, qty: 1 }]);
  }
  async function pay() {
    setPlacing(true); setErr('');
    let idempotencyKey: string;
    try { idempotencyKey = newIdempotencyKey(); }
    catch {
      setErr('Could not securely prepare your order. Please try a current browser or use HTTPS.');
      setPlacing(false);
      return;
    }
    const res = await placeOrder({ slug: r.slug, token, idempotencyKey,
      lines: cart.map((l) => ({ itemId: l.item.id, variantId: l.variantId, optionIds: l.optionIds, qty: l.qty })) });
    if (!res.ok) { setErr(res.error); setPlacing(false); return; }
    const go = () => router.push(`/order/${res.orderId}?t=${res.accessToken}`);
    if (!res.checkout) { go(); return; }
    try {
      await loadCheckout();
      const c = res.checkout;
      new window.Razorpay({ key: c.keyId, amount: c.amountPaise, currency: 'INR', name: r.name, order_id: c.orderId, theme: { color: accent },
        handler: async (p: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
          await verifyPayment({ orderId: res.orderId, accessToken: res.accessToken, ...p });
          go();   // if verification missed, the status page still flips to paid when the webhook arrives
        },
        modal: { ondismiss: () => setPlacing(false) } }).open();
    } catch { setErr('Could not open the payment window. Please try again.'); setPlacing(false); }
  }
  const bump = (key: string, d: number) => setCart((c) => c.map((l) => l.key === key ? { ...l, qty: l.qty + d } : l).filter((l) => l.qty > 0));
  const needsChoice = (i: MenuItem) => i.variants.length > 0 || i.groups.length > 0;

  return (
    <div className="min-h-screen bg-[#26262a] pb-28 text-[#f1ece2]" style={{ ['--accent' as string]: accent }}>
      <header className="px-5 pb-3 pt-8">
        <h1 className="text-3xl leading-tight" style={{ ...serif, color: accent }}>{r.name}</h1>
        <p className="mt-1 text-sm text-[#b9b2a3]">Table {table.label}. Order here and the kitchen gets it as soon as you pay.</p>
        {!r.acceptingOrders && <p className="mt-3 rounded bg-[#4a2f2f] p-3 text-sm">We’re not taking QR orders right now. Please ask a member of staff.</p>}
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search the menu" aria-label="Search the menu"
          className="mt-4 w-full rounded-lg border border-[#44444b] bg-[#303036] px-4 py-3 text-base outline-none focus:border-[color:var(--accent)]" />
      </header>

      <nav aria-label="Menu sections" className="sticky top-0 z-10 flex gap-2 overflow-x-auto bg-[#26262a]/95 px-5 py-3 backdrop-blur">
        {shown.map((c) => <a key={c.id} href={`#c-${c.id}`} className="shrink-0 rounded-full border border-[#44444b] px-4 py-2 text-sm hover:border-[color:var(--accent)]">{c.name}</a>)}
      </nav>

      <main className="px-5">
        {shown.length === 0 && <p className="py-12 text-center text-[#b9b2a3]">Nothing matches “{query}”. Try a different word.</p>}
        {shown.map((c) => (
          <section key={c.id} id={`c-${c.id}`} className="scroll-mt-16 pt-8">
            <h2 className="text-2xl" style={serif}>{c.name}</h2>
            {c.tagline && <p className="text-sm italic text-[#b9b2a3]">{c.tagline}</p>}
            <ul className="mt-2 divide-y divide-[#3a3a41]">
              {c.items.map((i) => (
                <li key={i.id} className={`flex items-start gap-3 py-4 ${i.isAvailable ? '' : 'opacity-45'}`}>
                  <VegMark veg={i.isVeg} />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{i.name}</p>
                    {i.description && <p className="mt-0.5 text-sm text-[#b9b2a3]">{i.description}</p>}
                    <p className="mt-1 text-sm text-[#b9b2a3]">
                      {i.variants.some((v) => v.deltaPaise > 0) ? `From ${formatRupees(i.basePricePaise)}` : formatRupees(i.basePricePaise)}
                      {i.calories ? ` · ${i.calories} kcal` : ''}
                    </p>
                  </div>
                  <button disabled={!i.isAvailable || !r.acceptingOrders}
                    onClick={() => (needsChoice(i) ? setPicking(i) : add(i, null, []))}
                    className="min-h-11 min-w-20 rounded-lg border px-4 text-sm font-medium disabled:cursor-not-allowed"
                    style={{ borderColor: accent, color: accent }}>
                    {i.isAvailable ? 'Add' : 'Sold out'}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </main>

      {count > 0 && !cartOpen && (
        <button onClick={() => setCartOpen(true)} className="fixed inset-x-4 bottom-4 z-20 flex min-h-14 items-center justify-between rounded-xl px-5 font-semibold text-[#26262a]"
          style={{ background: accent, marginBottom: 'env(safe-area-inset-bottom)' }}>
          <span>{count} {count === 1 ? 'item' : 'items'}</span><span>View order · {formatRupees(totals.totalPaise)}</span>
        </button>
      )}

      {picking && <Chooser item={picking} accent={accent} onClose={() => setPicking(null)} onAdd={(v, o) => { add(picking, v, o); setPicking(null); }} />}

      {cartOpen && (
        <div className="fixed inset-0 z-30 flex items-end bg-black/60" onClick={() => setCartOpen(false)}>
          <div role="dialog" aria-label="Your order" className="max-h-[85vh] w-full overflow-y-auto rounded-t-2xl bg-[#303036] p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between"><h2 className="text-xl" style={serif}>Your order · Table {table.label}</h2>
              <button onClick={() => setCartOpen(false)} className="min-h-11 px-2 text-sm text-[#b9b2a3]">Close</button></div>
            {cart.length === 0 && <p className="py-8 text-center text-[#b9b2a3]">Your order is empty. Add something from the menu.</p>}
            <ul className="divide-y divide-[#44444b]">
              {cart.map((l) => (
                <li key={l.key} className="flex items-center gap-3 py-3">
                  <div className="min-w-0 flex-1"><p>{l.item.name}</p>{l.label && <p className="text-sm text-[#b9b2a3]">{l.label}</p>}
                    <p className="text-sm text-[#b9b2a3]">{formatRupees(l.unitPaise)} each</p></div>
                  <div className="flex items-center gap-1">
                    <button aria-label={`Remove one ${l.item.name}`} onClick={() => bump(l.key, -1)} className="h-11 w-11 rounded-lg border border-[#55555d] text-lg">−</button>
                    <span className="w-6 text-center">{l.qty}</span>
                    <button aria-label={`Add one ${l.item.name}`} onClick={() => bump(l.key, 1)} className="h-11 w-11 rounded-lg border border-[#55555d] text-lg">+</button>
                  </div>
                </li>
              ))}
            </ul>
            {cart.length > 0 && (
              <div className="mt-4 space-y-1 text-sm text-[#b9b2a3]">
                <div className="flex justify-between"><span>Subtotal</span><span>{formatRupees(totals.subtotalPaise)}</span></div>
                <div className="flex justify-between"><span>{r.pricesIncludeTax ? 'Includes tax' : 'Tax'}</span><span>{formatRupees(totals.taxPaise)}</span></div>
                <div className="flex justify-between pt-2 text-lg font-semibold text-[#f1ece2]"><span>Total</span><span>{formatRupees(totals.totalPaise)}</span></div>
                <button disabled={placing} onClick={pay} className="mt-4 min-h-14 w-full rounded-xl font-semibold text-[#26262a] disabled:opacity-60" style={{ background: accent }}>
                  {placing ? 'Placing your order…' : `${process.env.NEXT_PUBLIC_DEV_SIMULATE_PAYMENT === 'true' ? 'Place test order' : 'Pay'} ${formatRupees(totals.totalPaise)}`}</button>
                {err && <p role="alert" className="pt-2 text-center text-sm text-red-300">{err}</p>}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Chooser({ item, accent, onClose, onAdd }: { item: MenuItem; accent: string; onClose: () => void; onAdd: (v: string | null, o: string[]) => void }) {
  const [variantId, setVariantId] = useState<string | null>(item.variants.length === 1 ? item.variants[0].id : null);
  const [opts, setOpts] = useState<string[]>(() => item.groups.flatMap((g) => (g.min >= 1 && g.options.length === 1 ? [g.options[0].id] : [])));
  let price: number | null = null; let problem = '';
  try { price = unitPrice(item, { variantId, optionIds: opts }); } catch (e) { problem = e instanceof PricingError ? e.message : 'Invalid choice'; }

  const toggle = (gId: string, oId: string, max: number) => setOpts((cur) => {
    const g = item.groups.find((x) => x.id === gId)!; const inGroup = g.options.map((o) => o.id);
    if (cur.includes(oId)) return cur.filter((x) => x !== oId);
    const same = cur.filter((x) => inGroup.includes(x));
    return max === 1 ? [...cur.filter((x) => !inGroup.includes(x)), oId] : same.length < max ? [...cur, oId] : cur;
  });
  const chip = (on: boolean) => `min-h-11 rounded-lg border px-4 text-sm ${on ? 'font-semibold text-[#26262a]' : 'border-[#55555d]'}`;

  return (
    <div className="fixed inset-0 z-30 flex items-end bg-black/60" onClick={onClose}>
      <div role="dialog" aria-label={item.name} className="max-h-[85vh] w-full overflow-y-auto rounded-t-2xl bg-[#303036] p-5" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-xl" style={serif}>{item.name}</h2>
        {item.variants.length > 0 && (<fieldset className="mt-4"><legend className="mb-2 text-sm text-[#b9b2a3]">Choose one</legend>
          <div className="flex flex-wrap gap-2">{item.variants.map((v) => (
            <button key={v.id} onClick={() => setVariantId(v.id)} className={chip(variantId === v.id)} style={variantId === v.id ? { background: accent, borderColor: accent } : undefined}>
              {v.name}{v.deltaPaise ? ` +${formatRupees(v.deltaPaise)}` : ''}</button>))}</div></fieldset>)}
        {item.groups.map((g) => (<fieldset key={g.id} className="mt-4"><legend className="mb-2 text-sm text-[#b9b2a3]">{g.name}{g.min >= 1 ? ' (required)' : ''}</legend>
          <div className="flex flex-wrap gap-2">{g.options.map((o) => { const on = opts.includes(o.id); return (
            <button key={o.id} onClick={() => toggle(g.id, o.id, g.max)} className={chip(on)} style={on ? { background: accent, borderColor: accent } : undefined}>
              {o.name}{o.deltaPaise ? ` +${formatRupees(o.deltaPaise)}` : ''}</button>); })}</div></fieldset>))}
        <button disabled={price === null} onClick={() => onAdd(variantId, opts)} className="mt-6 min-h-14 w-full rounded-xl font-semibold text-[#26262a] disabled:opacity-50" style={{ background: accent }}>
          {price === null ? problem : `Add to order · ${formatRupees(price)}`}</button>
      </div>
    </div>
  );
}
