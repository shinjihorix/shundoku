import { NextRequest, NextResponse } from 'next/server';

export const LIFF_COOKIE_NAME = 'liff_user';

const PUBLIC_PATHS = ['/login', '/api/auth/liff'];

async function verifyCookie(value: string): Promise<string | null> {
  const lastDot = value.lastIndexOf('.');
  if (lastDot === -1) return null;
  const lineUserId = value.slice(0, lastDot);
  const sig = value.slice(lastDot + 1);

  const secret = process.env.LIFF_CHANNEL_SECRET;
  if (!secret) return null;

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const rawSig = await crypto.subtle.sign('HMAC', key, enc.encode(lineUserId));
  const expected = Array.from(new Uint8Array(rawSig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  return sig === expected ? lineUserId : null;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));
  if (isPublic) return NextResponse.next();

  const cookie = request.cookies.get(LIFF_COOKIE_NAME);
  const lineUserId = cookie ? await verifyCookie(cookie.value) : null;

  if (!lineUserId) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
