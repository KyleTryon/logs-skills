const SENSITIVE_KEY_RE =
  /(?:password|passwd|token|authorization|cookie|secret|api[_-]?key|private[_-]?key|session[_-]?id)/i;
const RESERVED_KEY_RE = /^(?:sentry\.|browser\.|server\.|user\.)/;
const SNAKE_CASE_SEGMENT_RE = /^[a-z][a-z0-9_]*$/;
const LEVEL_METHODS = new Set([
  "trace",
  "debug",
  "info",
  "warn",
  "error",
  "fatal",
]);
const NON_SCALAR_NODE_TYPES = new Set([
  "ObjectExpression",
  "ArrayExpression",
  "FunctionExpression",
  "ArrowFunctionExpression",
  "ClassExpression",
]);

function unwrapChainExpression(node) {
  return node?.type === "ChainExpression" ? node.expression : node;
}

function getStaticPropertyName(node) {
  if (!node || node.type !== "MemberExpression") return null;
  if (!node.computed && node.property.type === "Identifier") {
    return node.property.name;
  }
  if (
    node.computed &&
    node.property.type === "Literal" &&
    typeof node.property.value === "string"
  ) {
    return node.property.value;
  }
  return null;
}

function hasDynamicPropertyName(node) {
  return node?.type === "MemberExpression" && node.computed;
}

function getMemberPath(node) {
  const segments = [];
  let current = node;

  while (current) {
    if (current.type === "Identifier") {
      segments.unshift(current.name);
      return segments.join(".");
    }

    if (current.type === "MemberExpression" && !current.computed) {
      const prop =
        current.property.type === "Identifier"
          ? current.property.name
          : current.property.type === "Literal"
            ? String(current.property.value)
            : null;
      if (!prop) return null;
      segments.unshift(prop);
      current = current.object;
      continue;
    }

    return null;
  }

  return null;
}

function isLoggerCall(node, options = {}) {
  if (node?.type !== "CallExpression") return false;

  const callee = unwrapChainExpression(node.callee);
  if (!callee || callee.type !== "MemberExpression") return false;

  const allowedLoggerObjects = new Set(
    options.allowedLoggerObjects || ["Sentry.logger"],
  );
  const allowedLoggerIdentifiers = new Set(
    options.allowedLoggerIdentifiers || [],
  );

  const objectPath = getMemberPath(callee.object);
  const isAllowedLoggerObject =
    (objectPath && allowedLoggerObjects.has(objectPath)) ||
    (callee.object?.type === "Identifier" &&
      allowedLoggerIdentifiers.has(callee.object.name));

  if (!isAllowedLoggerObject) return false;

  const method = getStaticPropertyName(callee);
  if (method) return LEVEL_METHODS.has(method);

  if (hasDynamicPropertyName(callee)) {
    return options.allowDynamicLevelMethods !== false;
  }

  return false;
}

function getPropertyKey(prop) {
  if (!prop || prop.type !== "Property" || prop.computed) return null;
  if (prop.key.type === "Identifier") return prop.key.name;
  if (prop.key.type === "Literal") return String(prop.key.value);
  return null;
}

function collectAttrsEntries(attrsNode, context, options = {}) {
  if (!attrsNode) return [];
  if (attrsNode.type !== "ObjectExpression") {
    if (options.reportNonLiteral) {
      context.report({
        node: attrsNode,
        message:
          "Log attributes must be an inline object literal so lint rules can validate keys and values.",
      });
    }
    return null;
  }

  const entries = [];
  for (const prop of attrsNode.properties) {
    if (prop.type === "SpreadElement") {
      context.report({
        node: prop,
        message:
          "Do not spread into log attributes; define each key explicitly.",
      });
      continue;
    }

    if (prop.type !== "Property") {
      context.report({
        node: prop,
        message: "Attributes must use static object properties.",
      });
      continue;
    }

    const key = getPropertyKey(prop);
    if (!key) {
      context.report({
        node: prop.key,
        message:
          "Attributes must use non-computed identifier or string literal keys.",
      });
      continue;
    }

    entries.push({ key, keyNode: prop.key, valueNode: prop.value });
  }

  return entries;
}

function isScalarLiteral(node) {
  return (
    node?.type === "Literal" &&
    (typeof node.value === "string" ||
      typeof node.value === "number" ||
      typeof node.value === "boolean")
  );
}

function isClearlyNonScalar(node) {
  if (!node) return false;
  if (NON_SCALAR_NODE_TYPES.has(node.type)) return true;
  if (node.type === "Literal") return !isScalarLiteral(node);
  if (node.type === "TemplateLiteral") return false;
  return false;
}

function isClearlyNotMessage(node) {
  if (!node) return false;
  if (node.type === "Literal") return typeof node.value !== "string";
  if (node.type === "TemplateLiteral") return false;
  if (node.type === "TaggedTemplateExpression") return false;
  if (NON_SCALAR_NODE_TYPES.has(node.type)) return true;
  return false;
}

function requireMessageAndFlatAttrs(context, node, options = {}) {
  const [messageArg, attrsArg] = node.arguments;
  if (!messageArg) {
    context.report({
      node,
      message: "Logger call must include a message as the first argument.",
    });
    return;
  }

  if (isClearlyNotMessage(messageArg)) {
    context.report({
      node: messageArg,
      message:
        "Logger call first argument must be message text, not structured data.",
    });
  }

  const entries = collectAttrsEntries(attrsArg, context, {
    reportNonLiteral: options.requireInlineAttributes === true,
  });
  if (!entries) return;

  for (const entry of entries) {
    const segments = entry.key.split(".");
    if (
      segments.some(
        (segment) => !segment || !SNAKE_CASE_SEGMENT_RE.test(segment),
      )
    ) {
      context.report({
        node: entry.keyNode,
        message: `Each dotted key segment must be snake_case: "${entry.key}".`,
      });
    }

    if (isClearlyNonScalar(entry.valueNode)) {
      context.report({
        node: entry.valueNode,
        message: `Attribute "${entry.key}" must be scalar (string, number, or boolean).`,
      });
    }
  }
}

function noReservedAttrKeys(context, node) {
  const attrsArg = node.arguments[1];
  const entries = collectAttrsEntries(attrsArg, context);
  if (!entries) return;

  for (const entry of entries) {
    if (RESERVED_KEY_RE.test(entry.key)) {
      context.report({
        node: entry.keyNode,
        message:
          `Reserved attribute prefix not allowed: "${entry.key}". ` +
          "Do not overwrite SDK-managed keys under sentry.*, browser.*, server.*, or user.*.",
      });
    }
  }
}

function noSensitiveAttrKeys(context, node) {
  const attrsArg = node.arguments[1];
  const entries = collectAttrsEntries(attrsArg, context);
  if (!entries) return;

  for (const entry of entries) {
    if (SENSITIVE_KEY_RE.test(entry.key)) {
      context.report({
        node: entry.keyNode,
        message: `Sensitive key not allowed in log attributes: "${entry.key}".`,
      });
    }
  }
}

function createRule(handler) {
  return {
    meta: {
      type: "problem",
      schema: [
        {
          type: "object",
          properties: {
            allowedLoggerObjects: { type: "array", items: { type: "string" } },
            allowedLoggerIdentifiers: {
              type: "array",
              items: { type: "string" },
            },
            allowDynamicLevelMethods: { type: "boolean" },
            requireInlineAttributes: { type: "boolean" },
          },
          additionalProperties: false,
        },
      ],
    },
    create(context) {
      const options = context.options?.[0] || {};
      return {
        CallExpression(node) {
          if (!isLoggerCall(node, options)) return;
          handler(context, node, options);
        },
      };
    },
  };
}

export default {
  meta: { name: "eslint-plugin-sentry-structured-logs" },
  rules: {
    "require-message-and-flat-attrs": createRule(requireMessageAndFlatAttrs),
    "no-reserved-attr-keys": createRule(noReservedAttrKeys),
    "no-sensitive-attr-keys": createRule(noSensitiveAttrKeys),
  },
};
