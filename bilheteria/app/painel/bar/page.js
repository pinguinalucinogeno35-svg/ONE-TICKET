import { redirect } from 'next/navigation';
import { OTHER } from '@/lib/apps';

// O painel do bar agora é o sistema do Bar
export default function OldBarPanel() { redirect(`${OTHER.url}/painel`); }
