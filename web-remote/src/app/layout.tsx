import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DELL 7490 // CYBER REMOTE",
  description: "Cross-Device Supabase Real-Time Controller for Dell Latitude 7490",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Dell Remote",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#07080d",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="bg-cyber-bg text-zinc-100 cyber-grid min-h-screen select-none antialiased">
        <div className="relative min-h-screen flex flex-col items-center justify-start">
          {children}
        </div>
      </body>
    </html>
  );
}
