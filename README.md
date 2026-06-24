# Flowvia Health

Production-ready static marketing and compliance website for Flowvia Health, built with Next.js, TypeScript, and Tailwind CSS.

## Local development

```bash
pnpm install
pnpm dev
```

Open `http://localhost:3000`.

## Quality checks

```bash
pnpm lint
pnpm typecheck
pnpm build
```

## Deploy to Vercel

Import the repository in Vercel. The default Next.js framework settings are sufficient; no environment variables or backend services are required.

## Public compliance routes

- `/sms-consent`
- `/privacy`
- `/terms`
- `/hipaa`
- `/contact`

The consent and contact forms are intentionally local demonstration placeholders. They do not transmit or store submitted data.

## Temporary brand lockup

The site currently uses a minimal text-based Flowvia Health lockup and abstract three-path placeholder. Replace the placeholder component in `components/logo.tsx` when the approved final vector logo asset is available.
