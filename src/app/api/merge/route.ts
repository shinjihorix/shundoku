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
    ids: string[];
    summaries: string[];    // fallback if no raw_text
    title?: string;
    cover_image?: string;
    total_images: number;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!Array.isArray(body.ids) || body.ids.length < 2) {
    return NextResponse.json({ error: 'ids must have at least 2 items' }, { status: 400 });
  }

  const admin = createAdminClient();

  // Fetch raw_texts from DB (server-side, no need to send from client)
  const { data: rows } = await admin
    .from('book_summaries')
    .select('id, raw_text, summary')
    .in('id', body.ids)
    .eq('user_id', lineUserId);

  // Sort rows to match the original part order (same order as body.ids)
  const sortedRows = body.ids
    .map((id) => rows?.find((r) => r.id === id))
    .filter(Boolean) as Array<{ id: string; raw_text: string | null; summary: string }>;

  const hasRawTexts = sortedRows.some((r) => r.raw_text);

  // Use raw_texts when available (more accurate), fall back to summaries
  const partsText = sortedRows
    .map((r, i) => {
      const content = (r.raw_text ?? r.summary ?? body.summaries[i] ?? '').trim();
      return `【パート${i + 1}】\n${content}`;
    })
    .join('\n\n');

  const bookLabel = body.title ? `「${body.title}」` : 'この本';
  const sourceNote = hasRawTexts
    ? '各パートの文字起こし原文'
    : '各パートの要約';

  const response = await anthropic.messages.create({
    model: 'claude-opus-4-7',
    max_tokens: 4096,
    messages: [
      {
        role: 'user',
        content: `以下は${bookLabel}を複数章に分けて読んだ${sourceNote}です。

${partsText}

これらをひとつにまとめ、本全体の内容を構造的に整理してください。

【出力形式（厳守）】
- 箇条書き15〜20点
- 各点は60〜100文字程度
- 合計1200文字以上になるよう十分な情報量を盛り込むこと
- 読み上げを想定しているので、記号（•、★、【】など）は使わず、数字と句読点のみ
- 形式: "1. ～。\\n2. ～。\\n..." のように各行を番号付きで

【まとめ方の方針】
- 重複している内容は統合して1点にまとめる
- 本の全体像（何について書かれた本か、誰に向けた本か）が冒頭でわかるようにする
- 著者の最も伝えたい主張・結論・根拠を優先する
- 各章のキーメッセージを漏らさず盛り込む
- 具体的なエピソード・データ・事例も簡潔に含める
- この本を読んでいない人でも内容が正確に伝わるよう詳しく書く
- 抽象的な概念より行動できる具体的な内容を優先する`,
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    return NextResponse.json({ error: 'まとめの生成に失敗しました' }, { status: 500 });
  }

  const mergedSummary = textBlock.text.trim();

  // Merge raw_texts into one block for the merged row
  const mergedRawText = hasRawTexts
    ? sortedRows.map((r, i) => `【パート${i + 1}】\n${r.raw_text ?? ''}`).join('\n\n')
    : null;

  // Insert merged row
  const { data: inserted, error: insertError } = await admin
    .from('book_summaries')
    .insert({
      user_id: lineUserId,
      title: body.title?.trim() || null,
      summary: mergedSummary,
      raw_text: mergedRawText,
      image_count: body.total_images,
      cover_image: body.cover_image ?? null,
    })
    .select('id, title, summary, image_count, created_at, cover_image, raw_text')
    .single();

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  // Delete old part rows
  await admin
    .from('book_summaries')
    .delete()
    .in('id', body.ids)
    .eq('user_id', lineUserId);

  return NextResponse.json({ item: inserted });
}
