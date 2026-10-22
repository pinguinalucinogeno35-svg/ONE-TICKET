import { getMe } from '@/lib/auth';
import { MeProvider } from '@/components/MeContext';

// Cada página do painel confere a função; aqui só disponibiliza a sessão para a navegação.
export default async function PainelLayout({ children }) {
  return <MeProvider me={await getMe()}>{children}</MeProvider>;
}
