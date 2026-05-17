'use client';

import { useState, useRef, useCallback } from 'react';
import { Upload, Play, Pause, Square, Loader2, X, BookOpen, Volume2, Save } from 'lucide-react';

interface UploadedImage {
  id: string;
  data: string;
  mediaType: string;
  preview: string;
}

type AudioState = 'idle' | 'loading' | 'playing' | 'paused';

export default function BookSummarizer() {
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [summarizing, setSummarizing] = useState(false);
  const [audioState, setAudioState] = useState<AudioState>('idle');
  const [error, setError] = useState('');
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string>('');

  const handleFiles = useCallback((files: FileList | null) => {
    if (!files) return;
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    Array.from(files).forEach((file) => {
      if (!allowed.includes(file.type)) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        setImages((prev) => [
          ...prev,
          { id: crypto.randomUUID(), data: dataUrl.split(',')[1], mediaType: file.type, preview: dataUrl },
        ]);
      };
      reader.readAsDataURL(file);
    });
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => { e.preventDefault(); handleFiles(e.dataTransfer.files); },
    [handleFiles],
  );

  const removeImage = (id: string) => setImages((prev) => prev.filter((img) => img.id !== id));

  const summarize = async () => {
    if (images.length === 0) return;
    setSummarizing(true);
    setError('');
    setSummary('');
    stopAudio();
    try {
      const res = await fetch('/api/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          images: images.map((img) => ({ data: img.data, mediaType: img.mediaType })),
          title: title || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? '要約に失敗しました');
      setSummary(json.summary);
    } catch (err) {
      setError(err instanceof Error ? err.message : '要約に失敗しました');
    } finally {
      setSummarizing(false);
    }
  };

  const stopAudio = () => {
    audioRef.current?.pause();
    audioRef.current = null;
    if (audioUrlRef.current) { URL.revokeObjectURL(audioUrlRef.current); audioUrlRef.current = ''; }
    setAudioState('idle');
  };

  const playAudio = async () => {
    if (!summary) return;
    if (audioState === 'paused' && audioRef.current) {
      audioRef.current.play();
      setAudioState('playing');
      return;
    }
    stopAudio();
    setAudioState('loading');
    setError('');
    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: summary }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? '音声生成に失敗しました');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      audioUrlRef.current = url;
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => setAudioState('idle');
      audio.onerror = () => { setError('再生に失敗しました'); setAudioState('idle'); };
      await audio.play();
      setAudioState('playing');
    } catch (err) {
      setError(err instanceof Error ? err.message : '音声生成に失敗しました');
      setAudioState('idle');
    }
  };

  const pauseAudio = () => { audioRef.current?.pause(); setAudioState('paused'); };

  const reset = () => {
    setImages([]);
    setTitle('');
    setSummary('');
    setError('');
    stopAudio();
  };

  const summaryLines = summary.split('\n').map((l) => l.trim()).filter(Boolean);

  return (
    <div className="p-4 space-y-4 max-w-lg mx-auto">
      {/* Title input */}
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="本のタイトル（任意）"
        className="w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
      />

      {/* Upload area */}
      <div
        className="border-2 border-dashed border-gray-300 rounded-2xl p-6 text-center cursor-pointer hover:border-indigo-400 hover:bg-indigo-50 transition-colors"
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        onClick={() => document.getElementById('book-file-input')?.click()}
      >
        <Upload className="mx-auto mb-2 text-gray-400" size={32} />
        <p className="text-sm text-gray-600">本のページをタップして選択</p>
        <p className="text-xs text-gray-400 mt-1">複数枚まとめてOK・JPG/PNG/WEBP</p>
        <input
          id="book-file-input"
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      {/* Previews */}
      {images.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {images.map((img) => (
            <div key={img.id} className="relative w-20 h-20">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.preview} alt="" className="w-20 h-20 object-cover rounded-xl" />
              <button onClick={() => removeImage(img.id)} className="absolute -top-1.5 -right-1.5 bg-gray-800 text-white rounded-full w-5 h-5 flex items-center justify-center">
                <X size={10} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Summarize button */}
      <button
        onClick={summarize}
        disabled={images.length === 0 || summarizing}
        className="w-full py-3 rounded-2xl bg-indigo-600 text-white font-semibold flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 transition-transform"
      >
        {summarizing ? <><Loader2 size={18} className="animate-spin" />要約中...</> : <><BookOpen size={18} />要約する</>}
      </button>

      {error && <div className="bg-red-50 text-red-600 text-sm rounded-xl px-4 py-3">{error}</div>}

      {/* Summary */}
      {summary && (
        <div className="bg-white rounded-2xl shadow-sm p-4 space-y-3">
          <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
            <BookOpen size={15} />
            {title || '要約'}
          </h2>
          <ol className="space-y-2">
            {summaryLines.map((line, i) => (
              <li key={i} className="text-sm text-gray-700 leading-relaxed">{line}</li>
            ))}
          </ol>

          {/* Audio controls */}
          <div className="flex gap-2 pt-1">
            {audioState === 'idle' || audioState === 'paused' ? (
              <button onClick={playAudio} className="flex-1 py-2.5 rounded-xl bg-green-600 text-white text-sm font-semibold flex items-center justify-center gap-1.5 active:scale-95 transition-transform">
                <Play size={16} />{audioState === 'paused' ? '再開' : '読み上げ'}
              </button>
            ) : audioState === 'playing' ? (
              <button onClick={pauseAudio} className="flex-1 py-2.5 rounded-xl bg-yellow-500 text-white text-sm font-semibold flex items-center justify-center gap-1.5 active:scale-95 transition-transform">
                <Pause size={16} />一時停止
              </button>
            ) : (
              <button disabled className="flex-1 py-2.5 rounded-xl bg-gray-200 text-gray-500 text-sm font-semibold flex items-center justify-center gap-1.5">
                <Loader2 size={16} className="animate-spin" />音声生成中...
              </button>
            )}
            {(audioState === 'playing' || audioState === 'paused') && (
              <button onClick={stopAudio} className="py-2.5 px-3 rounded-xl bg-gray-200 text-gray-600 active:scale-95 transition-transform">
                <Square size={16} />
              </button>
            )}
          </div>

          {audioState !== 'idle' && (
            <p className="text-xs text-gray-400 flex items-center gap-1">
              <Volume2 size={12} />
              {audioState === 'loading' ? '音声を生成しています...' : audioState === 'playing' ? '読み上げ中' : '一時停止中'}
            </p>
          )}

          {/* Save / New */}
          <div className="flex gap-2 pt-1 border-t border-gray-100">
            <p className="text-xs text-gray-400 flex items-center gap-1 flex-1">
              <Save size={12} />自動保存済み
            </p>
            <button onClick={reset} className="text-xs text-indigo-600 font-medium">
              新しい本を読む
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
