import { permanentRedirect } from "next/navigation";

/**
 * Permanent 308 redirect from /math-ocr to /plp-math-content.
 * Preserves legacy route compatibility while routing users and crawlers
 * to the clean canonical route.
 */
export default function MathOcrRedirectPage() {
  permanentRedirect("/plp-math-content");
}
