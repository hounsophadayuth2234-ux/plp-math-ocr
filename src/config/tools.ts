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
  iconName: "Calculator" | "Eraser" | "Sparkles" | "ImagePlus" | "Code2" | "Brain" | "Palette";
  disabled?: boolean;
}

export const CORE_TOOLS: ToolModule[] = [
  {
    id: "plp-math-content",
    number: 1,
    title: "PLP Math Content",
    shortTitle: "PLP Math Content",
    href: "/plp-math-content",
    description:
      "Convert math images and text into LaTeX, Jodit HTML, and MathML. ស្រង់រូបមន្ត និងបំលែងជាទម្រង់ LaTeX, Jodit HTML (Strict Inline CSS) និង MathML សម្រាប់ប្រព័ន្ធ PLP។",
    badge: "Active",
    engine: "Gemini Vision Core",
    accentColor: "from-cyan-500 via-indigo-500 to-violet-600",
    highlights: [
      "Option 1: Standard LaTeX code",
      "Option 2: Jodit HTML + strict Inline CSS (vertical tables)",
      "Option 3: Standard W3C MathML markup",
    ],
    iconName: "Calculator",
    disabled: false,
  },
  {
    id: "bg-remover",
    number: 2,
    title: "កាត់រូបភាព (សំណួរ & ដំណោះស្រាយ)",
    shortTitle: "កាត់រូបភាព",
    href: "/bg-remover",
    description:
      "កាត់ផ្ដាច់ផ្ទៃខាងក្រោយ និងជំនួសពណ៌ស្វ័យប្រវត្តិតាមមុខងារពិសេសទាំងពីរ៖ កាត់រូបដាក់សំណួរ (ផ្ទៃពណ៌ស #FFFFFF) និង កាត់រូបដាក់ដំណោះស្រាយ (ផ្ទៃផ្កាឈូក #FFF0F5)។",
    badge: "Browser-First AI",
    engine: "@imgly/isnet Browser Model + Local Canvas",
    accentColor: "from-emerald-500 via-teal-500 to-cyan-600",
    highlights: [
      "Feature 1: កាត់រូបដាក់សំណួរ (ផ្ទៃពណ៌ស #FFFFFF)",
      "Feature 2: កាត់រូបដាក់ដំណោះស្រាយ (ផ្ទៃផ្កាឈូក #FFF0F5)",
      "ជំនួសពណ៌ស្វ័យប្រវត្តិតាម Canvas និងទាញយក PNG ភ្លាមៗ",
    ],
    iconName: "Eraser",
    disabled: false,
  },
  {
    id: "image-upscaler",
    number: 3,
    title: "HD Resize & Sharpen (ធ្វើរូបឱ្យច្បាស់)",
    shortTitle: "HD Resize & Sharpen",
    href: "/image-upscaler",
    description:
      "បង្កើនគុណភាព និងទំហំរូបភាពជាមួយ Lanczos-3, Kuwahara Denoising, Khmer Text Crispness Booster និង Before/After comparison slider។",
    badge: "HD Enhance",
    engine: "HD Resize & Smart Enhance Engine",
    accentColor: "from-amber-500 via-orange-500 to-rose-600",
    highlights: [
      "Lanczos-3 Edge-Directed Resampling (1x, 2x, 4x)",
      "Fast, Balanced, and Quality Processing Modes",
      "Kuwahara Surface Denoising & JPEG Artifact Removal",
      "Khmer Text Crispness Booster & Diacritic Protection",
    ],
    iconName: "Sparkles",
    disabled: false,
  },
  {
    id: "math-solver",
    number: 4,
    title: "ដោះស្រាយលំហាត់គណិតវិទ្យា",
    shortTitle: "ដោះស្រាយគណិតវិទ្យា",
    href: "/math-solver",
    description:
      "បញ្ចូលរូបភាពលំហាត់គណិតវិទ្យាដើម្បីទទួលបានការពន្យល់ជាភាសាខ្មែរ និងផ្ទៀងផ្ទាត់ចម្លើយ។ ស្គាល់ទាំងអក្សរដៃ អក្សរបោះពុម្ព និងរូបរាងធរណីមាត្រ។",
    badge: "Khmer AI Solver",
    engine: "Gemini Vision Reasoning",
    accentColor: "from-violet-500 via-purple-500 to-fuchsia-600",
    highlights: [
      "ស្គាល់រូបភាពគណិតវិទ្យា (Printed & Handwritten)",
      "ផ្ទៀងផ្ទាត់ចម្លើយត្រឹមត្រូវ ឬមិនត្រឹមត្រូវ",
      "ពន្យល់ជាភាសាខ្មែរជំហានម្តងៗ",
      "ស្គាល់ច្រើនបញ្ហាក្នុងរូបភាពតែមួយ",
    ],
    iconName: "Brain",
    disabled: false,
  },
  {
    id: "lesson-studio",
    number: 5,
    title: "Module 05: ផលិតមេរៀន & រូបភាពគណិត (AI Lesson & Visual Studio)",
    shortTitle: "ផលិតមេរៀន & រូបភាពគណិត",
    href: "/lesson-studio",
    description:
      "គូសរូបភាពរាប់ចំនួន/ប្រភាគ SVG, បង្កើតវិញ្ញាសាពហុជ្រើសរើស និងរចនាប្រអប់មេរៀន HTML សម្រាប់ថ្នាក់ទី១–៦",
    badge: "AI Visual Studio",
    engine: "Gemini 2.5 / Flash Core",
    accentColor: "from-rose-500 via-pink-500 to-red-600",
    highlights: [
      "គូសរូបភាពរាប់ចំនួន/ប្រភាគ SVG (Child-friendly vector)",
      "បង្កើតសន្លឹកកិច្ចការ និងវិញ្ញាសាពហុជ្រើសរើស (MoEYS Grade 1–6)",
      "កែអក្ខរាវិរុទ្ធ & រចនាប្រអប់មេរៀន HTML (One-click Jodit Box)",
    ],
    iconName: "Palette",
    disabled: false,
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
