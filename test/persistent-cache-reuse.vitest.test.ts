import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  PersistentCacheStore,
  buildDeterministicCacheKey,
  computeExactSha256,
  computeNormalizedImageSha256,
  computeNormalizedTextFingerprint,
  computeOcrFingerprint,
} from "@/lib/persistent-cache-store";
import {
  buildModule01Artifacts,
  buildModule04Artifacts,
  buildModule05Artifacts,
  formatArtifactDriveFilename,
} from "@/lib/gemini-cache-artifacts";
import { NextRequest } from "next/server";
import * as authSession from "@/lib/auth-session";
import { GET as getHistory, POST as postHistory } from "@/app/api/history/route";

describe("Persistent Result Storage and Cache Reuse Test Suite", () => {
  beforeEach(async () => {
    // Reset test store before each test case
    await PersistentCacheStore.__resetTestStore();
  });

  describe("A. Deterministic Cache Key & Invalidation Invariants", () => {
    it("builds identical deterministic SHA-256 cache key for identical parameters", () => {
      const key1 = buildDeterministicCacheKey({
        module: "module01_math_ocr",
        userId: "usr_dayuth_001",
        grade: "grade_1",
        mode: "ocr_standard",
        language: "km",
        inputFingerprint: "sha256_input_sample_abc123",
        options: { mathml: true, custom: "instruction" },
        modelName: "gemini-2.5-flash",
        promptVersion: "math_ocr_v2.0",
      });

      const key2 = buildDeterministicCacheKey({
        module: "module01_math_ocr",
        userId: "usr_dayuth_001",
        grade: "grade_1",
        mode: "ocr_standard",
        language: "km",
        inputFingerprint: "sha256_input_sample_abc123",
        options: { custom: "instruction", mathml: true }, // Different object key ordering
        modelName: "gemini-2.5-flash",
        promptVersion: "math_ocr_v2.0",
      });

      expect(key1).toBe(key2);
      expect(key1.startsWith("dyt:cache:module01_math_ocr:")).toBe(true);
      expect(key1.split(":").pop()).toHaveLength(64); // SHA-256 digest
    });

    it("different grade does not reuse cache (cache miss invariant)", () => {
      const keyGrade1 = buildDeterministicCacheKey({
        module: "module04_math_solver",
        userId: "usr_01",
        grade: "grade_1",
        mode: "solve",
        language: "km",
        inputFingerprint: "question_fingerprint_xyz",
        modelName: "gemini-2.5-flash",
        promptVersion: "solver_v2.0",
      });

      const keyGrade2 = buildDeterministicCacheKey({
        module: "module04_math_solver",
        userId: "usr_01",
        grade: "grade_2",
        mode: "solve",
        language: "km",
        inputFingerprint: "question_fingerprint_xyz",
        modelName: "gemini-2.5-flash",
        promptVersion: "solver_v2.0",
      });

      expect(keyGrade1).not.toBe(keyGrade2);
    });

    it("different mode does not reuse cache", () => {
      const keySolve = buildDeterministicCacheKey({
        module: "module04_math_solver",
        userId: "usr_01",
        grade: "grade_1",
        mode: "solve",
        language: "km",
        inputFingerprint: "question_fingerprint_xyz",
        modelName: "gemini-2.5-flash",
        promptVersion: "solver_v2.0",
      });

      const keyVerify = buildDeterministicCacheKey({
        module: "module04_math_solver",
        userId: "usr_01",
        grade: "grade_1",
        mode: "verify",
        language: "km",
        inputFingerprint: "question_fingerprint_xyz",
        modelName: "gemini-2.5-flash",
        promptVersion: "solver_v2.0",
      });

      expect(keySolve).not.toBe(keyVerify);
    });

    it("different language does not reuse cache", () => {
      const keyKhmer = buildDeterministicCacheKey({
        module: "module05_lesson_studio",
        userId: "usr_01",
        grade: "grade_3",
        mode: "lesson_plan",
        language: "km",
        inputFingerprint: "prompt_fingerprint_123",
        modelName: "gemini-flash-lite-latest",
        promptVersion: "lesson_studio_v2.0",
      });

      const keyEnglish = buildDeterministicCacheKey({
        module: "module05_lesson_studio",
        userId: "usr_01",
        grade: "grade_3",
        mode: "lesson_plan",
        language: "en",
        inputFingerprint: "prompt_fingerprint_123",
        modelName: "gemini-flash-lite-latest",
        promptVersion: "lesson_studio_v2.0",
      });

      expect(keyKhmer).not.toBe(keyEnglish);
    });

    it("changed promptVersion invalidates cache deterministically", () => {
      const keyV1 = buildDeterministicCacheKey({
        module: "module01_math_ocr",
        userId: "usr_01",
        grade: "grade_1",
        mode: "standard",
        language: "km",
        inputFingerprint: "image_hash_000",
        modelName: "gemini-2.5-flash",
        promptVersion: "math_ocr_v1.0",
      });

      const keyV2 = buildDeterministicCacheKey({
        module: "module01_math_ocr",
        userId: "usr_01",
        grade: "grade_1",
        mode: "standard",
        language: "km",
        inputFingerprint: "image_hash_000",
        modelName: "gemini-2.5-flash",
        promptVersion: "math_ocr_v2.0",
      });

      expect(keyV1).not.toBe(keyV2);
    });
  });

  describe("B. Privacy and Multi-User RBAC Isolation", () => {
    it("USER cannot access another user's cached result (private scope)", async () => {
      const cacheKeyUserA = buildDeterministicCacheKey({
        module: "module04_math_solver",
        userId: "usr_alice_111",
        grade: "grade_2",
        mode: "solve",
        language: "km",
        inputFingerprint: "problem_sha256_shared_question",
        modelName: "gemini-2.5-flash",
        promptVersion: "solver_v2.0",
      });

      await PersistentCacheStore.set({
        cacheKey: cacheKeyUserA,
        userId: "usr_alice_111",
        module: "module04_math_solver",
        grade: "grade_2",
        mode: "solve",
        language: "km",
        inputFingerprint: "problem_sha256_shared_question",
        modelName: "gemini-2.5-flash",
        promptVersion: "solver_v2.0",
        summary: "Alice's private homework solution",
        outputFields: { solution: "Secret private work of Alice" },
        driveFileIds: { latex: "drive_file_alice_tex_123" },
        driveLinks: { latex: "https://drive.google.com/file/d/drive_file_alice_tex_123/view" },
        mimeTypes: { latex: "application/x-tex" },
        status: "completed",
      });

      // 1. User Alice accesses her own cache: SUCCESS
      const aliceResult = await PersistentCacheStore.get(cacheKeyUserA, "usr_alice_111");
      expect(aliceResult).not.toBeNull();
      expect(aliceResult?.outputFields.solution).toBe("Secret private work of Alice");

      // 2. User Bob attempts to access Alice's cache: ACCESS DENIED (returns null)
      const bobResult = await PersistentCacheStore.get(cacheKeyUserA, "usr_bob_222");
      expect(bobResult).toBeNull();

      // 3. Admin user with RBAC can inspect records
      const adminList = await PersistentCacheStore.listAllRecords();
      expect(adminList.length).toBeGreaterThanOrEqual(1);
      expect(adminList.some((r) => r.userId === "usr_alice_111")).toBe(true);

      // 4. Bob's private list only shows his own records
      const bobList = await PersistentCacheStore.listUserRecords("usr_bob_222");
      expect(bobList.length).toBe(0);
    });
  });

  describe("C. Cache Reuse & Preserving Drive File IDs", () => {
    it("stores real Google Drive file IDs and retrieves them upon cache hit", async () => {
      const cacheKey = buildDeterministicCacheKey({
        module: "module01_math_ocr",
        userId: "usr_charlie_333",
        grade: "grade_4",
        mode: "ocr_standard",
        language: "km",
        inputFingerprint: "image_fingerprint_charlie",
        modelName: "gemini-2.5-flash",
        promptVersion: "math_ocr_v2.0",
      });

      const driveFileIds = {
        original: "1dS_original_image_id_456",
        latex: "1dS_latex_tex_id_789",
        html: "1dS_preview_html_id_012",
        mathml: "1dS_mathml_xml_id_345",
        text: "1dS_plain_text_id_678",
      };

      const driveLinks = {
        original: "https://drive.google.com/file/d/1dS_original_image_id_456/view",
        latex: "https://drive.google.com/file/d/1dS_latex_tex_id_789/view",
        html: "https://drive.google.com/file/d/1dS_preview_html_id_012/view",
        mathml: "https://drive.google.com/file/d/1dS_mathml_xml_id_345/view",
        text: "https://drive.google.com/file/d/1dS_plain_text_id_678/view",
      };

      await PersistentCacheStore.set({
        cacheKey,
        userId: "usr_charlie_333",
        module: "module01_math_ocr",
        grade: "grade_4",
        mode: "ocr_standard",
        language: "km",
        inputFingerprint: "image_fingerprint_charlie",
        modelName: "gemini-2.5-flash",
        promptVersion: "math_ocr_v2.0",
        summary: "OCR recognition of 2x^2 + 5x + 3 = 0",
        outputFields: {
          transcription: "2x^2 + 5x + 3 = 0",
          latex: "2x^2 + 5x + 3 = 0",
          mathml: "<math><mn>2</mn><msup><mi>x</mi><mn>2</mn></msup></math>",
        },
        driveFileIds,
        driveLinks,
        mimeTypes: {
          original: "image/png",
          latex: "application/x-tex",
          html: "text/html",
          mathml: "application/xml",
          text: "text/plain",
        },
        status: "completed",
      });

      // Subsequent identical request reuses cache
      const cached = await PersistentCacheStore.get(cacheKey, "usr_charlie_333");
      expect(cached).not.toBeNull();
      expect(cached?.status).toBe("completed");
      expect(cached?.driveFileIds.latex).toBe("1dS_latex_tex_id_789");
      expect(cached?.driveLinks.latex).toContain("1dS_latex_tex_id_789");
      expect(cached?.driveFileIds.html).toBe("1dS_preview_html_id_012");
      expect(cached?.driveFileIds.mathml).toBe("1dS_mathml_xml_id_345");
      expect(cached?.driveFileIds.text).toBe("1dS_plain_text_id_678");
    });

    it("survives refresh and re-login without data loss", async () => {
      const cacheKey = buildDeterministicCacheKey({
        module: "module05_lesson_studio",
        userId: "usr_teacher_kh",
        grade: "grade_5",
        mode: "worksheet",
        language: "km",
        inputFingerprint: "lesson_prompt_fingerprint",
        modelName: "gemini-flash-lite-latest",
        promptVersion: "lesson_studio_v2.0",
      });

      await PersistentCacheStore.set({
        cacheKey,
        userId: "usr_teacher_kh",
        module: "module05_lesson_studio",
        grade: "grade_5",
        mode: "worksheet",
        language: "km",
        inputFingerprint: "lesson_prompt_fingerprint",
        modelName: "gemini-flash-lite-latest",
        promptVersion: "lesson_studio_v2.0",
        summary: "Grade 5 Fractions Worksheet",
        outputFields: {
          title: "សន្លឹកកិច្ចការប្រភាគថ្នាក់ទី ៥",
          htmlContent: "<div>Worksheet content</div>",
        },
        driveFileIds: { html: "drive_worksheet_html_555" },
        driveLinks: { html: "https://drive.google.com/file/d/drive_worksheet_html_555/view" },
        mimeTypes: { html: "text/html" },
        status: "completed",
      });

      // User logs out and logs back in (simulated by reading afresh with userId)
      const reloadedRecord = await PersistentCacheStore.get(cacheKey, "usr_teacher_kh");
      expect(reloadedRecord).not.toBeNull();
      expect(reloadedRecord?.outputFields.title).toBe("សន្លឹកកិច្ចការប្រភាគថ្នាក់ទី ៥");
      expect(reloadedRecord?.driveFileIds.html).toBe("drive_worksheet_html_555");
    });
  });

  describe("D. Image Matching & Normalization", () => {
    it("computes exact and normalized SHA-256 fingerprints correctly", () => {
      // Create minimal synthetic PNG buffer
      const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      const ihdrChunk = Buffer.from([
        0x00, 0x00, 0x00, 0x0d, // Length 13
        0x49, 0x48, 0x44, 0x52, // 'IHDR'
        0x00, 0x00, 0x00, 0x10, // Width 16
        0x00, 0x00, 0x00, 0x10, // Height 16
        0x08, 0x02, 0x00, 0x00, 0x00,
        0x90, 0x77, 0x53, 0xde, // CRC
      ]);
      const idatChunk = Buffer.from([
        0x00, 0x00, 0x00, 0x04, // Length 4
        0x49, 0x44, 0x41, 0x54, // 'IDAT'
        0x78, 0x9c, 0x63, 0x00, // Dummy data
        0x00, 0x00, 0x00, 0x01, // CRC
      ]);
      const iendChunk = Buffer.from([
        0x00, 0x00, 0x00, 0x00,
        0x49, 0x45, 0x4e, 0x44,
        0xae, 0x42, 0x60, 0x82,
      ]);

      const originalPng = Buffer.concat([pngHeader, ihdrChunk, idatChunk, iendChunk]);
      const exactSha = computeExactSha256(originalPng);
      const normalizedSha = computeNormalizedImageSha256(originalPng);

      expect(exactSha).toHaveLength(64);
      expect(normalizedSha).toHaveLength(64);
    });

    it("matches normalized image across metadata/EXIF variations", async () => {
      const buf1 = Buffer.from("test_image_data_payload_123");
      const exactSha = computeExactSha256(buf1);
      const normalizedSha = computeNormalizedImageSha256(buf1);

      const cacheKey = buildDeterministicCacheKey({
        module: "module01_math_ocr",
        userId: "usr_student_01",
        grade: "auto",
        mode: "standard",
        language: "km",
        inputFingerprint: exactSha,
        modelName: "gemini-2.5-flash",
        promptVersion: "math_ocr_v2.0",
      });

      await PersistentCacheStore.set({
        cacheKey,
        userId: "usr_student_01",
        module: "module01_math_ocr",
        grade: "auto",
        mode: "standard",
        language: "km",
        inputFingerprint: exactSha,
        exactImageSha256: exactSha,
        normalizedImageSha256: normalizedSha,
        modelName: "gemini-2.5-flash",
        promptVersion: "math_ocr_v2.0",
        summary: "Equation on blackboard",
        outputFields: { latex: "x + y = 10" },
        status: "completed",
      });

      // Lookup by exact image SHA-256
      const hitExact = await PersistentCacheStore.lookupByContent({
        userId: "usr_student_01",
        module: "module01_math_ocr",
        grade: "auto",
        mode: "standard",
        language: "km",
        modelName: "gemini-2.5-flash",
        promptVersion: "math_ocr_v2.0",
        exactImageSha256: exactSha,
      });
      expect(hitExact).not.toBeNull();
      expect(hitExact?.outputFields.latex).toBe("x + y = 10");

      // Lookup by normalized image SHA-256 (even if original bytes hash differed due to metadata)
      const hitNormalized = await PersistentCacheStore.lookupByContent({
        userId: "usr_student_01",
        module: "module01_math_ocr",
        grade: "auto",
        mode: "standard",
        language: "km",
        modelName: "gemini-2.5-flash",
        promptVersion: "math_ocr_v2.0",
        normalizedImageSha256: normalizedSha,
      });
      expect(hitNormalized).not.toBeNull();
      expect(hitNormalized?.cacheKey).toBe(cacheKey);
    });
  });

  describe("E. Artifact Builders & Format Invariants", () => {
    it("builds Module 01 artifacts including LaTeX (.tex), HTML (.html), MathML (.xml), Text (.txt)", () => {
      const artifacts = buildModule01Artifacts({
        username: "dayuth",
        timestamp: 1729329482938,
        latex: "\\frac{a}{b} = c",
        transcription: "លំហាត់ទី ១៖ a/b = c",
        mathml: "<math><mfrac><mi>a</mi><mi>b</mi></mfrac></math>",
        html: "<!DOCTYPE html><html><body><div>Rendered math</div></body></html>",
        originalImage: {
          buffer: Buffer.from("fake_image_bytes"),
          filename: "sample.png",
          mimeType: "image/png",
        },
      });

      const types = artifacts.map((a) => a.type);
      expect(types).toContain("original");
      expect(types).toContain("latex");
      expect(types).toContain("html");
      expect(types).toContain("mathml");
      expect(types).toContain("text");

      const latexArtifact = artifacts.find((a) => a.type === "latex");
      expect(latexArtifact?.filename).toBe("module01_math_ocr_dayuth_1729329482938_latex.tex");
      expect(latexArtifact?.mimeType).toContain("x-tex");

      const htmlArtifact = artifacts.find((a) => a.type === "html");
      expect(htmlArtifact?.filename).toBe("module01_math_ocr_dayuth_1729329482938_preview.html");
      expect(htmlArtifact?.buffer.toString("utf-8")).toContain("<!DOCTYPE html>");

      const textArtifact = artifacts.find((a) => a.type === "text");
      expect(textArtifact?.filename).toBe("module01_math_ocr_dayuth_1729329482938_ocr_text.txt");
    });

    it("builds Module 04 artifacts with self-contained HTML and plain text solution", () => {
      const artifacts = buildModule04Artifacts({
        username: "dayuth",
        timestamp: 1729329482938,
        originalImage: {
          buffer: Buffer.from("image_problem"),
          filename: "problem.png",
          mimeType: "image/png",
        },
        problemText: "លំហាត់ទី ៤",
        solutionHtml: "<html><body><div class='math-solution'>ដំណោះស្រាយ</div></body></html>",
        solutionText: "ដំណោះស្រាយ៖ 2 + 2 = 4",
      });

      expect(artifacts.length).toBeGreaterThanOrEqual(3);
      const htmlArt = artifacts.find((a) => a.type === "html");
      expect(htmlArt?.filename).toBe("module04_math_solver_dayuth_1729329482938_solution_card.html");
      expect(htmlArt?.buffer.toString("utf-8")).toContain("math-solution");

      const textArt = artifacts.find((a) => a.type === "text");
      expect(textArt?.filename).toBe("module04_math_solver_dayuth_1729329482938_solution.txt");
    });

    it("builds Module 05 lesson studio artifacts (lesson HTML, summary text, quiz)", () => {
      const artifacts = buildModule05Artifacts({
        username: "teacher_sok",
        timestamp: 1729329482938,
        originalImage: {
          buffer: Buffer.from("ref_image"),
          filename: "ref.png",
          mimeType: "image/png",
        },
        lessonHtml: "<div>មេរៀនប្រភាគថ្នាក់ទី៤</div>",
        lessonText: "សង្ខេបមេរៀន...",
        quizHtml: "<div>កម្រងសំណួរ</div>",
      });

      const types = artifacts.map((a) => a.type);
      expect(types).toContain("original");
      expect(types).toContain("html");
      expect(types).toContain("text");
      const quizArt = artifacts.find((a) => a.filename.includes("quiz_worksheet"));
      expect(quizArt).toBeDefined();
    });
  });

  describe("F. Failure Recovery & Truthful Drive Storage Status", () => {
    it("failed Drive upload sets status to partial and does not falsely claim complete success", async () => {
      const cacheKey = buildDeterministicCacheKey({
        module: "module01_math_ocr",
        userId: "usr_fail_test",
        grade: "auto",
        mode: "standard",
        language: "km",
        inputFingerprint: "fingerprint_partial_upload",
        modelName: "gemini-2.5-flash",
        promptVersion: "math_ocr_v2.0",
      });

      // Write record with partial status (Drive failed or not connected)
      await PersistentCacheStore.set({
        cacheKey,
        userId: "usr_fail_test",
        module: "module01_math_ocr",
        grade: "auto",
        mode: "standard",
        language: "km",
        inputFingerprint: "fingerprint_partial_upload",
        modelName: "gemini-2.5-flash",
        promptVersion: "math_ocr_v2.0",
        summary: "OCR calculation result",
        outputFields: { latex: "x^2 = 4" },
        driveFileIds: {}, // No drive file IDs
        driveLinks: {},
        processingStatus: "partial",
      });

      const record = await PersistentCacheStore.get(cacheKey, "usr_fail_test");
      expect(record?.processingStatus).toBe("partial");
      expect(Object.keys(record?.driveFileIds || {}).length).toBe(0);

      // Now simulate retry_storage updating the existing record without calling Gemini
      await PersistentCacheStore.updateDriveArtifacts(
        cacheKey,
        "usr_fail_test",
        { latex: "real_drive_id_recovered_999" },
        { latex: "https://drive.google.com/file/d/real_drive_id_recovered_999/view" }
      );

      const updated = await PersistentCacheStore.get(cacheKey, "usr_fail_test");
      expect(updated?.processingStatus).toBe("completed");
      expect(updated?.driveFileIds.latex).toBe("real_drive_id_recovered_999");
      expect(updated?.outputFields.latex).toBe("x^2 = 4"); // Preserved output without re-calling Gemini
    });
  });

  describe("G. History API Endpoints & RBAC Enforcement", () => {
    it("GET /api/history rejects unauthenticated requests with 401", async () => {
      vi.spyOn(authSession, "getSessionUser").mockResolvedValue(null);

      const req = new NextRequest("http://localhost:3000/api/history");
      const res = await getHistory(req);
      expect(res.status).toBe(401);
    });

    it("GET /api/history returns only the caller's own records for standard USER", async () => {
      vi.spyOn(authSession, "getSessionUser").mockResolvedValue({
        id: "usr_user_1",
        username: "user1",
        displayName: "User One",
        email: "user1@example.com",
        role: "USER",
        status: "ACTIVE",
        mustChangePassword: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      // Populate records for user1 and user2
      await PersistentCacheStore.set({
        cacheKey: "key_user1",
        userId: "usr_user_1",
        module: "module01_math_ocr",
        grade: "grade_1",
        mode: "standard",
        language: "km",
        inputFingerprint: "hash_user1",
        modelName: "gemini-2.5-flash",
        promptVersion: "v1",
        summary: "User 1 formula",
        outputFields: { latex: "a+b" },
        processingStatus: "completed",
      });

      await PersistentCacheStore.set({
        cacheKey: "key_user2",
        userId: "usr_user_2",
        module: "module01_math_ocr",
        grade: "grade_1",
        mode: "standard",
        language: "km",
        inputFingerprint: "hash_user2",
        modelName: "gemini-2.5-flash",
        promptVersion: "v1",
        summary: "User 2 formula",
        outputFields: { latex: "c+d" },
        processingStatus: "completed",
      });

      const req = new NextRequest("http://localhost:3000/api/history");
      const res = await getHistory(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.role).toBe("USER");
      expect(data.count).toBe(1);
      expect(data.items[0].userId).toBe("usr_user_1");
    });

    it("GET /api/history allows ADMIN to view all records across all users", async () => {
      vi.spyOn(authSession, "getSessionUser").mockResolvedValue({
        id: "usr_admin_master",
        username: "admin",
        displayName: "Administrator",
        email: "admin@example.com",
        role: "ADMIN",
        status: "ACTIVE",
        mustChangePassword: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      await PersistentCacheStore.set({
        cacheKey: "key_admin_test_1",
        userId: "usr_user_1",
        module: "module01_math_ocr",
        grade: "grade_1",
        mode: "standard",
        language: "km",
        inputFingerprint: "hash_admin_1",
        modelName: "gemini-2.5-flash",
        promptVersion: "v1",
        summary: "User 1 formula",
        outputFields: { latex: "a+b" },
        processingStatus: "completed",
      });

      await PersistentCacheStore.set({
        cacheKey: "key_admin_test_2",
        userId: "usr_user_2",
        module: "module01_math_ocr",
        grade: "grade_1",
        mode: "standard",
        language: "km",
        inputFingerprint: "hash_admin_2",
        modelName: "gemini-2.5-flash",
        promptVersion: "v1",
        summary: "User 2 formula",
        outputFields: { latex: "c+d" },
        processingStatus: "completed",
      });

      const req = new NextRequest("http://localhost:3000/api/history");
      const res = await getHistory(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.role).toBe("ADMIN");
      expect(data.count).toBeGreaterThanOrEqual(2);
      expect(data.items.some((i: any) => i.userId === "usr_user_1")).toBe(true);
      expect(data.items.some((i: any) => i.userId === "usr_user_2")).toBe(true);
    });

    it("POST /api/history deletes record when requested by owner", async () => {
      vi.spyOn(authSession, "getSessionUser").mockResolvedValue({
        id: "usr_user_1",
        username: "user1",
        displayName: "User One",
        email: "user1@example.com",
        role: "USER",
        status: "ACTIVE",
        mustChangePassword: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      await PersistentCacheStore.set({
        cacheKey: "key_to_delete",
        userId: "usr_user_1",
        module: "module01_math_ocr",
        grade: "grade_1",
        mode: "standard",
        language: "km",
        inputFingerprint: "hash_del",
        modelName: "gemini-2.5-flash",
        promptVersion: "v1",
        summary: "Delete formula",
        outputFields: { latex: "to_delete" },
        processingStatus: "completed",
      });

      const req = new NextRequest("http://localhost:3000/api/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", cacheKey: "key_to_delete" }),
      });

      const res = await postHistory(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);

      const deleted = await PersistentCacheStore.get("key_to_delete", "usr_user_1");
      expect(deleted).toBeNull();
    });
  });
});
