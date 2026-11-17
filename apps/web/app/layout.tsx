import type { Metadata } from 'next';
import { IBM_Plex_Mono, IBM_Plex_Sans } from 'next/font/google';
import './globals.css';
import { Footer, Header } from '@/components/shell';
import { WalletProvider } from '@/lib/wallet';

const sans = IBM_Plex_Sans({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-sans', display: 'swap' });
const mono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-mono', display: 'swap' });

export const metadata: Metadata = {
  title: 'Miter',
  description: 'Correctness bounties for TapeOut circuits on X Layer. A bug proves itself.',
  icons: { icon: '/favicon.svg' },
};

// Applies a saved theme before paint so there is no flash.
const themeScript = `try{var t=localStorage.getItem('miter:theme');if(t)document.documentElement.setAttribute('data-theme',t)}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen">
        <WalletProvider>
          <Header />
          <main className="mx-auto max-w-page px-4 pt-10 sm:px-6">{children}</main>
          <Footer />
        </WalletProvider>
      </body>
    </html>
  );
}
