'use client';
import { useEffect, useState } from 'react';
import Icon from './Icon';

// Claro é o padrão. A escolha fica salva neste aparelho (útil no PDV e na portaria, no escuro da festa).
export default function ThemeToggle() {
  const [dark, setDark] = useState(false);
  useEffect(() => { setDark(document.documentElement.getAttribute('data-theme') === 'dark'); }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    const root = document.documentElement;
    if (next) root.setAttribute('data-theme', 'dark'); else root.removeAttribute('data-theme');
    try { localStorage.setItem('one-theme', next ? 'dark' : 'light'); } catch {}
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', next ? '#0A0A0A' : '#FFFFFF');
  }

  const label = dark ? 'Usar tema claro' : 'Usar tema escuro';
  return (
    <button type="button" className="theme-toggle" onClick={toggle} aria-label={label} title={label} aria-pressed={dark}>
      <Icon name="contrast" size={18} />
    </button>
  );
}
