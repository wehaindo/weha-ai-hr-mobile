// Supabase orderline payload builder — ported from ai-pos (pure). Builds the
// `pos_orderlines` record from a source snapshot + device identity. The sync id
// is `OL-{order}-{line}` so re-sends are idempotent on `id`.

export interface OrderLineSource {
  order_id: string;
  order_number: string;
  order_line_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  [key: string]: unknown;
}

export interface DeviceIdentity {
  tenant_id?: string;
  store_id?: string;
  branch_id?: string;
  terminal_id?: string;
  installation_id?: string;
}

/** Build a Supabase orderline record. `id` is the idempotent upsert key. */
export function buildSupabaseOrderline(source: OrderLineSource, identity: DeviceIdentity): Record<string, unknown> {
  const lineId = String(source.order_line_id);
  const id = `OL-${source.order_id}-${lineId}`;
  const unitPrice = Number(source.unit_price ?? 0);
  const quantity = Number(source.quantity ?? 0);
  const subtotal = source.subtotal !== undefined ? Number(source.subtotal) : quantity * unitPrice;

  return {
    ...source,
    id,
    tenant_id: identity.tenant_id ?? 'default',
    store_id: identity.store_id ?? null,
    branch_id: identity.branch_id ?? null,
    terminal_id: identity.terminal_id ?? null,
    order_id: String(source.order_id),
    order_number: source.order_number,
    order_line_id: lineId,
    product_name: source.product_name,
    quantity,
    unit_price: unitPrice,
    subtotal,
    total: source.total !== undefined ? Number(source.total) : subtotal,
  };
}
