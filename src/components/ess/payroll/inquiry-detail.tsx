'use client';

// Inquiry detail dialog (BRD §4.6): category/period/subject, the message
// thread (employee + HR), attachments, and an employee reply box while the
// inquiry is not CLOSED.

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import type { InquiryDetailState } from '@/hooks/useInquiries';
import { INQUIRY_CATEGORY_LABEL, INQUIRY_STATUS_LABEL, INQUIRY_STATUS_VARIANT, canReplyToInquiry } from '@/lib/ess/payroll/view-model';

export interface InquiryDetailDialogProps {
  detail: InquiryDetailState;
  onClose: () => void;
  reply: (inquiryId: string, message: string) => Promise<unknown>;
}

export function InquiryDetailDialog({ detail, onClose, reply }: InquiryDetailDialogProps) {
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inquiry = detail.status === 'ready' ? detail.inquiry : null;

  function reset() {
    setMessage('');
    setBusy(false);
    setError(null);
  }

  async function send() {
    if (!inquiry) return;
    if (!message.trim()) {
      setError('Write a message first.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await reply(inquiry.inquiryId, message.trim());
      setMessage('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the message.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={detail.status !== 'closed'}
      onOpenChange={(open) => {
        if (!open) {
          reset();
          onClose();
        }
      }}
    >
      <DialogContent className="max-h-[85vh] overflow-y-auto" data-testid="inquiry-detail">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {detail.status === 'loading' ? 'Loading…' : inquiry?.subject}
            {inquiry && (
              <Badge variant={INQUIRY_STATUS_VARIANT[inquiry.status]} data-testid="inquiry-detail-status">
                {INQUIRY_STATUS_LABEL[inquiry.status]}
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            {inquiry
              ? `${inquiry.number} · ${INQUIRY_CATEGORY_LABEL[inquiry.category]}${inquiry.periodLabel ? ` · ${inquiry.periodLabel}` : ''}`
              : ''}
          </DialogDescription>
        </DialogHeader>

        {detail.status === 'loading' && <p className="text-sm text-muted-foreground">Loading…</p>}
        {detail.status === 'error' && (
          <p className="text-sm text-destructive" data-testid="inquiry-detail-error">
            {detail.message}
          </p>
        )}

        {inquiry && (
          <div className="space-y-4">
            {(inquiry.attachments?.length ?? 0) > 0 && (
              <div>
                <p className="mb-1 text-sm font-medium">Attachments</p>
                <ul className="space-y-1">
                  {inquiry.attachments!.map((attachment) => (
                    <li key={attachment.id} className="rounded-md border px-2 py-1 text-xs" data-testid="inquiry-attachment">
                      {attachment.fileName} · {Math.max(1, Math.round(attachment.size / 1024))} KB
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div>
              <p className="mb-1 text-sm font-medium">Thread</p>
              <ol className="space-y-2" data-testid="inquiry-thread">
                {(inquiry.messages ?? []).map((threadMessage, index) => (
                  <li
                    key={index}
                    className={`rounded-md border px-3 py-2 text-xs ${
                      threadMessage.authorRole === 'HR' ? 'bg-muted/50' : ''
                    }`}
                    data-testid="inquiry-message"
                    data-author={threadMessage.authorRole}
                  >
                    <p className="font-medium">
                      {threadMessage.authorRole === 'HR' ? 'HR / Payroll' : 'You'}
                      <span className="ml-2 font-normal text-muted-foreground">
                        {new Date(threadMessage.createdAt).toLocaleString()}
                      </span>
                    </p>
                    <p className="mt-0.5 whitespace-pre-wrap">{threadMessage.message}</p>
                  </li>
                ))}
                {(inquiry.messages ?? []).length === 0 && (
                  <li className="text-xs text-muted-foreground">No messages yet.</li>
                )}
              </ol>
            </div>

            {canReplyToInquiry(inquiry.status) ? (
              <div className="space-y-2" data-testid="inquiry-reply-box">
                <Textarea
                  rows={3}
                  data-testid="inquiry-reply-input"
                  placeholder="Add information for HR…"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                />
                {error && (
                  <p className="text-sm text-destructive" data-testid="inquiry-reply-error">
                    {error}
                  </p>
                )}
                <Button size="sm" data-testid="inquiry-reply-send" disabled={busy} onClick={() => void send()}>
                  {busy ? 'Sending…' : 'Send message'}
                </Button>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground" data-testid="inquiry-closed-note">
                This inquiry is closed — no further replies.
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
