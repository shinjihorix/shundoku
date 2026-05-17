import { createHmac } from 'crypto';

export const LIFF_COOKIE_NAME = 'liff_user';
export const LIFF_COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export function makeSessionCookieValue(lineUserId: string): string {
  const secret = process.env.LIFF_CHANNEL_SECRET!;
  const sig = createHmac('sha256', secret).update(lineUserId).digest('hex');
  return `${lineUserId}.${sig}`;
}

export function verifyCookieValue(value: string): string | null {
  const lastDot = value.lastIndexOf('.');
  if (lastDot === -1) return null;
  const lineUserId = value.slice(0, lastDot);
  const sig = value.slice(lastDot + 1);
  const expected = createHmac('sha256', process.env.LIFF_CHANNEL_SECRET!).update(lineUserId).digest('hex');
  return sig === expected ? lineUserId : null;
}
