import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Запись в парикмахерскую",
  description: "Онлайн-запись к мастеру",
};

// This UI is designed for phone screens only — no desktop/tablet layout.
// Locking the viewport keeps it rendering like a native mobile app.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body className="min-h-screen bg-gray-100">{children}</body>
    </html>
  );
}
