// Testing-module model metadata — the meta.json concept from weha-framework,
// expressed in code. Each test model describes its fields (drives the generic
// form), table columns (drives the generic list), filters, and its integration
// registration (natural key + delta) so the sync engines can push it. The
// generic CRUD renderer (`src/components/testing`) reads this to render any
// registered model with no per-model code.

export type FieldType = 'text' | 'number' | 'boolean' | 'date' | 'combobox' | 'textarea';

export interface FieldOption {
  label: string;
  value: string;
}

/** A combobox backed by rows of another model (many2one). */
export interface FieldSource {
  /** Model id whose rows populate the options. */
  model: string;
  valueField: string;
  labelField: string;
}

export interface FieldMeta {
  /** Physical column. */
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  options?: FieldOption[];
  /** Options load from another model's rows (instead of a static list). */
  source?: FieldSource;
  /** Minor-unit money — stored as INTEGER, rendered with thousands separators. */
  money?: boolean;
  default?: string | number | boolean;
  order: number;
}

export type ColumnRender = 'boolean' | 'money' | 'date' | 'badge' | 'text';

export interface ColumnMeta {
  key: string;
  label: string;
  sortable?: boolean;
  render?: ColumnRender;
}

export interface FilterMeta {
  key: string;
  label: string;
  type: 'text' | 'select' | 'boolean';
  options?: FieldOption[];
}

export interface TestModelMeta {
  /** Route segment: `/settings/testing/[model]`. */
  id: string;
  label: string;
  table: string;
  description: string;
  /** Primary-key column (generated on create; hidden from the form). */
  idColumn: string;
  /** Timestamp columns maintained on create/update. */
  createdAtColumn?: string;
  updatedAtColumn?: string;
  fields: FieldMeta[];
  columns: ColumnMeta[];
  filters: FilterMeta[];
  /** Registered for per-entity REST sync. */
  integration: { keys: string[]; deltaColumn?: string };
  /** Register for the Data Hub applier. */
  hub?: boolean;
  /** Soft-delete column, if any (hub applier sets it to 0 on delete). */
  activeColumn?: string;
}

/** Format a minor-unit integer for display (thousands separators, no symbol). */
export function formatMinor(value: unknown): string {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? new Intl.NumberFormat('en-US').format(n) : '0';
}
