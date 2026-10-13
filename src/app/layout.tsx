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
  title: "NexusAI Hub | Internal 4-Person AI Workbench",
  description:
    "Private all-in-one internal web application integrating Math OCR (LaTeX & Jodit HTML/Inline CSS), Background Removal, Image Upscaling, Text-to-Image, and Web Element Cloning.",
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
