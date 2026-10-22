'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Brand from './Brand';
import AdminNav from './AdminNav';
import { brl } from '@/lib/format';
import { toCents, fromCents, toLocalInput, fromLocalInput } from '@/lib/money';

const STATUS = { active: 'À venda', scheduled: 'Agendado', sold_out: 'Esgotado', closed: 'Encerrado' };
const TRACK = { principal: 'Lotes principais', promocional: 'Promocional', casadinha: 'Casadinha' };

async function act(payload) {
  const res = await fetch('/api/painel/acao', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || 'Não foi possível salvar.');
  return data;
}

function priceOf(batch, variant) {
  const o = batch.offers.find((x) => x.variant === variant);
  return o ? fromCents(o.price_cents) : '';
}

function BatchForm({ batch, onDone }) {
  const [f, setF] = useState({
    name: batch.name, quantity: String(batch.quantity), endsAt: toLocalInput(batch.ends_at),
    inteira: priceOf(batch, 'inteira'), meia: priceOf(batch, 'meia'), casadinha: priceOf(batch, 'casadinha'),
  });
  const [autoMeia, setAutoMeia] = useState(() => {
    const i = toCents(priceOf(batch, 'inteira')); const m = toCents(priceOf(batch, 'meia'));
    return i !== null && m !== null && Math.floor(i / 2) === m;
  });
  const [busy, setBusy] = useState(false);
  const taken = batch.sold + batch.reserved;
  const pct = Math.min(100, Math.round((taken / Math.max(1, batch.quantity)) * 100));
  const set = (k) => (e) => {
    const v = e.target.value;
    setF((old) => {
      const next = { ...old, [k]: v };
      if (k === 'inteira' && autoMeia) { const c = toCents(v); next.meia = c === null ? '' : fromCents(Math.floor(c / 2)); }
      return next;
    });
  };
  const changed = f.name !== batch.name || f.quantity !== String(batch.quantity) || f.endsAt !== toLocalInput(batch.ends_at)
    || ['inteira', 'meia', 'casadinha'].some((v) => f[v] !== priceOf(batch, v));

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await act({
        action: 'lote_salvar', batchId: batch.id, name: f.name, quantity: f.quantity, endsAt: fromLocalInput(f.endsAt),
        prices: { inteira: toCents(f.inteira), meia: toCents(f.meia), casadinha: toCents(f.casadinha) },
      });
      onDone(`${f.name} salvo.`);
    } catch (err) { onDone(err.message, true); }
    setBusy(false);
  }

  return (
    <form className="card" onSubmit={save}>
      <div className="row between" style={{ flexWrap: 'wrap' }}>
        <div className="row">
          <b style={{ fontSize: 17 }}>{batch.name}</b>
          <span className={`status ${batch.status}`}>{STATUS[batch.status]}</span>
          {batch.visibility === 'link' && <span className="status">link · {batch.access_code}</span>}
        </div>
        <span className="tiny muted mono">{batch.sold} vendidos · {batch.reserved} reservados</span>
      </div>
      <div className={`progress ${pct >= 85 ? 'hot' : ''}`}><i style={{ width: `${pct}%` }} /></div>

      <div className="grid-form mt-16">
        <div className="field"><label>Nome</label><input className="input" value={f.name} onChange={set('name')} required maxLength={60} /></div>
        <div className="field">
          <label>Quantidade (mín. {taken})</label>
          <input className="input mono" type="number" min={Math.max(taken, 1)} value={f.quantity} onChange={set('quantity')} required />
        </div>
        <div className="field"><label>Virada por data</label><input className="input mono" type="datetime-local" value={f.endsAt} onChange={set('endsAt')} /></div>
      </div>
      <div className="grid-form mt-16">
        <div className="field"><label>Inteira</label><div className="price-input"><input className="input" inputMode="decimal" value={f.inteira} onChange={set('inteira')} required /></div></div>
        <div className="field"><label>Meia-entrada</label><div className="price-input"><input className="input" inputMode="decimal" value={f.meia} onChange={set('meia')} disabled={autoMeia} placeholder="sem meia" /></div></div>
        <div className="field"><label>Casadinha (2 pessoas)</label><div className="price-input"><input className="input" inputMode="decimal" value={f.casadinha} onChange={set('casadinha')} placeholder="sem casadinha" /></div></div>
      </div>
      <div className="row between mt-16" style={{ flexWrap: 'wrap' }}>
        <label className="check">
          <input type="checkbox" checked={autoMeia} onChange={(e) => {
            setAutoMeia(e.target.checked);
            if (e.target.checked) { const c = toCents(f.inteira); setF((o) => ({ ...o, meia: c === null ? '' : fromCents(Math.floor(c / 2)) })); }
          }} />
          Meia = 50% da inteira
        </label>
        <button className="btn btn-accent btn-sm" disabled={!changed || busy}>{busy ? 'Salvando…' : 'Salvar lote'}</button>
      </div>
    </form>
  );
}

function NewBatch({ eventId, onDone }) {
  const empty = { track: 'principal', name: '', quantity: '', inteira: '', casadinha: '', endsAt: '', visibility: 'public', accessCode: '' };
  const [f, setF] = useState(empty);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function create(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const inteira = toCents(f.inteira);
      await act({
        action: 'lote_criar', eventId, track: f.track, name: f.name, quantity: f.quantity, endsAt: fromLocalInput(f.endsAt),
        visibility: f.visibility, accessCode: f.accessCode,
        prices: { inteira, meia: inteira === null ? null : Math.floor(inteira / 2), casadinha: toCents(f.casadinha) },
      });
      setF(empty);
      onDone('Lote criado.');
    } catch (err) { onDone(err.message, true); }
    setBusy(false);
  }

  return (
    <form className="card card-accent" onSubmit={create}>
      <p className="eyebrow">Novo lote</p>
      <div className="grid-form mt-16">
        <div className="field"><label>Trilha</label>
          <select className="input" value={f.track} onChange={set('track')}>
            <option value="principal">Lotes principais</option>
            <option value="promocional">Promocional</option>
          </select>
        </div>
        <div className="field"><label>Nome</label><input className="input" value={f.name} onChange={set('name')} placeholder="5º lote" required maxLength={60} /></div>
        <div className="field"><label>Quantidade</label><input className="input mono" type="number" min="1" value={f.quantity} onChange={set('quantity')} required /></div>
        <div className="field"><label>Inteira</label><div className="price-input"><input className="input" inputMode="decimal" value={f.inteira} onChange={set('inteira')} required /></div></div>
        <div className="field"><label>Casadinha</label><div className="price-input"><input className="input" inputMode="decimal" value={f.casadinha} onChange={set('casadinha')} placeholder="opcional" /></div></div>
        <div className="field"><label>Virada por data</label><input className="input mono" type="datetime-local" value={f.endsAt} onChange={set('endsAt')} /></div>
        <div className="field"><label>Visibilidade</label>
          <select className="input" value={f.visibility} onChange={set('visibility')}>
            <option value="public">Pública</option>
            <option value="link">Só por link</option>
          </select>
        </div>
        {f.visibility === 'link' && (
          <div className="field"><label>Código do link</label><input className="input mono" value={f.accessCode} onChange={(e) => setF({ ...f, accessCode: e.target.value.toUpperCase() })} required /></div>
        )}
      </div>
      <div className="row between mt-16" style={{ flexWrap: 'wrap' }}>
        <span className="tiny muted">Meia entra com 50% da inteira. Se a trilha já tem lote à venda, o novo entra como agendado.</span>
        <button className="btn btn-accent btn-sm" disabled={busy}>{busy ? 'Criando…' : 'Criar lote'}</button>
      </div>
    </form>
  );
}

export default function LotsAdmin({ data }) {
  const router = useRouter();
  const [toast, setToast] = useState(null);
  if (!data) return <main className="shell-wide"><Brand /><p>Evento não encontrado.</p></main>;
  const tracks = [...new Set(data.batches.map((b) => b.track))];

  function done(msg, err = false) {
    setToast({ msg, err });
    setTimeout(() => setToast(null), 3200);
    if (!err) router.refresh();
  }

  return (
    <main className="shell-wide">
      <Brand href="/painel" right={<form method="post" action="/api/logout"><button className="btn btn-ghost btn-sm">Sair</button></form>} />
      <p className="eyebrow">Painel do produtor · {data.event.name}</p>
      <h1 className="display" style={{ fontSize: 44, marginTop: 6 }}>Lotes e preços</h1>
      <AdminNav current="/painel/lotes" />

      <div className="demo-note">
        Mudanças de preço valem para novas compras na hora. Quem já reservou ou pagou mantém o preço que viu.
        A capacidade do evento ({data.event.capacity}) continua sendo o limite, mesmo que a soma dos lotes passe dela.
      </div>

      {tracks.map((t) => (
        <section key={t}>
          <h2 className="section-title">{TRACK[t] || t}</h2>
          <div className="stack">
            {data.batches.filter((b) => b.track === t).map((b) => (
              <BatchForm key={`${b.id}-${b.quantity}-${b.name}-${b.offers.map((o) => o.price_cents).join('-')}-${b.ends_at}`} batch={b} onDone={done} />
            ))}
          </div>
        </section>
      ))}

      <h2 className="section-title">Adicionar</h2>
      <NewBatch eventId={data.event.id} onDone={done} />
      <p className="footer-note">Preços em reais · alterações ficam registradas no histórico</p>
      {toast && <div className={`toast ${toast.err ? 'err' : ''}`} role="status">{toast.msg}</div>}
    </main>
  );
}
