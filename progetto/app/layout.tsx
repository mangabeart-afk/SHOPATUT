import "./globals.css";
import type { Metadata, Viewport } from "next";

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

export const metadata: Metadata = {
  title: "MangaBEART [ShopaTüT]",
  description: "Gestione caselle, articoli, pagamenti, crediti e spedizioni",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
  },
  appleWebApp: {
    capable: true,
    title: "ShopaTüT",
    statusBarStyle: "default",
  },
  formatDetection: { telephone: false },
  themeColor: "#5b1f24",
};

import PwaRegister from "../components/pwa-register";

export default function RootLayout({children}:{children:React.ReactNode}) {
  return <html lang="it"><body><PwaRegister />{children}</body></html>;
}
