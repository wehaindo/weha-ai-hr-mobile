// Bank ECR adapters — BCA, Mandiri, Niaga. Each maps generic response codes +
// card types to bank-specific messages and delegates packet building to the
// generic protocol. Ported from ai-pos electron/ecr/{bca,mandiri,niaga}.js.

import {
  buildSalePacket,
  buildVoidPacket,
  buildRefundPacket,
  buildSettlementPacket,
  parseGenericResponse,
  type ParsedResponse,
} from './protocol';

export interface BankResponse extends ParsedResponse {
  cardTypeName?: string;
  bank: string;
}

export interface BankAdapter {
  name: string;
  parseResponse(payload: string): BankResponse;
  buildSale(amountCents: number, invoice: string | number): Uint8Array;
  buildVoid(invoice: string | number): Uint8Array;
  buildRefund(amountCents: number, invoice: string | number): Uint8Array;
  buildSettlement(): Uint8Array;
}

function makeAdapter(
  name: string,
  responseCodes: Record<string, string>,
  cardTypes: Record<string, string>
): BankAdapter {
  return {
    name,
    parseResponse(payload: string): BankResponse {
      const result = parseGenericResponse(payload);
      return {
        ...result,
        message: responseCodes[result.responseCode] || result.message,
        cardTypeName: cardTypes[result.cardType] || result.cardType,
        bank: name,
      };
    },
    buildSale: (amountCents, invoice) => buildSalePacket(amountCents, invoice),
    buildVoid: (invoice) => buildVoidPacket(invoice),
    buildRefund: (amountCents, invoice) => buildRefundPacket(amountCents, invoice),
    buildSettlement: () => buildSettlementPacket(),
  };
}

export const bca = makeAdapter(
  'BCA',
  {
    '00': 'Approved / Transaksi Berhasil',
    '01': 'Hubungi Bank Penerbit',
    '02': 'Hubungi Bank Penerbit (Khusus)',
    '03': 'Merchant Tidak Valid',
    '05': 'Tolak',
    '06': 'Error',
    '08': 'Approve dengan ID',
    '12': 'Transaksi Tidak Valid',
    '13': 'Jumlah Tidak Valid',
    '14': 'Nomor Kartu Tidak Valid',
    '15': 'Penerbit Kartu Tidak Ditemukan',
    '21': 'Transaksi Tidak Ditemukan',
    '30': 'Format Error',
    '38': 'PIN Sudah Lewat Batas',
    '41': 'Kartu Hilang',
    '43': 'Kartu Dicuri',
    '51': 'Saldo Tidak Cukup',
    '54': 'Kartu Kedaluwarsa',
    '55': 'PIN Salah',
    '56': 'Kartu Tidak Valid',
    '58': 'Transaksi Tidak Diizinkan',
    '61': 'Melebihi Batas Tarik Tunai',
    '65': 'Melebihi Batas Frekuensi',
    '75': 'PIN Sudah Lewat Batas',
    '80': 'Ditolak',
    '85': 'Penerbit Tidak Tersedia',
    '91': 'Penerbit Tidak Tersedia',
    '96': 'Sistem Error',
  },
  {
    '01': 'Debit BCA',
    '02': 'Credit BCA',
    '03': 'Debit Other',
    '04': 'Credit Other',
    '05': 'QRIS',
    '06': 'Flazz',
    '07': 'KlikPay',
    '08': 'BCA OneKlik',
  }
);

export const mandiri = makeAdapter(
  'Mandiri',
  {
    '00': 'Approved / Transaksi Berhasil',
    '01': 'Hubungi Bank Penerbit',
    '05': 'Do Not Honor / Tolak',
    '12': 'Transaksi Tidak Valid',
    '13': 'Jumlah Tidak Valid',
    '14': 'Nomor Kartu Tidak Valid',
    '30': 'Format Error',
    '51': 'Saldo Tidak Cukup',
    '54': 'Kartu Kedaluwarsa',
    '55': 'PIN Salah',
    '58': 'Transaksi Tidak Diizinkan',
    '61': 'Melebihi Batas',
    '91': 'Issuer Tidak Tersedia',
    '96': 'Sistem Error',
  },
  {
    '01': 'Debit Mandiri',
    '02': 'Credit Mandiri',
    '06': 'e-Money',
  }
);

export const niaga = makeAdapter(
  'Niaga',
  {
    '00': 'Approved / Transaksi Berhasil',
    '01': 'Hubungi Bank Penerbit',
    '05': 'Tolak',
    '12': 'Transaksi Tidak Valid',
    '13': 'Jumlah Tidak Valid',
    '51': 'Saldo Tidak Cukup',
    '54': 'Kartu Kedaluwarsa',
    '55': 'PIN Salah',
    '58': 'Transaksi Tidak Diizinkan',
    '91': 'Penerbit Tidak Tersedia',
    '96': 'Sistem Error',
  },
  {
    '01': 'Debit Niaga',
    '02': 'Credit Niaga',
  }
);

/** Generic fallback adapter (English codes, generic card types). */
export const generic = makeAdapter('Generic', {}, {});

const REGISTRY: Record<string, BankAdapter> = { bca, mandiri, niaga, generic };

/** Resolve a bank adapter by code; falls back to the generic adapter. */
export function getBankAdapter(bank?: string | null): BankAdapter {
  return REGISTRY[(bank || '').toLowerCase()] ?? generic;
}

/** List supported bank codes. */
export function listBanks(): string[] {
  return Object.keys(REGISTRY);
}
