import './globals.css';
import type { Metadata, Viewport } from 'next';
import { Inter, Geist_Mono } from 'next/font/google';
import { Analytics } from '@vercel/analytics/next';
import { cn } from '@/lib/utils';
import { Providers } from '@/lib/providers';

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' });
const geistMono = Geist_Mono({ subsets: ['latin'], variable: '--font-mono' });

export const metadata: Metadata = {
  title: 'PremioLab — Renda mensal de investimentos',
  description: 'O app que organiza, projeta e cresce sua renda mensal de FIIs, acoes, opcoes e renda fixa.',
  metadataBase: new URL('https://premiolab.com.br'),
  manifest: '/manifest.json',
  openGraph: {
    title: 'PremioLab — Renda mensal de investimentos',
    description: 'Acompanhe, projete e cresca sua renda mensal. FIIs, acoes, opcoes e renda fixa.',
    url: 'https://premiolab.com.br',
    siteName: 'PremioLab',
    locale: 'pt_BR',
    type: 'website',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'PremioLab',
  },
};

export const viewport: Viewport = {
  themeColor: '#070a11',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" className={cn(inter.variable, geistMono.variable)}>
      <body className="bg-page text-primary font-sans antialiased selection:bg-orange-500/30">
        <Providers>
          {children}
        </Providers>
        <Analytics />
      </body>
    </html>
  );
}
