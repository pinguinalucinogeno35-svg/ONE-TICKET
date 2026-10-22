'use client';
import { useMe } from './MeContext';
import { AREA } from '@/lib/apps';

// Nome da área (Bilheteria ou Bar) ao lado da marca, só para a equipe logada.
export default function AreaTag({ force = false }) {
  const me = useMe();
  if (!me && !force) return null;
  return <span className="area-tag">{AREA}</span>;
}
