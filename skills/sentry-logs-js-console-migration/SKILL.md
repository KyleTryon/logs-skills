---
name: sentry-logs-js-console-migration
description: >-
  Migrate TypeScript/JavaScript app logging from console.* or legacy loggers to
  Sentry Logs (Sentry.logger): inventory, execution-flow and boundary mapping,
  scope placement, wide-event conversion, bridge teardown, redaction, and ESLint
  rollout. Not for initial SDK installation or framework wiring.
license: MIT
compatibility: >-
  JavaScript-platform Sentry SDK 9.41.0+ for Logs; 10.32.0+ for
  scope.setAttributes on logs; browser Logs require NPM SDK, not loader/CDN.
---

# Console to Sentry Logs (`Sentry.logger`)

## Use

Use for JavaScript/TypeScript apps using a JavaScript-platform Sentry SDK such
as `@sentry/nextjs`, `@sentry/node`, `@sentry/react`, `@sentry/vue`, or
`@sentry/browser`.

This skill is for auditing or migrating `console.*` and legacy logger call sites
to Sentry Logs. For SDK installation, framework init files, runtime boundaries,
or package wiring, use the relevant setup guide:

- [`@sentry/nextjs`](https://skills.sentry.dev/sentry-nextjs-sdk/SKILL.md)
- [`@sentry/react`](https://skills.sentry.dev/sentry-react-sdk/SKILL.md)
- [`@sentry/node`](https://skills.sentry.dev/sentry-node-sdk/SKILL.md)
- [JavaScript Logs docs](https://docs.sentry.io/platforms/javascript/logs/)
- [JavaScript Tracing docs](https://docs.sentry.io/platforms/javascript/tracing/)

Reference files:

- [Execution-flow mapping and router examples](references/execution-flow-mapping.md):
  read during Phase 0/2 for router, request/job boundary, service-layer, and
  scope placement examples.
- [Local ESLint plugin for Sentry structured logs](references/eslint-plugin-sentry-structured-logs.md):
  read only when implementing or enforcing structured-log lint rules.

Assets:

- [Sentry structured logs ESLint plugin](assets/eslint/sentry-structured-logs-plugin.mjs):
  copy when adding the local ESLint plugin described in the ESLint reference.

## Non-negotiables

- Confirm installed SDK versions support Logs and required scope APIs.
- Enable logs with `enableLogs: true`.
- Prefer tracing for log correlation; avoid parallel bespoke `request_id`
  schemes.
- Do not add timing, duration, or latency log attributes; traces/spans own
  timing data.
- Map execution flow and boundaries before editing call sites.
- Migrate by operation, route, job, command, or user action, not by statement.
- Prefer one wide log per operation. Put stable dimensions on scope and
  operation-specific outcomes/facts on the wide event payload.
- Only modify logging-related code: logger calls, Sentry log/scope attributes,
  redaction, temporary bridges, and scoped lint rules. Do not touch styling,
  unrelated refactors, or pre-existing bugs.
- Keep attributes flat and scalar (`string | number | boolean`) with dotted
  keys.
- Do not set SDK-managed/default prefixes: `sentry.*`, `browser.*`, `server.*`,
  or `user.*`.
- Use `beforeSendLog` for production drops and denylist redaction. Never log raw
  tokens, passwords, cookies, authorization headers, or secrets.
- Treat logger/console bridges as temporary; remove them after call sites move
  to `Sentry.logger`.
- Enforce zero remaining `console.*` in governed app/shared code with ESLint.
  Scope intentional CLI/server output as documented overrides.

## Phase 0: Execution-flow Map

Before inventory decisions or edits, locate how the operation enters the app and
moves through the code. Do not treat the file containing a log line as the whole
operation.

1. Identify runtime/router shape from `package.json`, framework config, route
   folders, server entrypoints, queue registration, CLI scripts, and browser SPA
   route definitions.
2. For each target log, trace upward to the durable boundary: route handler,
   action, loader, API handler, middleware/auth wrapper, job processor,
   scheduled task, command, or browser action handler.
3. Trace downward to services, SDK clients, repositories, and helpers. Record
   which context is available at the boundary, which facts become known deeper,
   and where completion/failure is observed.
4. Separate browser, server, edge, server action, and worker surfaces; scopes do
   not automatically cross runtimes.

Deliver a compact flow map with operation, runtime, entrypoint/router, boundary,
downstream path, global scope, isolation scope, nested scope, wide event, and
leaf-log actions. Use the execution-flow reference for templates and examples.

## Phase 1: Inventory

Use ESLint output as the main inventory source:

```bash
npx eslint . --ext .js,.jsx,.ts,.tsx,.mjs,.cjs,.mts,.cts -f json
```

Search separately for legacy loggers such as `pino`, `winston`, `consola`, and
custom wrappers. For each hit, record path, line, enclosing operation, method,
message summary, and target action:

- `delete`
- `move_to_scope`
- `merge_into_wide`
- `keep`

Group hits into operation bundles before deciding what to emit. Deliver counts
by file/rule and action.

## Phase 2: Boundary Map

Before replacing log lines, decide what belongs on global scope, isolation
scope, nested `withScope`, the wide-event payload, or deletion. Do not edit
until each target operation has a named wide event, a boundary where broad
context is set before downstream logs/errors, and a flow path to each migrated
log.

For the context ownership model and framework-specific placement rules, read the
execution-flow reference.

## Wide-Event Ownership

Before converting a bundle, choose exactly one owner for the operation result.

- Route/action/job boundaries own user-visible completion and failure logs.
- Shared clients own dependency facts only when the boundary will not capture
  them.
- Leaf helpers usually return facts or set scope; they do not emit success logs.
- Do not emit both dependency and boundary success logs for the same normal path
  unless both are independently searched or alerted.

| Location                  | Normal success    | Empty/not found     | Failure                        |
| ------------------------- | ----------------- | ------------------- | ------------------------------ |
| Route/action/job boundary | `info` wide event | `info` or merge     | `error` wide event             |
| Shared SDK/client wrapper | `debug` or delete | return fact; no log | `error` if not logged upstream |
| Render/component/helper   | delete            | delete or merge up  | throw/capture at boundary      |

Expected storefront outcomes such as empty search results, missing CMS pages,
missing products, and unsupported webhook topics are not warnings by default.
Use `warn` only when the condition needs operational attention.

## Phase 3: Classify

Classify each existing log relative to its operation bundle.

| Category               | Action                                                                     |
| ---------------------- | -------------------------------------------------------------------------- |
| Debug noise            | Remove, or use `trace`/`debug` only if valuable and dropped in prod.       |
| Boundary context       | Move to scope instead of emitting a separate log.                          |
| Thin request narrative | Merge useful facts into the wide event payload.                            |
| Operational signal     | Keep only if independently actionable or likely to be searched on its own. |
| Security-sensitive     | Strip via `beforeSendLog`; never log secrets, passwords, or raw tokens.    |

Decision shortcut:

- broad context -> `move_to_scope`
- larger-operation step -> `merge_into_wide`
- independently searchable signal -> `keep`
- otherwise -> `delete`

Success logs from shared services are `debug` by default and should usually be
dropped in production. Promote to `info` only when the event is a business or
operational outcome worth querying on its own.

For large codebases, migrate high-impact paths first: auth, checkout, billing,
data export, user-visible failures, then background jobs and leaf UI.

## Phase 4: Convert

Message is required. Pass structured data as the second argument.

Do not mechanically replace `console.log("x")` with `Sentry.logger.info("x")`.
Design the operation event:

1. Move broad route/job/user context onto scope.
2. Accumulate variable facts in a flat `logAttributes` object.
3. Emit one final completion/failure log at the response/job boundary.
4. Keep separate warn/error logs only when they are standalone signals.

```javascript
Sentry.setUser({ id: user.id });
Sentry.getIsolationScope().setAttributes({
  "route.name": "checkout.create",
  org_id: user.orgId,
  user_tier: user.tier,
});

const logAttributes = {
  "cart.item_count": cart.items.length,
  payment_method: "stripe",
};

const order = await chargeCard(cart);
logAttributes["order.id"] = order.id;

Sentry.logger.info("Checkout completed", logAttributes);
```

### Duplicate-Failure Guard

A failure path emits at most one log event per operation/dependency failure.
Avoid logging `Sentry.logger.error(...)` and then throwing into another catch
block that logs the same incident.

Preferred patterns:

- Let the catch block be the single failure logger.
- Log before throwing only when there is no later catch logger.
- Wrap/rethrow with extra data and merge those facts into the boundary failure
  log.

When reviewing a migration, trace every `throw` after `Sentry.logger.error(...)`
to confirm it does not create a duplicate failure log.

Attribute naming:

- quote dotted keys in object literals (`{ "order.id": order.id }`)
- use `snake_case` leaf names for business facts (`item_count`, `value_cents`)
- use predictable dotted prefixes (`order.*`, `cart.*`, `feature.*`, `http.*`,
  `error.*`)
- avoid camelCase, vague keys, nested objects, arrays, and reserved prefixes
- use `Sentry.logger.fmt` inside `Sentry.logger.info(...)` only when
  interpolated message values should become searchable `sentry.message.*`
  attributes

## Phase 5: Transitional Bridges

End state: call sites use `Sentry.logger` directly. Use bridges only when a
temporary transition is needed, and tune levels to avoid ingesting everything.

- `console`: `Sentry.consoleLoggingIntegration({ levels: [...] })` (SDK 10.13.0+
  for multi-arg parsing)
- Consola: `Sentry.createConsolaReporter()` (SDK 10.12.0+)
- Pino: `Sentry.pinoIntegration()` (SDK 10.18.0+)
- Winston: `Sentry.createSentryWinstonTransport(Transport, { levels: ... })`
  (SDK 9.13.0+)

## Phase 6: Filter and Redact

Use `beforeSendLog` to drop noisy levels in production and remove sensitive
attributes. Return `null` to drop a log; confirm exact semantics for the
installed SDK. Verify with fake sensitive fixture values in non-prod Sentry:
allowed business keys remain, unexpected PII does not.

## Phase 7: ESLint and Rollout

Before adding the `eslint-plugin-sentry-structured-logs`

Use `no-console` plus structured-log rules as the CI source of truth for
governed app/shared code. Keep local `package.json` scripts aligned with CI. For
implementation details, read the ESLint reference.

Structured-log policy covers required message text, flat scalar attributes where
statically visible, reserved prefixes, and sensitive keys.

Final checks:

- inventory grouped by operation bundle
- boundary map complete
- SDK version, `enableLogs`, tracing, scopes, and `beforeSendLog` verified
- pilot route/job migrated with one named wide event
- bridges removed or teardown tracked
- ESLint and Sentry samples verify policy, trace correlation, and no PII
