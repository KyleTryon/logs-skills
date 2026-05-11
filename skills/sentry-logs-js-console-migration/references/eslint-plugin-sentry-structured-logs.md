# Local ESLint plugin: Sentry structured logs

The bundled plugin asset checks required message text, inline attribute objects
for dotted `snake_case` keys and obvious non-scalars, reserved prefixes, and
sensitive keys.

Accumulated objects like `logAttributes` are allowed by default to match the
wide-event migration pattern. Inline literals are fully checked; non-inline
objects still need review because this plugin is not type-aware.

## Asset

Copy from:

```text
../assets/eslint/sentry-structured-logs-plugin.mjs
```

Suggested target:

```text
eslint/sentry-structured-logs-plugin.mjs
```

Plugin key: `sentry-structured-logs`

Rule IDs:

- `sentry-structured-logs/require-message-and-flat-attrs`
- `sentry-structured-logs/no-reserved-attr-keys`
- `sentry-structured-logs/no-sensitive-attr-keys`

## Config Delta

```javascript
import sentryStructuredLogs from "./eslint/sentry-structured-logs-plugin.mjs";

const loggerRuleOptions = {
  allowedLoggerObjects: ["Sentry.logger"],
  allowedLoggerIdentifiers: [],
  allowDynamicLevelMethods: true,
  requireInlineAttributes: false,
};

export default [
  {
    files: ["**/*.{js,jsx,ts,tsx,mjs,cjs,mts,cts}"],
    plugins: { "sentry-structured-logs": sentryStructuredLogs },
    rules: {
      "no-console": "error",
      "sentry-structured-logs/require-message-and-flat-attrs": [
        "warn",
        loggerRuleOptions,
      ],
      "sentry-structured-logs/no-reserved-attr-keys": [
        "error",
        loggerRuleOptions,
      ],
      "sentry-structured-logs/no-sensitive-attr-keys": [
        "error",
        loggerRuleOptions,
      ],
    },
  },
];
```

For wrapper-friendly mode, add approved identifiers/objects, for example
`allowedLoggerIdentifiers: ["logger", "appLogger"]` or
`allowedLoggerObjects: ["Sentry.logger", "Telemetry.logger"]`.

Rollout: start `require-message-and-flat-attrs` at `warn`; keep reserved and
sensitive key rules at `error`; promote all rules when conventions stabilize.
