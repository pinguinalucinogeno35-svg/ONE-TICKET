// Qual evento cada tela usa.
// Evento da noite: escolhido pelo produtor na aba Eventos e guardado no banco. Portaria, bar
// e o endereço principal usam este. EVENT_SLUG fica de reserva enquanto ninguém escolher.
// Evento do painel: o produtor pode abrir outro evento no painel (ex.: preparar a próxima festa)
// sem mexer na operação da noite. Fica num cookie deste aparelho.
import { cache } from 'react';
import { cookies } from 'next/headers';
import { rpc } from './db';

export const EVENT_COOKIE = 'one_ev';
const FALLBACK = () => process.env.EVENT_SLUG || 'festa-demo';

export const currentSlug = cache(async () => {
  try {
    return (await rpc('api_current_event')) || FALLBACK();
  } catch {
    return FALLBACK();
  }
});

export const panelSlug = cache(async () => {
  const store = await cookies();
  const chosen = store.get(EVENT_COOKIE)?.value;
  return chosen && /^[a-z0-9-]{3,60}$/.test(chosen) ? chosen : currentSlug();
});

export function eventCookie(slug) {
  return `${EVENT_COOKIE}=${slug}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}`;
}
