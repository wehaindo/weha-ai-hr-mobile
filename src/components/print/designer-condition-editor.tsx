'use client';

import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { RECEIPT_DYNAMIC_FIELDS } from '@/types/print-template';

type Mode = 'always' | 'exists' | 'empty' | 'compare';

interface ConditionEditorProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

const OPERATORS = [
  { value: '==', label: 'equals' },
  { value: '!=', label: 'not equals' },
  { value: '>', label: 'greater than' },
  { value: '>=', label: 'greater or equal' },
  { value: '<', label: 'less than' },
  { value: '<=', label: 'less or equal' },
  { value: 'contains', label: 'contains' },
];

function parseCondition(raw: string): { mode: Mode; field: string; operator: string; expected: string } {
  const value = (raw || '').trim();
  if (!value) return { mode: 'always', field: '', operator: '==', expected: '' };
  if (value.startsWith('!')) {
    return { mode: 'empty', field: value.slice(1).trim(), operator: '==', expected: '' };
  }
  const match = value.match(/^(.+?)\s*(==|!=|>=|<=|>|<|contains)\s*(.+)$/i);
  if (match) {
    return {
      mode: 'compare',
      field: match[1].trim(),
      operator: match[2].toLowerCase(),
      expected: match[3].trim().replace(/^["']|["']$/g, ''),
    };
  }
  return { mode: 'exists', field: value, operator: '==', expected: '' };
}

function buildCondition(mode: Mode, field: string, operator: string, expected: string): string {
  const f = field.trim();
  if (mode === 'always' || !f) return '';
  if (mode === 'exists') return f;
  if (mode === 'empty') return `!${f}`;
  const needsQuotes = /[^0-9.]/.test(expected) || expected === '';
  return `${f} ${operator} ${needsQuotes ? `"${expected}"` : expected}`;
}

export default function DesignerConditionEditor({ value, onChange, className }: ConditionEditorProps) {
  const [mode, setMode] = useState<Mode>('always');
  const [field, setField] = useState('');
  const [operator, setOperator] = useState('==');
  const [expected, setExpected] = useState('');
  const [freeText, setFreeText] = useState(value || '');

  useEffect(() => {
    const parsed = parseCondition(value);
    setMode(parsed.mode);
    setField(parsed.field);
    setOperator(parsed.operator);
    setExpected(parsed.expected);
    setFreeText(value || '');
  }, [value]);

  function emit(nextMode: Mode, nextField: string, nextOperator: string, nextExpected: string) {
    const condition = buildCondition(nextMode, nextField, nextOperator, nextExpected);
    setFreeText(condition);
    onChange(condition);
  }

  return (
    <div className={className}>
      <div className="space-y-2">
        <Label className="text-xs">Condition</Label>
        <Select
          value={mode}
          onValueChange={(v) => {
            const next = v as Mode;
            setMode(next);
            emit(next, field, operator, expected);
          }}
        >
          <SelectTrigger className="h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="always">Always visible</SelectItem>
            <SelectItem value="exists">Field has value</SelectItem>
            <SelectItem value="empty">Field is empty</SelectItem>
            <SelectItem value="compare">Compare field</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {mode !== 'always' && (
        <div className="space-y-2 mt-2">
          <Label className="text-xs">Field</Label>
          <Input
            list="designer-condition-fields"
            value={field}
            onChange={(e) => {
              setField(e.target.value);
              emit(mode, e.target.value, operator, expected);
            }}
            placeholder="e.g. customer.name"
            className="h-8 text-sm"
          />
          <datalist id="designer-condition-fields">
            {RECEIPT_DYNAMIC_FIELDS.map((f) => (
              <option key={f.key} value={f.key}>
                {f.label}
              </option>
            ))}
          </datalist>
        </div>
      )}

      {mode === 'compare' && (
        <div className="grid grid-cols-2 gap-2 mt-2">
          <div className="space-y-2">
            <Label className="text-xs">Operator</Label>
            <Select
              value={operator}
              onValueChange={(v) => {
                const next = v ?? '==';
                setOperator(next);
                emit(mode, field, next, expected);
              }}
            >
              <SelectTrigger className="h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OPERATORS.map((op) => (
                  <SelectItem key={op.value} value={op.value}>
                    {op.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Value</Label>
            <Input
              value={expected}
              onChange={(e) => {
                setExpected(e.target.value);
                emit(mode, field, operator, e.target.value);
              }}
              placeholder="value"
              className="h-8 text-sm"
            />
          </div>
        </div>
      )}

      <div className="space-y-2 mt-2">
        <Label className="text-xs text-muted-foreground">Expression</Label>
        <Input
          value={freeText}
          onChange={(e) => {
            setFreeText(e.target.value);
            onChange(e.target.value);
          }}
          placeholder="(always visible)"
          className="h-8 text-sm font-mono"
        />
      </div>
    </div>
  );
}
