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

  let body: {
    ids: string[];          // part row IDs to delete after merge
    summaries: string[];    // each part's summary text
    title?: string;
    cover_image?: string;
    total_images: number;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!Array.isArray(body.summaries) || body.summaries.length < 2) {
    return NextResponse.json({ error: 'summaries must have at least 2 items' }, { status: 400 });
  }

  const partsText = body.summaries
    .map((s, i) => `【パート${i + 1}】\n${s}`)
    .join('\n\n');

  const bookLabel = body.title ? `「${body.title}」` : 'この本';

  const response = await anthropic.messages.create({
    model: 'claude-opus-4-7',
    max_tokens: 2048,
    messages: [
      {
        role: 'user',
        content: `以下は${bookLabel}を複数回に分けて読んだ各パートの要約です。

${partsText}

これらをひとつにまとめ、本全体の内容を構造的に整理してください。

【出力形式（厳守）】
- 箇条書き8〜12点
- 各点は30〜70文字程度
- 読み上げを想定しているので、記号（•、★、【】など）は使わず、数字と句読点のみ
- 形式: "1. ～。\\n2. ～。\\n..." のように各行を番号付きで

【まとめ方の方針】
- 重複している内容は統合して1点にまとめる
- 本の全体像（何について書かれた本か）が冒頭でわかるようにする
- 著者の最も伝えたい主張・結論を優先する
- 各パートのキーメッセージを漏らさず盛り込む
- 読者がこの本を読んだかのように理解できる内容にする
- 抽象的な概念より行動できる具体的な内容を優先する`,
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    return NextResponse.json({ error: 'まとめの生成に失敗しました' }, { status: 500 });
  }

  const mergedSummary = textBlock.text.trim();

  const admin = createAdminClient();

  // Insert merged row
  const { data: inserted, error: insertError } = await admin
    .from('book_summaries')
    .insert({
      user_id: lineUserId,
      title: body.title?.trim() || null,
      summary: mergedSummary,
      image_count: body.total_images,
      cover_image: body.cover_image ?? null,
    })
    .select('id, title, summary, image_count, created_at, cover_image')
    .single();

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  // Delete old part rows
  if (body.ids.length > 0) {
    await admin
      .from('book_summaries')
      .delete()
      .in('id', body.ids)
      .eq('user_id', lineUserId);
  }

  return NextResponse.json({ item: inserted });
}
