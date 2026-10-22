// QR credential guard (contract §4.3): the scanned string is opaque — we
// only check the format before handing it to the backend for signature and
// expiry validation. Never log the payload itself.

export const QR_PAYLOAD_PREFIX = 'WEHAATT:';
/** Contract cap — reject absurd inputs early (scan garbage / injection). */
export const QR_PAYLOAD_MAX_LENGTH = 512;

/**
 * Returns the trimmed payload when it matches the expected shape, else null
 * (not a worksite attendance code).
 */
export function parseQrPayload(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith(QR_PAYLOAD_PREFIX)) return null;
  if (trimmed.length <= QR_PAYLOAD_PREFIX.length) return null;
  if (trimmed.length > QR_PAYLOAD_MAX_LENGTH) return null;
  return trimmed;
}
