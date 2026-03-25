import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Pokr Feedback',
  description: 'Review and respond to user feedback',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
