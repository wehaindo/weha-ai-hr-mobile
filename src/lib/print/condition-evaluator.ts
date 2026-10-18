// Template condition evaluator.
//
// Evaluates simple element visibility conditions against a data context.
//
// Supported syntax (case-insensitive operators):
//   ""                      -> always visible
//   "field"                 -> visible when field is truthy / present
//   "!field"                -> visible when field is absent / falsy
//   "field == value"        -> equality (loose, string compare fallback)
//   "field != value"        -> inequality
//   "field > value"         -> numeric greater-than
//   "field >= value"        -> numeric greater-or-equal
//   "field < value"         -> numeric less-than
//   "field <= value"        -> numeric less-than-or-equal
//   "field contains value"  -> substring / array membership
//
// Dotted paths (e.g. "order.total") are resolved against nested objects.

export interface ConditionResult {
  visible: boolean;
  reason?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

function resolvePath(context: Record<string, Any>, path: string): Any {
  if (!context) return undefined;
  if (Object.prototype.hasOwnProperty.call(context, path)) return context[path];
  return path.split('.').reduce<Any>((acc, key) => {
    if (acc === null || acc === undefined) return undefined;
    return acc[key];
  }, context);
}

function isBlank(value: Any): boolean {
  return value === undefined || value === null || value === '';
}

function isTruthy(value: Any): boolean {
  if (isBlank(value)) return false;
  if (value === 0 || value === '0' || value === false || value === 'false') return false;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function toNumber(value: Any): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : NaN;
}

export function evaluateCondition(
  condition: string | null | undefined,
  context: Record<string, Any>
): ConditionResult {
  const expr = String(condition || '').trim();
  if (!expr) return { visible: true };

  // Negated existence: "!field"
  if (expr.startsWith('!')) {
    const field = expr.slice(1).trim();
    const value = resolvePath(context, field);
    const visible = !isTruthy(value);
    return { visible, reason: visible ? undefined : `${field} is present` };
  }

  const operatorMatch = expr.match(/^(.+?)\s*(==|!=|>=|<=|>|<|contains)\s*(.+)$/i);
  if (!operatorMatch) {
    // Bare field: existence/truthiness check
    const value = resolvePath(context, expr);
    const visible = isTruthy(value);
    return { visible, reason: visible ? undefined : `${expr} is empty` };
  }

  const field = operatorMatch[1].trim();
  const operator = operatorMatch[2].toLowerCase();
  let rawExpected = operatorMatch[3].trim();

  // Strip a single layer of quotes from the expected value.
  if (
    (rawExpected.startsWith('"') && rawExpected.endsWith('"')) ||
    (rawExpected.startsWith("'") && rawExpected.endsWith("'"))
  ) {
    rawExpected = rawExpected.slice(1, -1);
  }

  const actual = resolvePath(context, field);

  switch (operator) {
    case '==':
      return { visible: String(actual) === String(rawExpected) };
    case '!=':
      return { visible: String(actual) !== String(rawExpected) };
    case '>':
      return { visible: toNumber(actual) > toNumber(rawExpected) };
    case '>=':
      return { visible: toNumber(actual) >= toNumber(rawExpected) };
    case '<':
      return { visible: toNumber(actual) < toNumber(rawExpected) };
    case '<=':
      return { visible: toNumber(actual) <= toNumber(rawExpected) };
    case 'contains': {
      if (Array.isArray(actual)) {
        return { visible: actual.map(String).includes(rawExpected) };
      }
      return { visible: String(actual ?? '').toLowerCase().includes(rawExpected.toLowerCase()) };
    }
    default:
      return { visible: true };
  }
}

/**
 * Apply element-level visibility: explicit `visible === false` wins, then the
 * optional `condition` string is evaluated against the context.
 */
export function isElementVisible(
  element: { visible?: boolean; condition?: string },
  context: Record<string, Any>
): boolean {
  if (element.visible === false) return false;
  return evaluateCondition(element.condition, context).visible;
}

/** Filter a list of elements, returning only those visible for the context. */
export function filterVisibleElements<T extends { visible?: boolean; condition?: string }>(
  elements: T[],
  context: Record<string, Any>
): T[] {
  return elements.filter((el) => isElementVisible(el, context));
}
