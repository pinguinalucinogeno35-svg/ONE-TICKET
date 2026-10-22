'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useMe } from './MeContext';
import Icon from './Icon';
import { NAV, OTHER, OTHER_ROLES, ROLE_LABEL } from '@/lib/apps';

export default function AdminNav({ current }) {
  const me = useMe();
  const path = usePathname();
  const active = current || path;
  const tabs = NAV.filter((t) => !me || t.roles.includes(me.role));
  return (
    <div className="admin-bar">
      <nav className="admin-nav" aria-label="Painel">
        {tabs.map((t) => (
          <Link key={t.href} href={t.href} aria-current={active === t.href ? 'page' : undefined}>{t.label}</Link>
        ))}
        {me && OTHER_ROLES.includes(me.role) && (
          <a href={OTHER.url} className="admin-nav-out" target="_blank" rel="noopener">
            {OTHER.label}<Icon name="external" size={14} />
          </a>
        )}
      </nav>
      {me && <p className="who tiny muted"><b>{me.name}</b> · {ROLE_LABEL[me.role] || me.role}</p>}
    </div>
  );
}
