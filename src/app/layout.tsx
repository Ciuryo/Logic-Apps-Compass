import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Logic Apps Compass — sua central de integrações",
  description: "Entenda, revise, diagnostique e planeje Azure Logic Apps com ferramentas locais e aprendizagem guiada."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body>{children}</body></html>;
}
