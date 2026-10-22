import { describe, expect, it } from 'vitest';
import { parseQrPayload, QR_PAYLOAD_MAX_LENGTH, QR_PAYLOAD_PREFIX } from '@/lib/ess/attendance/qr';

describe('parseQrPayload (BRD FR-01 QR validation guard)', () => {
  it('accepts a well-formed worksite payload', () => {
    expect(parseQrPayload('WEHAATT:eyJ3Ijoid3MtMSIsImV4cCI6MTcy5ifQ')).toBe(
      'WEHAATT:eyJ3Ijoid3MtMSIsImV4cCI6MTcy5ifQ'
    );
  });

  it('trims surrounding whitespace from scanner output', () => {
    expect(parseQrPayload('  WEHAATT:abc\n')).toBe('WEHAATT:abc');
  });

  it('rejects codes without the expected prefix (any other QR content)', () => {
    expect(parseQrPayload('https://example.com')).toBeNull();
    expect(parseQrPayload('WEHAXTT:abc')).toBeNull();
    expect(parseQrPayload('')).toBeNull();
  });

  it('rejects an empty or absurdly long payload', () => {
    expect(parseQrPayload(QR_PAYLOAD_PREFIX)).toBeNull();
    expect(parseQrPayload(QR_PAYLOAD_PREFIX + 'x'.repeat(QR_PAYLOAD_MAX_LENGTH))).toBeNull();
  });

  it('keeps a payload exactly at the length cap', () => {
    const body = 'x'.repeat(QR_PAYLOAD_MAX_LENGTH - QR_PAYLOAD_PREFIX.length);
    expect(parseQrPayload(QR_PAYLOAD_PREFIX + body)).not.toBeNull();
  });
});
