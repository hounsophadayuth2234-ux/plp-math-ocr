import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { DashboardShell } from "@/components/layout/DashboardShell";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://math.dytcore.com"),
  title: "PLP math content | DYT ECOSYSTEM",
  description:
    "PLP math content & DYT ECOSYSTEM — Futuristic high-tech AI platform uniting LaTeX/Jodit HTML/MathML OCR, background isolation, 4K upscaling, and creative generation.",
  icons: {
    icon: [
      { url: "/brand/plp-math-content-logo.jpg", sizes: "any" },
      { url: "/favicon.ico" },
    ],
    apple: [
      { url: "/brand/plp-math-content-logo.jpg" },
    ],
  },
  openGraph: {
    title: "PLP math content | DYT ECOSYSTEM",
    description:
      "PLP math content & DYT ECOSYSTEM — Futuristic high-tech AI platform uniting LaTeX/Jodit HTML/MathML OCR, background isolation, 4K upscaling, and creative generation.",
    images: [
      {
        url: "/brand/plp-math-content-logo.jpg",
        width: 1254,
        height: 1254,
        alt: "PLP Math Content logo",
      },
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} dark h-full antialiased`}
    >
      <body className="min-h-full bg-slate-950 font-sans text-slate-100">
        <DashboardShell>{children}</DashboardShell>
      </body>
    </html>
  );
}
