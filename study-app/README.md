# Flashdrop

Live at **[flashdropai.com](https://flashdropai.com)** (once deployed).

Snap your notes, get a quiz in seconds. Students photograph handwritten or printed notes (or write them on an iPad with Apple Pencil). The app cleans up the photo, reads it with AI, lets the student fix any word it wasn't sure about, then makes quizzes, flashcards and practice tests linked back to the notes.

> To rename the app, change it in **`src/config/app.ts`**; it flows to page titles, link previews and the sign-in screen.

## Status: Stage 1 done

| Area | What's in |
| --- | --- |
| Sign-in | Google and Apple via Supabase Auth. Local email login for testing only (`NEXT_PUBLIC_ENABLE_DEV_LOGIN`). |
| Note capture | In-app multi-page camera, photo/PDF/PowerPoint upload, drag-and-drop on laptop, Apple Pencil writing on iPad. Notes saved by class and topic. |
| Photo cleanup | Auto-crop, straighten, shadow/glare removal, color correction, contrast boost. Runs in a Web Worker before upload (`src/lib/imaging`). Before/after toggle. |
| Handwriting reading | Claude vision with the class and topic as context. Unsure words come back marked and show up highlighted; tap to pick an alternative or type the fix. Math in LaTeX, diagrams described. |
| Learns your handwriting | Every fix (tapped or typed) is saved. Before each read, past fixes become a profile (common misreads, letter habits, class vocabulary) that is sent to the model (`src/lib/handwriting/profile.ts`). |
| Focus marks | Pink highlighter on a photo or Pencil page, or select text in review: "Quiz me harder on this". Those passages get more and harder questions. |
| Quiz generation | Concepts, definitions, dates, formulas and vocabulary, then multiple choice, flashcards, fill in the blank, true/false, short answer and matching. Every question stores the page and exact quote it came from. Edit, delete, regenerate (or switch type). |
| Studying | Practice with instant feedback and the source passage, swipeable flashcards, timed practice test. Pencil answers on iPad. |
| Devices | Phone opens to a big camera button; iPad gets Pencil writing; laptop gets the full dashboard and library. Runs in the browser at a normal link (no install). Dark mode first, plus light mode. |
| Sharing | Share any quiz by link or code. Friends open `/q/CODE` and play without an account. Link previews (iMessage, Snapchat, WhatsApp) show a card with the title, class and question count. |
| Sync | Supabase Realtime: changes on one device show up on the others instantly. |

**Stage 2 (next):** smart review with spaced repetition, AI tutor, saving guest scores after sign-up, quiz requests, study groups, live games, daily streaks/points/badges, test countdown plan.

## Stack and why

- **Next.js 16 (App Router, TypeScript)**: one responsive website for phone, iPad and laptop; server routes keep AI keys off the device.
- **Supabase**: Postgres with row-level security (each student can only touch their own rows and image folder), Google/Apple auth, Realtime for cross-device sync and later live games, private storage for page photos.
- **Claude (Anthropic API)**: vision model that reads words in context; structured JSON output for reliable quizzes.
- **Tailwind CSS 4 + Framer Motion**: fast, themeable UI with smooth animations (all respect the system reduce-motion setting).

## Design system

- **Look:** dark first, one accent (electric lime `#C4F82A`) on neutral grays, Geist type. All colors are tokens in `src/app/globals.css`; light and dark are defined side by side.
- **Logo:** a lime flashcard with a lightning bolt on a near-black tile. Source art in `assets/brand/` (full mark, square version for iOS, and a simpler single-card mark for 16–32px). `node scripts/make-icons.mjs` regenerates the favicon, browser-tab and home-screen icons.
- **Icons:** our own set in `src/components/icons.tsx` (24px, 1.8px rounded stroke, soft duotone fill). Empty-state illustrations are in `src/components/ui/illustrations.tsx`.
- **Motion:** springy buttons, page transitions (React `<ViewTransition>`), 3D flip + physics swipe flashcards, a scanning animation while notes are read, confetti on wins (`src/lib/celebrate.ts`).
- **Visual QA:** `node scripts/screenshots.mjs <outDir>` seeds a demo account and screenshots every main screen on phone, iPad and laptop in both themes, plus side-by-side contact sheets.

## Project layout

```
src/config/app.ts          App name and branding (change the name here)
src/config/plans.ts        Plan limits; add a paid tier here
src/lib/ai/                All AI calls. index.ts picks the provider
  providers/claude.ts      Claude: models and effort per task (CLAUDE_TASKS)
  providers/mock.ts        Offline provider for dev and tests
  prompts.ts, schemas.ts   Provider-neutral prompts and output schemas
src/lib/imaging/           Photo cleanup pipeline (pure functions + worker)
src/lib/handwriting/       Uncertain-word markers, correction diffing, handwriting profile
src/lib/quiz/              Question schemas, grading, source-quote matching
src/lib/entitlements.ts    The one place limits are enforced
src/app/api/               Server routes: read page, make quiz, regenerate, read handwritten answer
supabase/migrations/       Database schema + RLS policies + storage bucket
tests/unit, integration, e2e
```

### Swapping AI models
Change `CLAUDE_TASKS` in `src/lib/ai/providers/claude.ts` to use a different Claude model or effort per task. To use another provider, implement the `AIProvider` interface (`src/lib/ai/types.ts`) in a new file under `providers/` and add it to `getAI()`. Nothing else changes.

### Adding a paid tier later
`profiles.plan` is `free` or `pro` (students can't change it themselves; RLS blocks it). Set limits in `src/config/plans.ts`, flip `plan` from a payment webhook, and `src/lib/entitlements.ts` enforces it. Every AI call is already metered in `usage_events`.

## Run it locally

Requires Node 20+ and Docker.

```bash
cd study-app
npm install
npm run db:start            # local Supabase (applies migrations)
cp .env.example .env.local  # then fill in from `npx supabase status`
npm run dev
```

For offline development without an AI key set `AI_PROVIDER=mock` and `NEXT_PUBLIC_ENABLE_DEV_LOGIN=true` in `.env.local`. The mock reads every page as a sample biology page and builds simple questions, so you can click through the whole app.

## Tests

```bash
npm test                  # unit: image cleanup, handwriting learning, grading, quiz schemas, Claude request shape (36 tests)
npm run test:integration  # row-level security against local Supabase (7 tests)
npm run build && npm run test:e2e   # Playwright: full capture → read → fix → quiz → study flow, sharing, sync, phone/iPad layouts (7 tests)
```

## Going live (checklist)

1. **Supabase project**: create one, run `npx supabase link` then `npx supabase db push` to apply the schema.
2. **Google sign-in**: create an OAuth client in Google Cloud and add it under Supabase → Authentication → Providers → Google.
3. **Apple sign-in**: needs a paid Apple Developer account. Create a Services ID and key, then add them under Supabase → Providers → Apple.
4. **Redirect URLs**: in Supabase → Authentication → URL Configuration set Site URL to `https://flashdropai.com` and add `https://flashdropai.com/auth/callback` (and `https://www.flashdropai.com/auth/callback` if you use www).
5. **Anthropic API key**: set `ANTHROPIC_API_KEY` on the server (never in `NEXT_PUBLIC_*`).
6. **Deploy** (e.g. Vercel) with the variables from `.env.example`, `NEXT_PUBLIC_SITE_URL=https://flashdropai.com`. Leave `NEXT_PUBLIC_ENABLE_DEV_LOGIN` unset. Long AI routes set `maxDuration` up to 300 s.
7. **Domain**: add `flashdropai.com` in your host's domain settings and point your registrar's DNS records at it as the host instructs.

## Privacy and security

- Row-level security on every table and on the image bucket; there is no service-role key in the app.
- AI keys and calls stay on the server; inputs are validated with zod; errors never leak internals.
- Page photos are private and served through short-lived signed URLs.
- Daily per-student AI limits (`src/config/plans.ts`) prevent abuse.
