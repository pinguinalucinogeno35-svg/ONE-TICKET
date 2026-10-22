'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Brand from './Brand';
import AdminNav from './AdminNav';
import { brl, dateLong, dateShort, STATUS_LABEL, VARIANT_LABEL } from '@/lib/format';

const BATCH_STATUS = { active: 'À venda', scheduled: 'Agendado', sold_out: 'Esgotado', closed: 'Encerrado' };

export default function DashboardClient({ data }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState('');

  useEffect(() => {
    const t = setInterval(() => router.refresh(), 15000);
    return () => clearInterval(t);
  }, [router]);

  if (!data) return <main className="shell-wide"><Brand /><p>Evento não encontrado.</p></main>;

  const { event: e, summary: s, batches, coupons, recent, by_variant: bv, checkins } = data;
  const courtesy = s.seats_courtesy;
  const paid = e.seats_sold - courtesy;
  const free = e.capacity - e.seats_sold - e.seats_reserved;
  const pct = (n) => `${(n / e.capacity) * 100}%`;
  const avg = paid > 0 ? Math.round(s.collected_cents / paid) : 0;

  async function advance(track, name) {
    if (!confirm(`Virar agora o ${name}? O próximo lote da trilha abre na hora.`)) return;
    setBusy(true);
    await fetch('/api/painel/virar', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ eventId: e.id, track }),
    });
    setBusy(false);
    router.refresh();
  }

  function copy(text, label) {
    navigator.clipboard?.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(''), 2000);
  }

  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  return (
    <main className="shell-wide">
      <Brand href="/painel" right={<form method="post" action="/api/logout"><button className="btn btn-ghost btn-sm">Sair</button></form>} />

      <div className="row between" style={{ flexWrap: 'wrap', gap: 12 }}>
        <div>
          <p className="eyebrow">Painel do produtor</p>
          <h1 className="display" style={{ fontSize: 48, marginTop: 6 }}>{e.name}</h1>
          <p className="muted small mt-8">{dateLong(e.starts_at)} · {e.venue_name}</p>
        </div>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <Link className="btn btn-accent btn-sm" href={`/e/${e.slug}`} target="_blank">Página de venda</Link>
          <button className="btn btn-ghost btn-sm" onClick={() => copy(`${origin}/e/${e.slug}?codigo=RELAMPAGO`, 'promo')}>
            {copied === 'promo' ? 'Link copiado' : 'Copiar link do promocional'}
          </button>
        </div>
      </div>

      <AdminNav current="/painel" />

      <section className="kpis">
        <div className="card kpi"><span className="eyebrow">Ingressos vendidos</span><b>{e.seats_sold}</b><span className="tiny muted">de {e.capacity} de capacidade</span></div>
        <div className="card kpi"><span className="eyebrow">Arrecadado</span><b className="accent">{brl(s.collected_cents)}</b><span className="tiny muted">ticket médio {brl(avg)}</span></div>
        <div className="card kpi"><span className="eyebrow">Reservas em aberto</span><b>{e.seats_reserved}</b><span className="tiny muted">aguardando pagamento</span></div>
        <div className="card kpi"><span className="eyebrow">Entradas na portaria</span><b>{checkins.accepted}</b><span className="tiny muted">{checkins.duplicate} tentativas duplicadas</span></div>
      </section>

      <section className="card mt-16">
        <div className="row between">
          <p className="display" style={{ fontSize: 24 }}>Capacidade</p>
          <span className="chip">{free} livres</span>
        </div>
        <div className="capbar" role="img" aria-label="Ocupação da capacidade">
          <i style={{ width: pct(paid), background: 'var(--accent)' }} />
          <i style={{ width: pct(courtesy), background: 'var(--mark-2)' }} />
          <i style={{ width: pct(e.seats_reserved), background: 'var(--warn)' }} />
        </div>
        <div className="legend">
          <span><i style={{ background: 'var(--accent)' }} />Pagos {paid}</span>
          <span><i style={{ background: 'var(--mark-2)' }} />Cortesias {courtesy}</span>
          <span><i style={{ background: 'var(--warn)' }} />Reservados {e.seats_reserved}</span>
          <span><i style={{ background: 'var(--surface-2)' }} />Livres {free}</span>
        </div>
        <p className="tiny muted mt-8">
          A soma de todos os lotes, casadinhas, promocionais e cortesias nunca passa de {e.capacity}. Meia-entrada: {e.half_sold} de {e.half_quota} da cota.
        </p>
      </section>

      <div className="grid-2 mt-16">
        <section className="card">
          <div className="row between">
            <p className="display" style={{ fontSize: 24 }}>Lotes</p>
            <Link className="btn btn-ghost btn-sm" href="/painel/lotes">Editar preços</Link>
          </div>
          <div className="stack mt-16">
            {batches.map((b) => {
              const p = Math.min(100, Math.round(((b.sold + b.reserved) / Math.max(1, b.quantity)) * 100));
              return (
                <div key={b.id}>
                  <div className="row between">
                    <div className="row">
                      <b>{b.name}</b>
                      <span className={`status ${b.status}`}>{BATCH_STATUS[b.status]}</span>
                      {b.visibility === 'link' && <span className="status">só por link</span>}
                    </div>
                    <span className="small">{brl(b.price_cents)}</span>
                  </div>
                  <div className={`progress ${p >= 85 ? 'hot' : ''}`} style={{ marginTop: 8 }}><i style={{ width: `${p}%` }} /></div>
                  <div className="row between mt-8">
                    <span className="tiny muted">{b.sold} vendidos · {b.reserved} reservados · {b.quantity} no lote{b.ends_at ? ` · vira ${dateShort(b.ends_at)}` : ''}</span>
                    {b.status === 'active' && (
                      <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => advance(b.track, b.name)}>Virar lote</button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="card">
          <p className="display" style={{ fontSize: 24 }}>Financeiro do evento</p>
          <div className="mt-16">
            <div className="summary-line"><span>Receita bruta de ingressos</span><span>{brl(s.gross_cents)}</span></div>
            <div className="summary-line"><span>Descontos de cupons</span><span>−{brl(s.discount_cents)}</span></div>
            <div className="summary-line"><span>Taxa de serviço</span><span>{brl(s.fee_cents)}</span></div>
            <div className="summary-line total"><span>Arrecadado</span><span className="accent">{brl(s.collected_cents)}</span></div>
          </div>
          <p className="eyebrow mt-24">Vendas por tipo</p>
          <div className="mt-8">
            {['inteira', 'meia', 'casadinha'].map((v) => (
              <div key={v} className="summary-line"><span>{VARIANT_LABEL[v]}</span><span>{bv[v] || 0} pessoas</span></div>
            ))}
          </div>
          <div className="demo-note mt-16">Despesas por categoria, resultado do evento e exportação para planilha entram na Fase 2.</div>
        </section>
      </div>

      <section className="card mt-16">
        <div className="row between">
          <p className="display" style={{ fontSize: 24 }}>Ranking de cupons</p>
          <Link className="btn btn-ghost btn-sm" href="/painel/cupons">Gerenciar cupons</Link>
        </div>
        <div className="table-wrap mt-8">
          <table className="table">
            <thead><tr><th>Cupom</th><th>Dono</th><th>Desconto</th><th className="num">Usos</th><th className="num">Pessoas</th><th className="num">Receita</th></tr></thead>
            <tbody>
              {coupons.map((c) => (
                <tr key={c.code}>
                  <td><b>{c.code}</b></td>
                  <td>{c.owner_name} <span className="tiny muted">· {{ influencer: 'influenciador', sponsor: 'patrocinador', promoter: 'promoter', other: 'produção' }[c.owner_kind]}</span></td>
                  <td>{c.kind === 'percent' ? `${c.value}%` : c.kind === 'fixed' ? brl(c.value) : 'Cortesia'}</td>
                  <td className="num">{c.used}{c.max_uses ? `/${c.max_uses}` : ''}</td>
                  <td className="num">{c.seats}</td>
                  <td className="num">{brl(c.revenue_cents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card mt-16">
        <p className="display" style={{ fontSize: 24 }}>Últimos pedidos</p>
        <div className="table-wrap mt-8">
          <table className="table">
            <thead><tr><th>Quando</th><th>Comprador</th><th className="num">Pessoas</th><th className="num">Total</th><th>Pagamento</th><th>Status</th></tr></thead>
            <tbody>
              {recent.map((o) => (
                <tr key={o.id}>
                  <td className="muted">{dateShort(o.created_at)}</td>
                  <td>{o.buyer_name}</td>
                  <td className="num">{o.seats}</td>
                  <td className="num">{brl(o.total_cents)}</td>
                  <td>{{ pix: 'Pix', card: 'Cartão', courtesy: 'Cortesia' }[o.payment_method]}</td>
                  <td><span className={`status ${o.status}`}>{STATUS_LABEL[o.status]}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <p className="footer-note">ONE Ticket · atualiza a cada 15 segundos · dados de demonstração</p>
    </main>
  );
}
