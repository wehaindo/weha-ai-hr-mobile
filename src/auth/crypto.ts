// PIN hashing/verification. bcryptjs is pure JS — it runs identically in the
// renderer (web / Capacitor / Electron) so no bridge round-trip is needed.

import bcrypt from 'bcryptjs';

export const PIN_MIN_LENGTH = 4;
export const PIN_MAX_LENGTH = 8;

export function isValidPin(pin: string): boolean {
  return pin.length >= PIN_MIN_LENGTH && pin.length <= PIN_MAX_LENGTH && /^\d+$/.test(pin);
}

export function hashPin(pin: string): Promise<string> {
  return bcrypt.hash(pin, 10);
}

export function verifyPin(pin: string, hash: string): Promise<boolean> {
  return bcrypt.compare(pin, hash);
}

// Password hashing/verification (username + password login, optional alongside PIN).

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
