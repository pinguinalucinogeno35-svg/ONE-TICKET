import { ImageResponse } from 'next/og';

// Ícone do app ONE Ticket: fundo White, ingresso Perspective Blue com picotes e "ONE" vazado.
export function iconResponse(size) {
  const u = size / 64; // grade de 64
  const dash = Array.from({ length: 7 });
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#FFFFFF' }}>
        <div style={{ position: 'relative', width: 50 * u, height: 34 * u, borderRadius: 4 * u, background: '#2F5BFF', display: 'flex', alignItems: 'center' }}>
          <div style={{ position: 'absolute', left: -5 * u, top: 12 * u, width: 10 * u, height: 10 * u, borderRadius: 999, background: '#FFFFFF' }} />
          <div style={{ position: 'absolute', right: -5 * u, top: 12 * u, width: 10 * u, height: 10 * u, borderRadius: 999, background: '#FFFFFF' }} />
          <div style={{ position: 'absolute', left: 37.5 * u, top: 4 * u, display: 'flex', flexDirection: 'column' }}>
            {dash.map((_, i) => (
              <div key={i} style={{ width: 2.4 * u, height: 2.4 * u, marginBottom: 1.6 * u, background: '#FFFFFF' }} />
            ))}
          </div>
          <div style={{ position: 'absolute', left: 4 * u, width: 30 * u, display: 'flex', justifyContent: 'center', color: '#FFFFFF', fontSize: 13 * u, fontWeight: 700, letterSpacing: -0.6 * u }}>
            ONE
          </div>
        </div>
      </div>
    ),
    { width: size, height: size }
  );
}
