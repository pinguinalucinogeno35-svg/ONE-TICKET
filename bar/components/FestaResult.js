import { brl } from '@/lib/format';

const pct = (a, b) => (b > 0 ? Math.round((a / b) * 100) : 0);
const n = (v) => Number(v || 0).toLocaleString('pt-BR');

// Resultado da festa: soma a bilheteria e o bar do mesmo evento (mesmo banco, dois sistemas).
export default function FestaResult({ data, links }) {
  const t = data.tickets || {};
  const b = data.bar || {};
  const tk = Number(t.collected_cents || 0);
  const bar = Number(b.revenue_cents || 0);
  const total = tk + bar;
  const paidSeats = Number(t.seats || 0) - Number(t.courtesy_seats || 0);
  const checkins = Number(data.checkins || 0);
  const margin = bar - Number(b.cost_cents || 0);
  const ext = (href) => (href.startsWith('http') ? { target: '_blank', rel: 'noopener' } : {});

  return (
    <>
      <section className="card">
        <p className="eyebrow">Faturamento bruto da festa</p>
        <b className="display res-total" style={{ display: 'block', marginTop: 8 }}>{brl(total)}</b>
        <div className="split" role="img" aria-label={`Ingressos ${pct(tk, total)}%, bar ${pct(bar, total)}%`}>
          <i className="s-tk" style={{ width: `${pct(tk, total)}%` }} />
          <i className="s-bar" style={{ width: `${total ? 100 - pct(tk, total) : 0}%` }} />
        </div>
        <div className="legend">
          <span><i style={{ background: 'var(--mark-2)' }} />Ingressos <b>{brl(tk)}</b> <span className="muted">· {pct(tk, total)}%</span></span>
          <span><i style={{ background: 'var(--accent)' }} />Bar <b>{brl(bar)}</b> <span className="muted">· {total ? 100 - pct(tk, total) : 0}%</span></span>
        </div>
      </section>

      <section className="kpis mt-16">
        <div className="card kpi"><span className="eyebrow">Pessoas que entraram</span><b>{n(checkins)}</b><span className="tiny muted">{pct(checkins, t.seats)}% dos {n(t.seats)} ingressos</span></div>
        <div className="card kpi"><span className="eyebrow">Gasto no bar por pessoa</span><b>{checkins ? brl(bar / checkins) : '—'}</b><span className="tiny muted">bar ÷ quem entrou</span></div>
        <div className="card kpi"><span className="eyebrow">Ingresso médio</span><b>{paidSeats > 0 ? brl(tk / paidSeats) : '—'}</b><span className="tiny muted">sem contar cortesias</span></div>
        <div className="card kpi"><span className="eyebrow">Margem do bar</span><b>{brl(margin)}</b><span className="tiny muted">{pct(margin, bar)}% sobre o faturamento</span></div>
      </section>

      <div className="grid-2 mt-16">
        <section className="card">
          <div className="row between"><p className="display" style={{ fontSize: 24 }}>Bilheteria</p><a className="btn btn-ghost btn-sm" href={links.tickets} {...ext(links.tickets)}>Abrir</a></div>
          <div className="res-lines small">
            <div><span>Arrecadado (pedidos pagos)</span><b>{brl(tk)}</b></div>
            <div><span>Pedidos pagos</span><b>{n(t.orders)}</b></div>
            <div><span>Ingressos emitidos</span><b>{n(t.seats)}</b></div>
            <div><span>Cortesias</span><b>{n(t.courtesy_seats)}</b></div>
            <div><span>Entradas na portaria</span><b>{n(checkins)}</b></div>
          </div>
        </section>
        <section className="card">
          <div className="row between"><p className="display" style={{ fontSize: 24 }}>Bar</p><a className="btn btn-ghost btn-sm" href={links.bar} {...ext(links.bar)}>Abrir</a></div>
          <div className="res-lines small">
            <div><span>Faturamento</span><b>{brl(bar)}</b></div>
            <div><span>Custo dos produtos vendidos</span><b>{brl(b.cost_cents)}</b></div>
            <div><span>Margem bruta</span><b>{brl(margin)}</b></div>
            <div><span>Unidades vendidas</span><b>{n(b.units)}</b></div>
            <div><span>Vendas</span><b>{n(b.sales)}</b></div>
          </div>
        </section>
      </div>
      <p className="tiny muted mt-16">
        Valores brutos. Ainda não descontam a taxa do meio de pagamento [TAXA DO MERCADO PAGO], as maquininhas do bar [TAXA DAS MAQUININHAS]
        nem os custos fixos da festa [CACHÊS, LOCAÇÃO, EQUIPE]. O custo do bar usa o custo unitário cadastrado em cada produto.
      </p>
    </>
  );
}
