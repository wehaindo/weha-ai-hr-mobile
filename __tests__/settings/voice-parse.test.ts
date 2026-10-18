// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { parseItemsFromContent } from '@/integration/voice/parse-order';

describe('parseItemsFromContent', () => {
  it('parses a plain JSON response', () => {
    const content = JSON.stringify({ items: [{ name: 'Nasi Goreng', quantity: 2, price: 15000 }], confidence: 0.95 });
    const result = parseItemsFromContent(content);
    expect(result.ok).toBe(true);
    expect(result.items).toHaveLength(1);
    expect(result.items?.[0].name).toBe('Nasi Goreng');
    expect(result.items?.[0].quantity).toBe(2);
    expect(result.confidence).toBe(0.95);
  });

  it('strips markdown code fences', () => {
    const content = '```json\n{"items":[{"name":"Es Teh","quantity":1}],"confidence":0.8}\n```';
    const result = parseItemsFromContent(content);
    expect(result.ok).toBe(true);
    expect(result.items?.[0].name).toBe('Es Teh');
  });

  it('defaults quantity to 1 when missing', () => {
    const content = JSON.stringify({ items: [{ name: 'Kopi' }] });
    const result = parseItemsFromContent(content);
    expect(result.items?.[0].quantity).toBe(1);
    expect(result.items?.[0].price).toBeUndefined();
  });

  it('filters items without a name', () => {
    const content = JSON.stringify({ items: [{ name: 'Valid' }, { quantity: 3 }, { name: 'Also Valid' }] });
    const result = parseItemsFromContent(content);
    expect(result.items).toHaveLength(2);
  });

  it('returns an error for invalid JSON', () => {
    const result = parseItemsFromContent('this is not json');
    expect(result.ok).toBe(false);
    expect(result.error).toContain('not valid JSON');
    expect(result.raw).toBe('this is not json');
  });

  it('handles an empty items array', () => {
    const result = parseItemsFromContent(JSON.stringify({ items: [], confidence: 0.5 }));
    expect(result.ok).toBe(true);
    expect(result.items).toHaveLength(0);
  });
});
