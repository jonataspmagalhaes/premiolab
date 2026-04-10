import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'PremioLab — Renda mensal de investimentos',
  description: 'O app que organiza, projeta e cresce sua renda mensal de FIIs, ações, opções e renda fixa. R$ 14,90/mês ou R$ 149/ano.',
  metadataBase: new URL('https://premiolab.com.br'),
  openGraph: {
    title: 'PremioLab — Renda mensal de investimentos',
    description: 'Acompanhe, projete e cresça sua renda mensal. FIIs, ações, opções e renda fixa.',
    url: 'https://premiolab.com.br',
    siteName: 'PremioLab',
    locale: 'pt_BR',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'PremioLab — Renda mensal de investimentos',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body className="bg-bg text-primary font-body antialiased">
        {children}
      </body>
    </html>
  );
}
