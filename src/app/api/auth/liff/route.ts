import { NextRequest, NextResponse } from 'next/server';
import { makeSessionCookieValue, LIFF_COOKIE_NAME, LIFF_COOKIE_MAX_AGE } from '@/lib/session';

export async function POST(request: NextRequest) {
  const { accessToken } = await request.json().catch(() => ({ accessToken: null }));
  if (!accessToken) {
    return NextResponse.json({ error: 'accessToken required' }, { status: 400 });
  }

  const profileRes = await fetch('https://api.line.me/v2/profile', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!profileRes.ok) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  }

  const profile = await profileRes.json() as { userId?: string };
  const lineUserId = profile.userId;
  if (!lineUserId) {
    return NextResponse.json({ error: 'Could not get user ID' }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(LIFF_COOKIE_NAME, makeSessionCookieValue(lineUserId), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: LIFF_COOKIE_MAX_AGE,
    path: '/',
  });
  return res;
}
