# Architecture.md — TestGen-AI: Vector-Powered Test Case Generator (Mistral + MongoDB Atlas)

## Overview

TestGen-AI is a **standalone microservice** that generates test cases (manual + Playwright automation scripts) from requirement documents, user stories, and API specs. It uses **MongoDB Atlas Vector Search** for retrieval-augmented context and the **Mistral API** (`mistral-embed` + `mistral-large-latest`) for embeddings and generation.

It does **not** duplicate moderation logic. All text passes through the existing **AI-Shield** moderation gateway (`/api/moderate`) via HTTP before embedding/generation (input, MASK-only mode) and again before persistence/export (output, full scan — BLOCK enabled).

```
┌──────────────┐   ┌───────────────────┐   ┌──────────────────┐   ┌─────────────┐   ┌──────────────────┐   ┌───────────────┐
│ User Input   │──▶│ AI-Shield          │──▶│ Chunk + Embed    │──▶│ Mongo Atlas │──▶│ Mistral Generate │──▶│ AI-Shield      │
│ (text/doc/   │   │ /api/moderate      │   │ (semantic split, │   │ Vector      │   │ (mistral-large,  │   │ /api/moderate  │
│ API spec)    │   │ mode=MASK_ONLY     │   │ mistral-embed)   │   │ Search      │   │ RAG context)     │   │ mode=FULL/BLOCK│
└──────────────┘   └───────────────────┘   └──────────────────┘   └─────────────┘   └──────────────────┘   └───────┬───────┘
                                                                                                                     ▼
                                                                                        ┌─────────────────────────────────────┐
                                                                                        │ Persist: MongoDB (testcases coll.)   │
                                                                                        │ Export: Excel/CSV                    │
                                                                                        │ Push: Jira (Xray/Zephyr plugin)      │
                                                                                        │ Emit: Playwright (.spec.ts) scripts   │
                                                                                        └─────────────────────────────────────┘
```

---

## Tech Stack

| Layer                | Technology                                       |
|----------------------|---------------------------------------------------|
| Runtime              | Node.js (npm run dev)                            |
| Language             | TypeScript (strict mode)                         |
| Framework            | Express.js                                       |
| Dev Server           | ts-node-dev                                      |
| Database             | MongoDB Atlas (documents + Vector Search index)  |
| ODM                  | Mongoose                                          |
| Embeddings           | Mistral API — `mistral-embed`                    |
| Generation LLM       | Mistral API — `mistral-large-latest`             |
| File Upload          | Multer                                            |
| Excel/CSV Export     | `exceljs`                                          |
| Test Mgmt Integration| Jira REST API + Xray/Zephyr plugin API           |
| Auth                 | Static API key middleware (`x-api-key`)          |
| Rate Limiting        | `express-rate-limit` (global, 60 req/min)        |
| Logging              | Winston (JSON structured)                        |
| Moderation Dependency| AI-Shield `/api/moderate` (HTTP, external service)|

---

## Environment Variables (`.env`)

```
PORT=5000
NODE_ENV=development

# Mistral
MISTRAL_API_KEY=your_mistral_api_key_here
MISTRAL_EMBED_MODEL=mistral-embed
MISTRAL_GEN_MODEL=mistral-large-latest

# MongoDB Atlas
MONGODB_URI=mongodb+srv://<user>:<pass>@cluster.mongodb.net/testgen
MONGODB_VECTOR_INDEX=testgen_vector_index

# AI-Shield (moderation dependency — separate running service)
AI_SHIELD_BASE_URL=http://localhost:4000/api
AI_SHIELD_INPUT_MODE=MASK_ONLY
AI_SHIELD_OUTPUT_MODE=FULL_BLOCK

# Service Auth
TESTGEN_API_KEY=your_static_api_key_here

# Rate limiting
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=60

# Jira / Xray
JIRA_BASE_URL=https://yourcompany.atlassian.net
JIRA_EMAIL=bot@yourcompany.com
JIRA_API_TOKEN=your_jira_token_here
JIRA_PROJECT_KEY=QA
```

---

## Folder Structure

```
testgen-ai/
├── src/
│   ├── app.ts
│   ├── server.ts
│   ├── types/
│   │   └── index.ts
│   ├── config/
│   │   └── env.ts
│   ├── middleware/
│   │   ├── auth.middleware.ts        # x-api-key check
│   │   ├── rateLimit.middleware.ts
│   │   └── error.middleware.ts
│   ├── clients/
│   │   ├── aiShield.client.ts        # calls /api/moderate (input + output modes)
│   │   ├── mistral.client.ts         # embeddings + chat completion
│   │   └── jira.client.ts            # push test cases to Xray/Zephyr
│   ├── ingestion/
│   │   ├── chunker.ts                # semantic chunking by heading/section
│   │   ├── parsers/
│   │   │   ├── text.parser.ts
│   │   │   ├── docx.parser.ts
│   │   │   └── openapi.parser.ts
│   │   └── embedder.ts               # calls mistral.client, writes to Mongo
│   ├── retrieval/
│   │   └── vectorSearch.service.ts   # MongoDB Atlas $vectorSearch query
│   ├── generation/
│   │   ├── prompt.builder.ts         # builds RAG prompt (context + category flags)
│   │   ├── testcase.generator.ts     # orchestrates retrieval -> Mistral -> parse
│   │   └── playwright.emitter.ts     # converts structured test case -> .spec.ts
│   ├── models/
│   │   ├── chunk.model.ts            # embedded requirement chunks
│   │   └── testcase.model.ts         # generated test cases
│   ├── export/
│   │   └── excel.exporter.ts
│   ├── routes/
│   │   ├── index.ts
│   │   ├── ingest.route.ts           # POST /api/ingest
│   │   ├── generate.route.ts         # POST /api/generate
│   │   └── export.route.ts           # GET /api/export/:jobId
│   └── utils/
│       └── logger.ts
├── logs/
│   └── testgen.log
├── package.json
├── tsconfig.json
└── .env
```

---

## MongoDB Collections

### `chunks` (embedded requirement context)
```typescript
{
  _id: ObjectId,
  jobId: string,
  sourceType: "text" | "docx" | "openapi",
  sectionTitle: string,
  content: string,
  embedding: number[],       // 1024-dim, mistral-embed output
  createdAt: Date
}
```
Atlas Vector Search index (`testgen_vector_index`) on `embedding`, cosine similarity, 1024 dimensions.

### `testcases`
```typescript
{
  _id: ObjectId,
  jobId: string,
  testId: string,             // e.g. TC-LOGIN-001
  title: string,
  category: "functional" | "negative" | "security" | "performance",
  precondition: string,
  steps: string[],
  expectedResult: string,
  priority: "low" | "medium" | "high",
  automationScript: string,   // Playwright .spec.ts content, nullable
  moderationFlags: object,    // output-scan result summary
  jiraIssueKey: string | null,
  createdAt: Date
}
```

---

## API Endpoints

| Method | Endpoint                  | Description                                                        |
|--------|---------------------------|----------------------------------------------------------------------|
| POST   | /api/ingest                | Upload text/doc/OpenAPI spec → moderate(MASK) → chunk → embed → store |
| POST   | /api/generate               | Given jobId + category flags → retrieve context → Mistral generate → moderate(FULL/BLOCK) → persist |
| GET    | /api/export/:jobId/excel    | Export test cases as .xlsx                                          |
| GET    | /api/export/:jobId/csv      | Export test cases as .csv                                           |
| POST   | /api/export/:jobId/jira     | Push generated test cases to Jira (Xray/Zephyr)                     |
| GET    | /api/export/:jobId/playwright | Download generated `.spec.ts` automation files (zipped)           |

All routes require header `x-api-key: <TESTGEN_API_KEY>` and are subject to the global rate limiter (60 req/min).

---

## Standard Response Envelope

```json
{
  "status": "success | error",
  "jobId": "job_8f21ac",
  "testCasesGenerated": 12,
  "moderation": {
    "inputAction": "MASK",
    "outputAction": "ALLOW",
    "outputFindings": []
  },
  "metadata": {
    "chunksRetrieved": 6,
    "mistralModel": "mistral-large-latest",
    "processingTimeMs": 4210,
    "timestamp": "2026-07-07T10:00:00.000Z"
  }
}
```

---

# PHASE 1 — Project Setup & AI-Shield Client Wiring

**Goal:** Scaffold the microservice and confirm it can reach the AI-Shield moderation service.

```bash
mkdir testgen-ai && cd testgen-ai
npm init -y
npm install express mongoose axios multer dotenv winston exceljs cors express-rate-limit
npm install --save-dev typescript ts-node-dev @types/express @types/multer @types/node @types/cors
npx tsc --init
```

### `src/clients/aiShield.client.ts`
```typescript
import axios from 'axios';

const AI_SHIELD_BASE_URL = process.env.AI_SHIELD_BASE_URL!;

export async function moderateInput(text: string) {
  const { data } = await axios.post(`${AI_SHIELD_BASE_URL}/moderate`, {
    text,
    mode: 'MASK_ONLY' // custom flag consumed by AI-Shield's decision engine override
  });
  return data; // { action, sanitizedContent, detectorResults, ... }
}

export async function moderateOutput(text: string) {
  const { data } = await axios.post(`${AI_SHIELD_BASE_URL}/moderate`, {
    text,
    mode: 'FULL_BLOCK'
  });
  return data;
}
```

> **Note:** AI-Shield's `decision.engine.ts` needs a small extension to accept a `mode` field: `MASK_ONLY` downgrades any `BLOCK` action to `MASK` and always returns `sanitizedContent`; `FULL_BLOCK` is the existing default behavior. This is the only change required on the AI-Shield side.

### ✅ Phase 1 Approval Gate
`npm run dev` starts on port 5000. `POST /api/ingest` with sample text returns a mocked AI-Shield response (confirms connectivity before building chunking/embedding).

---

# PHASE 2 — Ingestion: Parsing & Semantic Chunking

**Goal:** Accept text, `.docx`, or OpenAPI JSON/YAML, split into semantically coherent chunks by section/heading.

**Files:** `src/ingestion/chunker.ts`, `src/ingestion/parsers/*`

**Chunking rule:** Split on heading markers (`#`, `##` in Markdown; numbered sections in plain text; `paths`/`components` keys in OpenAPI). Each chunk keeps its `sectionTitle` for traceability back to the source requirement.

### ✅ Phase 2 Approval Gate
Uploading a sample PRD with 3 headings produces exactly 3 chunks, each ≤ configurable max token size, with correct `sectionTitle`.

---

# PHASE 3 — Embedding Pipeline (Mistral Embed → MongoDB Atlas)

**Goal:** Moderate each chunk (input, MASK_ONLY), embed via `mistral-embed`, store in `chunks` collection with the Atlas Vector Search index.

### `src/ingestion/embedder.ts` (core logic)
```typescript
import { moderateInput } from '../clients/aiShield.client';
import { getEmbedding } from '../clients/mistral.client';
import { ChunkModel } from '../models/chunk.model';

export async function embedAndStore(jobId: string, chunks: { sectionTitle: string; content: string }[], sourceType: string) {
  for (const chunk of chunks) {
    const moderated = await moderateInput(chunk.content);
    const embedding = await getEmbedding(moderated.sanitizedContent);
    await ChunkModel.create({
      jobId,
      sourceType,
      sectionTitle: chunk.sectionTitle,
      content: moderated.sanitizedContent,
      embedding
    });
  }
}
```

### ✅ Phase 3 Approval Gate
Chunks appear in MongoDB with populated `embedding` arrays (1024-dim). Any PII/secret in source text is masked in stored `content`.

---

# PHASE 4 — Retrieval (MongoDB Atlas `$vectorSearch`)

**Goal:** Given a generation request, embed the query and retrieve top-K relevant chunks for a `jobId`.

### `src/retrieval/vectorSearch.service.ts` (core query)
```typescript
export async function retrieveContext(jobId: string, queryEmbedding: number[], topK = 6) {
  return ChunkModel.aggregate([
    {
      $vectorSearch: {
        index: 'testgen_vector_index',
        path: 'embedding',
        queryVector: queryEmbedding,
        numCandidates: 100,
        limit: topK,
        filter: { jobId }
      }
    },
    { $project: { content: 1, sectionTitle: 1, score: { $meta: 'vectorSearchScore' } } }
  ]);
}
```

### ✅ Phase 4 Approval Gate
Querying with a topic-specific phrase returns the most relevant chunks first (verify via `score` ordering).

---

# PHASE 5 — Test Case Generation (Mistral + RAG Prompt)

**Goal:** Build a prompt combining retrieved context + requested categories (functional/negative/security/performance), call `mistral-large-latest`, parse structured JSON output into `testcases`.

**Prompt contract (structured JSON output enforced):**
```json
[
  {
    "testId": "TC-001",
    "title": "...",
    "category": "functional|negative|security|performance",
    "precondition": "...",
    "steps": ["..."],
    "expectedResult": "...",
    "priority": "low|medium|high"
  }
]
```

### ✅ Phase 5 Approval Gate
Given a sample "Login API" requirement chunk, generation returns ≥1 test case per requested category, valid JSON, parseable without errors.

---

# PHASE 6 — Output Moderation Before Persistence

**Goal:** Every generated test case's text fields (`title`, `steps`, `expectedResult`) pass through `moderateOutput()` (FULL_BLOCK mode) before saving. If BLOCK fires (e.g., Mistral echoed a secret from context), drop/re-mask that specific test case and log it — do not fail the whole batch.

### ✅ Phase 6 Approval Gate
Injecting a fake secret into a source chunk and generating test cases results in that specific test case being masked/excluded, while unrelated test cases still save successfully.

---

# PHASE 7 — Playwright Automation Script Emission

**Goal:** For each generated test case, emit a corresponding Playwright TypeScript spec file alongside the manual steps.

### `src/generation/playwright.emitter.ts` (pattern)
```typescript
export function emitPlaywrightSpec(tc: TestCase): string {
  return `
import { test, expect } from '@playwright/test';

test('${tc.testId}: ${tc.title}', async ({ page }) => {
  // Precondition: ${tc.precondition}
${tc.steps.map(s => `  // Step: ${s}`).join('\n')}
  // Expected: ${tc.expectedResult}
});
`.trim();
}
```
> Generated scripts are scaffolds with commented steps mapped from the structured test case — they establish the test skeleton and locators are filled in by QA/dev, since real DOM selectors aren't known from requirements alone.

### ✅ Phase 7 Approval Gate
Each `testcases` document has a non-null `automationScript` field containing valid, lint-clean TypeScript.

---

# PHASE 8 — Excel/CSV Export

**Goal:** `GET /api/export/:jobId/excel` and `/csv` return a downloadable file with columns: Test ID, Title, Category, Precondition, Steps, Expected Result, Priority.

**Library:** `exceljs` for `.xlsx`; simple CSV writer for `.csv`.

### ✅ Phase 8 Approval Gate
Exported file opens cleanly in Excel/Google Sheets with correct column headers and one row per test case.

---

# PHASE 9 — Jira (Xray/Zephyr) Push Integration

**Goal:** `POST /api/export/:jobId/jira` creates Xray/Zephyr test issues in the configured `JIRA_PROJECT_KEY`, storing the returned `jiraIssueKey` back on each `testcases` document.

### ✅ Phase 9 Approval Gate
Test cases appear as issues in the target Jira project with correct summary/steps mapping; `jiraIssueKey` is persisted in MongoDB.

---

# PHASE 10 — Auth, Rate Limiting & Route Wiring

**Goal:** Apply `x-api-key` auth middleware and global rate limiter (60 req/min) to all routes; wire `ingest`, `generate`, `export` routers into `src/routes/index.ts`.

### ✅ Phase 10 Approval Gate — Final Checklist

| Check | Expected Result |
|-------|------------------|
| `npm run dev` | Server starts on port 5000 |
| Request without `x-api-key` | 401 Unauthorized |
| 61st request within 1 min | 429 Too Many Requests |
| `POST /api/ingest` (PRD text) | Chunks stored with embeddings in MongoDB |
| `POST /api/generate` | Test cases across all 4 categories, moderation-scanned |
| `GET /api/export/:jobId/excel` | Valid .xlsx downloads |
| `POST /api/export/:jobId/jira` | Issues created in Jira, keys saved |
| `GET /api/export/:jobId/playwright` | Zipped `.spec.ts` files download |
| Secret injected in source doc | Excluded/masked in final output, logged |

---

## Summary — Phase Execution Order

| Phase | Goal | Key Output |
|-------|------|------------|
| 1  | Scaffold + AI-Shield client | Service boots, moderation connectivity confirmed |
| 2  | Parsing + semantic chunking | Section-aware chunks |
| 3  | Embedding pipeline | `chunks` collection populated (Mistral Embed) |
| 4  | Vector retrieval | `$vectorSearch` query working |
| 5  | Test case generation | Structured JSON test cases (Mistral Large) |
| 6  | Output moderation | Full scan before persistence |
| 7  | Playwright emission | `.spec.ts` scaffolds per test case |
| 8  | Excel/CSV export | Downloadable QA-ready files |
| 9  | Jira/Xray push | Test cases synced to Jira |
| 10 | Auth + rate limit + wiring | Full app assembly |

---

> **Development rule:** Complete one phase, run `npm run dev`, test the endpoint with Postman, then proceed to the next phase. Never skip the approval gate. AI-Shield must be running locally (`npm run dev` on port 4000) before Phase 1's connectivity check.
