// Supabase orderline payload validation — ported from ai-pos (pure). Required
// fields + numeric type checks; used before upload so invalid rows fail fast.

export interface OrderlineValidationResult {
  valid: boolean;
  errors: string[];
}

const REQUIRED_FIELDS = [
  'id',
  'tenant_id',
  'order_id',
  'order_number',
  'product_name',
  'quantity',
  'unit_price',
  'total',
] as const;

const NUMERIC_FIELDS = ['quantity', 'unit_price', 'total', 'discount', 'tax', 'subtotal'] as const;

/** Validate an orderline payload before pushing to Supabase. */
export function validateOrderlinePayload(payload: Record<string, unknown>): OrderlineValidationResult {
  const errors: string[] = [];

  for (const field of REQUIRED_FIELDS) {
    const value = payload[field];
    if (value === undefined || value === null || value === '') {
      errors.push(`Missing required field: ${field}`);
    }
  }

  for (const field of NUMERIC_FIELDS) {
    const value = payload[field];
    if (value !== undefined && value !== null && value !== '' && typeof value !== 'number' && !Number.isFinite(Number(value))) {
      errors.push(`Field ${field} must be numeric`);
    }
  }

  return { valid: errors.length === 0, errors };
}
