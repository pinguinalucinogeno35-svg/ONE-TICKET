import Link from 'next/link';
import ThemeToggle from './ThemeToggle';
import AreaTag from './AreaTag';

// Símbolo ONE Ticket: ingresso Perspective Blue com picotes e "ONE" vazado.
// O picote usa a cor do fundo, então funciona no tema claro e no escuro.
export function TicketMark({ size = 32, title = 'ONE Ticket' }) {
  return (
    <svg className="brand-mark" width={size} height={size} viewBox="0 0 64 64" role="img" aria-label={title}>
      <path fill="#2F5BFF" d="M10 14h44a4 4 0 0 1 4 4v9a5 5 0 0 0 0 10v9a4 4 0 0 1-4 4H10a4 4 0 0 1-4-4v-9a5 5 0 0 0 0-10v-9a4 4 0 0 1 4-4z" />
      <path style={{ stroke: 'var(--bg)' }} strokeWidth="2.4" strokeDasharray="3.2 3.2" d="M44 19v26" />
      <text x="25" y="37.5" textAnchor="middle" fontFamily="Inter Tight, Helvetica Neue, Arial, sans-serif" fontWeight="900" fontSize="13.5" letterSpacing="-0.8" fill="#FFFFFF">ONE</text>
    </svg>
  );
}

export function Wordmark() {
  return <span className="wordmark"><b>ONE</b> <span>Ticket</span></span>;
}

export default function Brand({ href = '/', right = null, area = false }) {
  return (
    <header className="topbar">
      <div className="brand-group">
        <Link href={href} className="brand" aria-label="ONE Ticket — início">
          <TicketMark />
          <Wordmark />
        </Link>
        <AreaTag force={area} />
      </div>
      <div className="topbar-right">
        {right}
        <ThemeToggle />
      </div>
    </header>
  );
}
