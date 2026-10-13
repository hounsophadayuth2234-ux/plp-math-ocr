import { NextRequest, NextResponse } from "next/server";
import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";

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

// Blocked domains to prevent SSRF abuse in a team context
const BLOCKED_HOSTS = [
  "localhost", "127.0.0.1", "0.0.0.0",
  "169.254.", "10.", "192.168.", "172.16.",
];

function isBlockedUrl(urlStr: string): boolean {
  try {
    const u = new URL(urlStr);
    return BLOCKED_HOSTS.some((h) => u.hostname.startsWith(h) || u.hostname === h);
  } catch {
    return true;
  }
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

    if (isBlockedUrl(targetUrl)) {
      return NextResponse.json<ScrapeError>(
        { error: "Requests to internal/private IP ranges are not allowed." },
        { status: 403 }
      );
    }

    // Fetch the target page (15s timeout)
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    let rawHtml: string;

    try {
      const response = await fetch(targetUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; NexusAI-WebCloner/1.0; +internal)",
          Accept: "text/html,application/xhtml+xml",
          "Accept-Language": "en-US,en;q=0.9",
        },
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!response.ok) {
        return NextResponse.json<ScrapeError>(
          {
            error: `Target server returned HTTP ${response.status}: ${response.statusText}`,
          },
          { status: 502 }
        );
      }
      rawHtml = await response.text();
    } catch (fetchErr) {
      clearTimeout(timeout);
      return NextResponse.json<ScrapeError>(
        {
          error: "Failed to fetch the target URL.",
          details: fetchErr instanceof Error ? fetchErr.message : String(fetchErr),
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
