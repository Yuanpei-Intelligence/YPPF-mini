# AGENTS.md

This file is the repository-level development map and execution contract. It applies to the entire repository. If a subdirectory later contains a more specific `AGENTS.md`, the closest file takes precedence.

## Build and verification commands

The only required delivery target is the WeChat Mini Program (`mp-weixin`). Run commands from the YPPF-mini repository root.

```bash
pnpm dev:mp                 # WeChat development build; output: dist/dev/mp-weixin
pnpm build:mp               # WeChat production build; output: dist/build/mp-weixin
pnpm build:mp:test          # WeChat build using env/.env.test
pnpm type-check             # vue-tsc --noEmit
pnpm lint                   # Full-repository ESLint
pnpm exec eslint <files...> # Targeted lint for changed files
git diff --check            # Whitespace and patch-integrity check
```

Command rules:

- `pnpm dev:mp` has a matching `predev:mp` script and runs `init-baseFiles` automatically.
- Build scripts do not run `init-baseFiles`. If `src/pages.json` or `src/manifest.json` is missing, run `pnpm init-baseFiles` before any build.
- A mini-program build may try to open WeChat DevTools. If automatic opening fails, manually import `dist/dev/mp-weixin` or `dist/build/mp-weixin`.
- `pnpm lint:fix` can modify unrelated files across the repository. Prefer targeted ESLint fixes, inspect the diff, and then run the full lint command.
- The package still contains H5 and App scripts from the upstream scaffold. They are legacy, non-target paths and are not required for implementation or acceptance unless a task explicitly says otherwise.

## Core principles

- **WeChat only:** implement and verify new work for the WeChat Mini Program. Do not add H5/App fallbacks, compatibility branches, or validation work unless explicitly requested.
- **Rules outrank legacy code:** this repository contains substantial scaffold and legacy code. Existing code is evidence of current behavior, not automatic evidence of the correct architecture, style, API contract, or error handling.
- **Refactor the touched path:** when touched legacy code conflicts with this file, change the relevant path to comply with this file instead of copying the old pattern. Do not use this as permission to clean up unrelated modules.
- **Read before editing:** locate the backend contract, frontend types, API wrapper, state, page, and WeChat-specific lifecycle before changing behavior.
- **Use the right source of truth:** backend serializers, runtime validation, schema, tests, package scripts, and active configuration define behavior. README files and old generated YAML may be stale.
- **Make the smallest coherent change:** complete the whole affected vertical slice, but do not refactor neighboring features without a real dependency.
- **Protect user work:** preserve unrelated changes, do not reset or overwrite the worktree, do not hand-edit generated files, and never commit secrets.
- **Verify claims:** every completion claim must be backed by a command, schema inspection, backend test, WeChat build, or DevTools smoke test.

## Project overview and runtime architecture

YPPF-mini is the WeChat Mini Program frontend for YPPF. It uses Vue 3, TypeScript, uni-app, Vite, and unibest. Pinia manages shared state; UnoCSS and SCSS provide styles; Wot Design Uni and vendored uv-ui components provide UI primitives.

The repository retains H5/App infrastructure from the scaffold, but those platforms are outside the normal delivery scope.

Cross-repository feature order:

```text
YPPF domain model/business utility
  -> YPPF api/<domain> serializers/views/tests/schema
  -> YPPF-mini src/api/types/<domain>.ts
  -> YPPF-mini src/api/<domain>.ts
  -> YPPF-mini src/pages/** UI
```

Frontend runtime flow:

```text
src/main.ts
  -> Pinia persistence
  -> route/login interceptor
  -> uni.request/uploadFile interceptor
  -> App.vue WeChat lifecycle and automatic login
  -> App.ku.vue root view and custom tabbar
  -> pages -> api -> http -> YPPF backend
```

## Source map

- `README.md`: local backend setup and scaffold-era run notes. Treat non-WeChat platform notes as legacy.
- `package.json`: Node/pnpm requirements and the authoritative command list.
- `vite.config.ts`: page/manifest generation, auto-imports, UnoCSS, package optimization, and platform plugins.
- `pages.config.ts`: global page style, easycom, and tabbar output.
- `manifest.config.ts`: WeChat AppID and mini-program manifest settings.
- `uno.config.ts`: UnoCSS preset, theme, icons, and safe-area rules.
- `src/router/README.md` and `src/pages-auth/README.md`: background on login strategy; verify route values against source and newly generated `src/pages.json`.
- `src/tabbar/README.md`: native/custom tabbar background.
- `src/http/README.md`: scaffold request alternatives; active business APIs use `src/http/http.ts`.
- `src/hooks/useScroll.md`: scroll-hook behavior.
- Reference vertical slice: backend `../YPPF/api/notification/` maps to `src/api/types/notification.ts`, `src/api/notification.ts`, and `src/pages/me/notifications.vue`. The backend directory name is singular: `notification`.

## Directory responsibilities

- `src/pages/`: main-package pages. File location and `definePage` generate the route.
- `src/pages-auth/`: authentication subpackage registered in `vite.config.ts`.
- `src/components/`: reusable business/presentation components.
- `src/api/types/`: pure wire-contract types.
- `src/api/*.ts`: typed endpoint wrappers.
- `src/http/`: transport, URL composition, auth headers, response normalization, retry, and standard error presentation.
- `src/store/`: persistent cross-page Pinia state.
- `src/router/`: uni-app navigation interception and login routing.
- `src/tabbar/`: tabbar configuration, rendering, and active index.
- `src/hooks/`: reusable composition logic.
- `src/utils/`: routing, backend URL, webview, upload, and low-level helpers.
- `src/style/`, `src/uni.scss`, and `uno.config.ts`: global styling and design tokens.
- `src/static/`: packaged static assets, normally referenced at runtime as `/static/...`.
- `src/uni_modules/`: vendored uv-ui code. Do not edit it unless the task explicitly requests a vendor patch or upgrade.
- `scripts/` and `vite-plugins/`: build-time scripts and plugins.

## Architecture boundaries

The normal runtime dependency direction is UI -> application service -> contract/transport.

- Pages orchestrate interaction state and rendering. They may use components, hooks, stores, APIs, and public utilities. They must not call `uni.request`, build backend base URLs, set auth headers, or reproduce serializer/response-unwrapping logic.
- Reusable components receive data/actions through typed props and emits. Presentation components do not know endpoint URLs, tokens, or concrete page routes.
- Generic hooks do not import pages or page-only components. A domain hook may call `src/api` or a store, but it must not render UI.
- `src/api/types/` is a pure contract layer and must not depend on Vue, Pinia, UI, routing, or HTTP runtime code.
- A normal `src/api/<domain>.ts` module depends only on its contract types and `src/http/`. It must not import pages, components, hooks, stores, router, or tabbar, and it must not show toast/modal UI or navigate. Platform-auth bridges such as `getWxCode` are named legacy exceptions, not patterns for normal APIs.
- `src/http/` is the single transport path for ordinary JSON APIs. Existing upload hook/util modules are the only allowed direct `uni.uploadFile` paths. Do not introduce another raw `uni.request` or `uni.uploadFile` implementation.
- Stores may call typed APIs, but they do not call HTTP directly. Business APIs do not mutate stores in reverse. Token injection belongs to the HTTP interceptor.
- Router and tabbar code enforce global navigation invariants and do not contain domain requests.
- `src/tabbar/config.ts` serves build time and runtime, so it must remain pure data with no store, API, HTTP, page, or `uni.*` runtime dependency.
- `src/utils/` stays low level. `utils/index.ts -> pages.json` and `utils/webview.ts -> api/login` are named legacy exceptions; do not expand the authentication cycle through new barrel exports or imports.
- Runtime code does not import root Vite/pages/manifest/UnoCSS configuration. `pages.config.ts -> src/tabbar/config.ts` is allowed only because the tabbar config is pure.
- Backend `YPPF/api/<domain>/` is an HTTP adapter layer. It may depend on serializers, models, and established domain utilities. Domain utilities must not depend back on API views/serializers or on frontend code.
- The two repositories communicate only through HTTP/OpenAPI. Do not cross-import source code or duplicate Django business logic in the frontend.
- Generated, vendor, and business code boundaries are strict. Business behavior never belongs in generated manifests, `src/uni_modules`, or backend root `api/urls.py`.

A known authentication cycle already exists (`api/login -> http -> store/token -> api/login`). Do not add other business domains to that cycle. Any intentional decoupling must be a separate authentication refactor with full login and 401 verification.

## Change guidelines

- Make the smallest coherent change that solves the task.
- When the touched legacy implementation violates this file, refactor that implementation to the documented rule. Do not copy a non-compliant neighboring example.
- Preserve WeChat-facing API fields, response shapes, page paths, storage keys, and public function signatures unless the task explicitly authorizes a breaking change.
- A breaking contract change must update backend serializers/schema/tests, frontend types/API, all callers, and migration/release notes in the same feature slice.
- Update backend API tests whenever observable backend behavior changes.
- The frontend currently has no configured test suite. Do not add a test framework solely to satisfy a generic rule; use targeted lint, type-checking, WeChat build, and DevTools smoke tests unless the task includes test infrastructure.
- Update documentation when public APIs, configuration, environment variables, routes, tabbar behavior, build commands, or user flows change.
- Before adding a production dependency, explain why uni-app, Vue, Wot, uv-ui, or existing helpers are insufficient. Update the proper dependency manifest and lockfile only after approval.
- Do not hand-edit generated files. Backend model changes use Django migrations; frontend page/manifest/type output changes start from their configuration source.
- Before modifying HTTP, auth, router, tabbar, store, or shared utilities, use `rg` to find all callers and validate the actual impact surface.
- Existing baseline failures do not lower the standard for new code. Prove that the change adds no new failure and report old failures separately.

## Generated and vendor boundaries

- Do not edit or commit `src/pages.json`, `src/manifest.json`, `src/types/`, or `dist/`. They are ignored and generated.
- Page metadata belongs in page-level `definePage` or `pages.config.ts`.
- Manifest changes belong in `manifest.config.ts`.
- Auto-import/component type declarations come from Vite plugin configuration.
- `scripts/create-base-files.js` creates only minimal placeholders for missing page/manifest JSON; Vite generates the real content.
- `src/service/**` is generated by `pnpm openapi` and excluded from ESLint. The current `openapi-ts-request.config.ts` points to an unibest demo schema rather than the active YPPF schema. Do not run or adopt it without first correcting and reviewing the schema source.
- Do not edit `node_modules/`. Resolve dependency issues through versions, configuration, or an explicitly approved patch mechanism.

## Environment and installation

- Required: Node.js `>=20` and pnpm `>=9`. `packageManager` pins pnpm `10.10.0`.
- Use pnpm only. Do not create `package-lock.json` or `yarn.lock`, and do not hand-edit `pnpm-lock.yaml`.
- Use `pnpm install` for the first local setup and `pnpm install --frozen-lockfile` when exact lockfile reproduction is required.
- Installation runs `prepare`, initializes Husky, and creates missing base manifest/page files.
- Environment files live under `env/`. Put personal overrides in ignored `env/.env.local` or `env/.env.<mode>.local` files.
- Every `VITE_*` value is client-visible. Never put a WeChat AppSecret, token, or server secret in frontend env files.
- `src/utils/index.ts#getEnvBaseUrl` overrides the backend URL for WeChat develop/trial/release builds. A change to `VITE_SERVER_BASEURL` alone does not update every WeChat environment.

## Cross-repository API workflow

YPPF and YPPF-mini are separate Git worktrees. Before editing, inspect applicable `AGENTS.md` files and `git status` in each repository, and review each diff separately. If a task authorizes only one layer, do not write to the other repository, but still read the upstream/downstream contract.

1. **Understand the domain:** read the backend model, existing business utility, permission/ownership rules, state transitions, and the nearest `api/<domain>/` implementation. Then inspect the frontend callers. Do not begin by guessing fields from a UI mock.
2. **Implement the backend API:** maintain `serializers.py`, `views.py`, `urls.py`, and `tests.py` under `../YPPF/api/<domain>/`. Register `v2/<domain>/` in `../YPPF/api/urls.py`; `boot/urls.py` adds `/api/`, producing `/api/v2/<domain>/`.
3. **Fix the contract:** serializers define body, query, response, enums, required/nullable/read-only fields, and error payloads. Query serializers must both drive schema and run at runtime with `is_valid(raise_exception=True)`. Every action has a concrete response serializer.
4. **Define behavior:** views define method, status, authentication, ownership, transaction boundaries, and side effects. A failed domain utility result maps to a non-2xx response, never an unconditional 200.
5. **Test first:** run `python manage.py test api.<domain>`. Cover unauthenticated access, forbidden/cross-user access, valid and invalid input, success output, and database side effects. List endpoints also cover filters, ordering, empty data, and pagination/data-volume boundaries. Run `python manage.py test` when feasible.
6. **Inspect the live schema:** use the newly generated/running `/api/schema/` and `/api/docs/`. Do not treat a database model, old YAML export, README, or frontend mock as the wire contract.
7. **Write frontend contract types:** represent exact field names, enums, required vs nullable fields, query/body types, and response envelopes in `src/api/types/<domain>.ts`. Separate read models from write payloads when they differ.
8. **Write the frontend API wrapper:** map path including trailing slash, method, query/body, and return type in `src/api/<domain>.ts`, always through `@/http/http`.
9. **Build the UI last:** pages consume only typed APIs and implement loading, error, empty, and data states, duplicate-submit guards, confirmation, refresh, and WeChat layout.
10. **Verify end to end:** run backend tests, inspect the schema diff, run frontend checks and the WeChat build, and smoke-test success, validation, auth, permission, missing-resource, conflict, empty-data, and retry paths.

The `notification` slice is a useful structural reference, not a correctness template. It currently has no pagination; backend PATCH requires `status` while the frontend marks it optional; nullable `title`/`URL` fields are modeled as optional; bulk endpoints return `{ message, count }` while frontend wrappers declare `void`; the query serializer is not used for runtime validation; and “mark/delete all read” only affects `NEEDREAD` despite broader UI wording. When touching this feature, align domain semantics, schema, tests, frontend types, API wrappers, and UI text rather than preserving the mismatch.

## Canonical backend error contract

All new or touched YPPF mini-program APIs use HTTP status codes for success/failure. Do not return an error with HTTP 200.

Every non-2xx response uses this JSON shape:

```json
{
  "code": "validation_error",
  "message": "请求参数有误",
  "errors": {
    "field_name": ["该字段不能为空"]
  }
}
```

Contract rules:

- `code` is a required, stable, machine-readable `snake_case` identifier. The minimum shared set is `validation_error`, `not_authenticated`, `invalid_token`, `permission_denied`, `not_found`, `conflict`, `throttled`, `upstream_unavailable`, and `internal_error`. Domain-specific codes such as `insufficient_points`, `sold_out`, or `limit_reached` are allowed when callers need to branch; one meaning must never have multiple codes.
- `message` is a required, concise, user-safe message. The current product UI is Chinese, so user-facing backend messages should be concise Chinese even though this document is English.
- `errors` is required. It is a `Record<string, string[]>` and must be `{}` when there are no details. Use dot paths for nested fields and `non_field_errors` for non-field validation.
- Do not return mixed alternatives such as `detail`, `msg`, a bare string/list, or an arbitrary field dictionary from new/touched endpoints.
- Use a shared DRF exception handler and a reusable error serializer so authentication, permission, validation, 404, domain, and unexpected exceptions produce the same shape.
- Keep successful response schemas endpoint-specific; do not wrap every success merely to match the error envelope.
- Use 400 for malformed/validation input, 401 for missing/invalid/expired authentication, 403 for authenticated-but-forbidden actions, 404 for missing or deliberately hidden foreign-owned resources, 409 for state/conflict errors, 429 for throttling, 502/503 for upstream/service unavailability, and 500 for unexpected server failures.
- Never expose tracebacks, exception class names, SQL, secrets, or raw third-party error bodies. A 500 response always uses a generic safe message.
- Declare the error serializer/statuses in drf-spectacular for every endpoint and test both the HTTP status and payload shape.
- During migration, old endpoints may still emit DRF `detail` or field dictionaries. Normalize them at the frontend transport boundary, but refactor any touched backend endpoint to the canonical envelope.

## Frontend error normalization and presentation

All request failures must reject as one normalized `ApiError` class/shape:

```ts
interface ApiError extends Error {
  statusCode: number | null
  code: string
  fieldErrors: Record<string, string[]>
  kind: 'http' | 'network' | 'timeout' | 'cancelled' | 'unknown'
  presented: boolean
}
```

Transport rules:

- `src/http/http.ts` owns legacy-payload parsing. Normalize in this order: canonical `{ code, message, errors }`; DRF `detail`/field dictionary/list; legacy `message`/`msg`/`error`/`succeed: false`; then a safe status-based fallback.
- Network errors use `statusCode: null`, `kind: 'network'`, and `code: 'network_error'`. Timeouts use `kind: 'timeout'` and `code: 'timeout'`. A user cancellation uses `kind: 'cancelled'` and is never presented as an error.
- Non-success legacy business `code` values must reject. They must not show a toast and then resolve `data`.
- `hideErrorToast` must suppress the default UI for every failure path, including HTTP errors, legacy business errors, network failures, and timeouts; it never suppresses rejection.
- API modules return/reject typed values and do not catch errors only to rename or display them.
- The shared presenter sets `presented = true` after displaying an error. A page `catch` updates local error/inline state and may perform recovery, but it must not display again when `presented` is already true.
- Preserve only sanitized diagnostics; do not log tokens, request bodies containing personal data, or raw sensitive responses.
- Parallel requests use `hideErrorToast: true` and aggregate into one inline/page error or one presenter call; `Promise.all` must not produce several simultaneous toasts.

Exactly one error surface is allowed for one failure:

1. **Toast — ordinary action or background-refresh failure.** The centralized request/error helper shows:
   ```ts
   uni.showToast({
     title: error.message,
     icon: 'none',
     duration: 2500,
   })
   ```
   Use the backend's safe `message`. If absent, use these fixed fallbacks: `网络连接失败，请稍后重试` for network, `请求超时，请稍后重试` for timeout, `登录已过期，请重新登录` for final 401 failure, `没有权限执行此操作` for 403, `请求的内容不存在` for 404, and `服务暂时不可用，请稍后重试` for 5xx.

2. **Modal — blocking failure requiring acknowledgement.** Call the request with `hideErrorToast: true`, then show exactly one modal:
   ```ts
   uni.showModal({
     title: '操作失败',
     content: error.message,
     showCancel: false,
     confirmText: '知道了',
   })
   ```
   Do not use a modal for routine list-load, validation, or transient network errors.

3. **Inline — initial list/detail loads and forms.** Call the request with `hideErrorToast: true`. An initial page-load failure renders one retryable page error; a 400 form response maps `fieldErrors` beside fields, with `message` as the non-field summary. Do not also show a toast/modal. If old data remains visible during a background refresh, keep the data and use one toast instead.

Confirmation dialogs are not error dialogs. Destructive, irreversible, or value-consuming actions use:

```ts
uni.showModal({
  title: '<specific action, e.g. 确认删除>',
  content: '<specific consequence>',
  confirmText: '<specific verb, e.g. 删除>',
  cancelText: '取消',
  confirmColor: '#dc2626',
})
```

Use a destructive color only for destructive actions; non-destructive confirmations use the product primary color. Prefer the Promise/`await` form of `uni.showModal` over nesting async work in a `success` callback. Cancellation is not an error and shows no toast.

Success feedback is owned by the initiating UI layer, never by `src/http` or a reusable store. Use a single `uni.showToast({ icon: 'success', ... })` only when success is not already obvious from navigation/state. Never display both request-layer and page-layer failure popups.

The current transport is legacy: it sometimes resolves 2xx business errors and `hideErrorToast` does not cover every branch. When a task touches request/error behavior, refactor the touched flow to this contract; do not copy the legacy pattern.

## Page and routing workflow

1. Put a new main-package page at `src/pages/<domain>/<name>.vue`. Only authentication subpackage pages belong in `src/pages-auth/`.
2. Use `<script setup lang="ts">` and declare page metadata with `definePage`. Only the actual home page sets `type: 'home'`.
3. Use leading-slash uni-app routes that match a freshly generated `src/pages.json`. Do not use browser Vue Router APIs.
4. Use `uni.switchTab` for tabbar pages and `uni.navigateTo`/`redirectTo`/`reLaunch` elsewhere. Let the global interceptor update login and tabbar state.
5. Change tabbar items only in `src/tabbar/config.ts`, verify the page/icon, restart the dev process, and inspect the regenerated page output.
6. Read and validate/decode route parameters in `onLoad`. Refresh cached/returning pages in `onShow` or through `usePageRefresh`.
7. Verify route, query, stack, tabbar, direct-entry/share-entry, and callback behavior in WeChat DevTools.

Authentication route names in `src/router/config.ts`, `src/pages-auth/*.vue`, and old README text are not fully aligned. For auth work, inspect newly generated routes, update all constants coherently, and verify real navigation. Do not copy an old path.

## WeChat login, state, and lifecycle

- `src/main.ts` must continue to install Pinia, the route interceptor, and the request interceptor.
- `App.vue#onLaunch` calls `tokenStore.wxLogin()`. With `LOGIN_PAGE_ENABLE_IN_MP === false`, the mini program bypasses the old H5 login-page interceptor and relies on WeChat login plus request-layer 401 recovery.
- Auth changes cover unbound WeChat accounts, primary/sub-account switching, token expiry, 401 retry, logout/unbind, and persisted expiry timestamps.
- Use `tokenStore.updateNowTime().validToken` or the store's existing public methods. Do not duplicate token-expiry logic from storage.
- Keep page-local state in `ref`/`reactive`. Use Pinia only for cross-page, persistent, or session state.
- Use `storeToRefs` when destructuring reactive store state; call actions on the store object.
- `src/tabbar/store.ts` is the only tabbar-index state and persists `app-tabbar-index`.
- `App.ku.vue` is the `@uni-ku/root` visual root for `KuRootView` and the custom tabbar.

## API and transport rules

- The normal frontend path is `src/api/*.ts -> src/http/http.ts -> uni.request`.
- Put request/response types in `src/api/types/<domain>.ts` and functions in `src/api/<domain>.ts`.
- Preserve backend wire names, including `snake_case` and established domain abbreviations.
- GET query is the second helper argument. POST/PUT body is second and query is third. PATCH currently uses `http<T>({ method: 'PATCH', ... })`; do not assume `http.patch` exists.
- Use leading-slash relative API paths with the exact DRF trailing slash.
- The WeChat request interceptor adds the environment base URL, timeout, query string, and `Authorization: Bearer ...`.
- `http<T>` returns the business payload/raw DRF body, not an Axios response. Do not access an extra `.data` unless the endpoint schema actually contains that field.
- `src/http/alova.ts` and the OpenAPI demo client are scaffold remnants. Do not mix clients in one feature.
- Convert backend media paths with `toBackendURL`.
- Open authenticated legacy web pages through `openWebview`. Import it directly from `@/utils/webview`; do not re-export it through the `@/utils` barrel because that expands the auth cycle.

## Vue and TypeScript conventions

- Follow `.editorconfig` and ESLint: UTF-8, LF, two spaces, final newline, single quotes, no semicolons, trailing commas.
- SFC block order is `script -> template -> style`. Local styles normally use `<style lang="scss" scoped>`.
- Use `import type` for types. Components are PascalCase, hooks are `useXxx`, stores are `useXxxStore`, and API functions begin with clear verbs.
- Vue APIs, uni-app lifecycle APIs, and `src/hooks` are auto-imported. Preserve a local import style only when it complies with lint; do not create unrelated import churn.
- Use `async/await` with `try/catch/finally`. Reset loading/submitting in `finally` and guard duplicate submissions.
- Validate input, route parameters, and nullable backend fields explicitly. Do not hide real null branches with non-null assertions.
- Data pages implement loading, data, empty, and error/retry states.
- Extract shared business logic into a hook, store, API, or focused util. Extract a component for genuinely reusable UI, not merely to reduce line count.
- A nearby legacy file is not a style template. When it conflicts with this document, follow this document.

## UI and WeChat Mini Program rules

- Use uni-app components such as `view`, `text`, `image`, and `scroll-view` plus `uni.*` APIs. Do not use `window`, `document`, DOM-only events, or browser-only CSS.
- Prefer UnoCSS for straightforward layout. Use scoped SCSS for complex page styles, pseudo-elements, or deliberate third-party overrides.
- Reuse `primary` and `p-safe`/`pt-safe`/`pb-safe`. Do not create near-duplicate theme or safe-area rules.
- Use `rpx` where responsive mini-program sizing matters and existing UnoCSS px utilities for stable icons/layout. Test narrow screens, long Chinese text, and bottom safe areas.
- `wd-*` components are registered through easycom; uv-ui comes from `src/uni_modules`. Continue a compliant component family already used by the feature, but do not introduce a third UI library.
- Dynamic UnoCSS/icon classes must appear as complete static literals or be added to `uno.config.ts#safelist`.
- A page with `navigationStyle: 'custom'` uses the established `uv-navbar` approach with `placeholder`, safe-area handling, and a back action for non-home pages.
- Prefer `uni.chooseMedia` for WeChat media selection. Use a WeChat-specific API only when uni-app has no equivalent, and isolate it under `MP-WEIXIN` when the compiler requires it.
- Do not add H5/App branches for a new feature. Existing non-WeChat branches are legacy and may be left untouched unless they block the WeChat implementation or build.

## Known legacy debt

This section is a dated snapshot, not a permanent waiver. Remove or update an item when it is fixed.

- On 2026-07-14, `pnpm lint` reported 65 errors and 20 warnings, mainly in `src/pages/appoint/arrange-by-time.vue`, `src/pages/me/my-appointments.vue`, and `src/utils/globalError.ts`. Do not use those files as formatting examples.
- The same snapshot had `pnpm type-check` fail in `src/uni_modules/uv-popup/components/uv-popup/uv-popup.vue:122` with `TS1005`.
- Several pages import `openWebview` from `@/utils` even though the barrel does not export it. New/touched code imports `@/utils/webview` directly.
- `@img` resolves to `src/static/images` in Vite but `src/static/*` in TypeScript. Until unified, use `/static/images/...` runtime paths or explicit `@/static/images/...` imports.
- `src/hooks/useUpload.ts` and `src/utils/uploadFile.ts` both expose a `useUpload` implementation while hooks are auto-imported. Confirm the intended implementation and avoid name collisions; do not merge them as unrelated cleanup.
- Generated manifests may contain stale titles or file-case data. Use them only to inspect a fresh generation; never copy them back over `definePage` or root configuration.
- Legacy non-WeChat login and platform branches are not acceptance targets. Do not spend feature time preserving or extending them unless explicitly requested.
- The notification contract mismatches listed in the API workflow are debt, not examples to repeat.

## Testing and acceptance

There is no configured frontend unit/component/E2E test script. Installing `uni-automator` does not mean tests exist.

Minimum verification:

- Documentation-only change: validate Markdown structure, paths, commands, English text, and `git diff --check`.
- Type/API/store/hook change: targeted ESLint, `pnpm type-check`, full `pnpm lint`, and focused behavior verification.
- Page/component/style change: the above plus `pnpm build:mp:test` or `pnpm build:mp` and a WeChat DevTools smoke test.
- Route/login/tabbar/manifest/conditional-compile change: WeChat build plus DevTools checks for navigation, back stack, refresh, direct/share entry, and login state.
- HTTP/error change: test canonical and legacy errors, network failure, timeout, 400, final 401, 403, 404, 409, 5xx, duplicate-popup prevention, and `hideErrorToast` behavior.
- Backend API change: targeted backend API tests, schema inspection, and frontend contract checks.
- Dependency or Vite/UnoCSS change: all static checks, WeChat production build, and lockfile inspection.
- H5/App builds and smoke tests are not required unless a task explicitly adds them to scope.

If a full check fails because of known baseline debt, prove whether the changed files introduce a new failure. Report the command and minimal failure summary; do not repair unrelated debt.

## Security and privacy

- Never commit WeChat AppSecret, passwords, private keys, real access/refresh tokens, tickets, cookies, or production user data.
- `VITE_*` values, the WeChat AppID, and client constants are visible to users. Real secrets stay on the backend or in platform secret configuration.
- Do not log tokens, tickets, passwords, `signed_openid`, complete user objects, personal request bodies, or sensitive responses.
- Do not put auth data in normal page query strings, global error text, or new long-lived storage. Centralize it in the token store and clear it on logout/unbind.
- Open webviews only through `openWebview`. Validate protocol/domain allowlists before accepting a variable URI.
- Encode redirect/query/user content through `encodeURIComponent` or existing helpers.
- Do not disable production domain, TLS, auth, or permission checks for debugging.
- Treat `src/pages/generic/terms.vue` as approved legal/privacy text. Do not casually rewrite it.
- Reuse upload validation for size, count, MIME/extension, and auth. Client validation never replaces backend validation.
- Error payloads and popups must not reveal internal exception details or personal data.

## Git and delivery

- Start with `git status --short --branch` in every repository in scope. Confirm the requested working branch without writing personal branch names into this file.
- Do not reset, checkout over, delete, or reformat unrelated user changes.
- Commitlint requires Conventional Commits such as `feat: ...`, `fix: ...`, `docs: ...`, and `refactor: ...`.
- The pre-commit hook runs lint-staged and ESLint fix. Inspect the diff before and after the hook.
- Do not commit `dist/`, `src/pages.json`, `src/manifest.json`, `src/types/`, logs, IDE files, or secrets.
- Before handoff, run `git diff --check` and `git status --short`, read every changed hunk, and report what changed, what was verified, and any remaining WeChat manual check.
- If this file approaches 1000 lines, keep this root file as the core map and move detailed architecture, API/error, testing, and security material into `docs/` with links here.
