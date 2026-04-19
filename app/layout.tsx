import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Nav } from '@/components/Nav';
import { getCurrentHousehold, getCurrentUser } from '@/lib/household';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Home Inventory',
  description: 'Catalog every item in your home for insurance and reference.',
  manifest: '/manifest.webmanifest',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#172033',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [user, household] = await Promise.all([getCurrentUser(), getCurrentHousehold()]);
  return (
    <html lang="en">
      <body className={inter.className}>
        {user && <Nav householdName={household?.name} userEmail={user.email ?? undefined} />}
        <main className="max-w-7xl mx-auto px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
