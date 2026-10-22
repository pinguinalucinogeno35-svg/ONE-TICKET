import { requireRole } from '@/lib/auth';
import { ACCESS } from '@/lib/apps';
import { MeProvider } from '@/components/MeContext';
import { publicKey } from '@/lib/sign';
import GateClient from '@/components/GateClient';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Portaria' };

export default async function GatePage() {
  const me = await requireRole(ACCESS.portaria, '/portaria');
  return <MeProvider me={me}><GateClient publicKey={publicKey()} /></MeProvider>;
}
