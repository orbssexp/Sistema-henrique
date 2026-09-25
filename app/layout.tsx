import type { Metadata, Viewport } from "next";
import "./globals.css";

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
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
