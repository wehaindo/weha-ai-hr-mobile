// Generic ECR/EDC protocol — STX/ETX/LRC packet framing used by Indonesian bank
// terminals (BCA, Mandiri, Niaga). Ported from ai-pos electron/ecr/protocol.js
// to pure framework TS (Uint8Array + TextEncoder, no Node Buffer) so it runs in
// the renderer. Transport (serial/TCP) is handled by the DeviceBridge.
//
// Packet: [STX][payload][LRC][ETX]

export const STX = 0x02;
export const ETX = 0x03;

const encoder = new TextEncoder();
const decoder = new TextDecoder('ascii');

export const COMMANDS = {
  SALE: '020',
  VOID: '022',
  REFUND: '026',
  SETTLEMENT: '050',
  STATUS: '080',
  REPRINT: '081',
} as const;

export const RESPONSE_CODES: Record<string, string> = {
  '00': 'Approved',
  '01': 'Refer to card issuer',
  '02': 'Refer to card issuer (special)',
  '03': 'Invalid merchant',
  '04': 'Pick up card',
  '05': 'Do not honor',
  '06': 'Error',
  '07': 'Pick up card (special)',
  '08': 'Approve with ID',
  '09': 'Request in progress',
  '12': 'Invalid transaction',
  '13': 'Invalid amount',
  '14': 'Invalid card number',
  '15': 'No such issuer',
  '19': 'Re-enter transaction',
  '21': 'No transaction',
  '25': 'Unable to locate record',
  '30': 'Format error',
  '38': 'PIN tries exceeded',
  '41': 'Lost card (pick up)',
  '43': 'Stolen card (pick up)',
  '51': 'Insufficient funds',
  '54': 'Expired card',
  '55': 'Incorrect PIN',
  '56': 'Invalid card',
  '58': 'Transaction not permitted',
  '61': 'Exceeds withdrawal limit',
  '65': 'Exceeds frequency limit',
  '75': 'PIN tries exceeded',
  '76': 'Invalid transaction',
  '77': 'Wrong date',
  '78': 'Card not registered',
  '80': 'Declined',
  '85': 'Issuer not available',
  '91': 'Issuer not available',
  '96': 'System malfunction',
  '98': 'MAC error',
};

/** LRC (Longitudinal Redundancy Check) — XOR of all bytes. */
export function calculateLRC(bytes: Uint8Array): number {
  let lrc = 0;
  for (let i = 0; i < bytes.length; i++) {
    lrc ^= bytes[i];
  }
  return lrc;
}

/** Build a TX packet: [STX][payload][LRC][ETX]. */
export function buildPacket(payload: string): Uint8Array {
  const payloadBytes = encoder.encode(payload);
  const lrc = calculateLRC(payloadBytes);
  const out = new Uint8Array(payloadBytes.length + 3);
  out[0] = STX;
  out.set(payloadBytes, 1);
  out[payloadBytes.length + 1] = lrc;
  out[payloadBytes.length + 2] = ETX;
  return out;
}

export interface ParsedPacket {
  payload: string;
  payloadBytes: Uint8Array;
  lrc: number;
  valid: boolean;
  error: string | null;
}

/** Parse an RX packet: [STX][payload][LRC][ETX]. */
export function parsePacket(buffer: Uint8Array): ParsedPacket {
  if (!buffer || buffer.length < 4) {
    return { payload: '', payloadBytes: new Uint8Array(), lrc: 0, valid: false, error: 'Packet too short' };
  }

  let stxPos = -1;
  let etxPos = -1;
  for (let i = 0; i < buffer.length; i++) {
    if (buffer[i] === STX) stxPos = i;
    if (buffer[i] === ETX) etxPos = i;
  }

  if (stxPos === -1 || etxPos === -1 || etxPos <= stxPos) {
    return { payload: '', payloadBytes: new Uint8Array(), lrc: 0, valid: false, error: 'Invalid packet framing' };
  }

  const payloadBytes = buffer.slice(stxPos + 1, etxPos - 1);
  const receivedLrc = buffer[etxPos - 1];
  const calculatedLrc = calculateLRC(payloadBytes);

  return {
    payload: decoder.decode(payloadBytes),
    payloadBytes,
    lrc: receivedLrc,
    valid: receivedLrc === calculatedLrc,
    error: receivedLrc !== calculatedLrc ? 'LRC mismatch' : null,
  };
}

/** Sale: [Command 3][Amount 12][Invoice 6][Reserved 4]. Amount = zero-padded cents. */
export function buildSalePacket(amountCents: number, invoice: string | number): Uint8Array {
  const amount = String(amountCents).padStart(12, '0');
  const inv = String(invoice).padStart(6, '0');
  return buildPacket(COMMANDS.SALE + amount + inv + '0000');
}

/** Void: [Command 3][Amount 12 zeroed][Invoice 6][Reserved 4]. */
export function buildVoidPacket(invoice: string | number): Uint8Array {
  const inv = String(invoice).padStart(6, '0');
  return buildPacket(COMMANDS.VOID + '000000000000' + inv + '0000');
}

/** Refund: [Command 3][Amount 12][Invoice 6][Reserved 4]. */
export function buildRefundPacket(amountCents: number, invoice: string | number): Uint8Array {
  const amount = String(amountCents).padStart(12, '0');
  const inv = String(invoice).padStart(6, '0');
  return buildPacket(COMMANDS.REFUND + amount + inv + '0000');
}

/** Settlement (end-of-day batch close). */
export function buildSettlementPacket(): Uint8Array {
  return buildPacket(COMMANDS.SETTLEMENT + '000000000000' + '000000' + '0000');
}

/** Status check. */
export function buildStatusPacket(): Uint8Array {
  return buildPacket(COMMANDS.STATUS + '000000000000' + '000000' + '0000');
}

export interface ParsedResponse {
  responseCode: string;
  message: string;
  approved: boolean;
  authCode: string;
  cardType: string;
  rrn: string;
  invoice: string;
  raw: string;
}

/** Generic response: [ResponseCode 2][AuthCode 6][CardType 2][RRN 12][Invoice 6]… */
export function parseGenericResponse(payload: string): ParsedResponse {
  if (!payload || payload.length < 2) {
    return { responseCode: '96', message: 'Empty response', approved: false, authCode: '', cardType: '', rrn: '', invoice: '', raw: payload ?? '' };
  }

  const responseCode = payload.substring(0, 2);
  const authCode = payload.substring(2, 8).trim();
  const cardType = payload.substring(8, 10).trim();
  const rrn = payload.substring(10, 22).trim();
  const invoice = payload.substring(22, 28).trim();
  const message = RESPONSE_CODES[responseCode] || 'Unknown response';

  return { responseCode, message, approved: responseCode === '00', authCode, cardType, rrn, invoice, raw: payload };
}
