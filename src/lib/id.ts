// Random id generation using Web Crypto (works in browsers and Node >= 19).
// Convention from ai-pos: 16-char hex ids.

export function generateId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
