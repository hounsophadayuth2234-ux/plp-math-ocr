import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-session";
import { PersistentCacheStore, PersistentCacheRecord } from "@/lib/persistent-cache-store";
import {
  buildModule01Artifacts,
  buildModule04Artifacts,
  buildModule05Artifacts,
  uploadArtifactsToGoogleDrive,
} from "@/lib/gemini-cache-artifacts";
import {
  renderCanonicalSolutionHtml,
  renderCanonicalSolutionPlainText,
} from "@/lib/math-solution-html";

export const maxDuration = 45;

/**
 * GET /api/history
 * Returns user's persistent result history from Redis index.
 * ADMIN accounts can view all results across users.
 * Standard USER accounts strictly only view their own private records.
 */
export async function GET(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized: សូមចូលគណនីជាមុនសិន (Please log in first)." },
      { status: 401 }
    );
  }

  const searchParams = req.nextUrl.searchParams;
  const moduleFilter = searchParams.get("module") || undefined;

  try {
    const isAdmin = user.role === "ADMIN" || user.role === "SUPER_ADMIN";
    const records =
      isAdmin
        ? await PersistentCacheStore.listAllRecords(moduleFilter)
        : await PersistentCacheStore.listUserRecords(user.id, moduleFilter);

    const items = records.map((r) => {
      let summary = r.normalizedQuestionText || "";
      if (!summary && r.module.includes("ocr")) {
        summary = (r.outputFields?.transcription || r.outputFields?.latex || "Math OCR result").slice(0, 120);
      } else if (!summary && r.module.includes("solver")) {
        summary = (r.outputFields?.extractedText || r.outputFields?.problems?.[0]?.extractedProblem || "Math Problem Solution").slice(0, 120);
      } else if (!summary && r.module.includes("lesson")) {
        summary = (r.outputFields?.visual?.titleKhmer || r.outputFields?.quiz?.titleKhmer || r.outputFields?.styler?.titleKhmer || "Lesson content").slice(0, 120);
      }

      return {
        cacheKey: r.cacheKey,
        userId: r.userId,
        module: r.module,
        grade: r.grade,
        mode: r.mode,
        language: r.language,
        summary: summary || "Processed math result",
        modelName: r.modelName,
        promptVersion: r.promptVersion,
        createdAt: r.timestamps.createdAt,
        lastAccessedAt: r.timestamps.lastAccessedAt,
        status: r.processingStatus,
        driveFileIds: r.driveFileIds,
        driveLinks: r.driveLinks,
        outputFields: r.outputFields,
        source: r.source,
      };
    });

    return NextResponse.json({
      success: true,
      role: user.role,
      count: items.length,
      items,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[/api/history] Error listing history:", message);
    return NextResponse.json(
      { error: "Failed to load result history", details: message },
      { status: 500 }
    );
  }
}

/**
 * POST /api/history
 * Actions:
 * - action === "retry_storage": Retries uploading artifacts to Google Drive without re-calling Gemini
 * - action === "delete": Deletes a cached record
 */
import { enforceRateLimit } from "@/lib/rate-limiter";

export async function POST(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized: សូមចូលគណនីជាមុនសិន (Please log in first)." },
      { status: 401 }
    );
  }

  // Rate limiting (20 req/min per user)
  const rateLimitBlock = await enforceRateLimit(req, "history_mutation", { userId: user.id });
  if (rateLimitBlock) {
    return rateLimitBlock;
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const { action, cacheKey } = body || {};
  if (!cacheKey) {
    return NextResponse.json({ error: "cacheKey is required" }, { status: 400 });
  }

  const isAdmin = user.role === "ADMIN" || user.role === "SUPER_ADMIN";
  const record = await PersistentCacheStore.get(cacheKey, user.id);
  if (!record && !isAdmin) {
    return NextResponse.json(
      { error: "Record not found or access denied." },
      { status: 404 }
    );
  }

  const targetRecord = record || (await PersistentCacheStore.get(cacheKey, user.id));
  if (!targetRecord) {
    return NextResponse.json({ error: "Record not found." }, { status: 404 });
  }

  // Object-level authorization: Standard users can only mutate their own records
  if (!isAdmin && targetRecord.userId !== user.id) {
    return NextResponse.json(
      { error: "Forbidden: Cannot mutate another user's history record." },
      { status: 403 }
    );
  }

  // 1. Delete Action
  if (action === "delete") {
    await PersistentCacheStore.deleteRecord(cacheKey, targetRecord.userId);
    return NextResponse.json({ success: true, message: "Record deleted." });
  }

  // 2. Retry Storage Action (Google Drive re-upload without Gemini inference)
  if (action === "retry_storage") {
    let artifacts: any[] = [];
    const username = user.username || "user";

    if (targetRecord.module.includes("module01")) {
      artifacts = buildModule01Artifacts({
        username,
        latex: targetRecord.outputFields?.latex,
        html: targetRecord.outputFields?.joditHtml,
        mathml: targetRecord.outputFields?.mathml,
        transcription: targetRecord.outputFields?.transcription,
      });
    } else if (targetRecord.module.includes("module04")) {
      const problems = targetRecord.outputFields?.problems || [];
      const solutionHtml = problems.map((p: any) => renderCanonicalSolutionHtml(p)).join("\n<hr/>\n");
      const solutionText = problems.map((p: any) => renderCanonicalSolutionPlainText(p)).join("\n\n---\n\n");
      artifacts = buildModule04Artifacts({
        username,
        problemText: targetRecord.normalizedQuestionText,
        solutionText,
        solutionHtml,
      });
    } else if (targetRecord.module.includes("module05")) {
      artifacts = buildModule05Artifacts({
        username,
        lessonHtml: targetRecord.outputFields?.styler?.htmlContent,
        lessonText: targetRecord.outputFields?.styler?.correctedText || targetRecord.outputFields?.quiz?.textContent,
        quizHtml: targetRecord.outputFields?.quiz?.htmlContent,
        visualSvg: targetRecord.outputFields?.visual?.htmlCard || targetRecord.outputFields?.visual?.svg,
      });
    }

    if (artifacts.length === 0) {
      return NextResponse.json(
        { error: "No exportable artifacts found for this record." },
        { status: 400 }
      );
    }

    const uploadResult = await uploadArtifactsToGoogleDrive(targetRecord.userId, artifacts);
    const updated = await PersistentCacheStore.updateDriveArtifacts(
      cacheKey,
      targetRecord.userId,
      uploadResult.driveFileIds,
      uploadResult.driveLinks
    );

    return NextResponse.json({
      success: uploadResult.allSucceeded,
      record: updated,
      driveFileIds: uploadResult.driveFileIds,
      driveLinks: uploadResult.driveLinks,
      errors: uploadResult.errors,
    });
  }

  return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
}
