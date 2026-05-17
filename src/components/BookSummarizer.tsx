'use client';

import { useState, useRef, useCallback } from 'react';
import { Upload, Loader2, X, BookOpen, ScanLine, AlertCircle, BookMarked, FileText } from 'lucide-react';

interface UploadedImage {
  id: string;
  data: string;
  mediaType: string;
  preview: string;
}

const MAX_IMAGES = 20;
const MAX_PX = 1280;
const JPEG_QUALITY = 0.82;

async function compressToJpeg(file: File): Promise<{ data: string; preview: string }> {
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
      const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
      resolve({ data: dataUrl.split(',')[1], preview: dataUrl });
    };
    img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error('Image load failed')); };
    img.src = objectUrl;
  });
}

export default function BookSummarizer() {
  const [coverImage, setCoverImage] = useState<UploadedImage | null>(null);
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [title, setTitle] = useState('');
  const [transcription, setTranscription] = useState('');
  const [processing, setProcessing] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState('');
  const coverFileRef = useRef<HTMLInputElement>(null);

  const handleCoverFile = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    const file = files[0];
    if (!allowed.includes(file.type)) return;
    const { data, preview } = await compressToJpeg(file);
    const img: UploadedImage = { id: crypto.randomUUID(), data, mediaType: 'image/jpeg', preview };
    setCoverImage(img);
    setScanning(true);
    setError('');
    try {
      const res = await fetch('/api/detect-cover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: { data: img.data, mediaType: img.mediaType } }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? '読み取り失敗');
      if (json.display) setTitle(json.display);
    } catch (err) {
      setError(err instanceof Error ? err.message : '表紙の読み取りに失敗しました');
    } finally {
      setScanning(false);
    }
  }, []);

  const handlePageFiles = useCallback(async (files: FileList | null) => {
    if (!files) return;
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    const validFiles = Array.from(files).filter((f) => allowed.includes(f.type));
    for (const file of validFiles) {
      const { data, preview } = await compressToJpeg(file);
      setImages((prev) => {
        if (prev.length >= MAX_IMAGES) return prev;
        return [...prev, { id: crypto.randomUUID(), data, mediaType: 'image/jpeg', preview }];
      });
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => { e.preventDefault(); handlePageFiles(e.dataTransfer.files); },
    [handlePageFiles],
  );

  const removeImage = (id: string) => setImages((prev) => prev.filter((img) => img.id !== id));

  const transcribe = async () => {
    if (images.length === 0) return;
    setProcessing(true);
    setError('');
    setTranscription('');
    try {
      const res = await fetch('/api/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          images: images.map((img) => ({ data: img.data, mediaType: img.mediaType })),
          title: title || undefined,
          coverImage: coverImage?.data ?? undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? '文字起こしに失敗しました');
      setTranscription(json.transcription);
    } catch (err) {
      setError(err instanceof Error ? err.message : '文字起こしに失敗しました');
    } finally {
      setProcessing(false);
    }
  };

  const reset = () => {
    setCoverImage(null);
    setImages([]);
    setTitle('');
    setTranscription('');
    setError('');
  };

  const continueReading = () => {
    setImages([]);
    setTranscription('');
    setError('');
  };

  const atLimit = images.length >= MAX_IMAGES;

  return (
    <div className="p-4 space-y-4 max-w-lg mx-auto">

      {/* Cover scan section */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <button
          className="w-full px-4 py-3 flex items-center gap-3 text-left"
          onClick={() => coverFileRef.current?.click()}
          disabled={scanning}
        >
          <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0">
            {scanning ? (
              <Loader2 size={20} className="text-indigo-500 animate-spin" />
            ) : coverImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={coverImage.preview} alt="cover" className="w-10 h-10 object-cover rounded-xl" />
            ) : (
              <ScanLine size={20} className="text-indigo-400" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-800">
              {scanning ? 'スキャン中...' : '① 表紙をスキャン'}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              {scanning ? '題名・著者を読み取っています' : '表紙のスクショをタップして選択 → 自動入力'}
            </p>
          </div>
          {coverImage && !scanning && (
            <span className="text-xs text-green-600 font-medium shrink-0">完了</span>
          )}
        </button>
        <input
          ref={coverFileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="hidden"
          onChange={(e) => handleCoverFile(e.target.files)}
        />

        <div className="px-4 pb-3">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="題名・著者（自動入力 or 手動）"
            className="w-full px-3 py-2 rounded-xl border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />
        </div>
      </div>

      {/* Page upload section */}
      <div
        className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-colors ${
          atLimit
            ? 'border-orange-300 bg-orange-50 cursor-not-allowed'
            : 'border-gray-300 hover:border-indigo-400 hover:bg-indigo-50'
        }`}
        onDrop={!atLimit ? handleDrop : undefined}
        onDragOver={(e) => e.preventDefault()}
        onClick={() => !atLimit && document.getElementById('book-file-input')?.click()}
      >
        <Upload className={`mx-auto mb-2 ${atLimit ? 'text-orange-400' : 'text-gray-400'}`} size={32} />
        {atLimit ? (
          <>
            <p className="text-sm font-semibold text-orange-700">② ページ（最大 {MAX_IMAGES}枚）</p>
            <p className="text-xs text-orange-600 mt-1">{MAX_IMAGES}枚に達しました。不要な画像を削除してください。</p>
          </>
        ) : (
          <>
            <p className="text-sm text-gray-600 font-medium">② ページをタップして選択</p>
            <p className="text-xs text-gray-400 mt-1">
              最大 {MAX_IMAGES}枚まで · 現在 {images.length}枚 · JPG/PNG/WEBP
            </p>
            <p className="text-xs text-gray-400">（章ごとに10〜20枚ずつ取り込んで下さい）</p>
          </>
        )}
        <input
          id="book-file-input"
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          multiple
          className="hidden"
          onChange={(e) => handlePageFiles(e.target.files)}
        />
      </div>

      {images.length > 10 && (
        <div className="flex items-start gap-2 bg-amber-50 rounded-xl px-3 py-2.5">
          <AlertCircle size={14} className="text-amber-500 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-700">
            枚数が多いと処理が遅くなります。章ごとに分けて複数回取り込むと快適です。
          </p>
        </div>
      )}

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

      {/* Transcribe button */}
      <button
        onClick={transcribe}
        disabled={images.length === 0 || processing}
        className="w-full py-3 rounded-2xl bg-indigo-600 text-white font-semibold flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 transition-transform"
      >
        {processing
          ? <><Loader2 size={18} className="animate-spin" />文字起こし中...</>
          : <><FileText size={18} />文字起こしする（{images.length}枚）</>}
      </button>

      {error && <div className="bg-red-50 text-red-600 text-sm rounded-xl px-4 py-3">{error}</div>}

      {/* Transcription result */}
      {transcription && (
        <div className="bg-white rounded-2xl shadow-sm p-4 space-y-3">
          <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
            <FileText size={15} />
            文字起こし確認
            {title && <span className="text-gray-400 font-normal">— {title}</span>}
          </h2>

          <div className="max-h-64 overflow-y-auto rounded-xl bg-gray-50 px-3 py-2.5">
            <p className="text-xs text-gray-600 leading-relaxed whitespace-pre-wrap">{transcription}</p>
          </div>

          <p className="text-xs text-gray-400 flex items-center gap-1">
            <BookOpen size={11} />
            履歴タブから要約を生成できます
          </p>

          <div className="pt-1 border-t border-gray-100 flex gap-2">
            <button
              onClick={continueReading}
              className="flex-1 py-2 rounded-xl bg-indigo-50 text-indigo-700 text-xs font-semibold flex items-center justify-center gap-1.5 active:scale-95 transition-transform"
            >
              <BookMarked size={14} />続きの章を取り込む
            </button>
            <button
              onClick={reset}
              className="flex-1 py-2 rounded-xl bg-gray-100 text-gray-600 text-xs font-semibold active:scale-95 transition-transform"
            >
              新しい本
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
