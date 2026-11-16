import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Adiestra', template: '%s · Adiestra' },
  description: 'Gestión para adiestradores y centros de entrenamiento de mascotas',
};

export const viewport: Viewport = { themeColor: '#2f6b4f', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
