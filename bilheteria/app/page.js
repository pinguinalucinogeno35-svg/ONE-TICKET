import { redirect } from 'next/navigation';

export default function Home() {
  redirect(`/e/${process.env.EVENT_SLUG || 'festa-demo'}`);
}
