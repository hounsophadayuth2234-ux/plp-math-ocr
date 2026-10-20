import { NextRequest, NextResponse } from "next/server";
import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";
import { enforceRouteAuth } from "@/lib/auth-gate";
import { enforceRateLimit } from "@/lib/rate-limiter";
import { safeFetch } from "@/lib/ssrf-guard";

// -----------------------------------------------------------
// Types
// -----------------------------------------------------------
export interface ScrapeSuccess {
  url: string;
  title: string;
  /** Sanitized, selector-scoped HTML structure */
  html: string;
  /** All <style> and inline style content collected from the page */
  css: string;
  /** Combined self-contained bundle ready to paste/preview */
  bundle: string;
  scrapedAt: string;
}

export interface ScrapeError {
  error: string;
  details?: string;
}


// -----------------------------------------------------------
// CSS Sanitizer — scope all rules to a wrapper class
// to prevent the extracted styles from affecting the page.
// -----------------------------------------------------------
function sanitizeAndScopeCss(rawCss: string, scopeClass: string): string {
  // Very naive but effective for inline-use: prefix each rule block
  // Strip @charset, @import (external resources), and @font-face
  const stripped = rawCss
    .replace(/@charset[^;]+;/gi, "")
    .replace(/@import[^;]+;/gi, "")
    .replace(/@font-face\s*\{[^}]*\}/gi, "");

  // Prefix every rule selector with the scope class
  const scoped = stripped.replace(
    /([^{}]+)\{/g,
    (match, selector: string) => {
      if (selector.trim().startsWith("@")) return match; // keep @media etc.
      const prefixed = selector
        .split(",")
        .map((s) => `.${scopeClass} ${s.trim()}`)
        .join(", ");
      return `${prefixed} {`;
    }
  );
  return scoped;
}

// -----------------------------------------------------------
// HTML Sanitizer — remove scripts, tracking, dangerous attrs
// -----------------------------------------------------------
function sanitizeHtml($: cheerio.CheerioAPI, $root: cheerio.Cheerio<AnyNode>): string {
  // Remove dangerous elements
  $root.find("script, noscript, iframe, object, embed, link[rel=stylesheet]").remove();
  // Remove event handlers and dangerous attributes
  $root.find("*").each((_, el) => {
    if (el.type !== "tag") return;
    const attrs = Object.keys(el.attribs ?? {});
    for (const attr of attrs) {
      if (attr.startsWith("on") || attr === "srcdoc") {
        delete el.attribs[attr];
      }
    }
    // Neutralize src/href pointing to external resources (images kept as-is)
    if (el.attribs?.href && !el.attribs.href.startsWith("#")) {
      el.attribs.href = "#";
    }
  });
  return $root.html() ?? "";
}

// -----------------------------------------------------------
// Route Handler – POST /api/web-scraper
// -----------------------------------------------------------
export async function POST(req: NextRequest) {
  // 1. Enforce Server-Side Session Auth (defense-in-depth)
  const authBlock = await enforceRouteAuth(req);
  if (authBlock) return authBlock;

  // 2. Enforce Server-Side Rate Limiting (20 req/min/IP) before reading payload or fetching target
  const rateLimitBlock = await enforceRateLimit(req, "web_scraper");
  if (rateLimitBlock) {
    return rateLimitBlock;
  }

  try {
    const body = await req.json();
    const { url, selector } = body as { url: string; selector?: string };

    if (!url || typeof url !== "string") {
      return NextResponse.json<ScrapeError>(
        { error: "A valid URL is required." },
        { status: 400 }
      );
    }

    // Normalize URL
    const targetUrl = url.startsWith("http") ? url : `https://${url}`;

    // Fetch the target page using SSRF-safe fetch (DNS check, private IP block, redirect tracking)
    let rawHtml: string;
    try {
      const fetchResult = await safeFetch(targetUrl, {
        timeoutMs: 15_000,
        maxSizeBytes: 10 * 1024 * 1024,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; NexusAI-WebCloner/1.0; +internal)",
          Accept: "text/html,application/xhtml+xml",
          "Accept-Language": "en-US,en;q=0.9",
        },
      });
      rawHtml = new TextDecoder().decode(fetchResult.buffer);
    } catch (fetchErr: unknown) {
      const msg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
      const isSsrf =
        msg.toLowerCase().includes("ssrf") ||
        msg.toLowerCase().includes("private") ||
        msg.toLowerCase().includes("loopback") ||
        msg.toLowerCase().includes("metadata");

      if (isSsrf) {
        return NextResponse.json<ScrapeError>(
          {
            error: "Requests to internal/private IP ranges or metadata services are not allowed.",
            details: msg,
          },
          { status: 403 }
        );
      }

      return NextResponse.json<ScrapeError>(
        {
          error: "Failed to fetch the target URL.",
          details: msg,
        },
        { status: 502 }
      );
    }

    // Parse with Cheerio
    const $ = cheerio.load(rawHtml);
    const pageTitle = $("title").first().text().trim() || targetUrl;

    // Collect all <style> block contents
    const styleBlocks: string[] = [];
    $("style").each((_, el) => {
      styleBlocks.push($(el).text());
    });
    const rawCss = styleBlocks.join("\n\n");

    // Determine extraction root
    const SCOPE_CLASS = "nexusai-cloned";
    let $target: cheerio.Cheerio<AnyNode>;

    if (selector && selector.trim()) {
      $target = $(selector.trim()).first();
      if ($target.length === 0) {
        return NextResponse.json<ScrapeError>(
          {
            error: `CSS selector "${selector}" matched no elements on the page. Try a broader selector.`,
          },
          { status: 404 }
        );
      }
    } else {
      // Default: extract <main>, <article>, or <body> — in that priority
      $target =
        $("main").first().length
          ? $("main").first()
          : $("article").first().length
          ? $("article").first()
          : $("body");
    }

    const sanitizedHtml = sanitizeHtml($, $target);
    const scopedCss = sanitizeAndScopeCss(rawCss, SCOPE_CLASS);

    // Build a self-contained preview bundle
    const bundle = `<!-- Cloned from: ${targetUrl} | NexusAI Web Cloner | ${new Date().toISOString()} -->
<style>
/* Scoped CSS — all rules prefixed with .${SCOPE_CLASS} to prevent leakage */
${scopedCss}
</style>
<div class="${SCOPE_CLASS}">
${sanitizedHtml}
</div>`;

    return NextResponse.json<ScrapeSuccess>(
      {
        url: targetUrl,
        title: pageTitle,
        html: sanitizedHtml,
        css: scopedCss,
        bundle,
        scrapedAt: new Date().toISOString(),
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unexpected error.";
    console.error("[/api/web-scraper]", err);
    return NextResponse.json<ScrapeError>(
      { error: "Web scraping failed.", details: message },
      { status: 500 }
    );
  }
}
