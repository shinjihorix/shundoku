import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { LIFF_COOKIE_NAME, verifyCookieValue } from '@/lib/session';

export default async function RootPage() {
  const cookieStore = await cookies();
  const cookie = cookieStore.get(LIFF_COOKIE_NAME);
  const lineUserId = cookie ? verifyCookieValue(cookie.value) : null;
  redirect(lineUserId ? '/home' : '/login');
}
