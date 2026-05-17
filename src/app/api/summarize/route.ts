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

  let body: { images?: Array<{ data: string; mediaType: string }>; title?: string };
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

  const response = await anthropic.messages.create({
    model: 'claude-opus-4-7',
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: [
          ...imageContent,
          {
            type: 'text',
            text: `この本のページを読んで、内容を日本語で要約してください。

【出力形式】
- 箇条書き3〜5点
- 各点は30〜60文字程度
- 読み上げを想定しているので、記号（•、★、【】など）は使わず、数字と句読点のみ
- 形式: "1. ～。\n2. ～。\n..." のように各行を番号付きで

【要約の方針】
- 著者が最も伝えたいことに絞る
- 具体的なアドバイスや行動できる内容を優先
- 抽象的な概念より実践的な内容を優先
- 日常語で分かりやすく表現する`,
          },
        ],
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    return NextResponse.json({ error: '要約を生成できませんでした' }, { status: 500 });
  }

  const summary = textBlock.text.trim();

  // Supabaseに保存
  const admin = createAdminClient();
  await admin.from('book_summaries').insert({
    user_id: lineUserId,
    title: body.title?.trim() || null,
    summary,
    image_count: body.images.length,
  });

  return NextResponse.json({ summary });
}
