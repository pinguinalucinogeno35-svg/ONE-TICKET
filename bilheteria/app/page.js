import { rpc } from '@/lib/db';
import Showcase from '@/components/Showcase';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'ONE Ticket · ingressos para festas',
  description: 'Escolha a sua próxima festa e compre o ingresso com Pix ou cartão.',
};

// Contato comercial para produtores (e-mail ou WhatsApp). Sem ele, o botão não aparece.
function salesHref() {
  const c = (process.env.CONTATO_COMERCIAL || '').trim();
  if (!c) return null;
  if (c.includes('@')) return `mailto:${c}?subject=${encodeURIComponent('Quero vender minha festa no ONE Ticket')}`;
  const d = c.replace(/\D/g, '');
  return d.length >= 10 ? `https://wa.me/${d.startsWith('55') ? d : `55${d}`}` : null;
}

export default async function Home() {
  const [upcoming, past] = await Promise.all([
    rpc('api_public_events', { p_past: false }).catch(() => []),
    rpc('api_public_events', { p_past: true, p_limit: 24 }).catch(() => []),
  ]);
  return <Showcase upcoming={upcoming || []} past={past || []} salesHref={salesHref()} />;
}
