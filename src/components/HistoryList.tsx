'use client';

import { useEffect, useState, useRef, useMemo } from 'react';
import { Trash2, ChevronDown, ChevronUp, Loader2, BookOpen, Play, Pause, Square, Volume2 } from 'lucide-react';

interface SummaryItem {
  id: string;
  title: string | null;
  summary: string;
  image_count: number;
  created_at: string;
  cover_image: string | null;
}

interface BookGroup {
  key: string;
  title: string | null;
  cover_image: string | null;
  parts: SummaryItem[]; // sorted oldest first
  totalImages: number;
  latestDate: Date;
}

type AudioState = 'idle' | 'loading' | 'playing' | 'paused';

export default function HistoryList() {
  const [items, setItems] = useState<SummaryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  // TTS state – only one item plays at a time
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [audioState, setAudioState] = useState<AudioState>('idle');
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string>('');

  useEffect(() => {
    fetch('/api/history')
      .then((r) => r.json())
      .then((d) => setItems(d.items ?? []))
      .finally(() => setLoading(false));
  }, []);

  // Group items by title (null-title items stay as individual entries)
  const groups = useMemo<BookGroup[]>(() => {
    const map = new Map<string, SummaryItem[]>();
    const ungrouped: SummaryItem[] = [];

    for (const item of items) {
      const key = item.title?.trim();
      if (!key) {
        ungrouped.push(item);
      } else {
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(item);
      }
    }

    const result: BookGroup[] = [];

    for (const [title, titleItems] of Array.from(map)) {
      const sorted = [...titleItems].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      );
      result.push({
        key: title,
        title,
        cover_image: sorted[sorted.length - 1].cover_image ?? sorted[0].cover_image ?? null,
        parts: sorted,
        totalImages: sorted.reduce((s, i) => s + i.image_count, 0),
        latestDate: new Date(sorted[sorted.length - 1].created_at),
      });
    }

    for (const item of ungrouped) {
      result.push({
        key: item.id,
        title: null,
        cover_image: item.cover_image,
        parts: [item],
        totalImages: item.image_count,
        latestDate: new Date(item.created_at),
      });
    }

    // Most recently updated first
    result.sort((a, b) => b.latestDate.getTime() - a.latestDate.getTime());

    return result;
  }, [items]);

  const stopAudio = () => {
    audioRef.current?.pause();
    audioRef.current = null;
    if (audioUrlRef.current) { URL.revokeObjectURL(audioUrlRef.current); audioUrlRef.current = ''; }
    setAudioState('idle');
    setPlayingId(null);
  };

  const playItem = async (item: SummaryItem) => {
    if (playingId === item.id && audioState === 'playing') {
      audioRef.current?.pause();
      setAudioState('paused');
      return;
    }
    if (playingId === item.id && audioState === 'paused' && audioRef.current) {
      audioRef.current.play();
      setAudioState('playing');
      return;
    }
    stopAudio();
    setPlayingId(item.id);
    setAudioState('loading');
    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: item.summary }),
      });
      if (!res.ok) throw new Error('音声生成に失敗しました');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      audioUrlRef.current = url;
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => { setAudioState('idle'); setPlayingId(null); };
      audio.onerror = () => { setAudioState('idle'); setPlayingId(null); };
      await audio.play();
      setAudioState('playing');
    } catch {
      setAudioState('idle');
      setPlayingId(null);
    }
  };

  const deleteItem = async (id: string) => {
    if (playingId === id) stopAudio();
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

  if (groups.length === 0) {
    return (
      <div className="flex flex-col items-center py-16 text-gray-400 gap-3">
        <BookOpen size={40} strokeWidth={1} />
        <p className="text-sm">まだ要約がありません</p>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-3 max-w-lg mx-auto">
      {groups.map((group) => {
        const isOpen = expanded === group.key;
        const isMultiPart = group.parts.length > 1;
        const anyPartPlaying = group.parts.some((p) => p.id === playingId);
        const dateStr = group.latestDate.toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' });

        return (
          <div key={group.key} className="bg-white rounded-2xl shadow-sm overflow-hidden">
            {/* Header row */}
            <button
              onClick={() => setExpanded(isOpen ? null : group.key)}
              className="w-full px-4 py-3 flex items-center gap-3 text-left"
            >
              {/* Cover thumbnail */}
              <div className="w-10 h-14 rounded-lg overflow-hidden shrink-0 bg-indigo-50 flex items-center justify-center">
                {group.cover_image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`data:image/jpeg;base64,${group.cover_image}`}
                    alt="cover"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <BookOpen size={16} className="text-indigo-300" />
                )}
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-800 truncate">
                  {group.title || '無題'}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {dateStr} · {group.totalImages}枚
                  {isMultiPart && (
                    <span className="ml-1.5 bg-indigo-100 text-indigo-600 rounded-full px-1.5 py-0.5 text-[10px] font-semibold">
                      {group.parts.length}パート
                    </span>
                  )}
                </p>
              </div>

              {/* Playing indicator on collapsed card */}
              {anyPartPlaying && !isOpen && (
                <Volume2 size={14} className="text-green-500 shrink-0 animate-pulse" />
              )}

              {isOpen
                ? <ChevronUp size={16} className="text-gray-400 shrink-0" />
                : <ChevronDown size={16} className="text-gray-400 shrink-0" />}
            </button>

            {/* Expanded content */}
            {isOpen && (
              <div className="border-t border-gray-50">
                {group.parts.map((item, idx) => {
                  const isThisPlaying = playingId === item.id;
                  const lines = item.summary.split('\n').map((l) => l.trim()).filter(Boolean);
                  const partDate = new Date(item.created_at).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' });

                  return (
                    <div
                      key={item.id}
                      className={`px-4 py-3 space-y-2 ${idx < group.parts.length - 1 ? 'border-b border-gray-50' : ''}`}
                    >
                      {/* Part label (only for multi-part groups) */}
                      {isMultiPart && (
                        <p className="text-[11px] font-semibold text-indigo-500">
                          パート {idx + 1}
                          <span className="text-gray-400 font-normal ml-1.5">{partDate} · {item.image_count}枚</span>
                        </p>
                      )}

                      {/* TTS controls */}
                      <div className="flex items-center gap-2">
                        {isThisPlaying && audioState === 'loading' ? (
                          <button disabled className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-100 text-gray-400 text-xs">
                            <Loader2 size={13} className="animate-spin" />音声生成中...
                          </button>
                        ) : isThisPlaying && audioState === 'playing' ? (
                          <>
                            <button
                              onClick={() => playItem(item)}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-yellow-500 text-white text-xs font-semibold active:scale-95 transition-transform"
                            >
                              <Pause size={13} />一時停止
                            </button>
                            <button
                              onClick={stopAudio}
                              className="p-1.5 rounded-lg bg-gray-100 text-gray-500 active:scale-95 transition-transform"
                            >
                              <Square size={13} />
                            </button>
                            <span className="text-xs text-green-600 flex items-center gap-1">
                              <Volume2 size={11} className="animate-pulse" />読み上げ中
                            </span>
                          </>
                        ) : isThisPlaying && audioState === 'paused' ? (
                          <>
                            <button
                              onClick={() => playItem(item)}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-600 text-white text-xs font-semibold active:scale-95 transition-transform"
                            >
                              <Play size={13} />再開
                            </button>
                            <button
                              onClick={stopAudio}
                              className="p-1.5 rounded-lg bg-gray-100 text-gray-500 active:scale-95 transition-transform"
                            >
                              <Square size={13} />
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => playItem(item)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-600 text-white text-xs font-semibold active:scale-95 transition-transform"
                          >
                            <Play size={13} />読み上げ
                          </button>
                        )}
                      </div>

                      {/* Summary lines */}
                      <ol className="space-y-1.5">
                        {lines.map((line, i) => (
                          <li key={i} className="text-sm text-gray-700 leading-relaxed">{line}</li>
                        ))}
                      </ol>

                      {/* Delete */}
                      <button
                        onClick={() => deleteItem(item.id)}
                        disabled={deleting === item.id}
                        className="flex items-center gap-1 text-xs text-red-400 hover:text-red-600 disabled:opacity-50"
                      >
                        {deleting === item.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                        {isMultiPart ? 'このパートを削除' : '削除'}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
