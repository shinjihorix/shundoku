import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { LIFF_COOKIE_NAME, verifyCookieValue } from '@/lib/session';

export async function GET(request: NextRequest) {
  const cookie = request.cookies.get(LIFF_COOKIE_NAME);
  const lineUserId = cookie ? verifyCookieValue(cookie.value) : null;
  if (!lineUserId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q')?.trim() ?? '';

  const admin = createAdminClient();

  let query = admin
    .from('book_summaries')
    .select('id, title, summary, image_count, created_at, cover_image, raw_text')
    .eq('user_id', lineUserId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (q) {
    query = query.or(`title.ilike.%${q}%,summary.ilike.%${q}%,raw_text.ilike.%${q}%`);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ items: data });
}

export async function PATCH(request: NextRequest) {
  const cookie = request.cookies.get(LIFF_COOKIE_NAME);
  const lineUserId = cookie ? verifyCookieValue(cookie.value) : null;
  if (!lineUserId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { id?: string; title?: string; cover_image?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.cover_image) {
    return NextResponse.json({ error: 'cover_image required' }, { status: 400 });
  }

  const admin = createAdminClient();

  if (body.title) {
    await admin
      .from('book_summaries')
      .update({ cover_image: body.cover_image })
      .eq('user_id', lineUserId)
      .eq('title', body.title);
  } else if (body.id) {
    await admin
      .from('book_summaries')
      .update({ cover_image: body.cover_image })
      .eq('id', body.id)
      .eq('user_id', lineUserId);
  } else {
    return NextResponse.json({ error: 'id or title required' }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const cookie = request.cookies.get(LIFF_COOKIE_NAME);
  const lineUserId = cookie ? verifyCookieValue(cookie.value) : null;
  if (!lineUserId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await request.json().catch(() => ({ id: null }));
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const admin = createAdminClient();
  await admin.from('book_summaries').delete().eq('id', id).eq('user_id', lineUserId);
  return NextResponse.json({ ok: true });
}
