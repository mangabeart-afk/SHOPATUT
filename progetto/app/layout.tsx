import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "MangaBEART [ShopaTüT]",
  description: "Gestione caselle, articoli, pagamenti, crediti e spedizioni"
};

export default function RootLayout({children}:{children:React.ReactNode}) {
  return <html lang="it"><body>{children}</body></html>;
}
