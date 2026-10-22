import { redirect } from 'next/navigation';
import { getMe } from '@/lib/auth';
import { HOME } from '@/lib/apps';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const me = await getMe();
  redirect(me && HOME[me.role] ? HOME[me.role] : '/entrar');
}
