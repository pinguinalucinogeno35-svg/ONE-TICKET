import Link from 'next/link';
import Brand from '@/components/Brand';
import { getMe } from '@/lib/auth';
import { AREA, HOME, ROLE_LABEL } from '@/lib/apps';

export const dynamic = 'force-dynamic';
export const metadata = { title: `Sem acesso · ${AREA}` };

export default async function NoAccess() {
  const me = await getMe();
  const home = me && HOME[me.role];
  return (
    <main className="shell">
      <Brand area />
      <div className="card mt-16 stack">
        <p className="display" style={{ fontSize: 36 }}>Sem acesso a esta tela</p>
        <p className="muted small">
          {me ? <>Você entrou como <b>{me.name}</b> ({ROLE_LABEL[me.role] || me.role}). Esta parte não faz parte da sua função.</> : 'Entre com seu login para continuar.'}
        </p>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          {home ? <Link className="btn btn-accent btn-sm" href={home}>Ir para minha tela</Link> : <Link className="btn btn-accent btn-sm" href="/entrar">Entrar</Link>}
          {me && <form method="post" action="/api/logout"><button className="btn btn-ghost btn-sm">Trocar de usuário</button></form>}
        </div>
      </div>
    </main>
  );
}
