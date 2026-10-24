import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import deviceConfig from '@/device.config';
import Providers from './providers';
import AppShell from '@/components/shell/app-shell';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const metadata: Metadata = {
  title: deviceConfig.appName,
  description: 'Offline-first device application',
};

// viewport-fit=cover lets the bottom navigator extend into the display cutout
// area on Capacitor (notch / home indicator), using safe-area-inset padding.
export const viewport: Viewport = { viewportFit: 'cover' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans antialiased`}>
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
