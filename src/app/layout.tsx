import type { Metadata } from "next";

import "@/app/globals.css";

export const metadata: Metadata = {
  title: "La Burbuja POS",
  description: "Sistema local de lavanderia con control de relevadores"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-MX">
      <body>{children}</body>
    </html>
  );
}
