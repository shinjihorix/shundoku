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

  let body: { id: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.id) {
    return NextResponse.json({ error: 'id required' }, { status: 400 });
  }

  const admin = createAdminClient();

  // Fetch raw_text for this part
  const { data: row, error } = await admin
    .from('book_summaries')
    .select('id, raw_text')
    .eq('id', body.id)
    .eq('user_id', lineUserId)
    .single();

  if (error || !row) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (!row.raw_text) {
    return NextResponse.json({ error: '文字起こしが保存されていません（この要約は旧バージョンで作成されました）' }, { status: 400 });
  }

  const res = await anthropic.messages.create({
    model: 'claude-opus-4-7',
    max_tokens: 2048,
    messages: [
      {
        role: 'user',
        content: `以下は本のページの文字起こしです。この内容を日本語で詳しく要約してください。

${row.raw_text}

【出力形式（厳守）】
- 箇条書き10〜15点
- 各点は60〜100文字程度
- 合計800文字以上になるよう十分な情報量を盛り込むこと
- 読み上げを想定しているので、記号（•、★、【】など）は使わず、数字と句読点のみ
- 形式: "1. ～。\\n2. ～。\\n..." のように各行を番号付きで

【要約の方針】
- 著者の主張・結論・根拠を漏れなく拾う
- 具体的なエピソード・データ・事例も含める
- 行動できるアドバイスや実践的な内容を優先
- 抽象論より具体論を優先し、日常語で分かりやすく表現する
- この章を読んでいない人でも内容が正確に伝わるよう詳しく書く`,
      },
    ],
  });

  const textBlock = res.content.find((b) => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    return NextResponse.json({ error: '要約を生成できませんでした' }, { status: 500 });
  }

  const newSummary = textBlock.text.trim();

  await admin
    .from('book_summaries')
    .update({ summary: newSummary })
    .eq('id', body.id)
    .eq('user_id', lineUserId);

  return NextResponse.json({ summary: newSummary });
}
