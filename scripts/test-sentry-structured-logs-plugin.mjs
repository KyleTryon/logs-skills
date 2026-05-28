import assert from "node:assert/strict";

import sentryStructuredLogs from "../skills/sentry-logs-migration-javascript/assets/eslint/sentry-structured-logs-plugin.mjs";

const {
  "require-message-and-flat-attrs": requireMessageAndFlatAttrs,
  "no-reserved-attr-keys": noReservedAttrKeys,
  "no-sensitive-attr-keys": noSensitiveAttrKeys,
} = sentryStructuredLogs.rules;

function identifier(name) {
  return { type: "Identifier", name };
}

function literal(value) {
  return { type: "Literal", value };
}

function templateLiteral() {
  return {
    type: "TemplateLiteral",
    expressions: [],
    quasis: [
      {
        type: "TemplateElement",
        value: { cooked: "", raw: "" },
        tail: true,
      },
    ],
  };
}

function member(object, property, computed = false) {
  return { type: "MemberExpression", object, property, computed };
}

function sentryLoggerObject() {
  return member(identifier("Sentry"), identifier("logger"));
}

function loggerCall(method, args, object = sentryLoggerObject()) {
  return {
    type: "CallExpression",
    callee: member(object, method, method.type !== "Identifier"),
    arguments: args,
  };
}

function attrs(properties) {
  return { type: "ObjectExpression", properties };
}

function attr(key, value, computed = false) {
  return {
    type: "Property",
    key: computed ? identifier(key) : literal(key),
    value,
    computed,
  };
}

function spread(argument = identifier("extra")) {
  return { type: "SpreadElement", argument };
}

function run(rule, node, options = {}) {
  const reports = [];
  const context = {
    options: [options],
    report(descriptor) {
      assert.ok(
        rule.meta.messages[descriptor.messageId],
        `missing meta.messages entry for ${descriptor.messageId}`,
      );
      reports.push({
        messageId: descriptor.messageId,
        data: descriptor.data ?? null,
      });
    },
  };

  rule.create(context).CallExpression(node);
  return reports;
}

function reportIds(reports) {
  return reports.map((report) => report.messageId);
}

function assertReports(rule, node, options, expectedMessageIds) {
  assert.deepEqual(reportIds(run(rule, node, options)), expectedMessageIds);
}

assert.deepEqual(
  Object.keys(requireMessageAndFlatAttrs.meta.schema[0].properties).sort(),
  [
    "allowDynamicLevelMethods",
    "allowUnknownAttributeValues",
    "allowedLoggerIdentifiers",
    "allowedLoggerObjects",
    "attributesFirstLoggerIdentifiers",
    "attributesFirstLoggerObjects",
  ],
);
assert.deepEqual(Object.keys(noReservedAttrKeys.meta.schema[0].properties), [
  "allowedLoggerObjects",
  "allowedLoggerIdentifiers",
  "attributesFirstLoggerObjects",
  "attributesFirstLoggerIdentifiers",
  "allowDynamicLevelMethods",
]);
assert.deepEqual(Object.keys(noSensitiveAttrKeys.meta.schema[0].properties), [
  "allowedLoggerObjects",
  "allowedLoggerIdentifiers",
  "attributesFirstLoggerObjects",
  "attributesFirstLoggerIdentifiers",
  "allowDynamicLevelMethods",
]);

assertReports(
  requireMessageAndFlatAttrs,
  loggerCall(identifier("info"), [literal("ready")]),
  {},
  [],
);
assertReports(
  requireMessageAndFlatAttrs,
  loggerCall(identifier("warn"), [
    literal("ready"),
    attrs([attr("job.id", identifier("jobId"))]),
  ]),
  {},
  [],
);
assertReports(
  requireMessageAndFlatAttrs,
  loggerCall(
    identifier("warn"),
    [literal("ready"), attrs([attr("job.id", identifier("jobId"))])],
    identifier("logger"),
  ),
  { allowedLoggerIdentifiers: ["logger"] },
  [],
);
assertReports(
  requireMessageAndFlatAttrs,
  loggerCall(
    identifier("info"),
    [attrs([attr("job.id", identifier("jobId"))]), literal("ready")],
    identifier("logger"),
  ),
  {
    allowedLoggerIdentifiers: ["logger"],
    attributesFirstLoggerIdentifiers: ["logger"],
  },
  [],
);
assertReports(
  requireMessageAndFlatAttrs,
  loggerCall(
    identifier("info"),
    [literal("ready"), attrs([attr("job.id", identifier("jobId"))])],
    identifier("logger"),
  ),
  {
    allowedLoggerIdentifiers: ["logger"],
    attributesFirstLoggerIdentifiers: ["logger"],
  },
  ["messageMustBeText", "nonInlineAttributes"],
);
assertReports(
  requireMessageAndFlatAttrs,
  loggerCall(identifier("info"), [
    literal("ready"),
    attrs([attr("job.id", templateLiteral())]),
  ]),
  {},
  [],
);
assertReports(
  requireMessageAndFlatAttrs,
  loggerCall(identifier("info"), []),
  {},
  ["messageRequired"],
);
assertReports(
  requireMessageAndFlatAttrs,
  loggerCall(identifier("info"), [attrs([])]),
  {},
  ["messageMustBeText"],
);
assertReports(
  requireMessageAndFlatAttrs,
  loggerCall(identifier("info"), [
    literal("ready"),
    attrs([attr("Job.ID", literal(42))]),
  ]),
  {},
  ["snakeCaseAttributeKey"],
);
assertReports(
  requireMessageAndFlatAttrs,
  loggerCall(identifier("info"), [
    literal("ready"),
    attrs([attr("job.data", attrs([]))]),
  ]),
  {},
  ["scalarAttributeValue"],
);
assertReports(
  requireMessageAndFlatAttrs,
  loggerCall(identifier("info"), [literal("ready"), identifier("logAttrs")]),
  {},
  ["nonInlineAttributes"],
);
assertReports(
  requireMessageAndFlatAttrs,
  loggerCall(identifier("info"), [
    literal("ready"),
    attrs([attr("job.id", identifier("jobId"))]),
  ]),
  { allowUnknownAttributeValues: false },
  ["scalarAttributeValue"],
);
assertReports(
  requireMessageAndFlatAttrs,
  loggerCall(identifier("info"), [
    literal("ready"),
    attrs([attr("job.id", literal(42))]),
  ]),
  { allowUnknownAttributeValues: false },
  [],
);
assertReports(
  requireMessageAndFlatAttrs,
  {
    type: "CallExpression",
    callee: member(sentryLoggerObject(), identifier("level"), true),
    arguments: [attrs([])],
  },
  {},
  ["messageMustBeText"],
);
assertReports(
  requireMessageAndFlatAttrs,
  {
    type: "CallExpression",
    callee: member(sentryLoggerObject(), identifier("level"), true),
    arguments: [attrs([])],
  },
  { allowDynamicLevelMethods: false },
  [],
);

const spreadCall = loggerCall(identifier("info"), [
  literal("ready"),
  attrs([spread()]),
]);
assert.deepEqual(
  [
    ...run(requireMessageAndFlatAttrs, spreadCall),
    ...run(noReservedAttrKeys, spreadCall),
    ...run(noSensitiveAttrKeys, spreadCall),
  ].map((report) => report.messageId),
  ["noAttributeSpread"],
);

assertReports(
  noReservedAttrKeys,
  loggerCall(identifier("info"), [
    literal("ready"),
    attrs([attr("sentry.trace_id", literal("abc"))]),
  ]),
  {},
  ["reservedAttributeKey"],
);
assertReports(
  noReservedAttrKeys,
  loggerCall(
    identifier("info"),
    [attrs([attr("sentry.trace_id", literal("abc"))]), literal("ready")],
    identifier("logger"),
  ),
  {
    allowedLoggerIdentifiers: ["logger"],
    attributesFirstLoggerIdentifiers: ["logger"],
  },
  ["reservedAttributeKey"],
);
assertReports(
  noSensitiveAttrKeys,
  loggerCall(identifier("info"), [
    literal("ready"),
    attrs([attr("api.key", literal("secret"))]),
  ]),
  {},
  ["sensitiveAttributeKey"],
);
assertReports(
  noSensitiveAttrKeys,
  loggerCall(
    identifier("info"),
    [attrs([attr("api.key", literal("secret"))]), literal("ready")],
    identifier("logger"),
  ),
  {
    allowedLoggerIdentifiers: ["logger"],
    attributesFirstLoggerIdentifiers: ["logger"],
  },
  ["sensitiveAttributeKey"],
);

console.log("sentry structured logs plugin tests passed");
