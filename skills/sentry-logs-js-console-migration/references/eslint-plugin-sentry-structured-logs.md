# Local ESLint plugin: Sentry structured logs

The bundled plugin asset checks required message text, inline attribute objects
for dotted `snake_case` keys and obvious non-scalars, reserved prefixes, and
sensitive keys.

Attribute objects must be inline at the logger call so lint can validate keys
and values at the callsite. Build reusable context with Sentry scope attributes,
then keep the logger call's inline object for facts specific to that one emitted
log. Set `allowUnknownAttributeValues: false` on the shape rule when you want to
reject unknown expressions and allow only statically verifiable scalar attribute
values.

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

const loggerMatcherOptions = {
  allowedLoggerObjects: ["Sentry.logger"],
  allowedLoggerIdentifiers: [],
  allowDynamicLevelMethods: true,
};

const attributeShapeOptions = {
  ...loggerMatcherOptions,
  allowUnknownAttributeValues: true,
};

export default [
  {
    files: ["**/*.{js,jsx,ts,tsx,mjs,cjs,mts,cts}"],
    plugins: { "sentry-structured-logs": sentryStructuredLogs },
    rules: {
      "no-console": "error",
      "sentry-structured-logs/require-message-and-flat-attrs": [
        "warn",
        attributeShapeOptions,
      ],
      "sentry-structured-logs/no-reserved-attr-keys": [
        "error",
        loggerMatcherOptions,
      ],
      "sentry-structured-logs/no-sensitive-attr-keys": [
        "error",
        loggerMatcherOptions,
      ],
    },
  },
];
```

For wrapper-friendly mode, add approved identifiers/objects, for example
`allowedLoggerIdentifiers: ["logger", "appLogger"]` or
`allowedLoggerObjects: ["Sentry.logger", "Telemetry.logger"]`.

`allowUnknownAttributeValues` only applies to `require-message-and-flat-attrs`;
the reserved and sensitive key rules share only the logger matcher options.

Rollout: start `require-message-and-flat-attrs` at `warn`; keep reserved and
sensitive key rules at `error`; promote all rules when conventions stabilize.
