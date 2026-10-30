'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import Brand from './Brand';
import { brl } from '@/lib/format';

const day = (iso) => new Date(iso).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short', timeZone: 'America/Sao_Paulo' }).replace('.', '');
const hour = (iso) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
const year = (iso) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'America/Sao_Paulo' }).replace('.', '');
const norm = (t) => (t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function Cover({ ev, past }) {
  if (ev.image_url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={ev.image_url} alt="" className="event-card-cover" loading="lazy" />;
  }
  return (
    <div className={`event-card-cover cover-empty ${past ? 'past' : ''}`} aria-hidden="true">
      <span>{new Date(ev.starts_at).toLocaleDateString('pt-BR', { day: '2-digit', timeZone: 'America/Sao_Paulo' })}</span>
      <small>{new Date(ev.starts_at).toLocaleDateString('pt-BR', { month: 'short', timeZone: 'America/Sao_Paulo' }).replace('.', '')}</small>
    </div>
  );
}

function tag(ev) {
  if (ev.status === 'paused') return ['Vendas pausadas', ''];
  if (ev.status === 'closed') return ['Vendas encerradas', ''];
  if (ev.sold_out) return ['Esgotado', 'needs_refund'];
  return ['À venda', 'active'];
}

function EventCard({ ev, past = false }) {
  const [label, cls] = tag(ev);
  const where = [ev.venue_name, ev.city].filter(Boolean).join(' · ');
  return (
    <Link href={`/e/${ev.slug}`} className={`event-card ${past ? 'past' : ''}`}>
      <Cover ev={ev} past={past} />
      <div className="event-card-body">
        <p className="eyebrow">{past ? year(ev.starts_at) : `${day(ev.starts_at)} · ${hour(ev.starts_at)}`}</p>
        <p className="event-card-name">{ev.name}</p>
        {where && <p className="muted small">{where}</p>}
        {!past && (
          <div className="row between mt-16">
            <span className={`status ${cls}`}>{label}</span>
            {ev.status === 'on_sale' && !ev.sold_out && ev.min_price_cents !== null && (
              <span className="small">a partir de <b>{brl(ev.min_price_cents)}</b></span>
            )}
          </div>
        )}
      </div>
    </Link>
  );
}

export default function Showcase({ upcoming, past, salesHref }) {
  const [q, setQ] = useState('');
  const match = (ev) => !q.trim() || norm(`${ev.name} ${ev.venue_name} ${ev.city} ${ev.producer_name}`).includes(norm(q.trim()));
  const up = useMemo(() => upcoming.filter(match), [upcoming, q]); // eslint-disable-line react-hooks/exhaustive-deps
  const old = useMemo(() => past.filter(match), [past, q]); // eslint-disable-line react-hooks/exhaustive-deps
  const total = upcoming.length + past.length;

  return (
    <main className="shell-wide">
      <Brand right={<Link href="/entrar" className="btn btn-ghost btn-sm">Entrar</Link>} />

      <section className="hero showcase-hero">
        <p className="eyebrow">Ingressos para festas</p>
        <h1 className="display showcase-title">Escolha a sua <span>próxima festa.</span></h1>
        <p className="muted mt-8">Compre com Pix ou cartão e entre com o QR code no celular. Funciona até sem internet na porta.</p>
        {total > 0 && (
          <input className="input mt-24 showcase-search" type="search" placeholder="Buscar por festa, local ou cidade"
                 aria-label="Buscar eventos" value={q} onChange={(e) => setQ(e.target.value)} />
        )}
      </section>

      <h2 className="section-title">Próximos eventos</h2>
      {up.length ? (
        <div className="event-grid">{up.map((ev) => <EventCard key={ev.id} ev={ev} />)}</div>
      ) : (
        <div className="card muted small">{q ? 'Nenhum evento encontrado com essa busca.' : 'Nenhum evento à venda agora. Volte em breve.'}</div>
      )}

      {old.length > 0 && (
        <>
          <h2 className="section-title">Já aconteceram</h2>
          <div className="event-grid compact">{old.map((ev) => <EventCard key={ev.id} ev={ev} past />)}</div>
        </>
      )}

      <section className="card card-accent producers mt-32" id="produtores">
        <p className="eyebrow">Para produtores</p>
        <h2 className="display producers-title">Venda ingressos e controle o bar da sua festa no mesmo sistema.</h2>
        <ol className="producers-list">
          <li><b>Cadastre a festa</b><span>Página do evento, lotes com virada automática, meia-entrada e cupons.</span></li>
          <li><b>Venda e confira na porta</b><span>Pix e cartão, QR code assinado e portaria que funciona sem internet.</span></li>
          <li><b>Feche a noite com números</b><span>PDV do bar, estoque e resultado da festa: ingressos e bar juntos.</span></li>
        </ol>
        <div className="row mt-24" style={{ gap: 8, flexWrap: 'wrap' }}>
          {salesHref && <a href={salesHref} target="_blank" rel="noopener" className="btn btn-accent">Quero vender minha festa</a>}
          <Link href="/entrar?next=/painel/eventos" className="btn btn-ghost">Já sou produtor · entrar</Link>
        </div>
      </section>

      <p className="footer-note">ONE Ticket · ingressos e bar para festas</p>
    </main>
  );
}
