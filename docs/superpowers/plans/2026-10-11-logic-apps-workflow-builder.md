# Logic Apps Workflow Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task by task. The domain, generator, route, and interface share contracts, so execute tasks in order and integrate them in this checkout.

**Goal:** Add an AI-assisted, Portuguese-language workflow builder that produces a locally validated Azure Logic Apps Consumption ARM package from a reviewed, typed plan.

**Architecture:** Keep `src/lib/workflow-builder` pure and independent of React and AI. A server-only route reuses the existing provider adapters, sends only explicitly approved sanitized text, and validates model output as `unknown`. The UI confirms the returned plan; deterministic local code alone produces WDL and ARM. Extend the current “Quero criar” journey with a choice between the existing proposal and the builder.

**Tech Stack:** Next.js App Router 16.4.0, React 19.3.0, TypeScript strict, Zod 4, existing AI providers and redaction utilities, Vitest, Playwright, npm.

**Spec:** `docs/superpowers/specs/2026-10-11-logic-apps-workflow-builder-design.md` (approved by the user on 11/10/2026).

## Global Constraints

- Work in the existing checkout and preserve the unrelated generated change to `next-env.d.ts`; never stage it with this feature.
- Before implementation, read the relevant Next.js 16 guides from `node_modules/next/dist/docs/` as required by `AGENTS.md`; verify current APIs before editing.
- Use English identifiers and file names; keep user-facing UI and useful comments in Brazilian Portuguese. TypeScript stays strict; do not use `any`.
- Domain schemas, cross-reference validation, sanitization decisions, WDL generation, and diagnostics stay pure and outside React. Treat provider output and parsed JSON as `unknown` until validated.
- Generate only the approved subset: Request or Recurrence trigger; sequential HTTP, Compose, and eligible Response actions; GET, POST, PUT, PATCH, DELETE; HTTPS endpoints; typed values/references; no arbitrary WDL expressions or unsupported operators.
- A ready model result is not evidence that an endpoint, method, schema, response, or assumption is correct. Show those details and require the user to confirm the plan before creating downloadable files. Never silently accept invented API details.
- Require a user-provided or explicitly confirmed HTTP response schema whenever a later action references fields from that HTTP response; allow the opaque full response to pass through without a schema.
- Never accept, store, echo, log, or place real credential values in prompts, plans, WDL, ARM, or README. Only create secure parameter placeholders. For authenticated HTTP actions, hide inputs and outputs with `runtimeConfiguration.secureData`.
- Every model turn requires a fresh, editable sanitized preview and literal user consent. Changing the message, context, or provider invalidates that preview. No `localStorage`, automatic send, Azure call, deployment, or silent provider fallback.
- Mock must not claim to understand the request or produce a personalized workflow. Keep the current local architecture proposal and all existing journeys intact.
- Consult the linked official Microsoft documentation before choosing the exact ARM/WDL shape for parameters, authentication, Request/Response, and secure data; document any unresolved platform compatibility as a limitation.
- Each task follows TDD: add focused failing behavior tests, observe the failure, implement the smallest change, then rerun the focused tests. Run the complete verification matrix in the final task. Preserve existing regression tests.

## Review Focus

1. **Unsupported or extra model output must not enter the generator.** Test that extra keys, unsupported action types, invalid enums, and malformed `needs-input`/`ready` results are rejected before any artifact is offered.
2. **References must resolve only to the trigger or an earlier action.** Test unresolved names, forward references, invalid paths, and valid references after sequential actions.
3. **Unsafe endpoints must block packaging.** Test non-HTTPS URLs, URL user information, fragments, and query values that look like credentials; confirm no artifact is produced.
4. **Credential values must never survive in any boundary or artifact.** Test secrets in user text and model output, secure placeholders without defaults, and authenticated HTTP `secureData` on both inputs and outputs.
5. **The consent and layout must hold on small screens.** Test that no request happens before authorization, edits/provider changes invalidate consent, and selection/preview/download remain usable at 320 px without horizontal overflow.

## Task 1: Define and validate the workflow-builder domain

**Files:** `src/lib/workflow-builder/types.ts`, `src/lib/workflow-builder/schema.ts`, `src/lib/workflow-builder/validate.ts`; `tests/unit/workflow-builder-schema.test.ts`, `tests/unit/workflow-builder-validation.test.ts`.

**Interfaces:** Export `workflowBuilderResultSchema`, `workflowPlanSchema`, `parseWorkflowBuilderResult(value: unknown): WorkflowBuilderResult`, `validateWorkflowPlan(plan: WorkflowPlan): WorkflowPlanValidation`. `WorkflowPlanValidation` is `{ valid: boolean, issues: Array<{ code: string, path: Array<string | number>, message: string }> }`. Use a discriminated `WorkflowBuilderResult` union: `{ status: "needs-input", summary, questions, assumptions, unresolved }` or `{ status: "ready", summary, plan, assumptions, warnings }`. The plan is `{ name, trigger, actions }`. Trigger is `{ kind: "Request", name, requestSchema }` or `{ kind: "Recurrence", name, frequency, interval }`. `requestSchema` is a bounded JSON Schema subset: object/properties/required/additionalProperties=false, array/items, and string/number/integer/boolean/null leaves. Actions are `{ kind: "Http", name, method, uri, headers, body?, responseSchema?, authentication }`, `{ kind: "Compose", name, inputs }`, or `{ kind: "Response", name, statusCode, headers, body? }`. `responseSchema` describes the HTTP body and is required when a later action references one of its fields; paths on a whole HTTP response can pass through without interpreting its shape. HTTP methods are the five allowed methods; response status is an integer from 100–599. A builder value is `{ kind: "literal", value: JsonValue }` or `{ kind: "reference", source: "trigger" | "action", actionName?, path: string[] }`; action references must point backward in the ordered action list. Auth is `{ kind: "none" }`, `{ kind: "bearer", parameterName }`, or `{ kind: "header", headerName, parameterName }`; it contains parameter names, never credential values. Apply explicit name, URL, list, string, and recursion-depth bounds in schemas and cross-field validation.

- [x] Write schema tests for both statuses, required fields, strict rejection of unknown properties, unsupported operations, malformed JSON-schema subset, and invalid enum values. Run the focused tests and observe failure.
- [x] Implement the Zod schemas and inferred types with explicit length/depth/count caps; define only the supported JSON-schema and value-reference subset.
- [x] Add validation tests for safe action names, duplicate names, allowed methods, HTTPS URL requirements, request/response pairing, recurrence bounds, header names, missing/forward references, and data paths. Include safe placeholder-only auth. HTTP output paths require an explicit response schema and are checked against it.
- [x] Implement pure cross-field validation that returns typed issues with stable field paths; do not generate WDL or import React/AI here.
- [x] Run focused tests, lint, and typecheck for the new domain. Confirm that invalid plans cannot be represented as validated output.

## Task 2: Generate deterministic Consumption WDL and ARM artifacts

**Files:** `src/lib/workflow-builder/generate.ts`, `src/lib/workflow-builder/validate-generated.ts`; `tests/unit/workflow-builder-generator.test.ts`.

**Interfaces:** `generateWorkflowArtifacts(plan: WorkflowPlan): WorkflowBuilderArtifacts` returns `{ workflowDefinition: string, armTemplate: string, readme: string }`. It accepts only a plan that passes Task 1 validation. `validateGeneratedWorkflow(artifacts: WorkflowBuilderArtifacts): GeneratedWorkflowValidation` returns `{ valid: boolean, issues: Array<{ code: string, path: Array<string | number>, message: string }> }`, parses the WDL with `parseWorkflow` from the existing local parser, and applies explicit subset checks. Keep generated JSON deterministically formatted.

- [x] Write generator tests for Request→HTTP→Response and Recurrence→HTTP, action order and `runAfter`, JSON literals, typed trigger/prior-action references, and the exact Consumption `Microsoft.Logic/workflows` ARM envelope. Observe failure before implementation.
- [x] Write security tests for ARM/WDL parameter wiring, secure-string placeholders without defaults or values, HTTP Bearer/header auth, and hidden authenticated action inputs/outputs. Assert the generated output contains no credential values.
- [x] Implement local WDL/ARM/README generation using only fixed templates and validated plan fields. No model-authored WDL/ARM fragments or arbitrary expression strings are accepted.
- [x] Implement generated-artifact validation using `parseWorkflow` from `src/lib/logic-apps/parser` and semantic checks for the supported subset. Return actionable local diagnostics and do not describe this as full Azure validation.
- [x] Test that invalid plans throw or return blocking validation without partial artifacts, and that generation does not mutate the plan.

## Task 3: Add the consent-gated workflow-builder API

**Files:** `src/app/api/workflow-builder/route.ts`, `src/lib/workflow-builder/prompt.ts`, `src/lib/ai/types.ts`, `src/lib/ai/providers.ts`; `tests/integration/workflow-builder.test.ts`, focused provider unit tests.

**Interfaces:** `POST /api/workflow-builder` accepts a strict body `{ message: string, context: string, provider: AiProviderId, consent: true }`; response is `{ result: WorkflowBuilderResult, provider: string }`. Add a server-authored `AiRequest.instructionProfile?: "workflow-builder"` and call the existing adapter as `createAiProvider(provider).sendMessage({ mode: "Build", message: sanitizedUserMessage, context: sanitizedAuthorizedConversation, consent: true, provider, instructionProfile: "workflow-builder" })`. The adapter uses this fixed profile as the system instruction instead of the generic response/citation instructions; untrusted user data stays in user content. Prompt builder returns Portuguese instructions demanding exactly the domain JSON contract, response schemas for HTTP outputs whose fields are referenced, and refusal of unsupported scope. Parse only the returned `answer` as strict JSON. Reuse `createAiProvider`, `getProviderStatus`, and `redactContent`; do not add an independent provider or expose environment data.

- [ ] Add route tests for missing/false consent, oversized request, unknown provider/fields, unconfigured provider, and Mock selection; all blocked cases must avoid external `fetch`.
- [ ] Add provider-response tests for malformed/truncated JSON, extra properties, unsupported workflow operations, `needs-input`, valid `ready`, redaction before transport, detected secrets in model output, safe errors, no payload logging, and no fallback. If output redaction detects credential material or `[OCULTO]`, reject the result instead of packaging it. Observe failures first.
- [ ] Implement bounded request parsing, strict Zod request validation, server-side redaction, provider status checks, and result validation from `unknown`; on `ready`, also require `validateWorkflowPlan` to pass. Reject Mock with a safe message because it cannot perform personalized workflow planning.
- [ ] Add the fixed `workflow-builder` instruction profile to the provider adapters so strict JSON instructions do not conflict with the generic assistant's educational answer/citation format. Test the system instruction for Responses and Chat Completions adapters; parse only returned structured JSON. Do not return unvalidated model text or include payloads in errors.
- [ ] Run all new integration tests plus existing assistant integration tests to prove provider selection and privacy behavior remain compatible.

## Task 4: Add the builder experience under “Quero criar”

**Files:** `src/features/workflow-builder/index.tsx`, `src/features/architecture-wizard/index.tsx`, `src/app/globals.css`; `tests/e2e/workflow-builder.spec.ts`, and focused UI tests if the existing test setup supports them.

**Interfaces:** `WorkflowBuilder` reads the already-public catalog from `GET /api/assistant` and uses the new route. `ArchitectureWizard` initially renders two choices: the unchanged architecture proposal and the Consumption workflow builder; selecting the first enters the current wizard exactly as it does today. Builder state (conversation, preview, result, confirmation, artifacts) stays in React memory only. If no real provider is configured or Mock is selected, explain how to configure a provider and keep the architecture proposal available.

- [ ] Add E2E tests for the choice screen and unchanged architecture path, plus no-configured-provider/Mock guidance while keeping the local proposal accessible. Observe failure before UI implementation.
- [ ] Add E2E tests for drafting a message, sanitized preview editing, provider choice, no network send before consent, and preview invalidation after editing or changing provider.
- [ ] Add E2E tests with intercepted route responses for `needs-input` followed by a new preview/consent turn, invalid result errors, `ready` summary, endpoint/method/contract review, explicit plan confirmation, generation, artifact preview, and `azuredeploy.json` / `README.md` download.
- [ ] Implement accessible Portuguese UI with clear warnings not to enter secrets, concise pending questions, provider configuration guidance, blocking diagnostics, explicit plan confirmation, and downloadable files only after generated validation passes.
- [ ] Verify keyboard focus and accessible labels; at widths 320, 360, 390, 768, 1024, and 1440 px test builder selection, preview, and result screens for horizontal overflow and usable controls.

## Task 5: Document limits and complete verification

**Files:** `README.md`, `docs/architecture.md`, `docs/verification.md`, new `docs/workflow-builder.md`, and `PLANS.md`.

- [ ] Document the supported Consumption subset, generated files, manual import/deployment responsibility, secure parameters, provider configuration, privacy boundary, validation limits, and excluded operations. Link only the official sources already in the approved spec or re-verify them before adding.
- [ ] Update architecture and implementation ledger to reflect delivered behavior and actual test counts. Preserve prior history and mark any live authenticated-provider/Azure validation as unperformed unless it is actually run.
- [ ] Run `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:e2e -- --workers=1`, and `npm run build`; fix regressions and rerun every check affected by a fix.
- [ ] Inspect the app at the six required widths, especially the consent preview and generated code/download view. Record real results and limitations in `docs/verification.md`.
- [ ] Recheck `git status` and stage only feature-owned paths if making commits; leave the pre-existing `next-env.d.ts` edit untouched.

## Interface review before implementation

| Boundary | Contract | Compatibility check |
| --- | --- | --- |
| Provider → route | Existing `AiProvider.sendMessage(AiRequest): Promise<AiResponse>` returns untrusted answer text; `getProviderStatus` exposes only safe availability. Optional server-authored `instructionProfile: "workflow-builder"` selects a fixed system instruction, never user-authored instructions. | Route rejects Mock for personalized generation, parses answer text as JSON into `unknown`, and validates both the discriminated result and ready plan before returning it. |
| Route → browser | Strict authorized request; response contains only validated `needs-input` or `ready` data and safe provider label. | All other route errors are non-echoing JSON; no unvalidated model output is rendered. |
| Plan → generator | `WorkflowPlan` from the domain schema, with tagged values/references and placeholder auth. | Generator revalidates and applies deterministic mapping; model cannot supply WDL/ARM or expressions. |
| Generator → parser/UI | `{ workflowDefinition, armTemplate, readme }` plus blocking validation diagnostics. | Existing parser checks structural compatibility; downloads are disabled for any schema or semantic error. |
| Architecture wizard → new experience | Choice screen owns which sub-journey is shown. | Existing architecture proposal remains its own unchanged path and regression E2E stays green. |

## Plan self-review

- **Coverage:** Includes domain/schema, generator, server route/privacy, the existing “Quero criar” integration, docs, E2E, responsive checks, and the full repository verification matrix from `AGENTS.md`.
- **Consistency:** The route returns the schema's discriminated union; the UI handles both statuses; only the same validated `WorkflowPlan` reaches the generator. Exact artifact keys match the downloads and docs.
- **Security:** User consent and sanitized preview are per-turn; Mock and missing providers cannot generate; credential values are disallowed at domain/generator boundaries; authenticated action histories are hidden; no deployment capability is introduced.
- **Five focused review cases:** Mapped one-to-one to Review Focus and the domain, integration, generator, and E2E test steps above.
- **Repository compatibility:** Uses current Zod, provider adapter, parser, React feature, and test conventions; the plan explicitly requires Next.js 16 guide review before code and preserves existing tests/working-tree change.
