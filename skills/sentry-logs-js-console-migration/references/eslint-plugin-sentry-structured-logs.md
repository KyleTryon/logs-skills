# Local ESLint plugin: Sentry structured logs

The bundled plugin checks Sentry logger calls for required message text,
inline attribute objects, dotted `snake_case` keys, obvious non-scalar values,
reserved prefixes, and sensitive keys.

Log attributes must be inline so ESLint can validate them at the callsite. Put
reusable context on Sentry scopes, and reserve the logger call's inline object
for facts specific to that one log event.

Set `allowUnknownAttributeValues: false` when you want the shape rule to reject
unknown expressions and allow only statically verifiable scalar attribute values.

These rules validate `Sentry.logger.*(...)` calls only; they do not validate
scope attribute setters.


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
