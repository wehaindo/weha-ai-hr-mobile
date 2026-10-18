// The four testing-module models and their CRUD/sync metadata. Adapted from
// weha-framework's Testing module to framework conventions (snake_case columns,
// money = INTEGER minor units, booleans = 0/1, ISO timestamps).

import type { TestModelMeta } from './models';

const CATEGORY_OPTIONS = [
  { label: 'Raw', value: 'RAW' },
  { label: 'Finished', value: 'FINISHED' },
  { label: 'Service', value: 'SERVICE' },
  { label: 'Digital', value: 'DIGITAL' },
];

const STATUS_OPTIONS = [
  { label: 'Draft', value: 'DRAFT' },
  { label: 'Confirmed', value: 'CONFIRMED' },
  { label: 'Completed', value: 'COMPLETED' },
  { label: 'Cancelled', value: 'CANCELLED' },
];

export const TEST_PRODUCT: TestModelMeta = {
  id: 'test_products',
  label: 'Test Products',
  table: 'test_products',
  description: 'Flat master fixture: scalars, enum, money, boolean, nullable date.',
  idColumn: 'id',
  createdAtColumn: 'created_at',
  updatedAtColumn: 'updated_at',
  fields: [
    { name: 'code', label: 'Code', type: 'text', required: true, order: 0 },
    { name: 'name', label: 'Name', type: 'text', required: true, order: 1 },
    { name: 'category', label: 'Category', type: 'combobox', options: CATEGORY_OPTIONS, default: 'RAW', required: true, order: 2 },
    { name: 'price', label: 'Price', type: 'number', money: true, default: 0, order: 3 },
    { name: 'quantity', label: 'Quantity', type: 'number', default: 0, order: 4 },
    { name: 'is_active', label: 'Is active', type: 'boolean', default: true, order: 5 },
    { name: 'launched_at', label: 'Launched at', type: 'date', order: 6 },
    { name: 'notes', label: 'Notes', type: 'textarea', order: 7 },
  ],
  columns: [
    { key: 'code', label: 'Code', sortable: true },
    { key: 'name', label: 'Name', sortable: true },
    { key: 'category', label: 'Category', sortable: true, render: 'badge' },
    { key: 'price', label: 'Price', sortable: true, render: 'money' },
    { key: 'quantity', label: 'Quantity', sortable: true },
    { key: 'is_active', label: 'Active', render: 'boolean' },
    { key: 'launched_at', label: 'Launched', render: 'date' },
    { key: 'notes', label: 'Notes' },
  ],
  filters: [
    { key: 'code', label: 'Code', type: 'text' },
    { key: 'name', label: 'Name', type: 'text' },
    { key: 'category', label: 'Category', type: 'select', options: CATEGORY_OPTIONS },
    { key: 'is_active', label: 'Active', type: 'boolean' },
  ],
  integration: { keys: ['code'], deltaColumn: 'updated_at' },
  hub: true,
  activeColumn: 'is_active',
};

export const TEST_ORDER: TestModelMeta = {
  id: 'test_orders',
  label: 'Test Orders',
  table: 'test_orders',
  description: 'Workflow master fixture: a state field for exercising state transitions.',
  idColumn: 'id',
  createdAtColumn: 'created_at',
  updatedAtColumn: 'updated_at',
  fields: [
    { name: 'reference', label: 'Reference', type: 'text', required: true, order: 0 },
    { name: 'status', label: 'Status', type: 'combobox', options: STATUS_OPTIONS, default: 'DRAFT', required: true, order: 1 },
    { name: 'customer_name', label: 'Customer', type: 'text', required: true, order: 2 },
    { name: 'total', label: 'Total', type: 'number', money: true, default: 0, order: 3 },
    { name: 'ordered_at', label: 'Ordered at', type: 'date', required: true, order: 4 },
    { name: 'notes', label: 'Notes', type: 'textarea', order: 5 },
  ],
  columns: [
    { key: 'reference', label: 'Reference', sortable: true },
    { key: 'status', label: 'Status', sortable: true, render: 'badge' },
    { key: 'customer_name', label: 'Customer', sortable: true },
    { key: 'total', label: 'Total', sortable: true, render: 'money' },
    { key: 'ordered_at', label: 'Ordered', render: 'date' },
    { key: 'notes', label: 'Notes' },
  ],
  filters: [
    { key: 'reference', label: 'Reference', type: 'text' },
    { key: 'status', label: 'Status', type: 'select', options: STATUS_OPTIONS },
    { key: 'customer_name', label: 'Customer', type: 'text' },
  ],
  integration: { keys: ['reference'], deltaColumn: 'updated_at' },
  hub: true,
};

export const TEST_ORDER_LINE: TestModelMeta = {
  id: 'test_order_lines',
  label: 'Test Order Lines',
  table: 'test_order_lines',
  description: 'Detail fixture: master–detail (FK to Test Order) for nested writes / loops.',
  idColumn: 'id',
  createdAtColumn: 'created_at',
  updatedAtColumn: 'updated_at',
  fields: [
    {
      name: 'order_id',
      label: 'Order',
      type: 'combobox',
      source: { model: 'test_orders', valueField: 'id', labelField: 'reference' },
      required: true,
      order: 0,
    },
    { name: 'sku', label: 'SKU', type: 'text', required: true, order: 1 },
    { name: 'description', label: 'Description', type: 'textarea', order: 2 },
    { name: 'quantity', label: 'Quantity', type: 'number', default: 1, order: 3 },
    { name: 'unit_price', label: 'Unit price', type: 'number', money: true, default: 0, order: 4 },
    { name: 'line_total', label: 'Line total', type: 'number', money: true, default: 0, order: 5 },
  ],
  columns: [
    { key: 'order_id', label: 'Order', sortable: true },
    { key: 'sku', label: 'SKU', sortable: true },
    { key: 'description', label: 'Description' },
    { key: 'quantity', label: 'Qty', sortable: true },
    { key: 'unit_price', label: 'Unit price', render: 'money' },
    { key: 'line_total', label: 'Line total', render: 'money' },
  ],
  filters: [{ key: 'sku', label: 'SKU', type: 'text' }],
  integration: { keys: ['id'], deltaColumn: 'updated_at' },
  hub: true,
};

export const TEST_LOOKUP: TestModelMeta = {
  id: 'test_lookups',
  label: 'Test Lookups',
  table: 'test_lookups',
  description: 'Reference fixture: FK / combobox target.',
  idColumn: 'id',
  createdAtColumn: 'created_at',
  updatedAtColumn: 'updated_at',
  fields: [
    { name: 'code', label: 'Code', type: 'text', required: true, order: 0 },
    { name: 'name', label: 'Name', type: 'text', required: true, order: 1 },
  ],
  columns: [
    { key: 'code', label: 'Code', sortable: true },
    { key: 'name', label: 'Name', sortable: true },
  ],
  filters: [
    { key: 'code', label: 'Code', type: 'text' },
    { key: 'name', label: 'Name', type: 'text' },
  ],
  integration: { keys: ['code'], deltaColumn: 'updated_at' },
  hub: true,
};

export const TEST_MODELS: Record<string, TestModelMeta> = {
  [TEST_PRODUCT.id]: TEST_PRODUCT,
  [TEST_ORDER.id]: TEST_ORDER,
  [TEST_ORDER_LINE.id]: TEST_ORDER_LINE,
  [TEST_LOOKUP.id]: TEST_LOOKUP,
};

export function getTestModel(id: string): TestModelMeta | null {
  return TEST_MODELS[id] ?? null;
}

export function listTestModels(): TestModelMeta[] {
  return Object.values(TEST_MODELS);
}
