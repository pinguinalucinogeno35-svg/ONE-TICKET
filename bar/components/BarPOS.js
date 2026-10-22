'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import Brand from './Brand';
import Icon from './Icon';
import { useMe } from './MeContext';
import { ACCESS, ROLE_LABEL } from '@/lib/apps';
import { brl } from '@/lib/format';
import { units, PAYMENT_LABEL, hm } from '@/lib/units';

// PDV do bar: toca no produto, toca na forma de pagamento, pronto.
// Cada venda vai para uma fila local e sincroniza quando houver sinal (funciona offline).
const LS = { catalog: 'bar:catalog', queue: 'bar:queue', history: 'bar:history', device: 'bar:device' };

// Memória da sessão + localStorage. Se o navegador bloquear o armazenamento (aba anônima),
// a fila continua na memória enquanto a página estiver aberta.
const MEM = {};
function load(key, fallback) {
  if (key in MEM) return MEM[key];
  try { const v = localStorage.getItem(key); if (v) { MEM[key] = JSON.parse(v); return MEM[key]; } } catch {}
  return fallback;
}
function save(key, value) {
  MEM[key] = value;
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}
function uuid() {
  return crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, () => ((Math.random() * 16) | 0).toString(16));
}

export default function BarPOS({ initial }) {
  const me = useMe();
  const canPanel = !!me && ACCESS.painel.includes(me.role);
  const canCancel = !!me && ACCESS.cancelar.includes(me.role);
  const [catalog, setCatalog] = useState(initial);
  const [cart, setCart] = useState({});
  const [cat, setCat] = useState('Todos');
  const [queue, setQueue] = useState([]);
  const [history, setHistory] = useState([]);
  const [online, setOnline] = useState(true);
  const [device, setDevice] = useState('');
  const [toast, setToast] = useState(null);
  const [confirmId, setConfirmId] = useState(null);
  const [sheet, setSheet] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const syncing = useRef(false);

  useEffect(() => {
    const d = load(LS.device, null) || `Caixa ${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
    setDevice(d);
    save(LS.device, d);
    if (!initial) setCatalog(load(LS.catalog, null));
    else save(LS.catalog, initial);
    setQueue(load(LS.queue, []));
    setHistory(load(LS.history, []));
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); clearInterval(t); };
  }, [initial]);

  const notify = (msg, err = false) => {
    setToast({ msg, err });
    setTimeout(() => setToast(null), 2600);
  };

  const refreshCatalog = useCallback(async () => {
    try {
      const res = await fetch('/api/bar/catalogo', { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      if (data) { setCatalog(data); save(LS.catalog, data); }
    } catch {}
  }, []);

  const sync = useCallback(async () => {
    const q = load(LS.queue, []);
    if (syncing.current || !q.length || !navigator.onLine) return;
    const cat0 = load(LS.catalog, null);
    if (!cat0) return;
    syncing.current = true;
    try {
      const res = await fetch('/api/bar/sync', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId: cat0.event.id, deviceId: load(LS.device, 'pdv'), sales: q }),
      });
      if (res.ok) {
        const results = await res.json();
        const byId = Object.fromEntries(results.map((r) => [r.client_sale_id, r.result]));
        const rest = load(LS.queue, []).filter((s) => !byId[s.client_sale_id]);
        save(LS.queue, rest);
        setQueue(rest);
        const h = load(LS.history, []).map((x) => (byId[x.id]
          ? { ...x, synced: byId[x.id] !== 'invalid', rejected: byId[x.id] === 'invalid' }
          : x));
        save(LS.history, h);
        setHistory(h);
        refreshCatalog();
      }
    } catch {}
    syncing.current = false;
  }, [refreshCatalog]);

  useEffect(() => {
    sync();
    const a = setInterval(sync, 5000);
    const b = setInterval(refreshCatalog, 60000);
    return () => { clearInterval(a); clearInterval(b); };
  }, [sync, refreshCatalog]);

  const products = useMemo(() => catalog?.products || [], [catalog]);
  const byId = useMemo(() => Object.fromEntries(products.map((p) => [p.id, p])), [products]);
  const categories = useMemo(() => ['Todos', ...new Set(products.map((p) => p.category))], [products]);

  // Unidades ainda na fila deste aparelho (o estoque do servidor ainda não as descontou)
  const pending = useMemo(() => {
    const m = {};
    queue.forEach((s) => s.items.forEach((i) => { m[i.product_id] = (m[i.product_id] || 0) + i.qty; }));
    return m;
  }, [queue]);

  const lines = Object.entries(cart).filter(([id, q]) => q > 0 && byId[id]).map(([id, q]) => ({ p: byId[id], qty: q }));
  const totalUnits = lines.reduce((s, l) => s + l.qty, 0);
  const total = lines.reduce((s, l) => s + l.qty * l.p.price_cents, 0);

  const lineup = catalog?.lineup || [];
  const nowShow = lineup.find((l) => new Date(l.starts_at).getTime() <= now && now < new Date(l.ends_at).getTime());
  const nextShow = lineup.find((l) => new Date(l.starts_at).getTime() > now);
  const tz = catalog?.event?.timezone || 'America/Sao_Paulo';

  const add = (id, d) => setCart((c) => ({ ...c, [id]: Math.max(0, Math.min(500, (c[id] || 0) + d)) }));

  function register(method) {
    if (!lines.length) return;
    const id = uuid();
    const soldAt = new Date().toISOString();
    const sale = {
      client_sale_id: id, payment_method: method, sold_at: soldAt,
      items: lines.map((l) => ({ product_id: l.p.id, qty: l.qty, unit_price_cents: l.p.price_cents })),
    };
    const q = [...load(LS.queue, []), sale];
    save(LS.queue, q);
    setQueue(q);
    const h = [{
      id, at: soldAt, method, total, units: totalUnits, synced: false,
      items: lines.map((l) => ({ name: l.p.name, qty: l.qty, unit_label: l.p.unit_label })),
    }, ...load(LS.history, [])].slice(0, 60);
    save(LS.history, h);
    setHistory(h);
    setCart({});
    setSheet(false);
    notify(`${PAYMENT_LABEL[method]} · ${brl(total)} registrado`);
    if (navigator.vibrate) navigator.vibrate(40);
    setTimeout(sync, 50);
  }

  async function cancel(h) {
    setConfirmId(null);
    const q = load(LS.queue, []);
    if (q.some((s) => s.client_sale_id === h.id)) {
      const rest = q.filter((s) => s.client_sale_id !== h.id);
      save(LS.queue, rest);
      setQueue(rest);
    } else {
      try {
        const res = await fetch('/api/bar/cancelar', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clientSaleId: h.id, deviceId: device }),
        });
        if (res.status === 403) { notify('Venda já enviada: só o gerente do bar pode cancelar.', true); return; }
        if (!res.ok) throw new Error();
        refreshCatalog();
      } catch {
        notify('Sem conexão. Cancele quando o sinal voltar.', true);
        return;
      }
    }
    const nh = load(LS.history, []).map((x) => (x.id === h.id ? { ...x, canceled: true } : x));
    save(LS.history, nh);
    setHistory(nh);
    notify('Venda cancelada e estoque devolvido.');
  }

  function renameDevice() {
    const v = window.prompt?.('Nome deste caixa', device);
    if (v && v.trim()) { setDevice(v.trim().slice(0, 40)); save(LS.device, v.trim().slice(0, 40)); }
  }

  const valid = history.filter((h) => !h.canceled && !h.rejected);
  const deviceTotal = valid.reduce((s, h) => s + h.total, 0);
  const deviceUnits = valid.reduce((s, h) => s + h.units, 0);

  if (!catalog) {
    return (
      <main className="shell">
        <Brand href={canPanel ? '/painel' : '/pdv'} />
        <p className="muted">Sem catálogo salvo neste aparelho. Conecte à internet e recarregue a página uma vez.</p>
      </main>
    );
  }

  const cartPanel = (
    <>
      <div className="row between">
        <p className="eyebrow">Venda atual</p>
        {lines.length > 0 && <button type="button" className="tiny muted" onClick={() => setCart({})}>Limpar</button>}
      </div>
      {lines.length === 0 ? (
        <p className="muted small mt-16">Toque nos produtos para montar a venda.</p>
      ) : (
        <div className="pos-lines mt-8">
          {lines.map((l) => (
            <div key={l.p.id} className="pos-line">
              <div className="pos-line-info">
                <b>{l.p.name}</b>
                <span className="tiny muted">{units(l.qty, l.p.unit_label)} × {brl(l.p.price_cents)}</span>
              </div>
              <div className="stepper">
                <button type="button" aria-label={`Tirar 1 ${l.p.name}`} onClick={() => add(l.p.id, -1)}><Icon name="minus" size={16} /></button>
                <output>{l.qty}</output>
                <button type="button" className="plus" aria-label={`Mais 1 ${l.p.name}`} onClick={() => add(l.p.id, 1)}><Icon name="plus" size={16} /></button>
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="summary-line total mt-8"><span>{units(totalUnits, 'unidade')}</span><span>{brl(total)}</span></div>
      <p className="eyebrow mt-16">Cobrar e registrar</p>
      <div className="pay-grid mt-8">
        {['pix', 'card', 'cash'].map((m) => (
          <button key={m} type="button" className="pay-btn" disabled={!lines.length} onClick={() => register(m)}>
            {PAYMENT_LABEL[m]}
          </button>
        ))}
      </div>
      <p className="tiny muted mt-8">Cobre na maquininha ou no Pix do bar antes de tocar na forma de pagamento.</p>
    </>
  );

  return (
    <main className="pos">
      <Brand href={canPanel ? '/painel' : '/pdv'} right={
        <span className={`chip ${online ? 'chip-accent' : ''}`}>
          <span className="dot" style={online ? {} : { background: 'var(--warn)' }} />
          {online ? (queue.length ? `${queue.length} na fila` : 'Online') : `Offline · ${queue.length} na fila`}
        </span>
      } />

      <div className="pos-head">
        <div>
          <p className="eyebrow">PDV · {catalog.event.name}{me ? ` · ${me.name}` : ''}</p>
          <button type="button" className="pos-device" onClick={renameDevice} title="Renomear caixa">{device}<Icon name="edit" size={18} label="Renomear caixa" /></button>
        </div>
        <div className="now-playing">
          {nowShow ? (
            <><span className="eyebrow">Tocando agora</span><b>{nowShow.artist}</b><span className="tiny muted">até {hm(nowShow.ends_at, tz)} · {nowShow.stage}</span></>
          ) : nextShow ? (
            <><span className="eyebrow">Próximo show</span><b>{nextShow.artist}</b><span className="tiny muted">{new Date(nextShow.starts_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: tz })} às {hm(nextShow.starts_at, tz)}</span></>
          ) : (
            <><span className="eyebrow">Line-up</span><b>Sem show agora</b></>
          )}
        </div>
      </div>

      <div className="pos-cats" role="tablist" aria-label="Categorias">
        {categories.map((c) => (
          <button key={c} type="button" role="tab" aria-selected={cat === c} className={cat === c ? 'on' : ''} onClick={() => setCat(c)}>{c}</button>
        ))}
      </div>

      <div className="pos-body">
        <section className="pos-grid" aria-label="Produtos">
          {products.filter((p) => cat === 'Todos' || p.category === cat).map((p) => {
            const left = p.stock_units - (pending[p.id] || 0) - (cart[p.id] || 0);
            const state = left <= 0 ? 'out' : left <= p.low_stock_units ? 'low' : '';
            return (
              <button key={p.id} type="button" className={`pos-tile ${cart[p.id] ? 'in' : ''}`} onClick={() => add(p.id, 1)}>
                {cart[p.id] > 0 && <span className="pos-qty">{cart[p.id]}</span>}
                <span className="pos-name">{p.name}</span>
                <span className="pos-price">{brl(p.price_cents)}</span>
                <span className={`pos-stock ${state}`}>
                  {state === 'out' ? 'Conferir estoque' : `${units(left, p.unit_label)}${state === 'low' ? ' · baixo' : ''}`}
                </span>
              </button>
            );
          })}
        </section>

        <aside className="card pos-cart">{cartPanel}</aside>
      </div>

      <div className="pos-bar">
        <div className="buybar-inner">
          <div className="buybar-total">
            <span className="tiny muted">{totalUnits ? units(totalUnits, 'unidade') : 'Nenhum item'}</span>
            <b>{brl(total)}</b>
          </div>
          <button className="btn btn-accent" disabled={!lines.length} onClick={() => setSheet(true)}>Cobrar</button>
        </div>
      </div>

      {sheet && (
        <>
          <div className="sheet-backdrop" onClick={() => setSheet(false)} />
          <div className="sheet">{cartPanel}</div>
        </>
      )}

      <section className="mt-24">
        <div className="row between">
          <h2 className="section-title" style={{ margin: 0 }}>Vendas deste caixa</h2>
          <span className="chip">{units(deviceUnits, 'unidade')} · {brl(deviceTotal)}</span>
        </div>
        <div className="card mt-16">
          {history.length === 0 && <p className="muted small">Nenhuma venda neste aparelho ainda.</p>}
          {history.slice(0, 15).map((h) => (
            <div key={h.id} className={`pos-sale ${h.canceled || h.rejected ? 'off' : ''}`}>
              <div className="pos-sale-info">
                <span className="mono tiny muted">{hm(h.at, tz)} · {PAYMENT_LABEL[h.method]} · {h.synced ? 'enviada' : h.rejected ? 'recusada' : 'na fila'}</span>
                <span className="small">{h.items.map((i) => `${i.qty}× ${i.name}`).join(', ')}</span>
              </div>
              <b className="mono">{brl(h.total)}</b>
              {h.canceled ? <span className="status">cancelada</span> : h.rejected ? <span className="status needs_refund">recusada</span> : confirmId === h.id ? (
                <span className="row" style={{ gap: 6 }}>
                  <button type="button" className="btn btn-sm btn-danger" onClick={() => cancel(h)}>Confirmar</button>
                  <button type="button" className="btn btn-sm btn-ghost" onClick={() => setConfirmId(null)}>Não</button>
                </span>
              ) : canCancel || !h.synced ? (
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => setConfirmId(h.id)}>Cancelar</button>
              ) : null}
            </div>
          ))}
        </div>
      </section>

      <div className="row mt-16" style={{ flexWrap: 'wrap' }}>
        <button className="btn btn-ghost btn-sm" onClick={refreshCatalog}>Atualizar produtos</button>
        {canPanel && <Link className="btn btn-ghost btn-sm" href="/painel">Painel do bar</Link>}
        <form method="post" action="/api/logout"><button className="btn btn-ghost btn-sm"><Icon name="logout" size={16} />Sair</button></form>
      </div>
      {!canCancel && <p className="tiny muted mt-8">Venda ainda na fila pode ser cancelada aqui. Venda já enviada só o gerente do bar cancela.</p>}
      {queue.length > 0 && <p className="tiny muted mt-8">Vendas na fila ficam guardadas neste aparelho e são enviadas no próximo login.</p>}
      {me && <p className="tiny muted mt-8">Caixa: <b>{me.name}</b> · {ROLE_LABEL[me.role]}</p>}
      <p className="footer-note">ONE Ticket · Bar · funciona sem internet depois de aberto uma vez</p>
      {toast && <div className={`toast ${toast.err ? 'err' : ''}`} role="status">{toast.msg}</div>}
    </main>
  );
}
