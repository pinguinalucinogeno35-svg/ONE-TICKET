import { redirect } from 'next/navigation';
import Brand from '@/components/Brand';
import { getMe } from '@/lib/auth';
import { messageFor } from '@/lib/errors';
import { AREA, HOME, OTHER, LOGIN_TITLE } from '@/lib/apps';

export const dynamic = 'force-dynamic';
export const metadata = { title: `Entrar · ${AREA} · ONE Ticket` };

export default async function LoginPage({ searchParams }) {
  const sp = await searchParams;
  const next = typeof sp?.next === 'string' ? sp.next : '';
  const me = await getMe();
  if (me && HOME[me.role]) redirect(next || HOME[me.role]);
  const erro = typeof sp?.erro === 'string' ? sp.erro : '';
  return (
    <main className="shell">
      <Brand area />
      <form className="card mt-16 stack login-card" method="post" action="/api/login">
        <p className="display" style={{ fontSize: 38 }}>{LOGIN_TITLE}</p>
        <p className="muted small">Use o login e a senha que o produtor criou para você.</p>
        <input type="hidden" name="next" value={next} />
        <div className="field">
          <label htmlFor="login">Login</label>
          <input id="login" name="login" className="input mono" required autoFocus autoCapitalize="none" autoCorrect="off" spellCheck="false" autoComplete="username" defaultValue={typeof sp?.u === 'string' ? sp.u : ''} />
        </div>
        <div className="field">
          <label htmlFor="pw">Senha</label>
          <input id="pw" name="password" type="password" className="input" required autoComplete="current-password" />
        </div>
        {erro && (
          <p className="error">
            {messageFor(erro)}
            {erro === 'ACESSO_OUTRO_SISTEMA' && <> Entre por <a href={`${OTHER.url}/entrar`}>{OTHER.label}</a>.</>}
          </p>
        )}
        <button className="btn btn-accent btn-block">Entrar</button>
      </form>
      <p className="tiny muted mt-16">Esqueceu a senha? Peça ao produtor para redefinir na tela Equipe.</p>
    </main>
  );
}
