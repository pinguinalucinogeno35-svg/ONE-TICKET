'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import QRCode from 'qrcode';
import Brand from './Brand';
import { brl, VARIANT_LABEL } from '@/lib/format';

const pad = (n) => String(n).padStart(2, '0');

export default function CheckoutClient({ order: initial, mode, mpPublicKey, initialMethod }) {
  const router = useRouter();
  const [order, setOrder] = useState(initial);
  const [method, setMethod] = useState(initialMethod);
  const [left, setLeft] = useState(null);
  const [pix, setPix] = useState(null); // { qr_code, image }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const offset = useRef(new Date(initial.now).getTime() - Date.now());

  const done = order.status !== 'pending';

  // Cronômetro da reserva
  useEffect(() => {
    const tick = () => setLeft(Math.max(0, new Date(order.expires_at).getTime() - (Date.now() + offset.current)));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [order.expires_at]);

  // Consulta o status a cada 3 segundos (o webhook confirma no servidor)
  const poll = useCallback(async () => {
    try {
      const res = await fetch(`/api/pedido/${order.id}/status`, { cache: 'no-store' });
      if (!res.ok) return;
      const s = await res.json();
      if (s.status === 'paid') router.replace(`/ingressos/${order.id}`);
      else if (s.status !== order.status) setOrder((o) => ({ ...o, status: s.status }));
    } catch {}
  }, [order.id, order.status, router]);

  useEffect(() => {
    if (done) return;
    const t = setInterval(poll, 3000);
    return () => clearInterval(t);
  }, [poll, done]);

  useEffect(() => { if (left === 0 && !done) poll(); }, [left, done, poll]);

  // Pix: no modo simulado gera um QR de demonstração; no Mercado Pago pede a cobrança real
  useEffect(() => {
    if (method !== 'pix' || done || pix) return;
    let cancel = false;
    (async () => {
      try {
        if (mode === 'mercadopago') {
          const res = await fetch(`/api/pedido/${order.id}/pix`, { method: 'POST' });
          const data = await res.json();
          if (!res.ok) throw new Error(data.message);
          if (!cancel) setPix({ qr_code: data.qr_code, image: `data:image/png;base64,${data.qr_code_base64}` });
        } else {
          const code = `00020126DEMO-PIX-${order.id.slice(0, 8).toUpperCase()}-${order.total_cents}5204000053039865802BR6304DEMO`;
          const image = await QRCode.toDataURL(code, { margin: 1, width: 520 });
          if (!cancel) setPix({ qr_code: code, image });
        }
      } catch (e) {
        if (!cancel) setError(e.message || 'Não foi possível gerar o Pix.');
      }
    })();
    return () => { cancel = true; };
  }, [method, done, pix, mode, order.id, order.total_cents]);

  async function simulate(outcome) {
    setBusy(true);
    setError('');
    const res = await fetch(`/api/pedido/${order.id}/simular`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ outcome, method }),
    });
    const data = await res.json();
    if (data.status === 'paid') return router.replace(`/ingressos/${order.id}`);
    setOrder((o) => ({ ...o, status: data.status || o.status }));
    if (!res.ok) setError(data.message);
    setBusy(false);
  }

  async function cancel() {
    if (!confirm('Desistir da compra e liberar os ingressos?')) return;
    setBusy(true);
    const res = await fetch(`/api/pedido/${order.id}/cancelar`, { method: 'POST' });
    const data = await res.json();
    setOrder((o) => ({ ...o, status: data.status || 'canceled' }));
    setBusy(false);
  }

  const mm = left == null ? '--' : pad(Math.floor(left / 60000));
  const ss = left == null ? '--' : pad(Math.floor((left % 60000) / 1000));

  if (done) {
    const msg = {
      expired: ['Reserva expirada', 'O tempo para pagar acabou e os ingressos voltaram para a venda.'],
      canceled: ['Compra cancelada', 'Os ingressos voltaram para a venda.'],
      needs_refund: ['Pagamento em análise', 'Seu pagamento chegou depois que os ingressos esgotaram. O valor será devolvido.'],
    }[order.status] || ['Pedido encerrado', ''];
    return (
      <main className="shell">
        <Brand href={`/e/${order.event.slug}`} />
        <div className="card mt-16" style={{ textAlign: 'center' }}>
          <p className="display" style={{ fontSize: 40 }}>{msg[0]}</p>
          <p className="muted mt-8">{msg[1]}</p>
          <Link className="btn btn-accent btn-block mt-24" href={`/e/${order.event.slug}`}>Voltar ao evento</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="shell">
      <Brand href={`/e/${order.event.slug}`} right={<span className="chip">Pedido #{order.id.slice(0, 6).toUpperCase()}</span>} />

      <section className="card" style={{ textAlign: 'center' }}>
        <p className="eyebrow">Seus ingressos estão reservados por</p>
        <p className={`timer mt-8 ${left != null && left < 120000 ? 'low' : ''}`}>{mm}:{ss}</p>
        <p className="muted small mt-8">Pague antes do tempo acabar. Depois disso, as vagas voltam para a venda.</p>
      </section>

      <section className="card mt-16">
        <p className="eyebrow">{order.event.name}</p>
        <div className="mt-8">
          {order.items.map((it, i) => (
            <div key={i} className="summary-line">
              <span>{it.quantity}× {VARIANT_LABEL[it.variant]} · {it.batch_name}</span>
              <span>{brl(it.quantity * it.unit_price_cents)}</span>
            </div>
          ))}
          {order.discount_cents > 0 && (
            <div className="summary-line accent"><span>Cupom {order.coupon_code}</span><span>−{brl(order.discount_cents)}</span></div>
          )}
          {order.fee_cents > 0 && <div className="summary-line"><span>Taxa de serviço</span><span>{brl(order.fee_cents)}</span></div>}
          <div className="summary-line total"><span>Total</span><span>{brl(order.total_cents)}</span></div>
        </div>
        <p className="tiny muted mt-8">{order.buyer_name} · {order.buyer_email}</p>
      </section>

      <div className="segmented mt-16">
        <button type="button" className={method === 'pix' ? 'on' : ''} onClick={() => setMethod('pix')}>Pix</button>
        <button type="button" className={method === 'card' ? 'on' : ''} onClick={() => setMethod('card')}>Cartão de crédito</button>
      </div>

      {method === 'pix' && (
        <section className="card mt-16">
          <p className="eyebrow" style={{ textAlign: 'center' }}>Escaneie no app do seu banco</p>
          <div className="qr-box mt-16">
            {pix ? <img src={pix.image} alt="QR code Pix" /> : <div style={{ aspectRatio: 1 }} />}
          </div>
          {pix && (
            <div className="copy-line mt-16">
              <code>{pix.qr_code}</code>
              <button className="btn btn-sm btn-ghost" type="button"
                      onClick={() => navigator.clipboard?.writeText(pix.qr_code)}>Copiar</button>
            </div>
          )}
          <p className="small muted mt-16" style={{ textAlign: 'center' }}>A confirmação aparece aqui sozinha, em segundos.</p>
        </section>
      )}

      {method === 'card' && mode === 'mercadopago' && (
        <CardBrick order={order} publicKey={mpPublicKey}
                   onPaid={() => router.replace(`/ingressos/${order.id}`)} onError={setError} />
      )}

      {method === 'card' && mode !== 'mercadopago' && (
        <section className="card mt-16 stack">
          <div className="field"><label>Número do cartão</label><input className="input" inputMode="numeric" placeholder="0000 0000 0000 0000" defaultValue="5031 4332 1540 6351" /></div>
          <div className="row">
            <div className="field" style={{ flex: 1 }}><label>Validade</label><input className="input" placeholder="MM/AA" defaultValue="11/30" /></div>
            <div className="field" style={{ flex: 1 }}><label>CVV</label><input className="input" inputMode="numeric" placeholder="123" defaultValue="123" /></div>
          </div>
          <div className="field"><label>Nome impresso</label><input className="input" defaultValue={order.buyer_name.toUpperCase()} /></div>
          <button className="btn btn-accent btn-block" disabled={busy} onClick={() => simulate('approve')}>
            Pagar {brl(order.total_cents)}
          </button>
        </section>
      )}

      {mode !== 'mercadopago' && (
        <div className="demo-note mt-16">
          <b className="accent">Modo demonstração.</b> Nenhum pagamento real acontece e nenhum dado de cartão é enviado.
          Com o Mercado Pago ligado, esta tela mostra o Pix real e o formulário seguro do cartão.
          <div className="row mt-16" style={{ flexWrap: 'wrap' }}>
            {method === 'pix' && (
              <button className="btn btn-accent btn-sm" disabled={busy} onClick={() => simulate('approve')}>Simular Pix pago</button>
            )}
            <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => simulate('reject')}>Simular recusa</button>
          </div>
        </div>
      )}

      {error && <p className="error mt-16">{error}</p>}

      <button className="btn btn-ghost btn-block mt-24" disabled={busy} onClick={cancel}>Desistir da compra</button>
    </main>
  );
}

// Formulário seguro do Mercado Pago: o número do cartão vira token no navegador e nunca passa pelo nosso servidor
function CardBrick({ order, publicKey, onPaid, onError }) {
  const ref = useRef(null);
  const cb = useRef({ onPaid, onError });
  cb.current = { onPaid, onError };
  useEffect(() => {
    const onPaid = () => cb.current.onPaid();
    const onError = (m) => cb.current.onError(m);
    let controller;
    let cancelled = false;
    function load() {
      return new Promise((resolve, reject) => {
        if (window.MercadoPago) return resolve();
        const s = document.createElement('script');
        s.src = 'https://sdk.mercadopago.com/js/v2';
        s.onload = resolve;
        s.onerror = reject;
        document.body.appendChild(s);
      });
    }
    load().then(async () => {
      if (cancelled) return;
      const mp = new window.MercadoPago(publicKey, { locale: 'pt-BR' });
      controller = await mp.bricks().create('cardPayment', 'card-brick', {
        initialization: { amount: order.total_cents / 100, payer: { email: order.buyer_email } },
        customization: { visual: { style: { theme: 'dark' } } },
        callbacks: {
          onReady: () => {},
          onError: (e) => console.error(e),
          onSubmit: (formData) => fetch(`/api/pedido/${order.id}/cartao`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(formData),
          }).then((r) => r.json()).then((d) => {
            if (d.status === 'paid') onPaid();
            else onError(d.message || 'Pagamento não aprovado.');
          }),
        },
      });
    }).catch(() => onError('Não foi possível carregar o formulário do cartão.'));
    return () => { cancelled = true; controller?.unmount?.(); };
  }, [order.id, order.total_cents, order.buyer_email, publicKey]);
  return <div id="card-brick" ref={ref} className="mt-16" />;
}
