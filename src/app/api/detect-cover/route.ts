import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { LIFF_COOKIE_NAME, verifyCookieValue } from '@/lib/session';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(request: NextRequest) {
  const cookie = request.cookies.get(LIFF_COOKIE_NAME);
  const lineUserId = cookie ? verifyCookieValue(cookie.value) : null;
  if (!lineUserId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { image?: { data: string; mediaType: string } };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.image?.data || !body.image?.mediaType) {
    return NextResponse.json({ error: '画像が必要です' }, { status: 400 });
  }

  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  if (!allowedTypes.includes(body.image.mediaType)) {
    return NextResponse.json({ error: '非対応の画像形式です' }, { status: 400 });
  }

  const response = await anthropic.messages.create({
    model: 'claude-opus-4-7',
    max_tokens: 256,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: body.image.mediaType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
              data: body.image.data,
            },
          },
          {
            type: 'text',
            text: `この画像は本の表紙です。書名と著者名を読み取ってください。

【出力形式（厳守）】
書名: <書名>
著者: <著者名>

書名や著者が読み取れない場合は該当箇所を「不明」としてください。
余分な説明は不要です。`,
          },
        ],
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    return NextResponse.json({ error: '読み取りに失敗しました' }, { status: 500 });
  }

  const text = textBlock.text.trim();

  // Parse title and author from response
  const titleMatch = text.match(/書名[:：]\s*(.+)/);
  const authorMatch = text.match(/著者[:：]\s*(.+)/);

  const title = titleMatch?.[1]?.trim() ?? '';
  const author = authorMatch?.[1]?.trim() ?? '';

  // Combine into a single display string
  let display = title;
  if (author && author !== '不明') {
    display = `${title}　${author}著`;
  }

  return NextResponse.json({ title, author, display });
}
