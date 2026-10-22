import { rpc } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { ACCESS, RESULT_LINKS } from '@/lib/apps';
import { MeProvider } from '@/components/MeContext';
import Brand from '@/components/Brand';
import AdminNav from '@/components/AdminNav';
import FestaResult from '@/components/FestaResult';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Resultado da festa · ONE Ticket' };

export default async function ResultPage() {
  const me = await requireRole(ACCESS.resultado, '/resultado');
  const data = await rpc('api_festa_result', { p_slug: process.env.EVENT_SLUG || 'festa-demo' });
  return (
    <MeProvider me={me}>
      <main className="shell-wide">
        <Brand href="/" right={<form method="post" action="/api/logout"><button className="btn btn-ghost btn-sm">Sair</button></form>} />
        <p className="eyebrow">{data?.event?.name || 'Evento'}</p>
        <h1 className="display" style={{ fontSize: 44, marginTop: 6 }}>Resultado da festa</h1>
        <AdminNav current="/resultado" />
        {data ? <FestaResult data={data} links={RESULT_LINKS} /> : <p>Evento não encontrado.</p>}
      </main>
    </MeProvider>
  );
}
