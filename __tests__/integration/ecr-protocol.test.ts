// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  STX,
  ETX,
  COMMANDS,
  calculateLRC,
  buildPacket,
  parsePacket,
  buildSalePacket,
  buildVoidPacket,
  buildSettlementPacket,
  buildStatusPacket,
  parseGenericResponse,
} from '@/lib/ecr/protocol';
import { getBankAdapter } from '@/lib/ecr/banks';

function ascii(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

describe('ECR packet framing', () => {
  it('builds [STX][payload][LRC][ETX]', () => {
    const packet = buildPacket('020');
    expect(packet[0]).toBe(STX);
    expect(packet[packet.length - 1]).toBe(ETX);
    // LRC is the XOR of the payload.
    expect(packet[packet.length - 2]).toBe(calculateLRC(ascii('020')));
  });

  it('round-trips through parsePacket', () => {
    const packet = buildPacket('000123456789');
    const parsed = parsePacket(packet);
    expect(parsed.valid).toBe(true);
    expect(parsed.payload).toBe('000123456789');
    expect(parsed.error).toBeNull();
  });

  it('detects an LRC mismatch', () => {
    const packet = buildPacket('0200000000050000');
    packet[packet.length - 2] ^= 0xff; // corrupt the LRC
    const parsed = parsePacket(packet);
    expect(parsed.valid).toBe(false);
    expect(parsed.error).toBe('LRC mismatch');
  });

  it('rejects a too-short packet', () => {
    expect(parsePacket(ascii('AB')).valid).toBe(false);
    expect(parsePacket(new Uint8Array()).error).toBe('Packet too short');
  });

  it('rejects invalid framing (no STX/ETX)', () => {
    expect(parsePacket(ascii('ABCDEFGH')).valid).toBe(false);
  });

  it('computes LRC as XOR of all bytes', () => {
    expect(calculateLRC(ascii('A'))).toBe('A'.charCodeAt(0));
    expect(calculateLRC(ascii(''))).toBe(0);
  });
});

describe('ECR packet builders', () => {
  it('builds a sale packet: command + 12-digit amount + 6-digit invoice + reserved', () => {
    const packet = buildSalePacket(50000, '123');
    const parsed = parsePacket(packet);
    expect(parsed.payload).toBe(COMMANDS.SALE + '000000050000' + '000123' + '0000');
  });

  it('pads the invoice to 6 digits', () => {
    const parsed = parsePacket(buildSalePacket(1, '7'));
    expect(parsed.payload.substring(15, 21)).toBe('000007');
  });

  it('builds a void packet with zeroed amount', () => {
    const parsed = parsePacket(buildVoidPacket('42'));
    expect(parsed.payload).toBe(COMMANDS.VOID + '000000000000' + '000042' + '0000');
  });

  it('builds settlement and status packets', () => {
    expect(parsePacket(buildSettlementPacket()).payload.startsWith(COMMANDS.SETTLEMENT)).toBe(true);
    expect(parsePacket(buildStatusPacket()).payload.startsWith(COMMANDS.STATUS)).toBe(true);
  });
});

describe('ECR response parsing', () => {
  it('parses an approved generic response (code 00)', () => {
    // [code 2][auth 6][card 2][rrn 12][invoice 6]
    const payload = '00' + 'AUTH12' + '01' + '123456789012' + '000042';
    const result = parseGenericResponse(payload);
    expect(result.approved).toBe(true);
    expect(result.responseCode).toBe('00');
    expect(result.authCode).toBe('AUTH12');
    expect(result.cardType).toBe('01');
    expect(result.rrn).toBe('123456789012');
    expect(result.invoice).toBe('000042');
  });

  it('parses a declined response (code 51)', () => {
    const result = parseGenericResponse('51' + '------' + '--' + '------------' + '------');
    expect(result.approved).toBe(false);
    expect(result.message).toBe('Insufficient funds');
  });

  it('handles an empty response', () => {
    const result = parseGenericResponse('');
    expect(result.approved).toBe(false);
    expect(result.responseCode).toBe('96');
  });

  it('maps bank-specific codes (BCA 51 → Saldo Tidak Cukup)', () => {
    const bca = getBankAdapter('bca');
    const result = bca.parseResponse('51' + '------' + '--' + '------------' + '------');
    expect(result.bank).toBe('BCA');
    expect(result.message).toBe('Saldo Tidak Cukup');
  });

  it('maps bank card types (BCA 05 → QRIS)', () => {
    const bca = getBankAdapter('bca');
    const result = bca.parseResponse('00' + 'AUTH12' + '05' + '123456789012' + '000001');
    expect(result.cardTypeName).toBe('QRIS');
  });

  it('falls back to the generic adapter for unknown banks', () => {
    expect(getBankAdapter('unknown').name).toBe('Generic');
    expect(getBankAdapter(undefined).name).toBe('Generic');
  });
});
