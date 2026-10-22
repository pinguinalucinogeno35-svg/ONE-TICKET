'use client';
import { useEffect, useState } from 'react';

function parts(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return { d: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 };
}
const pad = (n) => String(n).padStart(2, '0');

export default function Countdown({ to, onEnd }) {
  const target = new Date(to).getTime();
  const [now, setNow] = useState(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => {
      const n = Date.now();
      setNow(n);
      if (n >= target) { clearInterval(t); onEnd && onEnd(); }
    }, 1000);
    return () => clearInterval(t);
  }, [target, onEnd]);
  const p = parts(now == null ? 0 : target - now);
  return (
    <div className="countdown" aria-live="off">
      <div><b>{now == null ? '--' : pad(p.d)}</b><span>dias</span></div>
      <div><b>{now == null ? '--' : pad(p.h)}</b><span>horas</span></div>
      <div><b>{now == null ? '--' : pad(p.m)}</b><span>min</span></div>
      <div><b>{now == null ? '--' : pad(p.s)}</b><span>seg</span></div>
    </div>
  );
}
