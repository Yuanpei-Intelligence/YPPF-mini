# YPPF Mini Engineering Guide

This file applies to the entire repository. It is the source of truth for agents and contributors. Existing code contains legacy patterns; those patterns are not precedent. Apply this guide to every new file and to the part of an existing file that you change. Prefer small, reviewable cleanups over repository-wide rewrites.

## Project profile

- Stack: uni-app, Vue 3, TypeScript, Vite 5, Pinia, UnoCSS, and pnpm.
- Primary target: WeChat Mini Program (`mp-weixin`). H5 and App scripts exist, but their authentication paths are not yet equally complete.
- Package manager: pnpm only. Respect the version pinned by `packageManager` in `package.json`.
- Source aliases: `@/` maps to `src/`; `@img/` maps to `src/static/images/`.
- The backend contract is exposed through `src/api/`; requests must go through `src/http/http.ts`.

## Commands

Run commands from the repository root.

```bash
pnpm install
pnpm dev:mp          # WeChat Mini Program -> dist/dev/mp-weixin
pnpm dev:h5          # H5 dev server -> http://localhost:9000
pnpm dev:app         # App development bundle -> dist/dev/app

pnpm lint            # whole-repository ESLint check
pnpm type-check      # vue-tsc --noEmit
pnpm build:mp        # production WeChat bundle -> dist/build/mp-weixin
pnpm build:h5        # production H5 bundle -> dist/build/h5
pnpm build:app       # production App bundle -> dist/build/app
```

There is currently no automated test runner. Do not describe the project as tested merely because it builds. For every change:

1. Run ESLint on the changed source files: `pnpm exec eslint <files...>`.
2. Run `pnpm type-check` when TypeScript, Vue, API types, stores, routing, or build configuration changes.
3. Run the build for every affected platform; `pnpm build:mp` is the minimum for shared application code.
4. Manually exercise the affected flow in WeChat DevTools when it depends on uni-app lifecycle, navigation, storage, authorization, upload, or platform APIs.

The repository has known legacy lint and type-check failures. Record unrelated baseline failures in the handoff; do not hide them, mass-fix unrelated files, or weaken rules to make checks pass. Use `pnpm lint:fix <files...>` only on files in scope. If a build fails with `EMFILE`, raise the shell file-descriptor limit and retry before treating it as a code failure.

## Change discipline and file ownership

- Keep each change focused. Do not mix feature work with broad renames, formatting, dependency upgrades, or generated-file churn.
- Before editing, check `git status`. Preserve user changes and do not overwrite unrelated work.
- Use Conventional Commit messages; commitlint is configured.
- Never commit secrets, App Secret values, production credentials, private keys, or real user data. App IDs and public endpoints belong in environment configuration; secrets do not.
- Do not hand-edit generated outputs: `dist/`, `src/pages.json`, `src/manifest.json`, or generated declarations under `src/types/`. Change their source configuration and regenerate them.
- Treat `src/uni_modules/` as vendored code. Do not reformat or refactor it. Change it only for a documented vendor patch or deliberate package upgrade.
- Root configuration files own cross-cutting behavior: `pages.config.ts`, `manifest.config.ts`, `uno.config.ts`, `vite.config.ts`, and `env/`.
- Put pages in `src/pages/` or a configured subpackage such as `src/pages-auth/`. Put page-only components in a local `components/` directory; promote a component to `src/components/` only when multiple features reuse it.
- Organize `src/api/`, `src/api/types/`, and stores by business domain. Avoid generic dumping grounds such as `common.ts` or an ever-growing `utils/index.ts`.
- Keep documentation close to its audience: human setup and project status in `README.md`, agent rules here, and focused implementation notes beside a subsystem only when they add information that code cannot express.

## Naming and TypeScript

- Vue components use PascalCase filenames; route/page files use kebab-case. Composables use `useXxx`; stores use `useXxxStore` with a stable singular store ID; booleans start with `is`, `has`, `can`, or `should`.
- Use camelCase for variables/functions, PascalCase for types, and UPPER_SNAKE_CASE only for true module constants.
- Prefer `interface` for extendable object contracts and `type` for unions, mapped types, and aliases. Import types with `import type`.
- Do not introduce `any`, non-null assertions, or unchecked casts at application boundaries. Narrow `unknown` and validate storage, route query, and backend data where needed.
- Keep API response field names aligned with the backend. Map them once at a boundary if the UI needs a different shape; do not mix backend and view-model naming throughout components.
- Use explicit return types for exported helpers and public store/API actions when inference does not make the contract obvious.

## Functions, helpers, and composables

- A helper is pure and platform-independent when possible. A functional/service function may perform I/O, storage, navigation, or UI effects; make that side effect clear in its name and location.
- Put reusable pure transformations in a focused file under `src/utils/`. Put reactive reusable behavior in `src/hooks/useXxx.ts`. Put network calls in `src/api/<domain>.ts`, not in components or stores directly through `uni.request`.
- Use named function declarations for reusable functions and lifecycle/event handlers. Use arrow functions for short callbacks. Prefer early returns over deep nesting.
- Use verb-led names consistently: `get` for synchronous lookup, `fetch` for remote reads, `create`/`update`/`delete` for mutations, `parse`/`format`/`to` for transformations, and `handle`/`on` for UI events.
- Keep functions single-purpose. If a function needs more than three independent arguments or boolean switches, use a typed options object.
- Return data or throw a typed/normalized error. Do not both show UI and silently swallow an error in a low-level helper. Toasts, dialogs, and navigation belong at the page or orchestration boundary unless the function explicitly owns a global policy.
- Add JSDoc only for non-obvious contracts, units, platform constraints, side effects, or invariants. Do not narrate the implementation.
- Composables expose readonly state where callers must not mutate it, clean up timers/listeners in the matching Vue or uni-app lifecycle, and never perform hidden work at module import time.

## Vue single-file components

- Use Composition API with `<script setup lang="ts">`; block order is `script`, `template`, then optional `style`, as enforced by ESLint.
- Within the script, keep this order: type imports/imports, `defineOptions`/`definePage`, props/emits, injected stores/composables, local state, computed values, functions, watchers, and lifecycle hooks.
- Define typed props and emits. Do not mutate props; emit an event or create explicit local state.
- Keep templates declarative. Move branching, transformation, and repeated lookups into computed values or named functions. Use stable `:key` values and avoid calling effectful functions during render.
- Put one attribute per line once a tag is multiline. Self-close components without children. Let ESLint determine attribute and UnoCSS utility order.
- Prefer UnoCSS utilities. Add `<style scoped>` only for styles that cannot be expressed clearly with existing utilities; remove empty style blocks.
- Use uni-app components and APIs for shared code. Isolate platform differences with uni-app conditional compilation and keep both branches type-safe.
- Pages use uni-app page lifecycles (`onLoad`, `onShow`, `onHide`, `onUnload`) for page behavior and Vue lifecycles for component behavior. Do not use `onMounted` as a substitute when the flow must rerun after returning to a cached page.
- Prevent duplicate async work. Loading flags must be reset in `finally`, stale responses must not overwrite newer state, and event/timer/listener cleanup must mirror setup.

## API and HTTP boundaries

- Define endpoint functions in `src/api/<domain>.ts` and their contracts in `src/api/types/<domain>.ts`. Components consume endpoint functions, never raw URLs.
- Keep endpoint paths exact and centralized. Use query parameters for filtering and body data for mutations according to the backend contract.
- Authentication headers, base URLs, error normalization, and retry policy belong in `src/http/`. Feature APIs must not duplicate them.
- Never leave unreachable request code after `throw new Error('Not implemented.')`. An unavailable capability must have a clearly named explicit stub or be omitted until implemented.
- Do not log tokens, authorization headers, signed identifiers, passwords, or full sensitive responses.

### Exception presentation

- `src/http/http.ts` normalizes request failures to `RequestError`; feature APIs and pages must distinguish network, authentication, permission, business, server, and unknown failures through `RequestError.kind`, never by parsing a translated message.
- A module migrated to the standardized backend error contract sets `errorPresentation: 'manual'` on every endpoint. The page or orchestration boundary then handles the rejected error with `useApiException`; low-level feature API functions do not show UI or swallow the error.
- Use UVUI `uv-toast`, `uv-alert`, and `uv-modal` for exception summaries and confirmations. `uni.showToast`/`uni.showModal` remain migration-only behavior in untouched legacy modules.
- Forms map the backend `errors` object by its exact request field path. Render field messages beside the matching control, render `non_field_errors` once near the form, preserve all messages for a field, and clear a field's old server error when that field changes.
- Show the backend `message` as the concise business-error summary. Network failures use the normalized network message; server and malformed-response failures use a safe generic message. Do not replace a useful normalized error with a page-specific generic “加载失败” or “提交失败”.
- A catch block either handles the error once or rethrows it. Do not combine automatic HTTP toast behavior with a second page toast for the same request.

## Pinia store lifecycle

- Create and install Pinia only in `src/store/index.ts`. Stores must not create their own Pinia instance.
- Use setup stores consistently. Within a store, order code as state, derived state, internal helpers, public actions, and the returned public surface.
- State is domain data that must outlive a component. Keep page-only form fields, modal state, and transient loading flags local unless multiple pages truly coordinate through them.
- Do not start requests, navigation, timers, or subscriptions at module import time. Expose an idempotent `initialize()` action and call it from the application/page lifecycle that owns it.
- Persist the minimum stable data with an explicit persistence selection. Persist credentials or durable user preferences only; never persist loading flags, errors, derived values, request queues, or timestamps that can be recomputed. Treat hydrated data as untrusted until normalized.
- Getters/computed values are pure. Actions own state transitions. Components must call actions instead of mutating store internals.
- Avoid cyclic store dependencies. If one action coordinates token and user stores, make the ownership explicit and clear both stores atomically on logout or unrecoverable authentication failure.
- Every resource acquired by a store needs a matching teardown action. Logout/reset must cancel or invalidate in-flight work, remove sensitive persistence, reset user data, and leave the store safe to initialize again.

## Authentication state machine

Refactoring must converge on one explicit auth status; token presence alone is not a state machine.

```text
booting -> anonymous
booting -> authenticated        (hydrated credentials are still valid)
anonymous -> authenticating
authenticating -> authenticated (login succeeds)
authenticating -> unbound       (WeChat identity needs account binding)
authenticating -> anonymous     (login fails or is cancelled)
unbound -> authenticating       (binding is submitted)
authenticated -> refreshing -> authenticated
authenticated -> refreshing -> anonymous
authenticated -> signingOut -> anonymous
any state -> anonymous          (credentials are cleared or invalid)
```

Use a small union such as `booting | anonymous | authenticating | unbound | authenticated | refreshing | signingOut`; keep error details separately rather than making a permanent error state.

Rules:

- `hasLogin` is derived from `status === 'authenticated'` and a non-expired access token. A stored token does not automatically mean authenticated.
- Application startup hydrates and validates auth exactly once. It must not launch competing login requests from pages, route guards, and API calls.
- Only the auth store changes credentials and auth status. Login actions return a typed outcome; pages/orchestrators own toasts and navigation, including the binding-page redirect.
- Authentication and refresh are single-flight: concurrent callers await the same promise. Queue protected requests during renewal and replay each request at most once.
- A 401 from a protected endpoint may trigger one renewal attempt. Never retry login, bind, refresh, or logout endpoints, and never create a retry loop.
- On renewal failure, clear token and user state before routing to login/binding. Preserve a sanitized intended route only when it is an internal application path.
- WeChat Mini Program uses `uni.login` and may enter `unbound`; after binding it enters `authenticated`. Account switching is a fresh authentication transition, not direct mutation of user fields.
- H5/App form login is currently incomplete. Do not claim it works or route users into it until the endpoint and route constants are implemented and verified.
- Route guards consume the settled auth state; they do not perform independent authentication. Login and binding routes must remain reachable without authentication.

For auth changes, verify at least: cold start with no credentials, valid persisted session, expired session, concurrent 401 responses, unbound WeChat identity, successful binding, account switch, logout, and failed renewal.

## Definition of done

- The change follows this guide in every touched area and does not expand the legacy surface.
- Changed files pass scoped ESLint; type-check and affected platform builds are run or their pre-existing/environmental blockers are reported precisely.
- User-visible and state-machine changes include a reproducible manual verification note until automated tests exist.
- Generated/vendor files and unrelated user changes are absent from the diff.
- `README.md` and this file are updated when commands, supported platforms, environment variables, architecture boundaries, or authentication behavior change.
