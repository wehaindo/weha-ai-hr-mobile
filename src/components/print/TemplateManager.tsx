'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from '@/components/ui/empty';
import ConfirmDialog from '@/components/ui/confirm-dialog';
import { toast } from '@/components/ui/toast';
import { FileText, Tag, Edit, Trash2, Copy, Download, Upload, Check } from 'lucide-react';
import { useBridge } from '@/platform';
import { generateId } from '@/lib/id';
import ReceiptDesigner from './ReceiptDesigner';
import ZplDesigner from './ZplDesigner';
import PrintQueuePanel from './PrintQueuePanel';
import type { HardwareTemplate } from '@/types';

/* eslint-disable @typescript-eslint/no-explicit-any */

type DesignerMode = null | 'receipt' | 'label';

function now(): string {
  return new Date().toISOString();
}

export default function TemplateManager() {
  const bridge = useBridge();
  const [templates, setTemplates] = useState<HardwareTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [designerMode, setDesignerMode] = useState<DesignerMode>(null);
  const [editingTemplate, setEditingTemplate] = useState<HardwareTemplate | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);

  const loadTemplates = useCallback(async () => {
    try {
      const data = await bridge.db.query<HardwareTemplate>('SELECT * FROM hardware_templates ORDER BY type, name');
      setTemplates(data);
    } catch (error) {
      console.error('Failed to load templates:', error);
    } finally {
      setLoading(false);
    }
  }, [bridge]);

  useEffect(() => {
    void loadTemplates();
  }, [loadTemplates]);

  function openDesigner(mode: DesignerMode, template?: HardwareTemplate) {
    setDesignerMode(mode);
    setEditingTemplate(template || null);
  }

  function closeDesigner() {
    setDesignerMode(null);
    setEditingTemplate(null);
    void loadTemplates();
  }

  async function upsertTemplate(data: any) {
    const timestamp = now();
    if (editingTemplate) {
      const fields: string[] = [];
      const params: unknown[] = [];
      const set = (col: string, value: unknown) => {
        fields.push(`${col} = ?`);
        params.push(value);
      };
      if (data.name !== undefined) set('name', data.name);
      if (data.device_type !== undefined) set('device_type', data.device_type);
      if (data.content !== undefined) set('content', data.content);
      if (data.variables !== undefined) set('variables', data.variables);
      if (data.paper_width !== undefined) set('paper_width', data.paper_width);
      if (data.paper_height !== undefined) set('paper_height', data.paper_height);
      if (data.schema_version !== undefined) set('schema_version', data.schema_version);
      if (data.template_json !== undefined) set('template_json', data.template_json);
      set('updated_at', timestamp);
      params.push(editingTemplate.id);
      await bridge.db.execute(`UPDATE hardware_templates SET ${fields.join(', ')} WHERE id = ?`, params);
      toast.add({ title: 'Template updated', type: 'success' });
    } else {
      await bridge.db.execute(
        `INSERT INTO hardware_templates (id, name, type, device_type, content, variables, paper_width, paper_height, is_default, is_active, schema_version, template_json, version, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 1, ?, ?, 1, ?, ?)`,
        [
          generateId(),
          data.name,
          data.type,
          data.device_type,
          data.content || '',
          data.variables || '[]',
          data.paper_width || 80,
          data.paper_height ?? null,
          data.schema_version || '1.0',
          data.template_json ?? null,
          timestamp,
          timestamp,
        ]
      );
      toast.add({ title: 'Template created', type: 'success' });
    }
    closeDesigner();
  }

  async function handleSave(data: any) {
    try {
      await upsertTemplate(data);
    } catch (error) {
      console.error('Failed to save template:', error);
      toast.add({ title: 'Failed to save template', type: 'error' });
    }
  }

  // Autosave is a no-op for new templates (only update existing).
  async function handleAutoSave(data: any) {
    if (!editingTemplate) return;
    try {
      await upsertTemplate(data);
    } catch {
      /* ignore autosave errors */
    }
  }

  async function performDelete(id: string) {
    setActionLoading(true);
    try {
      await bridge.db.execute('DELETE FROM hardware_templates WHERE id = ?', [id]);
      toast.add({ title: 'Template deleted', type: 'success' });
      await loadTemplates();
    } catch (error) {
      console.error('Failed to delete template:', error);
      toast.add({ title: 'Failed to delete template', type: 'error' });
    } finally {
      setActionLoading(false);
    }
  }

  async function handleDuplicate(template: HardwareTemplate) {
    const timestamp = now();
    await bridge.db.execute(
      `INSERT INTO hardware_templates (id, name, type, device_type, content, variables, paper_width, paper_height, is_default, is_active, schema_version, template_json, version, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 1, ?, ?, 1, ?, ?)`,
      [
        generateId(),
        `${template.name} (Copy)`,
        template.type,
        template.device_type,
        template.content,
        template.variables,
        template.paper_width,
        template.paper_height,
        template.schema_version || '1.0',
        template.template_json ?? null,
        timestamp,
        timestamp,
      ]
    );
    toast.add({ title: 'Template duplicated', type: 'success' });
    await loadTemplates();
  }

  function handleExport(template: HardwareTemplate) {
    const payload = {
      export_version: '1.0',
      exported_at: now(),
      template: {
        name: template.name,
        type: template.type,
        device_type: template.device_type,
        content: template.content,
        variables: template.variables,
        paper_width: template.paper_width,
        paper_height: template.paper_height,
        schema_version: template.schema_version || '1.0',
        template_json: template.template_json,
      },
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${template.name.replace(/\s+/g, '_').toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.add({ title: 'Template exported', type: 'success' });
  }

  async function handleImportFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const t = parsed.template || parsed;
      if (!t?.name || !t?.type) {
        toast.add({ title: 'Invalid template file', type: 'error' });
        return;
      }
      const timestamp = now();
      await bridge.db.execute(
        `INSERT INTO hardware_templates (id, name, type, device_type, content, variables, paper_width, paper_height, is_default, is_active, schema_version, template_json, version, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 1, ?, ?, 1, ?, ?)`,
        [
          generateId(),
          t.name,
          t.type,
          t.device_type || (t.type === 'label' ? 'label_printer' : 'receipt_printer'),
          t.content || '',
          t.variables || '[]',
          t.paper_width || 80,
          t.paper_height ?? null,
          t.schema_version || '1.0',
          t.template_json ?? null,
          timestamp,
          timestamp,
        ]
      );
      toast.add({ title: 'Template imported', type: 'success' });
      await loadTemplates();
    } catch (error) {
      console.error('Failed to import template:', error);
      toast.add({ title: 'Failed to import template', type: 'error' });
    }
  }

  if (designerMode === 'receipt') {
    return <ReceiptDesigner template={editingTemplate} onSave={handleSave} onAutoSave={handleAutoSave} onClose={closeDesigner} />;
  }
  if (designerMode === 'label') {
    return <ZplDesigner template={editingTemplate} onSave={handleSave} onClose={closeDesigner} />;
  }

  const receiptTemplates = templates.filter((t) => t.type === 'receipt');
  const labelTemplates = templates.filter((t) => t.type === 'label');

  return (
    <div className="space-y-6" data-testid="template-manager">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Print Templates</h2>
          <p className="text-sm text-muted-foreground">Design and manage receipt and label templates</p>
        </div>
        <div className="flex gap-2">
          <input ref={importInputRef} type="file" accept="application/json,.json" className="hidden" onChange={handleImportFile} />
          <Button variant="outline" onClick={() => importInputRef.current?.click()}>
            <Upload className="size-4 mr-2" />
            Import
          </Button>
          <Button onClick={() => openDesigner('receipt')} data-testid="new-receipt-template">
            <FileText className="size-4 mr-2" />
            New Receipt
          </Button>
          <Button onClick={() => openDesigner('label')} data-testid="new-label-template">
            <Tag className="size-4 mr-2" />
            New Label
          </Button>
        </div>
      </div>

      <section>
        <h3 className="mb-3 text-lg font-semibold">Receipt Templates</h3>
        {loading ? null : receiptTemplates.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia>
                <FileText className="size-10" />
              </EmptyMedia>
              <EmptyTitle>No receipt templates</EmptyTitle>
              <EmptyDescription>Create your first receipt template</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {receiptTemplates.map((template) => (
              <Card key={template.id} className="transition-shadow hover:shadow-md">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-sm">{template.name}</CardTitle>
                    {template.is_default === 1 && (
                      <Badge variant="secondary" className="text-xs">
                        <Check className="size-3 mr-1" />
                        Default
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">{template.paper_width}mm receipt</p>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-1.5">
                    <Button variant="outline" size="sm" onClick={() => openDesigner('receipt', template)}>
                      <Edit className="size-3 mr-1" />
                      Edit
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => void handleDuplicate(template)}>
                      <Copy className="size-3 mr-1" />
                      Copy
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => handleExport(template)}>
                      <Download className="size-3 mr-1" />
                      Export
                    </Button>
                    <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={() => setConfirmDeleteId(template.id)}>
                      <Trash2 className="size-3" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section>
        <h3 className="mb-3 text-lg font-semibold">Label Templates (ZPL)</h3>
        {loading ? null : labelTemplates.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia>
                <Tag className="size-10" />
              </EmptyMedia>
              <EmptyTitle>No label templates</EmptyTitle>
              <EmptyDescription>Create your first ZPL label template</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {labelTemplates.map((template) => (
              <Card key={template.id} className="transition-shadow hover:shadow-md">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-sm">{template.name}</CardTitle>
                    {template.is_default === 1 && (
                      <Badge variant="secondary" className="text-xs">
                        <Check className="size-3 mr-1" />
                        Default
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">{template.paper_width}mm label</p>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-1.5">
                    <Button variant="outline" size="sm" onClick={() => openDesigner('label', template)}>
                      <Edit className="size-3 mr-1" />
                      Edit
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => void handleDuplicate(template)}>
                      <Copy className="size-3 mr-1" />
                      Copy
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => handleExport(template)}>
                      <Download className="size-3 mr-1" />
                      Export
                    </Button>
                    <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={() => setConfirmDeleteId(template.id)}>
                      <Trash2 className="size-3" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      <PrintQueuePanel />

      <ConfirmDialog
        open={confirmDeleteId !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmDeleteId(null);
        }}
        title="Delete Template"
        description="This will permanently delete this template. This action cannot be undone."
        confirmLabel="Yes, Delete"
        cancelLabel="Cancel"
        variant="destructive"
        loading={actionLoading}
        onConfirm={async () => {
          const id = confirmDeleteId;
          setConfirmDeleteId(null);
          if (id) await performDelete(id);
        }}
      />
    </div>
  );
}
