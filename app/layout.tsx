import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nawyki",
  description: "Habit tracker: odhacz w 3 sekundy i zobacz postęp.",
  applicationName: "Nawyki",
  appleWebApp: { capable: true, title: "Nawyki", statusBarStyle: "default" },
  // Nowa nazwa pliku = nowa ikona: iOS i service worker trzymają ikony po adresie
  icons: { apple: "/apple-touch-icon-v2.png" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f2f2f7" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pl">
      <body>{children}</body>
    </html>
  );
}
