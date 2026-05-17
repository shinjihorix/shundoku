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
    summaries: string[];  // fallback when no raw_text
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

  // Fetch raw_texts from DB in original scan order
  const { data: rows } = await admin
    .from('book_summaries')
    .select('id, raw_text, summary')
    .in('id', body.ids)
    .eq('user_id', lineUserId);

  const sortedRows = body.ids
    .map((id) => rows?.find((r) => r.id === id))
    .filter(Boolean) as Array<{ id: string; raw_text: string | null; summary: string | null }>;

  const hasRawTexts = sortedRows.some((r) => r.raw_text);

  // Combine all text in reading order (raw_text preferred, fall back to summary)
  // Label as "スキャンバッチN" so Claude knows these are scan boundaries, not book chapters
  const combinedText = sortedRows
    .map((r, i) => {
      const content = (r.raw_text ?? r.summary ?? body.summaries[i] ?? '').trim();
      return `--- スキャンバッチ ${i + 1}/${sortedRows.length} ---\n${content}`;
    })
    .join('\n\n');

  // Target summary length = total raw_text chars / 3
  const totalRawChars = sortedRows.reduce(
    (sum, r) => sum + (r.raw_text?.length ?? r.summary?.length ?? 0),
    0,
  );
  const targetChars = Math.round(totalRawChars / 3);
  const bookLabel = body.title ? `「${body.title}」` : 'この本';
  const sourceLabel = hasRawTexts ? '文字起こし原文' : '要約';

  const response = await anthropic.messages.create({
    model: 'claude-opus-4-7',
    max_tokens: 8192,
    messages: [
      {
        role: 'user',
        content: `以下は${bookLabel}を複数回に分けてスキャンした${sourceLabel}です。
「スキャンバッチN」という区切りはスキャン作業上の都合であり、本の章とは無関係です。

${combinedText}

【指示】
本文中に登場する実際の章・節・見出し構造（「第○章」「はじめに」「Chapter」等）を見つけ、
その章立てに従って要約を作成してください。
明確な章見出しがない場合はトピックで適切に区切ってください。

【出力形式（厳守）】
- 各章（または節・トピック）の見出しを1行で書き、直後からその章の要約を箇条書きで書く
- 見出し行の例: "第1章 お金の本質。" のように句点で終わらせる
- 箇条書きは番号なし・行頭は何もつけない（「・」「-」「数字」不要）
- 各点は60〜100文字程度
- 読み上げを想定しているので、記号（•、★、■、【】など）は使わず、句読点のみ

【文字数ルール】
- 合計目標: ${targetChars}文字程度（文字起こし全体 ${totalRawChars}文字の3分の1）
- 各章の配分は文字起こし量に比例させる（長い章は多め、短い章は少なめ）

【要約の方針】
- 著者の主張・結論・根拠・具体的エピソード・データを含める
- スキャンバッチの区切りは完全に無視し、本の流れに沿って構成する
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

  // Preserve combined raw_text for future re-use
  const mergedRawText = hasRawTexts
    ? sortedRows.map((r, i) => `--- スキャンバッチ ${i + 1} ---\n${r.raw_text ?? ''}`).join('\n\n')
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

  // Delete original scan-batch rows
  await admin
    .from('book_summaries')
    .delete()
    .in('id', body.ids)
    .eq('user_id', lineUserId);

  return NextResponse.json({ item: inserted });
}
