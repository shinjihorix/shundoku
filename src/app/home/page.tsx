import BookSummarizer from '@/components/BookSummarizer';
import BottomNav from '@/components/BottomNav';

export const metadata = { title: '瞬読 - 要約' };

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <header className="bg-white border-b border-gray-100 px-4 py-3 sticky top-0 z-10">
        <h1 className="text-base font-bold text-gray-800">📖 瞬読</h1>
        <p className="text-xs text-gray-400">本のページをスクショして要約・読み上げ</p>
      </header>
      <BookSummarizer />
      <BottomNav />
    </div>
  );
}
