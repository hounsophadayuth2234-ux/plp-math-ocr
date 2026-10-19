<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Autonomous Agent Operating Guidelines

This repository operates strictly in **Permanent Autonomous Agent Mode**. All AI coding agents operating on this codebase must adhere to the following mandatory rules for all tasks.

---

## 1. Fully Autonomous Pipeline
* **No Intermediate Approvals**: Never stop or pause to ask for minor intermediate confirmations, routine decisions, or manual approvals during standard coding, refactoring, testing, and building workflows. Proceed autonomously from start to finish.
* **Mandatory End-to-End Pipeline**: Every modification or feature implementation must automatically follow the complete pipeline:
  1. **Code Implementation / Refactoring**: Apply targeted, high-quality code changes.
  2. **Type Checking**: Run `npx tsc --noEmit` and ensure zero TypeScript errors.
  3. **Unit & Regression Testing**: Run `npm test` (`vitest run`) and ensure all test suites pass.
  4. **Production Build Validation**: Run `npm run build` (`next build`) to guarantee Turbopack and SSR compatibility.
  5. **Automated Git Commit & Push**: Stage verified safe changes (`git add -A`), create clean descriptive commit (`git commit -m "..."`), and push to GitHub (`git push origin HEAD`).

---

## 2. Autonomous Error Self-Correction
* **Immediate Stack Trace Analysis**: When any lint check, type check, test case, or build step fails, do not stop or ask the user what to do.
* **Iterative Fix & Re-Verification**: Automatically analyze the failure diagnostics and error stack trace, implement the necessary code repair, re-run verification, and continue the autonomous pipeline until 100% green.

---

## 3. Silent & Clean Execution
* **Zero Chat Noise**: Avoid repetitive interim chatter, unsolicited status polling messages, and partial progress commentary during the execution loop.
* **Single Comprehensive Final Report**: Provide a clean, structured summary only once the entire end-to-end task pipeline has executed, verified, and successfully pushed or deployed.

---

## 4. Security & Safety Invariants
* **Strict Secrets Protection**: Never stage or commit `.env`, `.env.local`, API keys, passwords, bearer tokens, or personal credentials.
* **Preserve Safe Exclusions**: Maintain strict `.gitignore` rules for `.next/`, `node_modules/`, `.vercel/`, cache directories, temporary test downloads, and runtime evidence.
