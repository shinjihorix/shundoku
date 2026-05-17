import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createAdminClient } from '@/lib/supabase/admin';
import { LIFF_COOKIE_NAME, verifyCookieValue } from '@/lib/session';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(request: NextRequest) {
  const cookie = request.cookies.get(LIFF_COOKIE_NAME);
  const lineUserId = cookie ? verifyCookieValue(cookie.value) : null;
  if (!lineUserId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { images?: Array<{ data: string; mediaType: string }>; title?: string; coverImage?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!Array.isArray(body.images) || body.images.length === 0) {
    return NextResponse.json({ error: 'images配列が必要です' }, { status: 400 });
  }

  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  const imageContent = body.images
    .filter((img) => typeof img.data === 'string' && allowedTypes.includes(img.mediaType))
    .map((img) => ({
      type: 'image' as const,
      source: {
        type: 'base64' as const,
        media_type: img.mediaType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
        data: img.data,
      },
    }));

  if (imageContent.length === 0) {
    return NextResponse.json({ error: '有効な画像がありません' }, { status: 400 });
  }

  // Transcribe text from images (no summary generation)
  const transcribeRes = await anthropic.messages.create({
    model: 'claude-opus-4-7',
    max_tokens: 4096,
    messages: [
      {
        role: 'user',
        content: [
          ...imageContent,
          {
            type: 'text',
            text: `この本のページに書かれているテキストを、できる限り正確に文字起こしして下さい。
見出し・本文・図表の説明・注釈をすべて含め、ページ上のテキストをそのまま書き出してください。
読み取れない部分は「[判読不能]」と記してください。`,
          },
        ],
      },
    ],
  });

  const transcriptBlock = transcribeRes.content.find((b) => b.type === 'text');
  if (!transcriptBlock || transcriptBlock.type !== 'text') {
    return NextResponse.json({ error: '文字起こしに失敗しました' }, { status: 500 });
  }

  const rawText = transcriptBlock.text.trim();

  // Save to Supabase (summary is null – generated later via re-summarize or merge)
  const admin = createAdminClient();
  await admin.from('book_summaries').insert({
    user_id: lineUserId,
    title: body.title?.trim() || null,
    summary: null,
    raw_text: rawText,
    image_count: body.images.length,
    cover_image: body.coverImage ?? null,
  });

  return NextResponse.json({ transcription: rawText });
}
