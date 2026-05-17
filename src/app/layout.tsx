import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Silver Mock Interview',
  description: 'AI-powered behavioral interview practice for Silver.dev candidates',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white text-neutral-900 antialiased dark:bg-neutral-950 dark:text-neutral-100">
        {children}
      </body>
    </html>
  );
}
