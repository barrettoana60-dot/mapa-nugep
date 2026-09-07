import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import 'mapbox-gl/dist/mapbox-gl.css';

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "NUGEP-MAPS",
  description: "Plataforma Definitiva para Análise de Territórios Museológicos",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className={inter.className}>{children}</body>
    </html>
  );
}
