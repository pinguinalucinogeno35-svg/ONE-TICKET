import { redirect } from 'next/navigation';

export default async function OldLogin({ searchParams }) {
  const sp = await searchParams;
  redirect(typeof sp?.next === 'string' ? `/entrar?next=${encodeURIComponent(sp.next)}` : '/entrar');
}
