import type { Metadata, Viewport } from "next";
import { Cinzel, Inter } from "next/font/google";
import { MotionProvider } from "@/components/MotionProvider";
import { site } from "@/lib/site";
import "./globals.css";

// Self-hosted at build time by next/font: no layout shift, no external requests.
const cinzel = Cinzel({
  subsets: ["latin"],
  weight: ["400", "600"],
  variable: "--font-cinzel",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: {
    default: `${site.name} | ${site.tagline}`,
    template: `%s | ${site.name}`,
  },
  description: site.description,
  applicationName: site.name,
  authors: [{ name: site.founder }],
  creator: site.founder,
  publisher: site.legalName,
  keywords: [
    "Gleyde",
    "Gleyde Technologies",
    "games",
    "game studio",
    "software",
    "cybersecurity",
    "website security",
    "Sam Eyde III",
  ],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: "/",
    siteName: site.name,
    title: site.name,
    description: site.description,
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: site.name,
    description: site.description,
  },
  robots: { index: true, follow: true },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#0A0A0A",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-scroll-behavior="smooth" className={`${cinzel.variable} ${inter.variable}`}>
      <body className="grain min-h-svh overflow-x-hidden bg-ink">
        <MotionProvider>{children}</MotionProvider>
      </body>
    </html>
  );
}
