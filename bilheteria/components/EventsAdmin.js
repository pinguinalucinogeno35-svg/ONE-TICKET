'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Brand from './Brand';
import AdminNav from './AdminNav';
import { dateShort } from '@/lib/format';

export const EVENT_STATUS = { draft: 'Rascunho', on_sale: 'À venda', paused: 'Pausado', closed: 'Encerrado' };
export const EVENT_STATUS_CLASS = { draft: '', on_sale: 'active', paused: 'pending', closed: '' };

export async function eventAction(payload) {
  const res = await fetch('/api/painel/evento', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || 'Não foi possível salvar.');
  return data;
}

export default function EventsAdmin({ events, panel }) {
  const router = useRouter();
  const [toast, setToast] = useState(null);
  const [busy, setBusy] = useState(false);
  const night = events.find((e) => e.is_current);

  function notify(msg, err = false) {
    setToast({ msg, err });
    setTimeout(() => setToast(null), 3200);
  }

  async function run(payload, msg, go) {
    setBusy(true);
    try {
      await eventAction(payload);
      notify(msg);
      if (go) router.push(go); else router.refresh();
    } catch (err) { notify(err.message, true); }
    setBusy(false);
  }

  return (
    <main className="shell-wide">
      <Brand href="/painel" right={<form method="post" action="/api/logout"><button className="btn btn-ghost btn-sm">Sair</button></form>} />
      <p className="eyebrow">Painel do produtor</p>
      <h1 className="display" style={{ fontSize: 44, marginTop: 6 }}>Eventos</h1>
      <AdminNav current="/painel/eventos" />

      <div className="demo-note">
        <b>Evento da noite</b> é o que a portaria, o bar e o endereço principal usam{night ? <>: agora, <b>{night.name}</b></> : ''}.
        <b> Abrir no painel</b> só troca o evento das abas do painel neste aparelho, para preparar a próxima festa sem mexer na operação.
      </div>

      <div className="row between mt-16" style={{ flexWrap: 'wrap' }}>
        <h2 className="section-title" style={{ margin: 0 }}>Seus eventos</h2>
        <Link href="/painel/eventos/novo" className="btn btn-accent btn-sm">Novo evento</Link>
      </div>

      {events.length === 0 ? (
        <p className="muted mt-16">Nenhum evento ainda. Crie o primeiro.</p>
      ) : (
        <div className="table-wrap card mt-16">
          <table className="table">
            <thead>
              <tr><th>Evento</th><th>Data</th><th>Situação</th><th className="num">Vendidos</th><th /></tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id}>
                  <td>
                    <Link href={`/painel/eventos/${e.id}`}><b>{e.name}</b></Link>
                    <div className="tiny muted mono">/e/{e.slug}{e.venue_name ? ` · ${e.venue_name}` : ''}</div>
                    <div className="row mt-8" style={{ gap: 6, flexWrap: 'wrap' }}>
                      {e.is_current && <span className="status active">Evento da noite</span>}
                      {e.slug === panel && <span className="status">Aberto no painel</span>}
                      {e.active_batches === 0 && <span className="status needs_refund">Sem lote à venda</span>}
                    </div>
                  </td>
                  <td className="mono small">{dateShort(e.starts_at)}</td>
                  <td><span className={`status ${EVENT_STATUS_CLASS[e.status]}`}>{EVENT_STATUS[e.status]}</span></td>
                  <td className="num">{e.seats_sold}/{e.capacity}</td>
                  <td>
                    <div className="row" style={{ gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                      <Link href={`/painel/eventos/${e.id}`} className="btn btn-ghost btn-sm">Editar</Link>
                      {e.slug !== panel && (
                        <button type="button" className="btn btn-ghost btn-sm" disabled={busy}
                                onClick={() => run({ action: 'painel', slug: e.slug }, `${e.name} aberto no painel.`, '/painel')}>
                          Abrir no painel
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="footer-note">Só o produtor cria e edita eventos · alterações ficam registradas no histórico</p>
      {toast && <div className={`toast ${toast.err ? 'err' : ''}`} role="status">{toast.msg}</div>}
    </main>
  );
}
