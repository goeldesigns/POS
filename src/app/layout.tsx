import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { Providers } from "@/components/providers";
import { BRAND } from "@/config/brand";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: { default: `${BRAND.name} — ${BRAND.tagline}`, template: `%s · ${BRAND.name}` },
  description: "Point of sale, kitchen, inventory and back office for restaurants.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#5040d0",
  width: "device-width",
  initialScale: 1,
};

/**
 * suppressHydrationWarning on <html>/<body> (and on form controls in the UI kit):
 * browser extensions such as password managers inject attributes like
 * `fdprocessedid` or `bis_register` before React hydrates. This only silences
 * attribute differences on those exact elements, never on their children.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <body suppressHydrationWarning>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
