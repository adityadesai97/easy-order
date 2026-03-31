# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Install dependencies (node_modules not committed)
npm install

# Local dev server
npm run dev        # http://localhost:3000

# Type-check and build
./node_modules/.bin/next build   # use this, not `next build` or `npx next build`

# Lint
npm run lint

# Deploy to production
vercel deploy --prod
```

There are no tests. The build command serves as type-checking.

## Environment Variables

Required in `.env.local` (local) and Vercel project settings (production):

| Variable | Purpose |
|---|---|
| `ASSEMBLYAI_API_KEY` | AssemblyAI Streaming STT |
| `ANTHROPIC_API_KEY` | Claude order analysis |
| `SESSION_SECRET` | Passcode cookie value (set to the user's chosen passcode) |
| `ANTHROPIC_MODEL` | Optional override; defaults to `claude-sonnet-4-20250514` |

## Architecture

**Stack**: Next.js 14 App Router, TypeScript, Tailwind, deployed on Vercel.

### Request flow

```
Browser mic → AssemblyAI WebSocket (streaming) → live transcript
           → /api/analyze (POST) → Claude → OrderResult JSON
```

**Authentication**: A simple passcode gate. `middleware.ts` checks every request for a `session` cookie whose value equals `SESSION_SECRET`. `/login` and `/api/auth/*` are exempt. The login route (`/api/auth/login/route.ts`) sets the cookie on correct passcode entry.

**Transcription**: Browser connects directly to `wss://streaming.assemblyai.com/v3/ws` using a short-lived token (max 600 s). The token is fetched from `/api/realtime-token`, which calls `GET https://streaming.assemblyai.com/v3/token?expires_in_seconds=600` server-side to keep the API key out of the client bundle. Browser WebSocket **cannot** set the `Authorization` header; the `?token=` query param is the only supported browser auth method for this API.

**Audio pipeline** (`StepListening.tsx`): `getUserMedia` → `AudioContext` (16 kHz) → `ScriptProcessorNode` → PCM Int16 → WebSocket binary frames. AssemblyAI v3 message types: `Begin`, `Turn` (with `turn_is_formatted` distinguishing partial vs. final), `Termination`. Terminate by sending `{ type: "Terminate" }`.

**Analysis** (`/api/analyze/route.ts`): Receives the full accumulated transcript + people count, calls Claude with the prompt in `lib/prompts.ts`, strips any markdown fences, parses JSON.

### Session state (`app/page.tsx`)

The page is a step state machine: `input → listening → analyzing → results`. Sessions persist across Continue clicks by accumulating transcripts:

- `accumulatedTranscript` — grows each time Done is pressed; sent to Claude in full
- `currentSessionId` — UUID generated at Start, kept across Continue, cleared on Start Over
- Sessions saved to `localStorage` via `lib/sessions.ts` (max 10); shown on the input screen

### Key data types (`lib/types.ts`)

```typescript
OrderResult { orders: OrderItem[], perPersonSummary, analysis: { status, comment } }
Session     { id, createdAt, updatedAt, peopleCount, accumulatedTranscript, result }
```

`status` is `"adequate" | "light" | "generous"`. An empty `orders` array should display "No orders detected" — do **not** fall through to the status badge in that case.
