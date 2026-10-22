import { Inter_Tight, IBM_Plex_Mono } from 'next/font/google';
import './globals.css';
import './equipe.css';
import SwRegister from '@/components/SwRegister';

// Neue Haas Grotesk é a fonte oficial da ONE (licença paga). Na web usamos Inter Tight
// como substituta até a licença ser fornecida; o CSS já chama a oficial primeiro.
const display = Inter_Tight({ subsets: ['latin'], weight: ['300', '400', '500', '600', '700', '800', '900'], variable: '--font-display', display: 'swap' });
const mono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-mono', display: 'swap' });

export const metadata = {
  title: 'ONE Ticket',
  description: 'Ingressos com a precisão da ONE. Compra rápida, QR code seguro, entrada sem fila.',
  applicationName: 'ONE Ticket',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'ONE Ticket' },
  icons: { icon: [{ url: '/icon.svg', type: 'image/svg+xml' }, { url: '/icon-192.png', sizes: '192x192' }], apple: '/icon-192.png' },
};

// Aplica o tema salvo antes da primeira pintura (evita piscar branco no modo escuro)
const THEME_SCRIPT = "try{if(localStorage.getItem('one-theme')==='dark'){document.documentElement.setAttribute('data-theme','dark')}}catch(e){}";

export const viewport = {
  themeColor: '#FFFFFF',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR" className={`${display.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        {children}
        <SwRegister />
      </body>
    </html>
  );
}
