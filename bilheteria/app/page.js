import { redirect } from 'next/navigation';
import { currentSlug } from '@/lib/event';

export default async function Home() {
  redirect(`/e/${await currentSlug()}`);
}
