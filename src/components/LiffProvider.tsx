'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { BookOpen, Loader2 } from 'lucide-react';

export default function LiffProvider() {
  const router = useRouter();

  useEffect(() => {
    async function init() {
      const liffId = process.env.NEXT_PUBLIC_LIFF_ID;

      const liff = (await import('@line/liff')).default;
      await liff.init({ liffId: liffId! });

      if (!liff.isLoggedIn()) {
        liff.login({ redirectUri: window.location.href });
        return;
      }

      const accessToken = liff.getAccessToken();
      if (!accessToken) {
        liff.login({ redirectUri: window.location.href });
        return;
      }

      const res = await fetch('/api/auth/liff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessToken }),
      });

      if (res.ok) {
        router.replace('/home');
      }
    }

    init().catch(console.error);
  }, [router]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-purple-50 flex items-center justify-center">
      <div className="text-center space-y-4 px-6">
        <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center mx-auto shadow-lg">
          <BookOpen className="text-white" size={32} />
        </div>
        <p className="text-gray-500 text-sm flex items-center gap-2 justify-center">
          <Loader2 size={14} className="animate-spin" />
          LINEで認証中...
        </p>
      </div>
    </div>
  );
}
