import Link from 'next/link';
import Brand from '@/components/Brand';

export default function NotFound() {
  return (
    <main className="shell">
      <Brand />
      <div className="card mt-16" style={{ textAlign: 'center' }}>
        <p className="display" style={{ fontSize: 40 }}>Não encontrado</p>
        <p className="muted mt-8">Este link não existe ou expirou.</p>
        <Link className="btn btn-accent btn-block mt-24" href="/">Ver evento</Link>
      </div>
    </main>
  );
}
