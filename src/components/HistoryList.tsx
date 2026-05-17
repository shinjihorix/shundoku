'use client';

import { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import {
  Trash2, ChevronDown, ChevronUp, Loader2, BookOpen,
  Play, Pause, Square, Volume2, Camera, Merge, Search, X, RefreshCw,
  FileText, Eye, EyeOff, CheckCircle2,
} from 'lucide-react';

interface SummaryItem {
  id: string;
  title: string | null;
  summary: string | null;
  image_count: number;
  created_at: string;
  cover_image: string | null;
  raw_text: string | null;
}

interface BookGroup {
  key: string;
  title: string | null;
  cover_image: string | null;
  parts: SummaryItem[];
  totalImages: number;
  latestDate: Date;
}

type AudioState = 'idle' | 'loading' | 'playing' | 'paused';

const MAX_PX = 800;
const JPEG_QUALITY = 0.82;


async function compressCover(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > MAX_PX || height > MAX_PX) {
        if (width >= height) { height = Math.round((height * MAX_PX) / width); width = MAX_PX; }
        else { width = Math.round((width * MAX_PX) / height); height = MAX_PX; }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('Canvas not supported')); return; }
      ctx.drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(objectUrl);
      resolve(canvas.toDataURL('image/jpeg', JPEG_QUALITY).split(',')[1]);
    };
    img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error('Image load failed')); };
    img.src = objectUrl;
  });
}

function rawPreview(text: string): string {
  return text.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 5).join('\n');
}

// ─── マージ確認ダイアログ ─────────────────────────────────────
function MergeConfirmDialog({
  group,
  onConfirm,
  onCancel,
}: {
  group: BookGroup;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center p-4">
      <div className="bg-white rounded-2xl p-5 w-full max-w-sm space-y-4 max-h-[90vh] overflow-y-auto">

        {/* Title */}
        <p className="text-sm font-semibold text-gray-800">全パートをまとめて要約しますか？</p>

        {/* Part list */}
        <div className="bg-gray-50 rounded-xl px-3 py-2.5 space-y-1.5">
          <p className="text-[10px] text-gray-500 font-semibold mb-1">取り込み済みのパート</p>
          {group.parts.map((p, i) => (
            <p key={p.id} className="text-xs text-gray-600 flex items-center gap-1.5">
              <CheckCircle2 size={11} className="text-green-500 shrink-0" />
              パート{i + 1} · {p.image_count}枚
            </p>
          ))}
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 font-semibold"
          >
            キャンセル
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold"
          >
            まとめて要約する
          </button>
        </div>
      </div>
    </div>
  );
}
// ─────────────────────────────────────────────────────────────

export default function HistoryList() {
  const [items, setItems] = useState<SummaryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [uploadingCover, setUploadingCover] = useState<string | null>(null);
  const [merging, setMerging] = useState<string | null>(null);
  const [confirmMergeGroup, setConfirmMergeGroup] = useState<BookGroup | null>(null);
  const [generatingSummary, setGeneratingSummary] = useState<string | null>(null);
  const [expandedRawText, setExpandedRawText] = useState<Set<string>>(new Set());

  const [playingId, setPlayingId] = useState<string | null>(null);
  const [audioState, setAudioState] = useState<AudioState>('idle');
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string>('');
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchItems = useCallback(async (q = '') => {
    setSearching(true);
    const url = q ? `/api/history?q=${encodeURIComponent(q)}` : '/api/history';
    const d = await fetch(url).then((r) => r.json()).catch(() => ({ items: [] }));
    setItems(d.items ?? []);
    setLoading(false);
    setSearching(false);
  }, []);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const handleSearch = (value: string) => {
    setQuery(value);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => fetchItems(value), 400);
  };

  const toggleRawText = (id: string) => {
    setExpandedRawText((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const groups = useMemo<BookGroup[]>(() => {
    const map = new Map<string, SummaryItem[]>();
    const ungrouped: SummaryItem[] = [];
    for (const item of items) {
      const key = item.title?.trim();
      if (!key) { ungrouped.push(item); continue; }
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    }
    const result: BookGroup[] = [];
    for (const [title, titleItems] of Array.from(map)) {
      const sorted = [...titleItems].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      const coverItem = [...sorted].reverse().find((i) => i.cover_image);
      result.push({
        key: title, title,
        cover_image: coverItem?.cover_image ?? null,
        parts: sorted,
        totalImages: sorted.reduce((s, i) => s + i.image_count, 0),
        latestDate: new Date(sorted[sorted.length - 1].created_at),
      });
    }
    for (const item of ungrouped) {
      result.push({ key: item.id, title: null, cover_image: item.cover_image, parts: [item], totalImages: item.image_count, latestDate: new Date(item.created_at) });
    }
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
    const text = item.summary;
    if (!text) return;
    if (playingId === item.id && audioState === 'playing') { audioRef.current?.pause(); setAudioState('paused'); return; }
    if (playingId === item.id && audioState === 'paused' && audioRef.current) { audioRef.current.play(); setAudioState('playing'); return; }
    stopAudio();
    setPlayingId(item.id);
    setAudioState('loading');
    try {
      const res = await fetch('/api/tts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) });
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
    } catch { setAudioState('idle'); setPlayingId(null); }
  };

  const deleteItem = async (id: string) => {
    if (playingId === id) stopAudio();
    setDeleting(id);
    await fetch('/api/history', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
    setItems((prev) => prev.filter((i) => i.id !== id));
    setDeleting(null);
  };

  const executeMerge = useCallback(async (group: BookGroup) => {
    setConfirmMergeGroup(null);
    setMerging(group.key);
    try {
      const res = await fetch('/api/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ids: group.parts.map((p) => p.id),
          summaries: group.parts.map((p) => p.summary ?? p.raw_text ?? ''),
          title: group.title ?? undefined,
          cover_image: group.cover_image ?? undefined,
          total_images: group.totalImages,
        }),
      });
      if (!res.ok) throw new Error('まとめに失敗しました');
      const { item } = await res.json();
      setItems((prev) => {
        const filtered = prev.filter((i) => !group.parts.some((p) => p.id === i.id));
        return [item, ...filtered];
      });
    } catch (err) {
      alert(err instanceof Error ? err.message : 'まとめに失敗しました');
    } finally {
      setMerging(null);
    }
  }, []);

  const generateSummary = useCallback(async (item: SummaryItem) => {
    setGeneratingSummary(item.id);
    try {
      const res = await fetch('/api/re-summarize', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: item.id }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? '要約生成に失敗しました');
      setItems((prev) => prev.map((i) => i.id === item.id ? { ...i, summary: json.summary } : i));
    } catch (err) {
      alert(err instanceof Error ? err.message : '要約生成に失敗しました');
    } finally {
      setGeneratingSummary(null);
    }
  }, []);

  const handleCoverUpload = useCallback(async (group: BookGroup, file: File) => {
    setUploadingCover(group.key);
    try {
      const data = await compressCover(file);
      const body = group.title ? { title: group.title, cover_image: data } : { id: group.parts[0].id, cover_image: data };
      await fetch('/api/history', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      setItems((prev) => prev.map((item) => {
        const belongs = group.title ? item.title === group.title : item.id === group.parts[0].id;
        return belongs ? { ...item, cover_image: data } : item;
      }));
    } finally {
      setUploadingCover(null);
    }
  }, []);

  if (loading) {
    return <div className="flex justify-center py-16"><Loader2 className="animate-spin text-gray-400" size={24} /></div>;
  }

  return (
    <div className="p-4 space-y-3 max-w-lg mx-auto">

      {confirmMergeGroup && (
        <MergeConfirmDialog
          group={confirmMergeGroup}
          onConfirm={() => executeMerge(confirmMergeGroup)}
          onCancel={() => setConfirmMergeGroup(null)}
        />
      )}

      {/* Search bar */}
      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        <input type="text" value={query} onChange={(e) => handleSearch(e.target.value)}
          placeholder="タイトル・内容を検索..."
          className="w-full pl-8 pr-8 py-2 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
        {query && !searching && <button onClick={() => handleSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400"><X size={14} /></button>}
        {searching && <Loader2 size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-indigo-400 animate-spin" />}
      </div>

      {groups.length === 0 && (
        <div className="flex flex-col items-center py-16 text-gray-400 gap-3">
          <BookOpen size={40} strokeWidth={1} />
          <p className="text-sm">{query ? '一致する本がありません' : 'まだ取り込みがありません'}</p>
        </div>
      )}

      {groups.map((group) => {
        const isOpen = expanded === group.key;
        const isMultiPart = group.parts.length > 1;
        const anyPartPlaying = group.parts.some((p) => p.id === playingId);
        const allHaveSummary = group.parts.every((p) => p.summary);
        const dateStr = group.latestDate.toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' });
        const inputId = `cover-input-${group.key}`;


        return (
          <div key={group.key} className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <div className="px-4 py-3 flex items-center gap-3">
              <label htmlFor={inputId} className="relative w-10 h-14 rounded-lg overflow-hidden shrink-0 bg-indigo-50 flex items-center justify-center cursor-pointer group" title="表紙を登録">
                {uploadingCover === group.key ? <Loader2 size={16} className="text-indigo-400 animate-spin" />
                  : group.cover_image ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={`data:image/jpeg;base64,${group.cover_image}`} alt="cover" className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-black/30 opacity-0 group-active:opacity-100 flex items-center justify-center transition-opacity"><Camera size={12} className="text-white" /></div>
                    </>
                  ) : (
                    <div className="flex flex-col items-center gap-0.5"><Camera size={13} className="text-indigo-300" /><span className="text-[8px] text-indigo-300 leading-none">登録</span></div>
                  )}
                <input id={inputId} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleCoverUpload(group, f); e.target.value = ''; }} />
              </label>

              <button onClick={() => setExpanded(isOpen ? null : group.key)} className="flex-1 min-w-0 text-left">
                <p className="text-sm font-semibold text-gray-800 truncate">{group.title || '無題'}</p>
                <p className="text-xs text-gray-400 mt-0.5 flex flex-wrap gap-1 items-center">
                  {dateStr} · {group.totalImages}枚
                  {isMultiPart && <span className="bg-indigo-100 text-indigo-600 rounded-full px-1.5 py-0.5 text-[10px] font-semibold">{group.parts.length}パート</span>}
                  {!allHaveSummary && <span className="bg-amber-100 text-amber-600 rounded-full px-1.5 py-0.5 text-[10px] font-semibold">文字起こし</span>}
                </p>
              </button>

              {anyPartPlaying && !isOpen && <Volume2 size={14} className="text-green-500 shrink-0 animate-pulse" />}
              <button onClick={() => setExpanded(isOpen ? null : group.key)}>
                {isOpen ? <ChevronUp size={16} className="text-gray-400 shrink-0" /> : <ChevronDown size={16} className="text-gray-400 shrink-0" />}
              </button>
            </div>

            {isOpen && (
              <div className="border-t border-gray-50">

                {/* Merge button */}
                {isMultiPart && (
                  <div className="px-4 py-3 border-b border-gray-50">
                    {merging === group.key ? (
                      <div className="flex items-center gap-2 text-xs text-indigo-500">
                        <Loader2 size={13} className="animate-spin" />AIがまとめています...（少々お待ちください）
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmMergeGroup(group)}
                        className="flex items-center gap-2 w-full px-3 py-2.5 rounded-xl text-white text-xs font-semibold active:scale-95 transition-transform justify-center bg-indigo-600"
                      >
                        <Merge size={14} />
                        {`全${group.parts.length}パートをまとめて要約する`}
                      </button>
                    )}
                  </div>
                )}

                {/* Parts */}
                {group.parts.map((item, idx) => {
                  const isThisPlaying = playingId === item.id;
                  const isGenerating = generatingSummary === item.id;
                  const hasSummary = !!item.summary;
                  const hasRawText = !!item.raw_text;
                  const rawExpanded = expandedRawText.has(item.id);
                  const summaryLines = item.summary?.split('\n').map((l) => l.trim()).filter(Boolean) ?? [];
                  const partDate = new Date(item.created_at).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' });

                  return (
                    <div key={item.id} className={`px-4 py-3 space-y-2 ${idx < group.parts.length - 1 ? 'border-b border-gray-50' : ''}`}>
                      {isMultiPart && (
                        <p className="text-[11px] font-semibold text-indigo-500">
                          パート{idx + 1}
                          <span className="text-gray-400 font-normal ml-1.5">
                            {partDate} · {item.image_count}枚
                          </span>
                        </p>
                      )}

                      {/* Raw text viewer */}
                      {hasRawText && (
                        <div>
                          <button onClick={() => toggleRawText(item.id)} className="flex items-center gap-1 text-[11px] text-indigo-500 font-semibold mb-1">
                            {rawExpanded ? <EyeOff size={11} /> : <Eye size={11} />}
                            {rawExpanded ? '文字起こしを閉じる' : '文字起こしを確認する'}
                          </button>
                          {rawExpanded && (
                            <div className="max-h-60 overflow-y-auto rounded-xl bg-gray-50 px-3 py-2.5 mb-2">
                              <p className="text-xs text-gray-600 leading-relaxed whitespace-pre-wrap">{item.raw_text}</p>
                            </div>
                          )}
                          {!rawExpanded && !hasSummary && (
                            <div className="rounded-xl bg-gray-50 px-3 py-2">
                              <p className="text-[10px] text-amber-600 font-semibold mb-1 flex items-center gap-1">
                                <FileText size={10} />文字起こし済み・要約未生成
                              </p>
                              <p className="text-xs text-gray-500 leading-relaxed whitespace-pre-wrap">
                                {rawPreview(item.raw_text!)}
                                {item.raw_text!.split('\n').filter(Boolean).length > 5 && '…'}
                              </p>
                            </div>
                          )}
                        </div>
                      )}

                      {hasSummary && (
                        <>
                          <div className="flex items-center gap-2">
                            {isThisPlaying && audioState === 'loading' ? (
                              <button disabled className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-100 text-gray-400 text-xs"><Loader2 size={13} className="animate-spin" />音声生成中...</button>
                            ) : isThisPlaying && audioState === 'playing' ? (
                              <>
                                <button onClick={() => playItem(item)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-yellow-500 text-white text-xs font-semibold active:scale-95 transition-transform"><Pause size={13} />一時停止</button>
                                <button onClick={stopAudio} className="p-1.5 rounded-lg bg-gray-100 text-gray-500 active:scale-95 transition-transform"><Square size={13} /></button>
                                <span className="text-xs text-green-600 flex items-center gap-1"><Volume2 size={11} className="animate-pulse" />読み上げ中</span>
                              </>
                            ) : isThisPlaying && audioState === 'paused' ? (
                              <>
                                <button onClick={() => playItem(item)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-600 text-white text-xs font-semibold active:scale-95 transition-transform"><Play size={13} />再開</button>
                                <button onClick={stopAudio} className="p-1.5 rounded-lg bg-gray-100 text-gray-500 active:scale-95 transition-transform"><Square size={13} /></button>
                              </>
                            ) : (
                              <button onClick={() => playItem(item)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-600 text-white text-xs font-semibold active:scale-95 transition-transform"><Play size={13} />読み上げ</button>
                            )}
                          </div>
                          <ol className="space-y-1.5">
                            {summaryLines.map((line, i) => <li key={i} className="text-sm text-gray-700 leading-relaxed">{line}</li>)}
                          </ol>
                        </>
                      )}

                      {!hasSummary && !isMultiPart && hasRawText && (
                        <button onClick={() => generateSummary(item)} disabled={isGenerating}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-600 text-white text-xs font-semibold active:scale-95 transition-transform disabled:opacity-50">
                          {isGenerating ? <><Loader2 size={13} className="animate-spin" />要約生成中...</> : <><RefreshCw size={13} />このパートの要約を生成</>}
                        </button>
                      )}

                      <div className="flex items-center gap-3 pt-0.5">
                        {hasSummary && hasRawText && (
                          <button onClick={() => generateSummary(item)} disabled={isGenerating} className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-600 disabled:opacity-50">
                            {isGenerating ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}再要約
                          </button>
                        )}
                        <button onClick={() => deleteItem(item.id)} disabled={deleting === item.id} className="flex items-center gap-1 text-xs text-red-400 hover:text-red-600 disabled:opacity-50">
                          {deleting === item.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                          {isMultiPart ? 'このパートを削除' : '削除'}
                        </button>
                      </div>
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
