/**
 * Centralized configuration for all 5 AI Functional Modules and Team Metadata.
 * Used across Sidebar Navigation, Top Header, and Overview Dashboard cards.
 */

export type ToolStatus = "ready" | "active" | "planned";

export interface ToolModule {
  id: string;
  number: number;
  title: string;
  shortTitle: string;
  href: string;
  description: string;
  badge: string;
  engine: string;
  accentColor: string;
  highlights: string[];
  iconName: "Calculator" | "Eraser" | "Sparkles" | "ImagePlus" | "Code2";
}

export const CORE_TOOLS: ToolModule[] = [
  {
    id: "math-ocr",
    number: 1,
    title: "Advanced Math OCR & Code Generator",
    shortTitle: "Math OCR & Jodit HTML",
    href: "/math-ocr",
    description:
      "Extract complex equations, vertical arithmetic, and geometric figures from images or raw text into standard LaTeX and Jodit-ready HTML with strict Inline CSS.",
    badge: "Gemini Vision",
    engine: "Google Gemini 2.5 Flash / Pro Vision",
    accentColor: "from-indigo-500 to-violet-600",
    highlights: [
      "Option 1: Standard LaTeX code",
      "Option 2: Jodit HTML + strict Inline CSS (vertical tables)",
      "Option 3: Standard W3C MathML markup",
    ],
    iconName: "Calculator",
  },
  {
    id: "bg-remover",
    number: 2,
    title: "AI Background Removal & Replacement",
    shortTitle: "BG Remover & Color Studio",
    href: "/bg-remover",
    description:
      "Instantly isolate subjects into transparent PNGs and apply custom solid-color studio backdrops in real time using the HTML5 Canvas API.",
    badge: "Rembg / SegFormer",
    engine: "Open-Source Background Segmentation + HTML5 Canvas",
    accentColor: "from-emerald-500 to-teal-600",
    highlights: [
      "One-click transparent PNG extraction",
      "Real-time HTML5 Canvas solid color replacement",
      "Instant high-res composite download",
    ],
    iconName: "Eraser",
  },
  {
    id: "image-upscaler",
    number: 3,
    title: "Image Upscaling & Enhancement",
    shortTitle: "HD/4K Image Upscaler",
    href: "/image-upscaler",
    description:
      "Transform low-resolution, compressed, or blurry graphics into crisp HD/4K assets with an interactive side-by-side Before/After comparison slider.",
    badge: "Real-ESRGAN 4x",
    engine: "Replicate Real-ESRGAN / Super-Resolution API",
    accentColor: "from-amber-500 to-orange-600",
    highlights: [
      "Up to 4x super-resolution enhancement",
      "Interactive Before/After split comparison slider",
      "Detail recovery for text, illustrations & photos",
    ],
    iconName: "Sparkles",
  },
  {
    id: "image-generator",
    number: 4,
    title: "AI Text-to-Image Generation",
    shortTitle: "Text-to-Image Studio",
    href: "/image-generator",
    description:
      "Generate custom illustrations, educational diagrams, and creative assets from text prompts with configurable aspect ratios and a downloadable gallery.",
    badge: "Flux / DALL-E 3",
    engine: "Multi-Model Text-to-Image API",
    accentColor: "from-pink-500 to-rose-600",
    highlights: [
      "Custom prompt & negative prompt controls",
      "1:1, 16:9, 9:16, and 4:3 aspect ratio presets",
      "Persistent session gallery with one-click download",
    ],
    iconName: "ImagePlus",
  },
  {
    id: "web-cloner",
    number: 5,
    title: "Web Element Cloner & Scraper",
    shortTitle: "Web UI Cloner & Scraper",
    href: "/web-cloner",
    description:
      "Fetch any target URL, extract and sanitize its core DOM structure and associated styles, and inspect both a live visual preview and copyable HTML/CSS.",
    badge: "Cheerio / Puppeteer",
    engine: "Server-Side DOM Extractor & CSS Sanitizer",
    accentColor: "from-cyan-500 to-blue-600",
    highlights: [
      "Target URL & optional CSS selector extraction",
      "Sanitized HTML + scoped CSS bundle",
      "Sandboxed live preview & one-click code copy",
    ],
    iconName: "Code2",
  },
];

export interface TeamMember {
  name: string;
  role: string;
  initials: string;
  color: string;
}

export const TEAM_MEMBERS: TeamMember[] = [
  { name: "Member 1", role: "Content & Math Lead", initials: "M1", color: "bg-indigo-500" },
  { name: "Member 2", role: "Visual Designer", initials: "M2", color: "bg-emerald-500" },
  { name: "Member 3", role: "Frontend Engineer", initials: "M3", color: "bg-amber-500" },
  { name: "Member 4", role: "AI Operations", initials: "M4", color: "bg-rose-500" },
];
