'use client';
import { useEffect, useRef, useState } from 'react';

type Props = {
  slug: string;
  onClose: () => void;
};

/**
 * Preview de "cómo se verá la primera página". Streams ~N words of the
 * opening chapter using the entire bible as context. Pure read — does
 * not mutate anything. Closes the loop: outline → ¿se ve bien? → vuelve
 * al outline si falta algo.
 */
export default function PreviewModal({ slug, onClose }: Props) {
  const [text, setText] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [wordTarget, setWordTarget] = useState(500);
  const [started, setStarted] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    if (!streaming) return;
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [text, streaming]);

  async function generate() {
    setText('');
    setStreaming(true);
    setStarted(true);
    try {
      const r = await fetch(`/api/projects/${slug}/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wordTarget }),
      });
      if (!r.body) { setStreaming(false); return; }
      const reader = r.body.getReader();
      const decoder = new TextDecoder();
      let acc = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setText(acc);
      }
    } finally {
      setStreaming(false);
    }
  }

  const wordCount = text.split(/\s+/).filter(Boolean).length;
  const gaps = (text.match(/\[FALTA:[^\]]+\]/g) ?? []) as RegExpMatchArray;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-6 animate-fade-in"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[88vh] flex flex-col overflow-hidden">
        <header className="px-6 py-4 border-b-2 border-slate-200 bg-gradient-to-br from-amber-50 to-rose-50 flex items-center gap-3">
          <span className="text-3xl">👀</span>
          <div className="flex-1">
            <div className="text-[10px] uppercase tracking-widest text-amber-700 font-bold">Vista previa · solo lectura</div>
            <h2 className="text-lg font-bold text-slate-900">Cómo se verá la primera página</h2>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-lg hover:bg-white/60 text-slate-500 flex items-center justify-center text-lg">✕</button>
        </header>

        <div className="px-5 py-3 border-b border-slate-200 bg-slate-50 flex items-center gap-3 text-sm">
          <label className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-700">Longitud</span>
            <select
              value={wordTarget}
              onChange={(e) => setWordTarget(Number(e.target.value))}
              disabled={streaming}
              className="px-2 py-1 bg-white border-2 border-slate-300 rounded text-sm font-semibold focus:outline-none focus:border-amber-400"
            >
              <option value={300}>300 palabras (apertura corta)</option>
              <option value={500}>500 palabras (página)</option>
              <option value={800}>800 palabras (escena)</option>
              <option value={1200}>1200 palabras (capítulo cortito)</option>
            </select>
          </label>
          <div className="flex-1" />
          <button
            onClick={generate}
            disabled={streaming}
            className="px-4 py-1.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded-lg font-bold text-sm transition shadow-sm flex items-center gap-2"
          >
            {streaming ? '⏳ Escribiendo…' : started ? '↻ Regenerar' : '✨ Generar'}
          </button>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto p-7 bg-white">
          {!started && (
            <div className="text-center py-12 text-slate-600">
              <div className="text-5xl mb-3">📖</div>
              <p className="text-base max-w-md mx-auto leading-relaxed">
                La IA escribirá ~{wordTarget} palabras del Capítulo 1 usando <strong>toda</strong> tu bible como contexto.
              </p>
              <p className="text-sm text-slate-500 mt-3 max-w-md mx-auto">
                Si falta algo crítico, escribirá <code className="bg-slate-100 px-1 rounded">[FALTA: descripción]</code> y parará — así ves exactamente qué te queda por definir antes de Fase 2.
              </p>
            </div>
          )}

          {started && (
            <article className="prose prose-slate max-w-none prose-lg leading-relaxed first-letter:text-5xl first-letter:font-serif first-letter:font-bold first-letter:mr-2 first-letter:float-left first-letter:leading-none">
              <div className="whitespace-pre-wrap font-serif text-slate-900">
                {text || (streaming ? '…' : '')}
              </div>
            </article>
          )}
        </div>

        <footer className="px-5 py-3 border-t-2 border-slate-200 bg-slate-50 flex items-center gap-3 text-xs">
          <span className="text-slate-600">📝 {wordCount} palabras</span>
          {gaps.length > 0 && (
            <span className="px-2 py-0.5 bg-rose-100 text-rose-800 border border-rose-200 rounded-full font-bold">
              ⚠ {gaps.length} {gaps.length === 1 ? 'hueco' : 'huecos'} marcados
            </span>
          )}
          <div className="flex-1" />
          {text && (
            <button
              onClick={() => navigator.clipboard.writeText(text)}
              className="px-3 py-1 text-xs bg-white border border-slate-300 hover:border-slate-400 text-slate-700 rounded font-semibold"
            >
              📋 Copiar
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
