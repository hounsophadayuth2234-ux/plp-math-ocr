This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Vercel Environment Variables Configuration (Module 02 Remote Worker)

To connect Module 02 (កាត់រូបភាព) to an optional high-capacity Remote Background Removal Worker (e.g. self-hosted Rembg / BiRefNet container or Hugging Face Space), configure the following server-side environment variables in Vercel:

### 1. Variables Reference

| Variable | Scope | Description |
| :--- | :--- | :--- |
| `BACKGROUND_REMOVAL_WORKER_URL` | Server-Only | URL of the remote worker service (HTTP/HTTPS only). |
| `BACKGROUND_REMOVAL_WORKER_TOKEN` | Server-Only | Optional Bearer authorization token forwarded to the worker. |
| `BACKGROUND_REMOVAL_TIMEOUT_MS` | Server-Only | Optional timeout in milliseconds (default: `30000`). |
| `BACKGROUND_REMOVAL_MAX_UPLOAD_BYTES` | Server-Only | Optional max upload size limit in bytes (default: `12582912` / 12MB). |

> [!WARNING]
> **CRITICAL SECURITY REQUIREMENT:**
> `BACKGROUND_REMOVAL_WORKER_TOKEN` and `BACKGROUND_REMOVAL_WORKER_URL` must **NEVER** use the `NEXT_PUBLIC_` prefix.
> Keeping them server-only ensures secrets and endpoints are never bundled into client-side JavaScript or exposed to the browser. The client communicates exclusively through the secure, validated Next.js proxy route at `POST /api/remove-bg`.

### 2. Configuring via Vercel Dashboard

1. Navigate to your project on the [Vercel Dashboard](https://vercel.com/dashboard).
2. Go to **Settings** > **Environment Variables**.
3. Add `BACKGROUND_REMOVAL_WORKER_URL` and `BACKGROUND_REMOVAL_WORKER_TOKEN`.
4. Select the appropriate environments:
   - **Production**: For the live production deployment.
   - **Preview**: For pull request / staging branches.
   - **Development**: For local development workflows.

### 3. Configuring via Vercel CLI

Add variables directly from your terminal using `vercel env add`:

```bash
# Add worker URL for Production, Preview, and Development
vercel env add BACKGROUND_REMOVAL_WORKER_URL

# Add server-only Bearer token
vercel env add BACKGROUND_REMOVAL_WORKER_TOKEN

# Pull environment variables down to your local .env.local file
vercel env pull .env.local
```

### 4. Deployment Trigger Notice

> [!IMPORTANT]
> In Vercel, changes made to environment variables **do not retroactively apply** to currently running deployments.
> After adding, updating, or removing environment variables, you **must trigger a new deployment** (either via `git push`, or by clicking **Redeploy** on the latest deployment in the Vercel dashboard) for serverless functions to pick up the new configuration.
