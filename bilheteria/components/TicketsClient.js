'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Brand from './Brand';
import { dateLong, VARIANT_LABEL } from '@/lib/format';

export default function TicketsClient({ order, tickets }) {
  const router = useRouter();
  const [open, setOpen] = useState(null); // id do ingresso com formulário de envio aberto
  const [form, setForm] = useState({ name: '', email: '' });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  async function transfer(e, ticketId) {
    e.preventDefault();
    setBusy(true);
    setMsg('');
    const res = await fetch('/api/ingressos/transferir', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId: order.id, ticketId, ...form }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) return setMsg(data.message);
    setOpen(null);
    setForm({ name: '', email: '' });
    setMsg('Ingresso enviado. O QR code antigo deixou de valer.');
    router.refresh();
  }

  async function share() {
    const url = window.location.href;
    if (navigator.share) {
      try { await navigator.share({ title: order.event.name, text: `Vou no ${order.event.name}!`, url: `${window.location.origin}/e/${order.event.slug}` }); } catch {}
    } else {
      navigator.clipboard?.writeText(url);
      setMsg('Link copiado.');
    }
  }

  return (
    <main className="shell">
      <Brand href={`/e/${order.event.slug}`} right={<span className="chip chip-accent"><span className="dot" />Pago</span>} />

      <p className="display" style={{ fontSize: 40 }}>Seus ingressos</p>
      <p className="muted small mt-8">
        {tickets.length} {tickets.length === 1 ? 'ingresso' : 'ingressos'} · ficam salvos neste celular e funcionam sem internet.
        Guarde este link ou adicione o app à tela inicial.
      </p>
      {msg && <p className="ok mt-16">{msg}</p>}

      {tickets.map((t, i) => (
        <article key={t.id} className="pass mt-24">
          <div className="pass-top">
            <div className="row between">
              <span className="pass-brand"><b>ONE</b> Ticket</span>
              <span className="eyebrow">{i + 1} / {tickets.length}</span>
            </div>
            <span className="chip chip-accent mt-16">{VARIANT_LABEL[t.variant]}</span>
            <p className="display mt-16" style={{ fontSize: 44 }}>{order.event.name}</p>
            <p className="small mt-8" style={{ fontWeight: 700 }}>{dateLong(order.event.starts_at)}</p>
            <p className="small muted">{order.event.venue_name}</p>
          </div>
          <div className="pass-cut"><i /></div>
          <div className="pass-body">
            <div className="pass-qr"><img src={t.qr} alt={`QR code do ingresso ${i + 1}`} /></div>
            <div className="row between mt-16">
              <div>
                <p className="tiny muted">Titular</p>
                <p style={{ fontWeight: 800 }}>{t.holder_name || 'Aguardando nome'}</p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <p className="tiny muted">Código</p>
                <p className="mono" style={{ fontWeight: 600 }}>{t.code.slice(0, 6).toUpperCase()}</p>
              </div>
            </div>

            {t.status === 'valid' && (
              open === t.id ? (
                <form className="stack mt-16" onSubmit={(e) => transfer(e, t.id)}>
                  <input className="input" placeholder="Nome de quem vai usar" required minLength={3}
                         value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                  <input className="input" type="email" placeholder="E-mail" required
                         value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                  <div className="row">
                    <button className="btn btn-accent btn-sm" disabled={busy}>Enviar ingresso</button>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(null)}>Cancelar</button>
                  </div>
                </form>
              ) : (
                <div className="row mt-16" style={{ flexWrap: 'wrap' }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => { setOpen(t.id); setMsg(''); }}>
                    {t.holder_name ? 'Transferir' : 'Enviar para outra pessoa'}
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => { navigator.clipboard?.writeText(t.token); setMsg('Código do QR copiado (útil para testar a portaria no computador).'); }}>
                    Copiar código
                  </button>
                </div>
              )
            )}
          </div>
          {t.status === 'used' && <div className="pass-used"><b>Utilizado</b></div>}
        </article>
      ))}

      <button className="btn btn-accent btn-block mt-24" onClick={share}>Compartilhar nos stories</button>
      <p className="footer-note">Pedido #{order.id.slice(0, 6).toUpperCase()} · {order.buyer_email}</p>
    </main>
  );
}
