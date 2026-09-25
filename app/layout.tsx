import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

// next/font baixa e auto-hospeda a fonte no build: nada é pedido ao Google em
// tempo de execução, e não há salto de layout ao carregar.
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Monitoria — Agende seu horário",
  description: "Agende seu horário de monitoria.",
};

// viewport-fit=cover é necessário porque o :root da folha de estilo usa
// env(safe-area-inset-*) para não ficar embaixo do notch no iPhone.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}
