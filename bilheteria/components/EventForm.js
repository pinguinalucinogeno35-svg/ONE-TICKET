'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Brand from './Brand';
import AdminNav from './AdminNav';
import { EVENT_STATUS, EVENT_STATUS_CLASS, eventAction } from './EventsAdmin';
import { toLocalInput, fromLocalInput } from '@/lib/money';

const AGES = [['', 'Não informar'], ['L', 'Livre'], ['10', '10 anos'], ['12', '12 anos'], ['14', '14 anos'], ['16', '16 anos'], ['18', '18 anos']];
const POLICY = 'Cancelamento com reembolso em até 7 dias após a compra, desde que pedido até 48 horas antes do início do evento (Código de Defesa do Consumidor, art. 49). Depois disso, o ingresso pode ser transferido para outra pessoa pela página do ingresso.';

const toSlug = (name) => name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/, '');

function initial(ev) {
  const s = (v) => (v === null || v === undefined ? '' : String(v));
  return {
    name: s(ev?.name), slug: s(ev?.slug), starts_at: toLocalInput(ev?.starts_at), ends_at: toLocalInput(ev?.ends_at),
    age_rating: s(ev?.age_rating), venue_name: s(ev?.venue_name), address: s(ev?.address), city: s(ev?.city), state: s(ev?.state),
    capacity: s(ev?.capacity), half_quota: s(ev?.half_quota), max_seats_per_order: s(ev?.max_seats_per_order ?? 8),
    image_url: s(ev?.image_url), description: s(ev?.description), cancel_policy: ev ? s(ev.cancel_policy) : POLICY,
    producer_name: s(ev?.producer_name), producer_about: s(ev?.producer_about), contact: s(ev?.contact),
  };
}

export default function EventForm({ event = null, panel = null }) {
  const router = useRouter();
  const isNew = !event;
  const [f, setF] = useState(() => initial(event));
  const [slugTouched, setSlugTouched] = useState(!isNew);
  const [halfTouched, setHalfTouched] = useState(!isNew);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);
  const sold = event ? event.seats_sold + event.seats_reserved : 0;
  const halfMin = event ? event.half_sold + event.half_reserved : 0;
  const slugLocked = !!event?.has_orders;

  function notify(msg, err = false) {
    setToast({ msg, err });
    setTimeout(() => setToast(null), 3600);
  }

  const set = (k) => (e) => {
    const v = e.target.value;
    setF((old) => {
      const next = { ...old, [k]: v };
      if (k === 'name' && !slugTouched) next.slug = toSlug(v);
      if (k === 'slug') next.slug = v.toLowerCase().replace(/[^a-z0-9-]/g, '');
      if (k === 'state') next.state = v.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2);
      if (k === 'capacity' && !halfTouched) { const c = parseInt(v, 10); next.half_quota = c > 0 ? String(Math.floor(c * 0.4)) : ''; }
      return next;
    });
    if (k === 'slug') setSlugTouched(true);
    if (k === 'half_quota') setHalfTouched(true);
  };

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const data = { ...f, starts_at: fromLocalInput(f.starts_at), ends_at: fromLocalInput(f.ends_at) };
      const slugChanged = !isNew && f.slug !== event.slug;
      const r = await eventAction({ action: 'salvar', id: event?.id || null, data, openInPanel: slugChanged && panel === event.slug });
      if (isNew) {
        router.push(`/painel/eventos/${r.id}`);
        return;
      }
      notify('Evento salvo.');
      router.refresh();
    } catch (err) { notify(err.message, true); }
    setBusy(false);
  }

  async function run(payload, msg, confirmText) {
    if (confirmText && !confirm(confirmText)) return;
    setBusy(true);
    try {
      await eventAction(payload);
      notify(msg);
      router.refresh();
    } catch (err) { notify(err.message, true); }
    setBusy(false);
  }

  const status = event?.status;
  const changed = isNew || JSON.stringify(f) !== JSON.stringify(initial(event));

  return (
    <main className="shell-wide">
      <Brand href="/painel" right={<form method="post" action="/api/logout"><button className="btn btn-ghost btn-sm">Sair</button></form>} />
      <p className="eyebrow"><Link href="/painel/eventos">Eventos</Link> · {isNew ? 'novo' : event.name}</p>
      <h1 className="display" style={{ fontSize: 44, marginTop: 6 }}>{isNew ? 'Novo evento' : 'Editar evento'}</h1>
      <AdminNav current="/painel/eventos" />

      {!isNew && (
        <section className="card mt-16">
          <div className="row between" style={{ flexWrap: 'wrap' }}>
            <div className="row" style={{ flexWrap: 'wrap' }}>
              <span className={`status ${EVENT_STATUS_CLASS[status]}`}>{EVENT_STATUS[status]}</span>
              {event.is_current && <span className="status active">Evento da noite</span>}
              {panel === event.slug && <span className="status">Aberto no painel</span>}
            </div>
            <a href={`/e/${event.slug}`} target="_blank" rel="noopener" className="btn btn-ghost btn-sm">
              {status === 'draft' ? 'Ver prévia' : 'Ver página'}
            </a>
          </div>
          {event.active_batches === 0 && (
            <p className="small mt-16">
              Ainda não há lote à venda. {panel === event.slug
                ? <Link href="/painel/lotes" className="accent">Criar lotes e preços</Link>
                : <button type="button" className="accent" style={{ fontWeight: 600 }} disabled={busy}
                          onClick={() => eventAction({ action: 'painel', slug: event.slug }).then(() => router.push('/painel/lotes'))}>
                    Abrir no painel e criar lotes
                  </button>}
            </p>
          )}
          <div className="row mt-16" style={{ gap: 8, flexWrap: 'wrap' }}>
            {(status === 'draft' || status === 'paused' || status === 'closed') && (
              <button type="button" className="btn btn-accent btn-sm" disabled={busy}
                      onClick={() => run({ action: 'status', id: event.id, status: 'on_sale' }, 'Vendas abertas.',
                        status === 'draft' ? 'Publicar e abrir as vendas? A página fica visível para o público.' : null)}>
                {status === 'draft' ? 'Publicar e abrir vendas' : 'Reabrir vendas'}
              </button>
            )}
            {status === 'on_sale' && (
              <button type="button" className="btn btn-ghost btn-sm" disabled={busy}
                      onClick={() => run({ action: 'status', id: event.id, status: 'paused' }, 'Vendas pausadas.')}>
                Pausar vendas
              </button>
            )}
            {(status === 'on_sale' || status === 'paused') && (
              <button type="button" className="btn btn-ghost btn-sm" disabled={busy}
                      onClick={() => run({ action: 'status', id: event.id, status: 'closed' }, 'Vendas encerradas.',
                        'Encerrar as vendas deste evento? Dá para reabrir depois.')}>
                Encerrar vendas
              </button>
            )}
            {status !== 'draft' && !event.has_orders && (
              <button type="button" className="btn btn-ghost btn-sm" disabled={busy}
                      onClick={() => run({ action: 'status', id: event.id, status: 'draft' }, 'Evento voltou para rascunho.')}>
                Voltar para rascunho
              </button>
            )}
            {!event.is_current && (
              <button type="button" className="btn btn-ghost btn-sm" disabled={busy}
                      onClick={() => run({ action: 'noite', id: event.id }, 'Agora este é o evento da noite.',
                        'Usar este evento na portaria, no bar e no endereço principal? Quem estiver com a portaria ou o PDV aberto precisa recarregar a tela.')}>
                Usar como evento da noite
              </button>
            )}
          </div>
        </section>
      )}

      <form onSubmit={save}>
        <h2 className="section-title">O evento</h2>
        <div className="card">
          <div className="grid-form">
            <div className="field"><label htmlFor="ev-name">Nome</label>
              <input id="ev-name" className="input" value={f.name} onChange={set('name')} required minLength={3} maxLength={120} placeholder="Sexta no Bosque" /></div>
            <div className="field"><label htmlFor="ev-slug">Endereço da página</label>
              <input id="ev-slug" className="input mono" value={f.slug} onChange={set('slug')} required minLength={3} maxLength={60}
                     disabled={slugLocked} placeholder="sexta-no-bosque" /></div>
            <div className="field"><label htmlFor="ev-age">Classificação etária</label>
              <select id="ev-age" className="input" value={f.age_rating} onChange={set('age_rating')}>
                {AGES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select></div>
          </div>
          <p className="tiny muted mt-8">
            Link de venda: <span className="mono">/e/{f.slug || '…'}</span>
            {slugLocked && ' · não muda depois da primeira venda'}
          </p>
          <div className="grid-form mt-16">
            <div className="field"><label htmlFor="ev-start">Início</label>
              <input id="ev-start" className="input mono" type="datetime-local" value={f.starts_at} onChange={set('starts_at')} required /></div>
            <div className="field"><label htmlFor="ev-end">Término</label>
              <input id="ev-end" className="input mono" type="datetime-local" value={f.ends_at} onChange={set('ends_at')} min={f.starts_at || undefined} /></div>
          </div>
        </div>

        <h2 className="section-title">Local</h2>
        <div className="card">
          <div className="grid-form">
            <div className="field"><label htmlFor="ev-venue">Nome do local</label>
              <input id="ev-venue" className="input" value={f.venue_name} onChange={set('venue_name')} maxLength={120} placeholder="Bosque Bar" /></div>
            <div className="field"><label htmlFor="ev-address">Endereço</label>
              <input id="ev-address" className="input" value={f.address} onChange={set('address')} maxLength={200} placeholder="Rua, número, bairro" /></div>
          </div>
          <div className="grid-form mt-16">
            <div className="field"><label htmlFor="ev-city">Cidade</label>
              <input id="ev-city" className="input" value={f.city} onChange={set('city')} maxLength={80} /></div>
            <div className="field"><label htmlFor="ev-state">UF</label>
              <input id="ev-state" className="input mono" value={f.state} onChange={set('state')} maxLength={2} placeholder="RJ" /></div>
          </div>
        </div>

        <h2 className="section-title">Lotação</h2>
        <div className="card">
          <div className="grid-form">
            <div className="field"><label htmlFor="ev-cap">Capacidade{sold ? ` (mín. ${sold})` : ''}</label>
              <input id="ev-cap" className="input mono" type="number" min={Math.max(sold, 1)} value={f.capacity} onChange={set('capacity')} required placeholder="[CAPACIDADE DO LOCAL]" /></div>
            <div className="field"><label htmlFor="ev-half">Cota de meia-entrada{halfMin ? ` (mín. ${halfMin})` : ''}</label>
              <input id="ev-half" className="input mono" type="number" min={halfMin} max={f.capacity || undefined} value={f.half_quota} onChange={set('half_quota')} /></div>
            <div className="field"><label htmlFor="ev-max">Máximo por compra</label>
              <input id="ev-max" className="input mono" type="number" min={1} max={20} value={f.max_seats_per_order} onChange={set('max_seats_per_order')} required /></div>
          </div>
          <p className="tiny muted mt-8">A Lei 12.933/2013 garante 40% da lotação para meia-entrada (estudante, PCD e jovem de baixa renda). A cota já vem calculada. Idosos têm meia sem limite (Estatuto do Idoso). Confirme a regra do seu estado com o jurídico.</p>
        </div>

        <h2 className="section-title">Página do evento</h2>
        <div className="card">
          <div className="field"><label htmlFor="ev-img">Imagem de capa (link https)</label>
            <input id="ev-img" className="input" type="url" inputMode="url" value={f.image_url} onChange={set('image_url')} maxLength={500} placeholder="https://…" /></div>
          {/^https:\/\//.test(f.image_url) && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={f.image_url} alt="Prévia da capa" className="event-cover mt-16" />
          )}
          <div className="field mt-16"><label htmlFor="ev-desc">Descrição</label>
            <textarea id="ev-desc" className="input" rows={7} value={f.description} onChange={set('description')} maxLength={6000}
                      placeholder="Line-up, horários, dress code, o que pode e o que não pode levar…" /></div>
          <div className="field mt-16"><label htmlFor="ev-policy">Política de cancelamento</label>
            <textarea id="ev-policy" className="input" rows={4} value={f.cancel_policy} onChange={set('cancel_policy')} maxLength={2000} /></div>
          {f.cancel_policy !== POLICY && (
            <button type="button" className="tiny accent mt-8" style={{ fontWeight: 600 }} onClick={() => setF({ ...f, cancel_policy: POLICY })}>
              Usar o texto padrão (7 dias, Código de Defesa do Consumidor)
            </button>
          )}
        </div>

        <h2 className="section-title">Quem produz</h2>
        <div className="card">
          <div className="grid-form">
            <div className="field"><label htmlFor="ev-prod">Produtora</label>
              <input id="ev-prod" className="input" value={f.producer_name} onChange={set('producer_name')} maxLength={120} /></div>
            <div className="field"><label htmlFor="ev-contact">Contato (e-mail ou WhatsApp)</label>
              <input id="ev-contact" className="input" value={f.contact} onChange={set('contact')} maxLength={160} placeholder="contato@produtora.com.br" /></div>
          </div>
          <div className="field mt-16"><label htmlFor="ev-about">Sobre a produtora</label>
            <textarea id="ev-about" className="input" rows={3} value={f.producer_about} onChange={set('producer_about')} maxLength={2000} /></div>
        </div>

        <div className="row between mt-16" style={{ flexWrap: 'wrap' }}>
          <span className="tiny muted">{isNew ? 'O evento nasce como rascunho. Depois crie os lotes e publique.' : 'Mudanças valem na hora para a página do evento.'}</span>
          <button className="btn btn-accent" disabled={busy || !changed}>{busy ? 'Salvando…' : isNew ? 'Criar evento' : 'Salvar evento'}</button>
        </div>
      </form>

      <p className="footer-note">Alterações ficam registradas no histórico</p>
      {toast && <div className={`toast ${toast.err ? 'err' : ''}`} role="status">{toast.msg}</div>}
    </main>
  );
}
