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
    title: "សរសេរកូដ LaTeX, Jodit HTML, MathML",
    shortTitle: "សរសេរកូដ LaTeX, Jodit HTML, MathML",
    href: "/math-ocr",
    description:
      "ស្រង់សមីការ គណនាលេខបញ្ឈរ និងរូបធរណីមាត្រពីឯកសាររូបភាព ឬអក្សរ ទៅជាទម្រង់ LaTeX, Jodit HTML (Strict Inline CSS) និង MathML សម្រាប់ប្រព័ន្ធ PLP។",
    badge: "Gemini Vision",
    engine: "Google Gemini 2.5 Flash / Pro Vision",
    accentColor: "from-cyan-500 via-indigo-500 to-violet-600",
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
    title: "កាត់រូបភាព (សំណួរ & ដំណោះស្រាយ)",
    shortTitle: "កាត់រូបភាព",
    href: "/bg-remover",
    description:
      "កាត់ផ្ដាច់ផ្ទៃខាងក្រោយ និងជំនួសពណ៌ស្វ័យប្រវត្តិតាមមុខងារពិសេសទាំងពីរ៖ កាត់រូបដាក់សំណួរ (ផ្ទៃពណ៌ស #FFFFFF) និង កាត់រូបដាក់ដំណោះស្រាយ (ផ្ទៃផ្កាឈូក #FFF0F5)។",
    badge: "Auto Color Replace",
    engine: "Rembg / SegFormer + Auto Canvas Compositor",
    accentColor: "from-emerald-500 via-teal-500 to-cyan-600",
    highlights: [
      "Feature 1: កាត់រូបដាក់សំណួរ (ផ្ទៃពណ៌ស #FFFFFF)",
      "Feature 2: កាត់រូបដាក់ដំណោះស្រាយ (ផ្ទៃផ្កាឈូក #FFF0F5)",
      "ជំនួសពណ៌ស្វ័យប្រវត្តិតាម Canvas និងទាញយក PNG ភ្លាមៗ",
    ],
    iconName: "Eraser",
  },
  {
    id: "image-upscaler",
    number: 3,
    title: "ធ្វើរូបឱ្យច្បាស់",
    shortTitle: "ធ្វើរូបឱ្យច្បាស់",
    href: "/image-upscaler",
    description:
      "បង្កើនគុណភាពរូបភាពព្រិលៗ ឬទំហំតូចឱ្យទៅជាកម្រិតច្បាស់ HD/4K ជាមួយ Real-ESRGAN Super-Resolution និង Before/After comparison slider។",
    badge: "Real-ESRGAN 4x",
    engine: "Replicate Real-ESRGAN / Super-Resolution API",
    accentColor: "from-amber-500 via-orange-500 to-rose-600",
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
    title: "បង្កើតរូបភាព",
    shortTitle: "បង្កើតរូបភាព",
    href: "/image-generator",
    description:
      "បង្កើតរូបភាព និងគំនូរប្លែកៗតាមរយៈការសរសេរ Prompt ជាមួយម៉ូដែល Flux Schnell ក្នុងល្បឿនលឿនបំផុត និងទាញយករូបភាពបានភ្លាមៗ។",
    badge: "Flux / DALL-E 3",
    engine: "Multi-Model Text-to-Image API",
    accentColor: "from-pink-500 via-purple-500 to-indigo-600",
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
    title: "ចម្លងកូដគេហទំព័រ (Web Cloner)",
    shortTitle: "ចម្លងកូដគេហទំព័រ",
    href: "/web-cloner",
    description:
      "ស្រង់ទាញយក HTML DOM និង CSS Styles ពីគេហទំព័រគោលដៅ ពិនិត្យមើល Visual Preview និងចម្លងកូដបានភ្លាមៗ។",
    badge: "Cheerio / Puppeteer",
    engine: "Server-Side DOM Extractor & CSS Sanitizer",
    accentColor: "from-cyan-500 via-blue-500 to-indigo-600",
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
  { name: "DYT Node 1", role: "PLP Math & Core Architecture", initials: "D1", color: "bg-cyan-500" },
  { name: "DYT Node 2", role: "Vision & Creative Pipeline", initials: "D2", color: "bg-emerald-500" },
  { name: "DYT Node 3", role: "Robotic UI & Performance", initials: "D3", color: "bg-amber-500" },
  { name: "DYT Node 4", role: "Neural Engine & Operations", initials: "D4", color: "bg-purple-500" },
];
