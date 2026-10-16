import './globals.css';
import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  title: 'Book banetid – Sparebanken Norge Arena · Finns.Fairway',
  description: 'Book ledige timer på vinteråpen Sparebanken Norge Arena, høst og vinter 2026/27.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#005a4f',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="no">
      <body>{children}</body>
    </html>
  );
}
