import { redirect } from 'next/navigation';
import { OTHER } from '@/lib/apps';

// O PDV agora é o sistema do Bar
export default function OldPos() { redirect(`${OTHER.url}/pdv`); }
