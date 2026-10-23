'use client';

// Tax & BPJS documents (BRD §4.4): released PPh 21 / 1721-A1 / BPJS
// documents with authorized download. Only RELEASED rows ever arrive from
// the server; unavailable states are honest.

import { Download, FileText } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { PayrollDocument } from '@/integration/ess/payroll';
import { DOCUMENT_TYPE_LABEL } from '@/lib/ess/payroll/view-model';
import { formatFileSize } from '@/components/ess/requests/attachment-picker';

export function TaxDocuments({
  documents,
  onDownload,
}: {
  documents: PayrollDocument[];
  onDownload: (documentId: string) => void;
}) {
  if (documents.length === 0) {
    return (
      <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground" data-testid="tax-documents-empty">
        No released tax or payroll documents yet. Documents appear here when payroll releases them.
      </p>
    );
  }

  return (
    <ul className="divide-y rounded-md border" data-testid="tax-documents">
      {documents.map((document) => (
        <li key={document.documentId} className="flex items-center gap-3 px-3 py-2.5" data-testid="tax-document-row">
          <FileText className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium" data-testid="tax-document-name">
              {DOCUMENT_TYPE_LABEL[document.type] ?? document.type}
              {document.taxYear ? ` · ${document.taxYear}` : ''}
            </span>
            <span className="block truncate text-xs text-muted-foreground">
              {document.periodLabel ? `${document.periodLabel} · ` : ''}
              {document.releasedAt ? `released ${document.releasedAt}` : ''}
              {` · ${formatFileSize(document.size)}`}
            </span>
          </span>
          <Badge variant="secondary">{document.status}</Badge>
          <Button
            variant="outline"
            size="sm"
            data-testid="tax-document-download"
            onClick={() => onDownload(document.documentId)}
          >
            <Download className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            Download
          </Button>
        </li>
      ))}
    </ul>
  );
}
