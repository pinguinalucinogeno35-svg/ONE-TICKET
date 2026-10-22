'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Brand from './Brand';
import AdminNav from './AdminNav';
import { brl } from '@/lib/format';
import { units, caseEq, PAYMENT_LABEL, hm } from '@/lib/units';

// Converte um instante para "minutos no relógio local do evento" (mesma régua das horas do by_hour)
function localMinutes(iso, tz) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) / 60000;
}
function hourKeyMinutes(key) {
  const [d, t] = key.split('T');
  const [y, m, day] = d.split('-').map(Number);
  return Date.UTC(y, m - 1, day, Number(t.slice(0, 2))) / 60000;
}
const pct = (a, b) => (b > 0 ? Math.round((a / b) * 100) : 0);

// Eixo por hora (categórico): horas sem venda dentro de um mesmo bloco viram barra zero;
// buracos grandes (ex.: venda de teste em outro dia) viram uma quebra, sem esmagar o gráfico.
function buildSlots(byHour) {
  const out = [];
  byHour.forEach((h) => {
    const m = hourKeyMinutes(h.hour);
    const prev = out.length ? out[out.length - 1] : null;
    if (prev && prev.m !== undefined) {
      const gap = m - prev.m;
      if (gap > 60 && gap <= 180) for (let g = prev.m + 60; g < m; g += 60) out.push({ m: g, units: 0, revenue_cents: 0, hour: null });
      else if (gap > 180) out.push({ brk: true });
    }
    out.push({ ...h, m });
  });
  return out;
}

function HourChart({ byHour, shows, tz }) {
  const [hover, setHover] = useState(null);
  if (!byHour.length) return <p className="muted small mt-16">Sem vendas ainda. Assim que o PDV registrar, o gráfico aparece aqui.</p>;
  const slots = buildSlots(byHour);
  const W = 720; const H = 260; const top = 44; const bottom = 34; const left = 8; const right = 8;
  const slot = (W - left - right) / slots.length;
  const bw = Math.max(6, Math.min(56, slot - 10));
  const sx = (i) => left + i * slot;
  // posição (em slots) de um instante local; cai no próximo slot se estiver num buraco
  const pos = (m) => {
    for (let i = 0; i < slots.length; i += 1) {
      const sl = slots[i];
      if (sl.brk) continue;
      if (m < sl.m) return i;
      if (m < sl.m + 60) return i + (m - sl.m) / 60;
    }
    return slots.length;
  };
  const max = Math.max(1, ...byHour.map((h) => h.units));
  const y = (v) => top + (1 - v / max) * (H - top - bottom);
  const bands = shows.map((sh) => ({ ...sh, a: pos(localMinutes(sh.starts_at, tz)), b: pos(localMinutes(sh.ends_at, tz)) }))
    .filter((sh) => sh.b > sh.a);
  const peak = byHour.reduce((a, b) => (b.units > a.units ? b : a), byHour[0]);
  const label = (m) => { const d = new Date(m * 60000); return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`; };

  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label="Unidades vendidas por hora, com os shows do line-up">
        {bands.map((sh, i) => (
          <g key={sh.id}>
            <rect x={sx(sh.a)} y={20} width={sx(sh.b) - sx(sh.a)} height={H - bottom - 20} fill={i % 2 ? 'var(--band-b)' : 'var(--band-a)'} />
            <line x1={sx(sh.a)} x2={sx(sh.a)} y1={4} y2={H - bottom} stroke="var(--line-strong)" strokeDasharray="2 3" />
            <text x={sx(sh.a) + 6} y={14} className="chart-band-label">{sh.artist}</text>
          </g>
        ))}
        <line x1={left} x2={W - right} y1={H - bottom} y2={H - bottom} stroke="var(--line-strong)" />
        {slots.map((h, i) => {
          const cx = sx(i) + slot / 2;
          if (h.brk) return <path key={`b${i}`} className="chart-gap" d={`M${cx - 6},${H - bottom + 5} l4,-10 M${cx + 2},${H - bottom + 5} l4,-10`} />;
          const first = i === 0 || slots[i - 1].brk;
          const isPeak = h.hour === peak.hour;
          return (
            <g key={h.m} onMouseEnter={() => setHover({ ...h, i })} onMouseLeave={() => setHover(null)} onFocus={() => setHover({ ...h, i })} onBlur={() => setHover(null)} tabIndex={0}>
              <rect x={sx(i)} y={top} width={slot} height={H - bottom - top} fill="transparent" />
              {h.units > 0 && (
                <path d={`M${cx - bw / 2},${H - bottom} V${y(h.units) + 4} q0,-4 4,-4 H${cx + bw / 2 - 4} q4,0 4,4 V${H - bottom} Z`}
                      fill="var(--accent)" opacity={hover && hover.m !== h.m ? 0.45 : 1} />
              )}
              {isPeak && <text x={cx} y={y(h.units) - 6} textAnchor="middle" className="chart-value">{h.units.toLocaleString('pt-BR')}</text>}
              <text x={cx} y={H - bottom + 15} textAnchor="middle" className="chart-axis">{String(new Date(h.m * 60000).getUTCHours()).padStart(2, '0')}h</text>
              {first && <text x={cx} y={H - 4} textAnchor="middle" className="chart-axis">{label(h.m)}</text>}
            </g>
          );
        })}
      </svg>
      {hover && (
        <div className="chart-tip" style={{ left: `${((sx(hover.i) + slot / 2) / W) * 100}%` }}>
          <b>{String(new Date(hover.m * 60000).getUTCHours()).padStart(2, '0')}h–{String((new Date(hover.m * 60000).getUTCHours() + 1) % 24).padStart(2, '0')}h</b>
          <span>{units(hover.units, 'unidade')}</span>
          <span>{brl(hover.revenue_cents)}</span>
        </div>
      )}
    </div>
  );
}

export default function BarDashboard({ data }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => router.refresh(), 15000);
    return () => clearInterval(t);
  }, [router]);

  const best = useMemo(() => (data?.shows || []).reduce((a, s) => (!a || s.revenue_cents > a.revenue_cents ? s : a), null), [data]);
  if (!data) return <main className="shell-wide"><Brand /><p>Evento não encontrado.</p></main>;

  const { event: e, summary: s, shows, ranking, products, by_payment: pay, recent } = data;
  const tz = e.timezone || 'America/Sao_Paulo';
  const profit = s.revenue_cents - s.cost_cents;
  const festa = (data.tickets_cents || 0) + s.revenue_cents;
  const payTotal = pay.reduce((a, p) => a + p.revenue_cents, 0);

  return (
    <main className="shell-wide">
      <Brand href="/painel" right={<form method="post" action="/api/logout"><button className="btn btn-ghost btn-sm">Sair</button></form>} />
      <div className="row between" style={{ flexWrap: 'wrap', gap: 12 }}>
        <div>
          <p className="eyebrow">Bar · {e.name}</p>
          <h1 className="display" style={{ fontSize: 44, marginTop: 6 }}>Painel do bar</h1>
        </div>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <Link className="btn btn-accent btn-sm" href="/pdv">Abrir PDV</Link>
          <Link className="btn btn-ghost btn-sm" href="/painel/cadastro">Produtos e line-up</Link>
        </div>
      </div>
      <AdminNav current="/painel" />

      <div className="demo-note">Dados simulados de uma noite. Tudo é contado em unidades vendidas; a caixa (≈ cx) aparece só como referência de compra.</div>

      <section className="kpis mt-16">
        <div className="card kpi"><span className="eyebrow">Faturamento do bar</span><b className="accent">{brl(s.revenue_cents)}</b><span className="tiny muted">{s.sales.toLocaleString('pt-BR')} vendas{s.canceled_sales ? ` · ${s.canceled_sales} canceladas` : ''}</span></div>
        <div className="card kpi"><span className="eyebrow">Lucro bruto</span><b>{brl(profit)}</b><span className="tiny muted">margem {pct(profit, s.revenue_cents)}% sobre o custo cadastrado</span></div>
        <div className="card kpi"><span className="eyebrow">Unidades vendidas</span><b>{s.units.toLocaleString('pt-BR')}</b><span className="tiny muted">garrafas, latas e long necks</span></div>
        <div className="card kpi"><span className="eyebrow">Ticket médio</span><b>{brl(s.sales ? Math.round(s.revenue_cents / s.sales) : 0)}</b><span className="tiny muted">por venda no bar</span></div>
      </section>

      {data.tickets_cents != null && (
      <section className="card mt-16 festa">
        <div>
          <p className="eyebrow">Resultado da festa</p>
          <p className="display festa-total">{brl(festa)}</p>
        </div>
        <div className="festa-split">
          <div className="capbar" role="img" aria-label={`Ingressos ${pct(data.tickets_cents, festa)}%, bar ${pct(s.revenue_cents, festa)}%`}>
            <i style={{ width: `${pct(data.tickets_cents, festa)}%`, background: 'var(--mark-2)' }} />
            <i style={{ width: `${pct(s.revenue_cents, festa)}%`, background: 'var(--accent)' }} />
          </div>
          <div className="legend">
            <span><i style={{ background: 'var(--mark-2)' }} />Ingressos {brl(data.tickets_cents)} · {pct(data.tickets_cents, festa)}%</span>
            <span><i style={{ background: 'var(--accent)' }} />Bar {brl(s.revenue_cents)} · {pct(s.revenue_cents, festa)}%</span>
          </div>
          <p className="tiny muted mt-8">Receita bruta, somando os dois sistemas. <Link href="/resultado">Ver resultado completo</Link>.</p>
        </div>
      </section>
      )}

      <section className="card mt-16">
        <div className="row between" style={{ flexWrap: 'wrap' }}>
          <p className="display" style={{ fontSize: 24 }}>Vendas por hora</p>
          <span className="tiny muted">unidades · faixas = shows do line-up</span>
        </div>
        <HourChart byHour={data.by_hour} shows={shows} tz={tz} />
      </section>

      <h2 className="section-title">Durante cada show</h2>
      {shows.length === 0 && <p className="muted small">Cadastre o line-up para cruzar as vendas com os shows.</p>}
      <div className="show-grid">
        {shows.map((sh) => {
          const top = sh.top[0]?.units || 1;
          return (
            <article key={sh.id} className={`card show-card ${best && best.id === sh.id && sh.revenue_cents > 0 ? 'card-accent' : ''}`}>
              <div className="row between" style={{ alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <div>
                  <p className="show-artist">{sh.artist}</p>
                  <p className="mono tiny muted mt-8">{hm(sh.starts_at, tz)}–{hm(sh.ends_at, tz)} · {sh.stage}</p>
                </div>
                {best && best.id === sh.id && sh.revenue_cents > 0 && <span className="chip chip-accent">Maior faturamento</span>}
              </div>
              <div className="show-kpis">
                <div><b>{brl(sh.revenue_cents)}</b><span className="tiny muted">faturado</span></div>
                <div><b>{sh.units.toLocaleString('pt-BR')}</b><span className="tiny muted">unidades</span></div>
                <div><b>{sh.sales.toLocaleString('pt-BR')}</b><span className="tiny muted">vendas</span></div>
              </div>
              <p className="eyebrow mt-16">Mais vendidos no show</p>
              <ol className="show-top">
                {sh.top.map((t) => (
                  <li key={t.name}>
                    <div className="row between">
                      <span className="small"><b>{t.name}</b></span>
                      <span className="small mono">{units(t.units, t.unit_label)}</span>
                    </div>
                    <div className="hbar"><i style={{ width: `${Math.max(2, (t.units / top) * 100)}%` }} /></div>
                    <div className="row between"><span className="tiny muted">{caseEq(t.units, t.units_per_case)}</span><span className="tiny muted">{brl(t.revenue_cents)}</span></div>
                  </li>
                ))}
                {sh.top.length === 0 && <li className="muted small">Nenhuma venda neste horário.</li>}
              </ol>
            </article>
          );
        })}
      </div>
      {data.outside_shows.units > 0 && (
        <p className="tiny muted mt-8">Fora dos horários do line-up: {units(data.outside_shows.units, 'unidade')} · {brl(data.outside_shows.revenue_cents)}.</p>
      )}

      <div className="grid-2 mt-16">
        <section className="card">
          <p className="display" style={{ fontSize: 24 }}>Ranking de produtos</p>
          <div className="table-wrap mt-8">
            <table className="table">
              <thead><tr><th>#</th><th>Produto</th><th className="num">Vendido</th><th className="num">Receita</th><th className="num">Lucro</th></tr></thead>
              <tbody>
                {ranking.map((r, i) => (
                  <tr key={r.product_id}>
                    <td className="mono muted">{i + 1}</td>
                    <td><b>{r.name}</b><div className="tiny muted">{r.category}</div></td>
                    <td className="num">{units(r.units, r.unit_label)}<div className="tiny muted">{caseEq(r.units, r.units_per_case)}</div></td>
                    <td className="num">{brl(r.revenue_cents)}<div className="tiny muted">{pct(r.revenue_cents, s.revenue_cents)}%</div></td>
                    <td className="num">{brl(r.profit_cents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="card">
          <p className="display" style={{ fontSize: 24 }}>Pagamentos no bar</p>
          <div className="stack mt-16">
            {pay.map((p) => (
              <div key={p.method}>
                <div className="row between"><b>{PAYMENT_LABEL[p.method]}</b><span className="small mono">{brl(p.revenue_cents)} · {pct(p.revenue_cents, payTotal)}%</span></div>
                <div className="hbar"><i style={{ width: `${pct(p.revenue_cents, payTotal)}%` }} /></div>
                <span className="tiny muted">{p.sales.toLocaleString('pt-BR')} vendas</span>
              </div>
            ))}
            {pay.length === 0 && <p className="muted small">Sem vendas ainda.</p>}
          </div>
          <div className="demo-note mt-16">Confira no fechamento: o total em dinheiro deve bater com o caixa físico, e Pix e cartão com o extrato da maquininha.</div>
        </section>
      </div>

      <section className="card mt-16">
        <div className="row between" style={{ flexWrap: 'wrap' }}>
          <p className="display" style={{ fontSize: 24 }}>Estoque</p>
          <Link className="btn btn-ghost btn-sm" href="/painel/cadastro#estoque">Dar entrada</Link>
        </div>
        <div className="table-wrap mt-8">
          <table className="table">
            <thead><tr><th>Produto</th><th className="num">Entrou</th><th className="num">Vendido</th><th className="num">Restante</th><th>Situação</th></tr></thead>
            <tbody>
              {products.filter((p) => p.active).map((p) => {
                const st = p.stock_units < 0 ? ['needs_refund', 'Conferir: negativo'] : p.stock_units === 0 ? ['needs_refund', 'Acabou']
                  : p.stock_units <= p.low_stock_units ? ['pending', 'Estoque baixo'] : ['active', 'OK'];
                return (
                  <tr key={p.id}>
                    <td><b>{p.name}</b><div className="tiny muted">{p.units_per_case > 1 ? `caixa com ${p.units_per_case}` : 'vendido avulso'}</div></td>
                    <td className="num">{units(p.entered_units, p.unit_label)}</td>
                    <td className="num">{units(p.sold_units, p.unit_label)}</td>
                    <td className="num"><b>{units(p.stock_units, p.unit_label)}</b><div className="tiny muted">{caseEq(p.stock_units, p.units_per_case)}</div></td>
                    <td><span className={`status ${st[0]}`}>{st[1]}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card mt-16">
        <p className="display" style={{ fontSize: 24 }}>Últimas vendas recebidas</p>
        <div className="table-wrap mt-8">
          <table className="table">
            <thead><tr><th>Hora</th><th>Caixa</th><th>Itens</th><th>Pagamento</th><th className="num">Total</th></tr></thead>
            <tbody>
              {recent.map((r) => (
                <tr key={r.client_sale_id} className={r.canceled ? 'off' : ''}>
                  <td className="mono muted">{hm(r.sold_at, tz)}</td>
                  <td className="small">{r.device_id}</td>
                  <td className="small">{r.items}{r.canceled ? ' · cancelada' : ''}</td>
                  <td>{PAYMENT_LABEL[r.payment_method]}</td>
                  <td className="num">{brl(r.total_cents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <p className="footer-note">ONE Ticket · bar · atualiza a cada 15 segundos</p>
    </main>
  );
}
