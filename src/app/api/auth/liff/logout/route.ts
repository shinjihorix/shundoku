import { NextResponse } from 'next/server';
import { LIFF_COOKIE_NAME } from '@/lib/session';

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(LIFF_COOKIE_NAME, '', { maxAge: 0, path: '/' });
  return res;
}
