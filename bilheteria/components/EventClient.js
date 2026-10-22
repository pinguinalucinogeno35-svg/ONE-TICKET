'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Brand from './Brand';
import Countdown from './Countdown';
import Icon from './Icon';
import { brl, dateLong, VARIANT_LABEL } from '@/lib/format';

const NOTES = {
  inteira: 'Ingresso individual',
  meia: 'Apresente documento de meia na entrada',
  casadinha: 'Para 2 pessoas · gera 2 QR codes',
};

function calcDiscount(subtotal, coupon) {
  if (!coupon) return 0;
  if (coupon.kind === 'percent') return Math.floor((subtotal * coupon.value) / 100);
  if (coupon.kind === 'fixed') return Math.min(coupon.value, subtotal);
  if (coupon.kind === 'courtesy') return subtotal;
  return 0;
}

export default function EventClient({ initial, accessCode, couponCode = null }) {
  const router = useRouter();
  const [event, setEvent] = useState(initial);
  const [cart, setCart] = useState({});
  const [couponInput, setCouponInput] = useState(couponCode || '');
  const [coupon, setCoupon] = useState(null);
  const [couponMsg, setCouponMsg] = useState('');
  const [sheet, setSheet] = useState(false);
  const [buyer, setBuyer] = useState({ name: '', email: '' });
  const [method, setMethod] = useState('pix');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const idemKey = useRef(null);

  const refresh = useCallback(async () => {
    try {
      const q = accessCode ? `?codigo=${encodeURIComponent(accessCode)}` : '';
      const res = await fetch(`/api/evento/${initial.slug}${q}`, { cache: 'no-store' });
      if (res.ok) setEvent(await res.json());
    } catch {}
  }, [initial.slug, accessCode]);

  useEffect(() => {
    const t = setInterval(refresh, 15000);
    return () => clearInterval(t);
  }, [refresh]);

  // Cupom vindo do link do influenciador (?cupom=CODIGO) já entra aplicado
  useEffect(() => {
    if (couponCode) checkCoupon(couponCode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const principal = useMemo(() => event.batches.filter((b) => b.track === 'principal'), [event]);
  const activeBatches = useMemo(() => event.batches
    .filter((b) => b.status === 'active')
    .sort((a, b) => (a.track === 'principal' ? 1 : 0) - (b.track === 'principal' ? 1 : 0)), [event]); // promo primeiro
  const offers = useMemo(() => {
    const map = {};
    activeBatches.forEach((b) => b.offers.forEach((o) => { map[o.id] = { ...o, batch: b }; }));
    return map;
  }, [activeBatches]);

  // Carrinho fica limpo se uma oferta sumir (lote virou)
  useEffect(() => {
    setCart((c) => {
      const gone = Object.keys(c).filter((id) => !offers[id]);
      if (!gone.length) return c;
      return Object.fromEntries(Object.entries(c).filter(([id]) => offers[id]));
    });
  }, [offers]);

  const lines = Object.entries(cart).filter(([, q]) => q > 0).map(([id, q]) => ({ offer: offers[id], qty: q })).filter((l) => l.offer);
  const seats = lines.reduce((s, l) => s + l.qty * l.offer.seats, 0);
  const halfSeats = lines.filter((l) => l.offer.variant === 'meia').reduce((s, l) => s + l.qty, 0);
  const subtotal = lines.reduce((s, l) => s + l.qty * l.offer.price_cents, 0);
  const discount = calcDiscount(subtotal, coupon);
  const fee = Math.floor(((subtotal - discount) * (event.service_fee_bps || 0)) / 10000);
  const total = subtotal - discount + fee;
  const max = event.max_seats_per_order;

  function seatsInBatch(batchId) {
    return lines.filter((l) => l.offer.batch.id === batchId).reduce((s, l) => s + l.qty * l.offer.seats, 0);
  }

  function canAdd(o) {
    if (seats + o.seats > max) return false;
    if (seats + o.seats > event.available) return false;
    if (seatsInBatch(o.batch.id) + o.seats > o.batch.quantity - o.batch.taken) return false;
    if (o.variant === 'meia' && halfSeats + 1 > event.half_available) return false;
    return true;
  }

  function change(id, delta) {
    setError('');
    setCart((c) => ({ ...c, [id]: Math.max(0, (c[id] || 0) + delta) }));
  }

  async function applyCoupon(e) {
    e.preventDefault();
    if (!couponInput.trim()) return;
    checkCoupon(couponInput);
  }

  async function checkCoupon(code) {
    setCouponMsg('');
    const res = await fetch('/api/cupom', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventId: event.id, code }),
    });
    const data = await res.json();
    if (data.valid) {
      setCoupon(data);
      setCouponMsg(
        data.kind === 'percent' ? `${data.value}% de desconto aplicado` :
        data.kind === 'fixed' ? `${brl(data.value)} de desconto aplicado` : 'Cortesia aplicada'
      );
    } else {
      setCoupon(null);
      setCouponMsg(data.message || 'Cupom inválido');
    }
  }

  function openSheet() {
    idemKey.current = crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random();
    setError('');
    setSheet(true);
  }

  async function reserve(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/reservar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId: event.id,
          items: lines.map((l) => ({ offer_id: l.offer.id, quantity: l.qty })),
          name: buyer.name, email: buyer.email, method,
          coupon: coupon?.code || null, accessCode, idempotencyKey: idemKey.current,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message);
        if (['LOTE_INDISPONIVEL', 'LOTE_ESGOTADO', 'EVENTO_ESGOTADO'].includes(data.error)) refresh();
        setBusy(false);
        return;
      }
      router.push(data.status === 'paid' ? `/ingressos/${data.order_id}` : `/pedido/${data.order_id}?m=${method}`);
    } catch {
      setError('Sem conexão. Tente de novo.');
      setBusy(false);
    }
  }

  const soldOut = event.available <= 0;

  return (
    <main className="shell">
      <Brand right={<span className="chip chip-accent"><span className="dot" />Vendas abertas</span>} />

      <section className="hero">
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <span className="chip chip-accent">{dateLong(event.starts_at)}</span>
          <span className="chip">{event.venue_name}</span>
        </div>
        <h1 className="display hero-title">
          {event.name.split(' ').slice(0, -1).join(' ')}
          <span>{event.name.split(' ').slice(-1)}</span>
        </h1>
        <p className="eyebrow">Realização · Produtora Demo</p>
        <p className="muted small mt-8">Classificação 18+. Ingresso digital com QR code, funciona sem internet.</p>
      </section>

      {soldOut && (
        <div className="card card-accent mt-16" style={{ textAlign: 'center' }}>
          <p className="display" style={{ fontSize: 44 }}>Esgotado</p>
          <p className="muted small mt-8">Todos os ingressos foram vendidos.</p>
        </div>
      )}

      {!soldOut && activeBatches.map((b) => {
        const pct = Math.min(100, Math.round((b.taken / Math.max(1, b.quantity)) * 100));
        const hot = pct >= 85;
        const left = b.quantity - b.taken;
        const isPromo = b.track !== 'principal';
        return (
          <section key={b.id} className={`card mt-16 ${isPromo ? 'card-accent' : ''}`}>
            <div className="lot-head">
              <div>
                <p className="eyebrow">{isPromo ? 'Liberado pelo seu link' : 'À venda agora'}</p>
                <p className="lot-name mt-8">{b.name}</p>
              </div>
              <span className="chip">{pct}% vendido</span>
            </div>
            <div className={`progress ${hot ? 'hot' : ''}`}><i style={{ width: `${pct}%` }} /></div>
            {hot && <span className="alert-hot">Últimos ingressos · restam {left}</span>}
            {b.ends_at && (
              <>
                <p className="eyebrow mt-16">{isPromo ? 'Promoção acaba em' : 'Virada de lote em'}</p>
                <Countdown to={b.ends_at} onEnd={refresh} />
              </>
            )}
            <div className="mt-16">
              {b.offers.map((o) => {
                const q = cart[o.id] || 0;
                const full = o.price_cents;
                const pairSaving = o.variant === 'casadinha'
                  ? (b.offers.find((x) => x.variant === 'inteira')?.price_cents || 0) * 2 - o.price_cents : 0;
                return (
                  <div key={o.id} className="offer">
                    <div className="offer-info">
                      <p className="offer-name">
                        {VARIANT_LABEL[o.variant]}
                        {o.variant === 'casadinha' && pairSaving > 0 && <span className="badge">-{brl(pairSaving)}</span>}
                      </p>
                      <p className="offer-price">{brl(full)}</p>
                      <p className="offer-note">{NOTES[o.variant]}</p>
                    </div>
                    <div className="stepper">
                      <button type="button" aria-label="Remover" disabled={q === 0} onClick={() => change(o.id, -1)}><Icon name="minus" size={18} /></button>
                      <output>{q}</output>
                      <button type="button" className="plus" aria-label="Adicionar" disabled={!canAdd({ ...o, batch: b })} onClick={() => change(o.id, 1)}><Icon name="plus" size={18} /></button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}

      {principal.length > 1 && (
        <>
          <h2 className="section-title">Lotes</h2>
          <div className="lots">
            {principal.map((b) => {
              const inteira = b.offers.find((o) => o.variant === 'inteira');
              const cls = b.status === 'active' ? 'on' : b.status === 'scheduled' ? '' : 'off';
              const label = b.status === 'active' ? 'à venda' : b.status === 'scheduled' ? 'em breve' : 'encerrado';
              return (
                <div key={b.id} className={`lot-pill ${cls}`}>
                  <small>{b.position}º lote</small>
                  <b>{inteira ? brl(inteira.price_cents).replace(',00', '') : '-'}</b>
                  <small>{label}</small>
                </div>
              );
            })}
          </div>
        </>
      )}

      {!soldOut && (
        <>
          <h2 className="section-title">Cupom</h2>
          <form className="input-row" onSubmit={applyCoupon}>
            <input className="input" placeholder="Código do cupom" value={couponInput}
                   onChange={(e) => setCouponInput(e.target.value.toUpperCase())} autoCapitalize="characters" />
            <button className="btn btn-ghost" type="submit">Aplicar</button>
          </form>
          {couponMsg && <p className={`mt-8 ${coupon ? 'ok' : 'error'}`}>{couponMsg}</p>}
          <p className="tiny muted mt-8">Máximo de {max} pessoas por compra. Casadinha conta como 2.</p>
        </>
      )}

      <p className="footer-note">ONE Ticket · demonstração · preços fictícios</p>

      {!soldOut && (
        <div className="buybar">
          <div className="buybar-inner">
            <div className="buybar-total">
              <span className="tiny muted">{seats ? `${seats} ${seats === 1 ? 'pessoa' : 'pessoas'}` : 'Escolha seus ingressos'}</span>
              <b>{discount > 0 && <s>{brl(subtotal)}</s>}{brl(total)}</b>
            </div>
            <button className="btn btn-accent" disabled={seats === 0} onClick={openSheet}>Comprar</button>
          </div>
        </div>
      )}

      {sheet && (
        <>
          <div className="sheet-backdrop" onClick={() => !busy && setSheet(false)} />
          <form className="sheet" onSubmit={reserve}>
            <div className="sheet-handle" />
            <p className="display" style={{ fontSize: 30 }}>Seus dados</p>
            <p className="muted small mt-8">Os ingressos ficam reservados por {event.reservation_minutes} minutos enquanto você paga.</p>
            <div className="stack mt-16">
              <div className="field">
                <label htmlFor="nome">Nome completo</label>
                <input id="nome" className="input" required minLength={3} autoComplete="name"
                       value={buyer.name} onChange={(e) => setBuyer({ ...buyer, name: e.target.value })} />
              </div>
              <div className="field">
                <label htmlFor="email">E-mail</label>
                <input id="email" type="email" className="input" required autoComplete="email" inputMode="email"
                       value={buyer.email} onChange={(e) => setBuyer({ ...buyer, email: e.target.value })} />
              </div>
              {total > 0 && (
                <div className="segmented" role="tablist" aria-label="Forma de pagamento">
                  <button type="button" className={method === 'pix' ? 'on' : ''} onClick={() => setMethod('pix')}>Pix</button>
                  <button type="button" className={method === 'card' ? 'on' : ''} onClick={() => setMethod('card')}>Cartão</button>
                </div>
              )}
              <div>
                {lines.map((l) => (
                  <div key={l.offer.id} className="summary-line">
                    <span>{l.qty}× {VARIANT_LABEL[l.offer.variant]} · {l.offer.batch.name}</span>
                    <span>{brl(l.qty * l.offer.price_cents)}</span>
                  </div>
                ))}
                {discount > 0 && (
                  <div className="summary-line accent"><span>Cupom {coupon.code}</span><span>−{brl(discount)}</span></div>
                )}
                {fee > 0 && <div className="summary-line"><span>Taxa de serviço</span><span>{brl(fee)}</span></div>}
                <div className="summary-line total"><span>Total</span><span>{brl(total)}</span></div>
              </div>
              {error && <p className="error">{error}</p>}
              <button className="btn btn-accent btn-block" disabled={busy}>
                {busy ? 'Reservando…' : total === 0 ? 'Emitir cortesia' : 'Reservar e pagar'}
              </button>
            </div>
          </form>
        </>
      )}
    </main>
  );
}
