'use client';

// Attachment picker (contract §4.1): images/PDF, ≤3 files, ≤5 MB each.
// Files are held in memory only — drafts persist names, never bytes.

import { useRef } from 'react';
import { Paperclip, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { EssFilePart } from '@/integration/ess/core';
import {
  ATTACHMENT_MIME_TYPES,
  MAX_ATTACHMENTS,
  validateAttachments,
  type AttachmentFile,
} from '@/lib/ess/requests/validation';

export interface AttachmentPickerProps {
  files: File[];
  onChange: (files: File[]) => void;
  error?: string;
  /** Names from a restored draft — bytes cannot be restored, only hinted. */
  restoredNames?: string[];
}

function toAttachment(file: File): AttachmentFile {
  return { name: file.name, size: file.size, type: file.type };
}

/** Read picked files into transport parts for the multipart submit. */
export async function toFileParts(files: File[]): Promise<EssFilePart[]> {
  return Promise.all(
    files.map(async (file) => ({
      filename: file.name,
      bytes: new Uint8Array(await file.arrayBuffer()),
      contentType: file.type || 'application/octet-stream',
    }))
  );
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function AttachmentPicker({ files, onChange, error, restoredNames = [] }: AttachmentPickerProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  function accept(picked: FileList | null) {
    if (!picked) return;
    const next = [...files, ...Array.from(picked)].slice(0, MAX_ATTACHMENTS);
    onChange(next);
  }

  const fileErrors = validateAttachments(files.map(toAttachment));

  return (
    <div className="space-y-2" data-testid="attachment-picker">
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ATTACHMENT_MIME_TYPES.join(',')}
        className="hidden"
        data-testid="attachment-input"
        onChange={(e) => {
          accept(e.target.files);
          e.target.value = '';
        }}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        data-testid="attach-file"
        disabled={files.length >= MAX_ATTACHMENTS}
        onClick={() => inputRef.current?.click()}
      >
        <Paperclip className="mr-1.5 h-3.5 w-3.5" aria-hidden />
        Attach file {files.length > 0 && `(${files.length}/${MAX_ATTACHMENTS})`}
      </Button>
      <p className="text-xs text-muted-foreground">
        Images or PDF, up to {MAX_ATTACHMENTS} files of 5&nbsp;MB each.
      </p>
      {(error || fileErrors.files) && (
        <p className="text-xs text-destructive" data-testid="attachment-error">
          {error ?? fileErrors.files}
        </p>
      )}
      {files.length > 0 && (
        <ul className="space-y-1">
          {files.map((file, index) => (
            <li
              key={`${file.name}-${index}`}
              className="flex items-center justify-between gap-2 rounded-md border px-2 py-1 text-xs"
              data-testid="attachment-chip"
            >
              <span className="flex min-w-0 items-center gap-1.5">
                <Paperclip className="h-3 w-3 shrink-0" aria-hidden />
                <span className="truncate">{file.name}</span>
                <span className="shrink-0 text-muted-foreground">{formatFileSize(file.size)}</span>
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={`Remove ${file.name}`}
                data-testid="attachment-remove"
                onClick={() => onChange(files.filter((_, i) => i !== index))}
              >
                <X className="h-3 w-3" aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      )}
      {restoredNames.length > 0 && (
        <p className="text-xs text-muted-foreground" data-testid="attachment-restored-hint">
          Draft had: {restoredNames.join(', ')} — re-attach to include it.
        </p>
      )}
    </div>
  );
}
