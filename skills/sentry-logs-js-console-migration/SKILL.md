---
name: sentry-logs-js-console-migration
description: >-
  Migrate TypeScript/JavaScript console.* or legacy logger calls to Sentry Logs
  (Sentry.logger): flow mapping, scope placement, wide events, bridge teardown,
  redaction, and ESLint audit. Not for initial SDK setup or framework wiring.
license: MIT
compatibility: >-
  JavaScript-platform Sentry SDK 9.41.0+ for Logs; 10.32.0+ for
  scope.setAttributes on logs; browser Logs require NPM SDK, not loader/CDN.
---

# Console to Sentry Logs (`Sentry.logger`)

## Use

Use for JavaScript/TypeScript apps using `@sentry/nextjs`, `@sentry/node`,
`@sentry/react`, `@sentry/vue`, or `@sentry/browser`. For SDK installation,
framework init files, runtime boundaries, or package wiring, use:

- [`@sentry/nextjs`](https://skills.sentry.dev/sentry-nextjs-sdk/SKILL.md)
- [`@sentry/react`](https://skills.sentry.dev/sentry-react-sdk/SKILL.md)
- [`@sentry/node`](https://skills.sentry.dev/sentry-node-sdk/SKILL.md)
- [JavaScript Logs docs](https://docs.sentry.io/platforms/javascript/logs/) and
  [Tracing docs](https://docs.sentry.io/platforms/javascript/tracing/)

Reference files:

- [Execution-flow mapping and router examples](references/execution-flow-mapping.md):
  read during Phase 0/2 for router, boundary, service-layer, and scope examples.
- [Local ESLint plugin for Sentry structured logs](references/eslint-plugin-sentry-structured-logs.md):
  read only when implementing or enforcing structured-log lint rules.

Assets:

- [Sentry structured logs ESLint plugin](assets/eslint/sentry-structured-logs-plugin.mjs):
  copy when adding the local ESLint plugin.

## Non-negotiables

- One-shot the requested scope: inventory, map, migrate, enforce lint, rerun
  audits, verify. Stop after a pilot only if asked for pilot/audit/plan-only.
- Confirm installed SDK versions support Logs/scope APIs; set
  `enableLogs: true`.
- Prefer tracing for correlation; avoid bespoke `request_id` schemes.
- Do not add timing, duration, or latency log attributes; traces/spans own
  timing data.
- Map flow/boundaries before edits. Migrate by operation, route, job, command,
  or user action, not by statement.
- Prefer one wide log per operation: build context with scope attributes, then
  put only operation-result facts inline on the log event.
- Only modify logging-related code: logger calls, Sentry log/scope attributes,
  redaction, temporary bridges, and scoped lint rules. Do not touch styling,
  unrelated refactors, or pre-existing bugs.
- Log attributes must be inline object literals. Build reusable context on
  Sentry scopes, not in mutable `logAttributes` objects.
- Scope and log attributes are flat scalar (`string | number | boolean`) dotted
  keys; never set `sentry.*`, `browser.*`, `server.*`, or `user.*`.
- Use `beforeSendLog` for production drops/redaction. Never log raw tokens,
  passwords, cookies, authorization headers, or secrets.
- Bridges are temporary; remove them after call sites move to `Sentry.logger`.
- Enforce zero remaining `console.*` in governed app/shared code with ESLint.
  Scope intentional CLI/server output as documented overrides.
- Governed code means production app/shared JS/TS across browser, server, edge,
  workers, jobs, and shared clients. Exclude generated/vendor/build artifacts
  and narrowly documented CLI/user-facing terminal output.

## Phase 0: Boundary Map

Before inventory decisions or edits, map how each operation enters and moves
through the app. The file containing a log line is not the whole operation.

1. Identify runtime/router shape: package/framework config, routes, server
   entrypoints, queues, CLIs, SPA routes.
2. Trace each target log up to the durable boundary: route/action/loader/API
   handler, middleware/auth wrapper, job, scheduled task, command, or browser
   action.
3. Trace down to services/clients/repositories/helpers. Record boundary context,
   deeper facts, and completion/failure observation points.
4. Separate browser, server, edge, server-action, and worker surfaces; scopes do
   not cross runtimes automatically.

Deliver a compact boundary map with operation, runtime, entrypoint/router,
boundary, downstream path, global/isolation/nested scope, wide event, and
leaf-log actions. Use the execution-flow reference for examples.

## Phase 1: Inventory

Use ESLint as both inventory and completion audit. If `no-console` and
structured-log rules are missing, add the local plugin before the first full
inventory unless the user asked for audit-only/no-edits. Prefer the repo lint
command when it covers governed JS/TS; otherwise run:

```bash
npx eslint . --ext .js,.jsx,.ts,.tsx,.mjs,.cjs,.mts,.cts -f json --max-warnings=0
```

Search separately for `pino`, `winston`, `consola`, and custom wrappers because
`no-console` misses them. For each hit, record path, line, operation, method,
message summary, and target action:

- `delete`
- `move_to_scope`
- `merge_into_wide`
- `keep`

Group hits into operation bundles before deciding what to emit. Deliver counts
by file/rule/action.

## Phase 2: Boundary Map

Complete the boundary map before migrating an operation bundle; update it only
if implementation changes scope placement or wide-event ownership. Before edits,
decide what belongs on global scope, isolation scope, nested `withScope`, inline
log attributes, or deletion. Each operation needs a named wide event, a boundary
where broad context is set before downstream logs/errors, and a flow path to
each migrated log.

For the context ownership model and framework-specific placement rules, read the
execution-flow reference.

## Scope Attribute Placement

Scope attributes are the context-building layer. When Sentry captures a log or
error, active scope data is merged into the event.

- Global scope: app-wide constants set at startup, such as `service`, release,
  runtime, or deployment environment.
- Isolation scope: request/process/page/job context, such as route, procedure,
  job name, tenant/org id, user tier, and `Sentry.setUser(...)`.
- Current scope: narrow branch, dependency, or single-operation context created
  with `Sentry.withScope((scope) => { ... })`.
- Inline log attributes: facts specific to that one emitted log, such as
  `result.status`, `order.id`, `retry_count`, or `error.kind`.

Prefer top-level `Sentry.setXXX(...)` helpers or
`Sentry.getIsolationScope().setAttributes(...)` for request/page/job context.
Avoid `Sentry.getCurrentScope()` for new context; use `withScope` when the
context should apply only inside a callback.

```javascript
Sentry.getGlobalScope().setAttributes({
  service: "checkout",
  version: "2.1.0",
});

Sentry.getIsolationScope().setAttributes({
  org_id: user.orgId,
  user_tier: user.tier,
});

Sentry.withScope((scope) => {
  scope.setAttribute("operation.step", "payment");
  Sentry.logger.info("Processing order");
});
```

## Wide-Event Ownership

Choose exactly one owner for each operation result:

- Route/action/job boundary: `info` success/empty wide event, `error` failure
  wide event.
- Shared SDK/client wrapper: dependency facts only when the boundary will not
  capture them; success is `debug`/delete, failure logs only if not upstream.
- Render/component/helper: return facts, set narrow scope, or throw; do not emit
  success logs.

Do not emit both dependency and boundary success logs for the same normal path
unless both are independently searched or alerted.

Expected outcomes such as empty search results, missing CMS pages/products, and
unsupported webhook topics are not warnings unless they need operational
attention.

## Phase 3: Classify

Classify each log relative to its operation bundle:

- broad context -> `move_to_scope`
- larger-operation step -> `merge_into_wide` by moving reusable context to scope
  or preserving a local value for the final inline log attributes
- independently searchable signal -> `keep`
- security-sensitive -> strip via `beforeSendLog`
- otherwise/noise -> `delete` or `trace`/`debug` if valuable and dropped in prod

Shared-service success logs default to `debug` and production drop. Promote to
`info` only for business/operational outcomes worth querying.

For large codebases, migrate high-impact paths first: auth, checkout, billing,
data export, user-visible failures, then background jobs and leaf UI.

## Phase 4: Convert

Message is required; structured data is the second argument. Do not mechanically
replace `console.log("x")` with `Sentry.logger.info("x")`. Design the operation
event:

1. Move broad route/job/user context onto scope.
2. Move branch/dependency context onto a nested `withScope` when only part of
   the operation should inherit it.
3. Emit one final completion/failure log at the response/job boundary with an
   inline flat attributes object.
4. Keep separate warn/error logs only when they are standalone signals.

```javascript
Sentry.getGlobalScope().setAttributes({
  service: "checkout",
  version: "2.1.0",
});

Sentry.setUser({ id: user.id });
Sentry.getIsolationScope().setAttributes({
  "route.name": "checkout.create",
  org_id: user.orgId,
  user_tier: user.tier,
  "cart.item_count": cart.items.length,
  "payment.method": "stripe",
});

const order = await chargeCard(cart);

Sentry.logger.info("Checkout completed", {
  "order.id": order.id,
  "result.status": "completed",
});
```

### Duplicate-Failure Guard

A failure path emits at most one log event per operation/dependency failure. Let
the catch block be the single failure logger, or log before throwing only when
no later catch logs it. Wrap/rethrow with extra data and preserve facts for the
boundary failure log's scope or inline attributes. Trace every `throw` after
`Sentry.logger.error(...)`.

Scope/log attribute naming:

- quote dotted keys (`{ "order.id": order.id }`)
- use `snake_case` leaves and predictable prefixes (`order.*`, `cart.*`,
  `feature.*`, `http.*`, `error.*`)
- avoid camelCase, vague keys, nested objects, arrays, and reserved prefixes
- use `Sentry.logger.fmt` only when interpolated message values should become
  searchable `sentry.message.*` attributes

## Phase 5: Transitional Bridges

End state: call sites use `Sentry.logger` directly. Use bridges only for a
temporary transition, and tune levels to avoid ingesting everything.

- `console`: `Sentry.consoleLoggingIntegration({ levels: [...] })` (SDK 10.13.0+
  for multi-arg parsing)
- Consola: `Sentry.createConsolaReporter()` (SDK 10.12.0+)
- Pino: `Sentry.pinoIntegration()` (SDK 10.18.0+)
- Winston: `Sentry.createSentryWinstonTransport(Transport, { levels: ... })`
  (SDK 9.13.0+)

## Phase 6: Filter and Redact

Use `beforeSendLog` to drop noisy prod levels and remove sensitive attributes.
Return `null` to drop a log; confirm installed-SDK semantics. Verify with fake
sensitive fixture values in non-prod Sentry: allowed business keys remain,
unexpected PII does not.

## Phase 7: ESLint Completion Loop

Unless asked for audit-only/no-edits, keep ESLint policy enabled while
migrating. Ask only before installing packages, broad lint changes outside
governed JS/TS, or unrelated rule changes.

1. Add the plugin and `no-console` for all governed app/shared JS/TS files.
2. Run ESLint with `--max-warnings=0`; every `no-console` violation and
   structured-log warning/error is remaining inventory.
3. Do not scope `no-console` only to already-migrated files to keep CI green.
4. Do not add temporary disables or broad overrides for app/shared code.
5. Migrate/delete until ESLint has zero `console.*` failures and zero
   structured-log warnings/errors in governed code.
6. Use overrides only for intentional CLI/user-facing output; keep them narrow
   and commented.

Use `no-console` plus structured-log rules as CI truth. Keep local scripts
aligned with CI. The policy covers message text, flat scalar attributes where
static, reserved prefixes, and sensitive keys.

Final checks:

- ESLint passes governed app/shared code with `no-console`, structured-log
  rules, and `--max-warnings=0`; every finding is migrated, deleted, or covered
  by a narrow documented CLI/user-output override.
- No broad ESLint disables, temporary overrides, or "already migrated only" rule
  scoping remain.
- Legacy logger searches have zero unhandled findings.
- SDK version, `enableLogs`, tracing, scopes, and `beforeSendLog` verified for
  each logging runtime.
- Migrated operation bundles emit one named boundary-owned wide event, with
  broad context set on scope before downstream logs/errors.
- Bridges removed or teardown owner/date tracked.
- Sentry samples verify policy, trace correlation, expected attributes,
  redaction, and no PII/secrets.
