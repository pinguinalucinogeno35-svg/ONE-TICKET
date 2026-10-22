'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Brand from './Brand';
import AdminNav from './AdminNav';
import { brl } from '@/lib/format';
import { toCents, fromCents, toLocalInput, fromLocalInput } from '@/lib/money';
import { units, caseEq, hm } from '@/lib/units';

const UNIT_LABELS = ['garrafa', 'lata', 'long neck', 'unidade', 'combo'];
const EMPTY_P = { id: null, name: '', category: '', unitLabel: 'garrafa', price: '', cost: '', unitsPerCase: '12', lowStock: '0', active: true };
const EMPTY_S = { id: null, artist: '', stage: 'Principal', startsAt: '', endsAt: '' };

async function act(payload) {
  const res = await fetch('/api/painel/bar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || 'Não foi possível salvar.');
  return data;
}

export default function BarAdmin({ data }) {
  const router = useRouter();
  const [p, setP] = useState(EMPTY_P);
  const [st, setSt] = useState({ productId: '', cases: '', units: '', note: '' });
  const [sh, setSh] = useState(EMPTY_S);
  const [busy, setBusy] = useState('');
  const [toast, setToast] = useState(null);
  const [confirmShow, setConfirmShow] = useState(null);
  if (!data) return <main className="shell-wide"><Brand /><p>Evento não encontrado.</p></main>;

  const tz = data.event.timezone || 'America/Sao_Paulo';
  const categories = [...new Set(data.products.map((x) => x.category))];
  const stProduct = data.products.find((x) => x.id === st.productId);
  const stTotal = stProduct ? (parseInt(st.cases || '0', 10) || 0) * stProduct.units_per_case + (parseInt(st.units || '0', 10) || 0) : 0;

  function notify(msg, err = false) {
    setToast({ msg, err });
    setTimeout(() => setToast(null), 3200);
  }
  async function run(key, payload, okMsg, after) {
    setBusy(key);
    try {
      await act(payload);
      notify(okMsg);
      after?.();
      router.refresh();
    } catch (err) { notify(err.message, true); }
    setBusy('');
  }

  const setPf = (k) => (e) => setP({ ...p, [k]: e.target.value });
  function editProduct(x) {
    setP({
      id: x.id, name: x.name, category: x.category, unitLabel: x.unit_label, price: fromCents(x.price_cents), cost: fromCents(x.cost_cents),
      unitsPerCase: String(x.units_per_case), lowStock: String(x.low_stock_units), active: x.active,
    });
    document.getElementById('produto')?.scrollIntoView({ behavior: 'smooth' });
  }
  function saveProduct(e) {
    e.preventDefault();
    run('p', {
      action: 'produto_salvar', eventId: data.event.id, id: p.id, name: p.name, category: p.category, unitLabel: p.unitLabel,
      priceCents: toCents(p.price), costCents: toCents(p.cost) ?? 0, unitsPerCase: p.unitsPerCase, lowStockUnits: p.lowStock, active: p.active,
    }, p.id ? `${p.name} atualizado.` : `${p.name} cadastrado.`, () => setP(EMPTY_P));
  }
  function saveStock(e) {
    e.preventDefault();
    run('s', { action: 'estoque_entrada', productId: st.productId, cases: st.cases || 0, units: st.units || 0, note: st.note },
      `${units(stTotal, stProduct?.unit_label)} lançadas no estoque.`, () => setSt({ productId: st.productId, cases: '', units: '', note: '' }));
  }
  function editShow(x) {
    setSh({ id: x.id, artist: x.artist, stage: x.stage, startsAt: toLocalInput(x.starts_at), endsAt: toLocalInput(x.ends_at) });
    document.getElementById('lineup')?.scrollIntoView({ behavior: 'smooth' });
  }
  function saveShow(e) {
    e.preventDefault();
    run('l', { action: 'show_salvar', eventId: data.event.id, id: sh.id, artist: sh.artist, stage: sh.stage,
      startsAt: fromLocalInput(sh.startsAt), endsAt: fromLocalInput(sh.endsAt) },
    sh.id ? 'Horário do show atualizado.' : `${sh.artist} entrou no line-up.`, () => setSh(EMPTY_S));
  }

  const margin = (() => {
    const pr = toCents(p.price); const c = toCents(p.cost);
    return pr && c !== null ? Math.round(((pr - c) / pr) * 100) : null;
  })();

  return (
    <main className="shell-wide">
      <Brand href="/painel" right={<form method="post" action="/api/logout"><button className="btn btn-ghost btn-sm">Sair</button></form>} />
      <p className="eyebrow">Bar · {data.event.name}</p>
      <h1 className="display" style={{ fontSize: 44, marginTop: 6 }}>Produtos e line-up</h1>
      <AdminNav current="/painel/cadastro" />

      <div className="demo-note">
        Venda e estoque são sempre em unidades. A caixa serve só para dar entrada: informe quantas unidades vêm em cada caixa e o sistema converte.
      </div>

      <h2 className="section-title">Produtos</h2>
      <div className="grid-2">
        <section className="card">
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Produto</th><th className="num">Preço</th><th className="num">Custo</th><th className="num">Estoque</th><th></th></tr></thead>
              <tbody>
                {data.products.map((x) => (
                  <tr key={x.id} className={x.active ? '' : 'off'}>
                    <td><b>{x.name}</b><div className="tiny muted">{x.category} · por {x.unit_label}{x.units_per_case > 1 ? ` · cx ${x.units_per_case}` : ''}{x.active ? '' : ' · inativo'}</div></td>
                    <td className="num">{brl(x.price_cents)}</td>
                    <td className="num">{brl(x.cost_cents)}</td>
                    <td className="num">{units(x.stock_units, x.unit_label)}<div className="tiny muted">{caseEq(x.stock_units, x.units_per_case)}</div></td>
                    <td><button type="button" className="btn btn-ghost btn-sm" onClick={() => editProduct(x)}>Editar</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <form id="produto" className={`card ${p.id ? 'card-accent' : ''}`} onSubmit={saveProduct}>
          <p className="eyebrow">{p.id ? `Editando ${p.name}` : 'Novo produto'}</p>
          <div className="stack mt-16">
            <div className="field"><label>Nome</label><input className="input" value={p.name} onChange={setPf('name')} placeholder="Absolut 1L" required maxLength={60} /></div>
            <div className="grid-form">
              <div className="field"><label>Categoria</label>
                <input className="input" list="cats" value={p.category} onChange={setPf('category')} placeholder="Destilados" />
                <datalist id="cats">{categories.map((c) => <option key={c} value={c} />)}</datalist>
              </div>
              <div className="field"><label>Vendido por</label>
                <select className="input" value={p.unitLabel} onChange={setPf('unitLabel')}>
                  {UNIT_LABELS.map((u) => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
            </div>
            <div className="grid-form">
              <div className="field"><label>Preço por {p.unitLabel}</label><div className="price-input"><input className="input" inputMode="decimal" value={p.price} onChange={setPf('price')} required /></div></div>
              <div className="field"><label>Custo por {p.unitLabel}</label><div className="price-input"><input className="input" inputMode="decimal" value={p.cost} onChange={setPf('cost')} placeholder="0,00" /></div></div>
            </div>
            <div className="grid-form">
              <div className="field"><label>Unidades por caixa</label><input className="input mono" type="number" min="1" value={p.unitsPerCase} onChange={setPf('unitsPerCase')} required /></div>
              <div className="field"><label>Alerta de estoque (un.)</label><input className="input mono" type="number" min="0" value={p.lowStock} onChange={setPf('lowStock')} /></div>
            </div>
            {margin !== null && <p className="tiny muted">Margem por {p.unitLabel}: {margin}%</p>}
            <label className="check"><input type="checkbox" checked={p.active} onChange={(e) => setP({ ...p, active: e.target.checked })} /> Ativo no PDV</label>
            <div className="row">
              <button className="btn btn-accent btn-sm" disabled={busy === 'p'}>{busy === 'p' ? 'Salvando…' : p.id ? 'Salvar produto' : 'Cadastrar produto'}</button>
              {p.id && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setP(EMPTY_P)}>Cancelar</button>}
            </div>
          </div>
        </form>
      </div>

      <h2 className="section-title" id="estoque">Entrada de estoque</h2>
      <form className="card" onSubmit={saveStock}>
        <div className="grid-form">
          <div className="field"><label>Produto</label>
            <select className="input" value={st.productId} onChange={(e) => setSt({ ...st, productId: e.target.value })} required>
              <option value="">Escolha…</option>
              {data.products.filter((x) => x.active).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </div>
          <div className="field"><label>Caixas{stProduct ? ` (de ${stProduct.units_per_case})` : ''}</label><input className="input mono" type="number" value={st.cases} onChange={(e) => setSt({ ...st, cases: e.target.value })} placeholder="0" /></div>
          <div className="field"><label>Unidades avulsas</label><input className="input mono" type="number" value={st.units} onChange={(e) => setSt({ ...st, units: e.target.value })} placeholder="0" /></div>
          <div className="field"><label>Observação</label><input className="input" value={st.note} onChange={(e) => setSt({ ...st, note: e.target.value })} placeholder="NF 1234, fornecedor…" maxLength={200} /></div>
        </div>
        <div className="row between mt-16" style={{ flexWrap: 'wrap' }}>
          <span className="small">
            {stProduct ? <>Total: <b className="mono">{units(stTotal, stProduct.unit_label)}</b> · estoque passa de {units(stProduct.stock_units, stProduct.unit_label)} para <b>{units(stProduct.stock_units + stTotal, stProduct.unit_label)}</b></> : <span className="muted">Use número negativo para baixa (quebra, perda, consumo da equipe).</span>}
          </span>
          <button className="btn btn-accent btn-sm" disabled={busy === 's' || !stProduct || stTotal === 0}>{busy === 's' ? 'Lançando…' : 'Lançar no estoque'}</button>
        </div>
      </form>

      <h2 className="section-title" id="lineup">Line-up</h2>
      <div className="grid-2">
        <section className="card">
          {data.lineup.length === 0 && <p className="muted small">Nenhum show cadastrado.</p>}
          <div className="stack">
            {data.lineup.map((x) => (
              <div key={x.id} className="lineup-row">
                <div>
                  <b>{x.artist}</b>
                  <div className="tiny muted mono">{new Date(x.starts_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: tz })} · {hm(x.starts_at, tz)}–{hm(x.ends_at, tz)} · {x.stage}</div>
                </div>
                <div className="row" style={{ gap: 6 }}>
                  {confirmShow === x.id ? (
                    <>
                      <button type="button" className="btn btn-sm btn-danger" onClick={() => { setConfirmShow(null); run('r', { action: 'show_remover', id: x.id }, `${x.artist} saiu do line-up.`); }}>Remover</button>
                      <button type="button" className="btn btn-sm btn-ghost" onClick={() => setConfirmShow(null)}>Não</button>
                    </>
                  ) : (
                    <>
                      <button type="button" className="btn btn-sm btn-ghost" onClick={() => editShow(x)}>Editar</button>
                      <button type="button" className="btn btn-sm btn-ghost" onClick={() => setConfirmShow(x.id)}>Remover</button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
          <p className="tiny muted mt-16">Atrasou? Edite o horário real do show. O painel recalcula as vendas de cada show na hora.</p>
        </section>

        <form className={`card ${sh.id ? 'card-accent' : ''}`} onSubmit={saveShow}>
          <p className="eyebrow">{sh.id ? `Editando ${sh.artist}` : 'Novo show'}</p>
          <div className="stack mt-16">
            <div className="grid-form">
              <div className="field"><label>Artista</label><input className="input" value={sh.artist} onChange={(e) => setSh({ ...sh, artist: e.target.value })} required maxLength={80} /></div>
              <div className="field"><label>Palco</label><input className="input" value={sh.stage} onChange={(e) => setSh({ ...sh, stage: e.target.value })} maxLength={40} /></div>
            </div>
            <div className="grid-form">
              <div className="field"><label>Início</label><input className="input mono" type="datetime-local" value={sh.startsAt} onChange={(e) => setSh({ ...sh, startsAt: e.target.value })} required /></div>
              <div className="field"><label>Fim</label><input className="input mono" type="datetime-local" value={sh.endsAt} onChange={(e) => setSh({ ...sh, endsAt: e.target.value })} required /></div>
            </div>
            <div className="row">
              <button className="btn btn-accent btn-sm" disabled={busy === 'l'}>{busy === 'l' ? 'Salvando…' : sh.id ? 'Salvar horário' : 'Adicionar show'}</button>
              {sh.id && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSh(EMPTY_S)}>Cancelar</button>}
            </div>
          </div>
        </form>
      </div>

      <p className="footer-note">Alterações ficam registradas no histórico</p>
      {toast && <div className={`toast ${toast.err ? 'err' : ''}`} role="status">{toast.msg}</div>}
    </main>
  );
}
