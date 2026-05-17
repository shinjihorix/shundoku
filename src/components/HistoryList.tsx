'use client';

import { useEffect, useState } from 'react';
import { Trash2, ChevronDown, ChevronUp, Loader2, BookOpen } from 'lucide-react';

interface SummaryItem {
  id: string;
  title: string | null;
  summary: string;
  image_count: number;
  created_at: string;
}

export default function HistoryList() {
  const [items, setItems] = useState<SummaryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/history')
      .then((r) => r.json())
      .then((d) => setItems(d.items ?? []))
      .finally(() => setLoading(false));
  }, []);

  const deleteItem = async (id: string) => {
    setDeleting(id);
    await fetch('/api/history', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    setItems((prev) => prev.filter((i) => i.id !== id));
    setDeleting(null);
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="animate-spin text-gray-400" size={24} />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center py-16 text-gray-400 gap-3">
        <BookOpen size={40} strokeWidth={1} />
        <p className="text-sm">まだ要約がありません</p>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-3 max-w-lg mx-auto">
      {items.map((item) => {
        const isOpen = expanded === item.id;
        const lines = item.summary.split('\n').map((l) => l.trim()).filter(Boolean);
        const date = new Date(item.created_at).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' });

        return (
          <div key={item.id} className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <button
              onClick={() => setExpanded(isOpen ? null : item.id)}
              className="w-full px-4 py-3 flex items-center gap-3 text-left"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-800 truncate">
                  {item.title || '無題'}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">{date} · {item.image_count}枚</p>
              </div>
              {isOpen ? <ChevronUp size={16} className="text-gray-400 shrink-0" /> : <ChevronDown size={16} className="text-gray-400 shrink-0" />}
            </button>

            {isOpen && (
              <div className="px-4 pb-4 space-y-3 border-t border-gray-50 pt-3">
                <ol className="space-y-1.5">
                  {lines.map((line, i) => (
                    <li key={i} className="text-sm text-gray-700 leading-relaxed">{line}</li>
                  ))}
                </ol>
                <button
                  onClick={() => deleteItem(item.id)}
                  disabled={deleting === item.id}
                  className="flex items-center gap-1 text-xs text-red-400 hover:text-red-600 disabled:opacity-50"
                >
                  {deleting === item.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                  削除
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
