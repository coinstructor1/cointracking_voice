import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "CoinTracking Voice Agent",
  description: "AI Voice Sales Agent für CoinTracking",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="de" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-ct-dark text-white">
        <header className="bg-ct-darkest border-b border-ct-border px-6 h-[60px] flex items-center justify-between">
          <Link
            href="/"
            className="font-bold text-white hover:text-ct-primary transition-colors"
          >
            Coin<span className="text-ct-primary">Tracking</span> Voice Agent
          </Link>
          <nav className="flex gap-6 text-sm text-ct-secondary">
            <Link href="/call" className="hover:text-white transition-colors">
              Call
            </Link>
            <Link href="/config" className="hover:text-white transition-colors">
              Config
            </Link>
            <Link href="/history" className="hover:text-white transition-colors">
              History
            </Link>
            <Link href="/analysis" className="hover:text-white transition-colors">
              Analyse
            </Link>
          </nav>
        </header>
        <main className="flex-1 flex flex-col">{children}</main>
      </body>
    </html>
  );
}
