// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { evaluateCondition, isElementVisible, filterVisibleElements } from '@/lib/print/condition-evaluator';

describe('evaluateCondition', () => {
  it('treats an empty condition as always visible', () => {
    expect(evaluateCondition('', {}).visible).toBe(true);
    expect(evaluateCondition(null, {}).visible).toBe(true);
    expect(evaluateCondition(undefined, {}).visible).toBe(true);
  });

  it('checks bare-field truthiness', () => {
    expect(evaluateCondition('customer_name', { customer_name: 'Ann' }).visible).toBe(true);
    expect(evaluateCondition('customer_name', { customer_name: '' }).visible).toBe(false);
    expect(evaluateCondition('customer_name', {}).visible).toBe(false);
  });

  it('supports negated existence with "!"', () => {
    expect(evaluateCondition('!discount', { discount: 0 }).visible).toBe(true);
    expect(evaluateCondition('!discount', { discount: 5 }).visible).toBe(false);
  });

  it('evaluates equality operators', () => {
    expect(evaluateCondition('order.type == dine_in', { order: { type: 'dine_in' } }).visible).toBe(true);
    expect(evaluateCondition('order.type == takeaway', { order: { type: 'dine_in' } }).visible).toBe(false);
    expect(evaluateCondition('order.type != takeaway', { order: { type: 'dine_in' } }).visible).toBe(true);
  });

  it('evaluates numeric comparisons', () => {
    expect(evaluateCondition('total > 100', { total: 150 }).visible).toBe(true);
    expect(evaluateCondition('total > 100', { total: 50 }).visible).toBe(false);
    expect(evaluateCondition('total >= 100', { total: 100 }).visible).toBe(true);
    expect(evaluateCondition('total < 100', { total: 50 }).visible).toBe(true);
    expect(evaluateCondition('total <= 100', { total: 100 }).visible).toBe(true);
  });

  it('supports "contains" for strings and arrays', () => {
    expect(evaluateCondition('name contains ann', { name: 'Ann Smith' }).visible).toBe(true);
    expect(evaluateCondition('tags contains vip', { tags: ['vip', 'new'] }).visible).toBe(true);
    expect(evaluateCondition('tags contains vip', { tags: ['new'] }).visible).toBe(false);
  });

  it('resolves dotted paths against nested objects', () => {
    expect(evaluateCondition('order.total > 10', { order: { total: 20 } }).visible).toBe(true);
  });
});

describe('isElementVisible', () => {
  it('honors an explicit visible:false', () => {
    expect(isElementVisible({ visible: false }, {})).toBe(false);
  });

  it('falls back to the condition', () => {
    expect(isElementVisible({ condition: 'show_header' }, { show_header: true })).toBe(true);
    expect(isElementVisible({ condition: 'show_header' }, { show_header: false })).toBe(false);
  });
});

describe('filterVisibleElements', () => {
  it('keeps only visible elements', () => {
    const els = [
      { id: 'a', visible: true },
      { id: 'b', visible: false },
      { id: 'c', condition: 'flag' },
    ];
    const out = filterVisibleElements(els, { flag: true });
    expect(out.map((e) => e.id)).toEqual(['a', 'c']);
  });
});
