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

  // Pass 1: Transcribe text from images
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
図・表・見出し・本文・注釈を含め、ページ上のすべてのテキストをそのまま書き出してください。
読み取れない部分は「[判読不能]」と記してください。`,
          },
        ],
      },
    ],
  });

  const transcriptBlock = transcribeRes.content.find((b) => b.type === 'text');
  const rawText = transcriptBlock?.type === 'text' ? transcriptBlock.text.trim() : '';

  // Pass 2: Summarize from transcribed text
  const summarizeRes = await anthropic.messages.create({
    model: 'claude-opus-4-7',
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: `以下は本のページの文字起こしです。この内容を日本語で要約してください。

${rawText}

【出力形式】
- 箇条書き3〜5点
- 各点は30〜60文字程度
- 読み上げを想定しているので、記号（•、★、【】など）は使わず、数字と句読点のみ
- 形式: "1. ～。\\n2. ～。\\n..." のように各行を番号付きで

【要約の方針】
- 著者が最も伝えたいことに絞る
- 具体的なアドバイスや行動できる内容を優先
- 抽象的な概念より実践的な内容を優先
- 日常語で分かりやすく表現する`,
      },
    ],
  });

  const summaryBlock = summarizeRes.content.find((b) => b.type === 'text');
  if (!summaryBlock || summaryBlock.type !== 'text') {
    return NextResponse.json({ error: '要約を生成できませんでした' }, { status: 500 });
  }

  const summary = summaryBlock.text.trim();

  // Save to Supabase
  const admin = createAdminClient();
  await admin.from('book_summaries').insert({
    user_id: lineUserId,
    title: body.title?.trim() || null,
    summary,
    raw_text: rawText || null,
    image_count: body.images.length,
    cover_image: body.coverImage ?? null,
  });

  return NextResponse.json({ summary });
}
