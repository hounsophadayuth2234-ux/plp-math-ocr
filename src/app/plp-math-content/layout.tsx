import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "PLP Math Content",
  description: "Convert math images and text into LaTeX, Jodit HTML, and MathML.",
  alternates: {
    canonical: "https://ai-toolkit-hub-nu.vercel.app/plp-math-content",
  },
  openGraph: {
    title: "PLP Math Content",
    description: "Convert math images and text into LaTeX, Jodit HTML, and MathML.",
    url: "https://ai-toolkit-hub-nu.vercel.app/plp-math-content",
    siteName: "AI Toolkit Hub",
    type: "website",
  },
};

export default function PlpMathContentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
