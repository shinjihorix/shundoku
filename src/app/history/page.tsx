import BottomNav from '@/components/BottomNav';
import HistoryList from '@/components/HistoryList';

export const metadata = { title: '瞬読 - 履歴' };

export default function HistoryPage() {
  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <header className="bg-white border-b border-gray-100 px-4 py-3 sticky top-0 z-10">
        <h1 className="text-base font-bold text-gray-800">📚 読んだ本</h1>
        <p className="text-xs text-gray-400">過去の要約履歴</p>
      </header>
      <HistoryList />
      <BottomNav />
    </div>
  );
}
