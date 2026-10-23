import { describe, it, expect } from "vitest";
import { CORE_TOOLS } from "../src/config/tools";
import {
  sanitizeAndEnforceSvg,
  wrapSvgInHtmlCard,
  createDefaultCountingSvg,
  createDefaultFractionSvg,
  renderHtmlBox,
  renderQuizHtml,
  QuizResult,
  HtmlBox,
} from "../src/lib/lesson-studio";
import { POST } from "../src/app/api/lesson-studio/route";
import { NextRequest } from "next/server";

describe("Module 05: AI Lesson & Visual Studio Acceptance Suite", () => {
  describe("1. Module 05 Configuration & Navigation", () => {
    it("configures Module 05 as active with route /lesson-studio and proper titles", () => {
      const mod5 = CORE_TOOLS.find((t) => t.number === 5);
      expect(mod5).toBeDefined();
      expect(mod5?.id).toBe("lesson-studio");
      expect(mod5?.href).toBe("/lesson-studio");
      expect(mod5?.disabled).toBe(false);
      expect(mod5?.title).toContain("Module 05");
      expect(mod5?.shortTitle).toBe("ផលិតមេរៀន & រូបភាពគណិត");
      expect(mod5?.iconName).toBe("Palette");
    });
  });

  describe("2. SVG Sanitization, Responsive Attributes & Typography", () => {
    it("sanitizes dangerous scripts and event handlers from raw SVG", () => {
      const dangerousSvg = `<svg viewBox="0 0 600 320" xmlns="http://www.w3.org/2000/svg" onclick="alert(1)">
        <script>alert('xss')</script>
        <circle cx="50" cy="50" r="20" fill="red" onload="badCode()" />
        <text x="50" y="50">ផ្លែប៉ោម</text>
      </svg>`;

      const clean = sanitizeAndEnforceSvg(dangerousSvg);
      expect(clean).not.toContain("<script>");
      expect(clean).not.toContain("alert(1)");
      expect(clean).not.toContain("onload=");
      expect(clean).toContain("viewBox=\"0 0 600 320\"");
      expect(clean).toContain("Kantumruy Pro");
    });

    it("wraps incomplete SVG fragments into valid well-formed SVG", () => {
      const fragment = `<circle cx="100" cy="100" r="40" fill="#ef4444" />`;
      const full = sanitizeAndEnforceSvg(fragment);
      expect(full).toContain("<svg");
      expect(full).toContain("</svg>");
      expect(full).toContain("viewBox=\"0 0 600 320\"");
    });

    it("generates default counting SVG with vibrant colors and Khmer numerals", () => {
      const counting = createDefaultCountingSvg(5, 3);
      expect(counting).toContain("<svg");
      expect(counting).toContain("viewBox=\"0 0 600 300\"");
      expect(counting).toContain("ផ្លែប៉ោមក្រហម 5");
      expect(counting).toContain("ផ្លែប៉ោមបៃតង 3");
      expect(counting).toContain("5 + 3 =");
    });

    it("generates default fraction SVG with circle and bar representations", () => {
      const fraction = createDefaultFractionSvg(3, 4);
      expect(fraction).toContain("<svg");
      expect(fraction).toContain("រូបភាពបង្ហាញប្រភាគ 3/4");
      expect(fraction).toContain("របារប្រភាគ (៣ ភាគ ៤)");
    });

    it("wraps SVG inside self-contained Jodit HTML card", () => {
      const card = wrapSvgInHtmlCard(
        createDefaultCountingSvg(4, 2),
        "ការរាប់ផ្លែឈើ",
        "រូបភាពពន្យល់ពីការបូកផ្លែឈើ"
      );
      expect(card).toContain("class=\"lesson-svg-container\"");
      expect(card).toContain("ការរាប់ផ្លែឈើ");
      expect(card).toContain("រូបភាពពន្យល់ពីការបូកផ្លែឈើ");
      expect(card).toContain("<svg");
    });
  });

  describe("3. Jodit-Compatible HTML Box Styler (Mode 3)", () => {
    it("renders definition box with green theme and inline CSS", () => {
      const box: HtmlBox = {
        type: "definition",
        titleKhmer: "និយមន័យប្រភាគ",
        contentHtml: "<p>ប្រភាគគឺជាចំនួនដែលសម្គាល់ចំណែកនៃឯកតា។</p>",
      };
      const html = renderHtmlBox(box);
      expect(html).toContain("class=\"jodit-lesson-box lesson-box-definition\"");
      expect(html).toContain("border-left: 5px solid #16a34a");
      expect(html).toContain("និយមន័យប្រភាគ");
      expect(html).toContain("ប្រភាគគឺជាចំនួនដែលសម្គាល់ចំណែកនៃឯកតា។");
    });

    it("renders example, note, and summary boxes with distinct styles", () => {
      const exampleBox: HtmlBox = {
        type: "example",
        titleKhmer: "ឧទាហរណ៍ទី ១",
        contentHtml: "<p>នំខេក ១ ចំណែក</p>",
      };
      const noteBox: HtmlBox = {
        type: "note",
        titleKhmer: "ចំណាំសំខាន់",
        contentHtml: "<p>ភាគបែងមិនអាចសូន្យ</p>",
      };
      const summaryBox: HtmlBox = {
        type: "summary",
        titleKhmer: "សង្ខេបមេរៀន",
        contentHtml: "<p>រូបមន្តសង្ខេប</p>",
      };

      const exampleHtml = renderHtmlBox(exampleBox);
      const noteHtml = renderHtmlBox(noteBox);
      const summaryHtml = renderHtmlBox(summaryBox);

      expect(exampleHtml).toContain("border-left: 5px solid #2563eb");
      expect(noteHtml).toContain("border-left: 5px solid #d97706");
      expect(summaryHtml).toContain("border-left: 5px solid #db2777");
    });
  });

  describe("4. MoEYS Worksheet & Quiz Generator (Mode 2)", () => {
    it("renders complete MoEYS worksheet with student header and answer key", () => {
      const quiz: QuizResult = {
        titleKhmer: "សន្លឹកកិច្ចការប្រមាណវិធីបូកដក",
        gradeLevel: "grade_2",
        gradeTitleKhmer: "ថ្នាក់ទី ២",
        textContent: "លំហាត់ទី ១...",
        htmlContent: "",
        questions: [
          {
            id: 1,
            type: "multiple_choice",
            question: "តើ ៥០ + ៣០ ស្មើនឹងប៉ុន្មាន?",
            options: ["ក. ៧០", "ខ. ៨០", "គ. ៩០", "ឃ. ៦០"],
            answer: "ខ",
            explanation: "៥០ + ៣០ = ៨០",
          },
        ],
      };

      const html = renderQuizHtml(quiz);
      expect(html).toContain("class=\"moeys-worksheet\"");
      expect(html).toContain("សន្លឹកកិច្ចការប្រមាណវិធីបូកដក");
      expect(html).toContain("ឈ្មោះសិស្ស ៖");
      expect(html).toContain("សំណួរទី 1 ៖");
      expect(html).toContain("តើ ៥០ + ៣០ ស្មើនឹងប៉ុន្មាន?");
      expect(html).toContain("🔑 បង្ហាញចម្លើយ និងការពន្យល់");
      expect(html).toContain("ចម្លើយត្រឹមត្រូវគឺ <strong>ខ</strong>");
    });
  });

  describe("5. POST /api/lesson-studio Route Handler", () => {
    it("returns HTTP 400 when prompt and image are empty", async () => {
      const req = new NextRequest("http://localhost:3000/api/lesson-studio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: "", mode: "visual_svg" }),
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.ok).toBe(false);
      expect(data.errorKhmer).toContain("សូមបញ្ចូលសំណើ");
    });

    it("handles visual_svg mode with deterministic fallback when offline", async () => {
      const req = new NextRequest("http://localhost:3000/api/lesson-studio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "visual_svg",
          gradeLevel: "grade_1",
          prompt: "រូបផ្លែប៉ោមក្រហម ៥ បូកផ្លែប៉ោមបៃតង ៣",
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.ok).toBe(true);
      expect(data.mode).toBe("visual_svg");
      expect(data.visual).toBeDefined();
      expect(data.visual.svg).toContain("<svg");
      expect(data.visual.htmlCard).toContain("lesson-svg-container");
    });

    it("handles quiz_generator mode with deterministic fallback when offline", async () => {
      const req = new NextRequest("http://localhost:3000/api/lesson-studio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "quiz_generator",
          gradeLevel: "grade_2",
          prompt: "បង្កើតលំហាត់បូកដកលេខត្រឹម ១០០ ចំនួន ៥ សំណួរ",
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.ok).toBe(true);
      expect(data.mode).toBe("quiz_generator");
      expect(data.quiz).toBeDefined();
      expect(data.quiz.questions.length).toBeGreaterThan(0);
      expect(data.quiz.htmlContent).toContain("moeys-worksheet");
    });

    it("handles html_styler mode with deterministic fallback when offline", async () => {
      const req = new NextRequest("http://localhost:3000/api/lesson-studio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "html_styler",
          gradeLevel: "grade_4",
          prompt: "និយមន័យប្រភាគ និងឧទាហរណ៍",
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.ok).toBe(true);
      expect(data.mode).toBe("html_styler");
      expect(data.styler).toBeDefined();
      expect(data.styler.boxes.length).toBeGreaterThan(0);
      expect(data.styler.htmlContent).toContain("jodit-lesson-box");
    });
  });
});
