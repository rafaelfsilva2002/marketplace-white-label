import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import '@/styles/globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: {
    default: 'Marketplace - Encontre Profissionais',
    template: '%s | Marketplace',
  },
  description:
    'Marketplace de servicos profissionais com busca inteligente por IA. Encontre o profissional ideal para suas necessidades.',
  keywords: ['marketplace', 'servicos profissionais', 'busca inteligente', 'IA'],
  authors: [{ name: 'Marketplace' }],
  openGraph: {
    type: 'website',
    locale: 'pt_BR',
    siteName: 'Marketplace',
    title: 'Marketplace - Encontre Profissionais',
    description:
      'Marketplace de servicos profissionais com busca inteligente por IA.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Marketplace - Encontre Profissionais',
    description:
      'Marketplace de servicos profissionais com busca inteligente por IA.',
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body className={inter.className}>{children}</body>
    </html>
  );
}
