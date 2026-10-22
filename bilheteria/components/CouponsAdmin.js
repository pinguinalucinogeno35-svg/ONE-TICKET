'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Brand from './Brand';
import AdminNav from './AdminNav';
import { brl, dateShort } from '@/lib/format';
import { toCents, fromCents, toLocalInput, fromLocalInput } from '@/lib/money';

const OWNER = { influencer: 'Influenciador', sponsor: 'Patrocinador', promoter: 'Promoter', other: 'Produção' };
const EMPTY = { id: null, code: '', ownerName: '', ownerKind: 'influencer', kind: 'percent', value: '10', maxUses: '', validUntil: '', active: true };

async function act(payload) {
  const res = await fetch('/api/painel/acao', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || 'Não foi possível salvar.');
  return data;
}

function describe(c) {
  if (c.kind === 'percent') return `${c.value}% de desconto`;
  if (c.kind === 'fixed') return `${brl(c.value)} de desconto`;
  return 'Cortesia (100%)';
}

export default function CouponsAdmin({ data }) {
  const router = useRouter();
  const [f, setF] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);
  if (!data) return <main className="shell-wide"><Brand /><p>Evento não encontrado.</p></main>;

  const editing = !!f.id;
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  function notify(msg, err = false) {
    setToast({ msg, err });
    setTimeout(() => setToast(null), 3200);
  }

  function edit(c) {
    setF({
      id: c.id, code: c.code, ownerName: c.owner_name, ownerKind: c.owner_kind, kind: c.kind,
      value: c.kind === 'fixed' ? fromCents(c.value) : c.kind === 'percent' ? String(c.value) : '',
      maxUses: c.max_uses ? String(c.max_uses) : '', validUntil: toLocalInput(c.valid_until), active: c.active,
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const value = f.kind === 'fixed' ? toCents(f.value) : f.kind === 'percent' ? parseInt(f.value, 10) : 0;
      await act({
        action: 'cupom_salvar', eventId: data.event.id, id: f.id, code: f.code, ownerName: f.ownerName, ownerKind: f.ownerKind,
        kind: f.kind, value, maxUses: f.maxUses || null, validUntil: fromLocalInput(f.validUntil), active: f.active,
      });
      notify(editing ? 'Cupom atualizado.' : `Cupom ${f.code.toUpperCase()} criado.`);
      setF(EMPTY);
      router.refresh();
    } catch (err) { notify(err.message, true); }
    setBusy(false);
  }

  async function toggle(c) {
    try {
      await act({ action: 'cupom_ativo', id: c.id, active: !c.active });
      notify(c.active ? `${c.code} desativado.` : `${c.code} ativado.`);
      router.refresh();
    } catch (err) { notify(err.message, true); }
  }

  function copyLink(c) {
    const url = `${window.location.origin}/e/${data.event.slug}?cupom=${encodeURIComponent(c.code)}`;
    navigator.clipboard?.writeText(url);
    notify('Link do cupom copiado.');
  }

  const totals = data.coupons.reduce((a, c) => ({ seats: a.seats + c.seats, revenue: a.revenue + c.revenue_cents }), { seats: 0, revenue: 0 });

  return (
    <main className="shell-wide">
      <Brand href="/painel" right={<form method="post" action="/api/logout"><button className="btn btn-ghost btn-sm">Sair</button></form>} />
      <p className="eyebrow">Painel do produtor · {data.event.name}</p>
      <h1 className="display" style={{ fontSize: 44, marginTop: 6 }}>Cupons</h1>
      <AdminNav current="/painel/cupons" />

      <div className="grid-2">
        <section className="card">
          <div className="row between">
            <p className="display" style={{ fontSize: 24 }}>Cupons do evento</p>
            <span className="chip">{data.coupons.length} cupons · {totals.seats} pessoas · {brl(totals.revenue)}</span>
          </div>
          <div className="table-wrap mt-8">
            <table className="table">
              <thead><tr><th>Cupom</th><th>Desconto</th><th className="num">Usos</th><th className="num">Receita</th><th>Ativo</th><th></th></tr></thead>
              <tbody>
                {data.coupons.map((c) => (
                  <tr key={c.id} className={c.active ? '' : 'off'}>
                    <td>
                      <b className="mono">{c.code}</b>
                      <div className="tiny muted">{c.owner_name} · {OWNER[c.owner_kind]}{c.valid_until ? ` · até ${dateShort(c.valid_until)}` : ''}</div>
                    </td>
                    <td className="small">{describe(c)}</td>
                    <td className="num">{c.used}{c.max_uses ? `/${c.max_uses}` : ''}{c.reserved ? <span className="tiny muted"> +{c.reserved}</span> : null}</td>
                    <td className="num">{brl(c.revenue_cents)}</td>
                    <td>
                      <button type="button" className="switch" role="switch" aria-checked={c.active} aria-label={`Ativar ${c.code}`} onClick={() => toggle(c)} />
                    </td>
                    <td>
                      <div className="row" style={{ justifyContent: 'flex-end' }}>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => copyLink(c)}>Link</button>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => edit(c)}>Editar</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="tiny muted mt-16">O link abre a página do evento com o cupom já aplicado. Números com + são reservas aguardando pagamento.</p>
        </section>

        <form className={`card ${editing ? 'card-accent' : ''}`} onSubmit={save}>
          <p className="eyebrow">{editing ? `Editando ${f.code}` : 'Novo cupom'}</p>
          <div className="stack mt-16">
            <div className="field"><label>Código</label>
              <input className="input mono" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase().replace(/\s/g, '') })} placeholder="MARI10" required minLength={3} maxLength={30} />
            </div>
            <div className="grid-form">
              <div className="field"><label>Dono</label><input className="input" value={f.ownerName} onChange={set('ownerName')} placeholder="@perfil ou empresa" required /></div>
              <div className="field"><label>Tipo de parceiro</label>
                <select className="input" value={f.ownerKind} onChange={set('ownerKind')}>
                  {Object.entries(OWNER).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
            </div>
            <div className="grid-form">
              <div className="field"><label>Desconto</label>
                <select className="input" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value, value: e.target.value === 'percent' ? '10' : e.target.value === 'fixed' ? '10,00' : '' })}>
                  <option value="percent">Percentual</option>
                  <option value="fixed">Valor fixo</option>
                  <option value="courtesy">Cortesia</option>
                </select>
              </div>
              {f.kind === 'percent' && (
                <div className="field"><label>Percentual (%)</label><input className="input mono" type="number" min="1" max="100" value={f.value} onChange={set('value')} required /></div>
              )}
              {f.kind === 'fixed' && (
                <div className="field"><label>Valor por pedido</label><div className="price-input"><input className="input" inputMode="decimal" value={f.value} onChange={set('value')} required /></div></div>
              )}
            </div>
            <div className="grid-form">
              <div className="field"><label>Limite de usos</label><input className="input mono" type="number" min="1" value={f.maxUses} onChange={set('maxUses')} placeholder="sem limite" /></div>
              <div className="field"><label>Válido até</label><input className="input mono" type="datetime-local" value={f.validUntil} onChange={set('validUntil')} /></div>
            </div>
            {f.kind === 'courtesy' && <p className="tiny muted">Cortesia zera o pedido e emite o QR code na hora. Conta na capacidade do evento.</p>}
            <label className="check"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Ativo</label>
            <div className="row">
              <button className="btn btn-accent btn-sm" disabled={busy}>{busy ? 'Salvando…' : editing ? 'Salvar alterações' : 'Criar cupom'}</button>
              {editing && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setF(EMPTY)}>Cancelar</button>}
            </div>
          </div>
        </form>
      </div>

      {toast && <div className={`toast ${toast.err ? 'err' : ''}`} role="status">{toast.msg}</div>}
    </main>
  );
}
