'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Brand from './Brand';
import AdminNav from './AdminNav';
import { dateShort } from '@/lib/format';
import { ROLE_LABEL, ROLE_DESC, ROLE_SYSTEM } from '@/lib/apps';

const EMPTY = { id: null, name: '', login: '', role: 'caixa_bar', password: '', active: true };
const ROLES = ['produtor', 'bilheteria', 'portaria', 'gerente_bar', 'caixa_bar'];

// Senha provisória legível (sem 0/O, 1/l)
function makePassword() {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  const buf = new Uint32Array(8);
  crypto.getRandomValues(buf);
  return Array.from(buf, (v) => chars[v % chars.length]).join('').replace(/^(.{4})/, '$1-');
}

const toLogin = (name) => name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().split(/\s+/).slice(0, 2).join('.').replace(/[^a-z0-9._-]/g, '').slice(0, 30);

export default function TeamAdmin({ staff, meId }) {
  const router = useRouter();
  const [f, setF] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);
  const [shown, setShown] = useState(null); // credenciais recém-criadas para repassar
  const editing = !!f.id;
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  function notify(msg, err = false) {
    setToast({ msg, err });
    setTimeout(() => setToast(null), 3600);
  }

  function edit(u) {
    setF({ id: u.id, name: u.name, login: u.login, role: u.role, password: '', active: u.active });
    setShown(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch('/api/equipe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(f) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Não foi possível salvar.');
      if (f.password) setShown({ name: f.name, login: f.login.toLowerCase().trim(), password: f.password, role: f.role });
      notify(editing ? 'Acesso atualizado.' : 'Acesso criado.');
      setF(EMPTY);
      router.refresh();
    } catch (err) {
      notify(err.message, true);
    } finally {
      setBusy(false);
    }
  }

  const counts = ROLES.map((r) => [r, staff.filter((u) => u.active && u.role === r).length]);

  return (
    <main className="shell-wide">
      <Brand href="/painel" right={<form method="post" action="/api/logout"><button className="btn btn-ghost btn-sm">Sair</button></form>} />
      <p className="eyebrow">Acessos por função · valem para a Bilheteria e o Bar</p>
      <h1 className="display" style={{ fontSize: 44, marginTop: 6 }}>Equipe</h1>
      <AdminNav current="/painel/equipe" />

      <div className="grid-2">
        <section className="card">
          <div className="row between" style={{ flexWrap: 'wrap', gap: 8 }}>
            <p className="display" style={{ fontSize: 24 }}>Quem tem acesso</p>
            <span className="chip">{staff.filter((u) => u.active).length} ativos</span>
          </div>
          <div className="table-wrap mt-8">
            <table className="table">
              <thead><tr><th>Pessoa</th><th>Função</th><th>Último acesso</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {staff.map((u) => (
                  <tr key={u.id} className={u.active ? '' : 'off'}>
                    <td>
                      <b>{u.name}</b>{u.id === meId && <span className="tiny muted"> · você</span>}
                      <div className="tiny muted mono">{u.login}</div>
                    </td>
                    <td><span className={`role-pill ${ROLE_SYSTEM[u.role] === 'Bar' ? 'bar' : ''}`}>{ROLE_LABEL[u.role]}</span></td>
                    <td className="small num">{u.last_login_at ? dateShort(u.last_login_at) : <span className="muted">nunca</span>}</td>
                    <td className="small">{!u.active ? <span className="muted">Inativo</span> : u.locked ? <span className="badge-lock">Bloqueado</span> : 'Ativo'}</td>
                    <td><div className="row" style={{ justifyContent: 'flex-end' }}><button type="button" className="btn btn-ghost btn-sm" onClick={() => edit(u)}>Editar</button></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="res-lines small mt-16">
            {counts.map(([r, c]) => (
              <div key={r}><span><b>{ROLE_LABEL[r]}</b> <span className="muted">· {ROLE_DESC[r]}</span></span><b>{c}</b></div>
            ))}
          </div>
          <p className="tiny muted mt-16">Cinco senhas erradas seguidas bloqueiam o acesso por 10 minutos. Redefinir a senha desbloqueia na hora. Desativar alguém impede novos logins; quem já está dentro sai em até 12 horas.</p>
        </section>

        <div className="stack">
          <form className={`card ${editing ? 'card-accent' : ''}`} onSubmit={save}>
            <p className="eyebrow">{editing ? `Editando ${f.name}` : 'Novo acesso'}</p>
            <div className="stack mt-16">
              <div className="field"><label>Nome</label>
                <input className="input" value={f.name} required maxLength={60} placeholder="Ex.: Ana do caixa 2"
                  onChange={(e) => setF({ ...f, name: e.target.value, login: editing || f.loginTouched ? f.login : toLogin(e.target.value) })} />
              </div>
              <div className="field"><label>Login</label>
                <input className="input mono" value={f.login} required pattern="[a-z0-9._\-]{3,30}" title="3 a 30 letras minúsculas, números, ponto, hífen ou sublinhado"
                  autoCapitalize="none" autoCorrect="off" spellCheck="false"
                  onChange={(e) => setF({ ...f, login: e.target.value.toLowerCase().replace(/\s/g, ''), loginTouched: true })} />
              </div>
              <div className="field"><label>Função</label>
                <select className="input" value={f.role} onChange={set('role')}>
                  {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]} · {ROLE_SYSTEM[r]}</option>)}
                </select>
                <p className="tiny muted mt-8">{ROLE_DESC[f.role]}</p>
              </div>
              <div className="field"><label>{editing ? 'Nova senha' : 'Senha'}</label>
                <div className="input-row">
                  <input className="input mono" value={f.password} onChange={set('password')} minLength={6} maxLength={100}
                    required={!editing} placeholder={editing ? 'deixe em branco para manter' : 'mínimo 6 caracteres'} autoComplete="new-password" />
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setF({ ...f, password: makePassword() })}>Gerar</button>
                </div>
              </div>
              <label className="check"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Ativo</label>
              <div className="row">
                <button className="btn btn-accent btn-sm" disabled={busy}>{busy ? 'Salvando…' : editing ? 'Salvar alterações' : 'Criar acesso'}</button>
                {editing && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setF(EMPTY)}>Cancelar</button>}
              </div>
            </div>
          </form>

          {shown && (
            <section className="card card-accent" aria-live="polite">
              <p className="eyebrow">Passe para {shown.name}</p>
              <div className="res-lines small">
                <div><span>Sistema</span><b>{ROLE_SYSTEM[shown.role]}</b></div>
                <div><span>Login</span><b className="mono">{shown.login}</b></div>
                <div><span>Senha</span><b className="mono">{shown.password}</b></div>
              </div>
              <p className="tiny muted mt-8">A senha não aparece de novo depois que você sair desta tela.</p>
            </section>
          )}
        </div>
      </div>

      {toast && <div className={`toast ${toast.err ? 'err' : ''}`} role="status">{toast.msg}</div>}
    </main>
  );
}
