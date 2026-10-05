'use client';
import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import type { Entity } from '@/lib/entities';

type SketchVariant = {
  id: string;
  label: string;
  value?: string;
  body?: string;
  raw: string;
};

type SketchBranch = {
  id: string;
  scope: { entityRef: string; fieldKey: string | null };
  prompt: string;
  variants: SketchVariant[];
  status: 'open' | 'merged' | 'discarded';
  created: string;
  applied?: { variantId: string; ts: string };
};

type Props = {
  slug: string;
  entity: Entity;
  /** When set, the branch varies only this field (e.g. "Want"). When null,
   *  the whole entity body. */
  fieldKey: string | null;
  onClose: () => void;
  onApplied: (entity: Entity) => void;
};

/**
 * Right-side panel for sketch branches: ask the AI for N variants of an
 * entity (or a single field), compare them side by side, apply one or
 * discard. Persistent — closes/opens without losing the generated variants
 * thanks to /api/projects/[slug]/branches storage.
 */
export default function BranchExplorer({ slug, entity, fieldKey, onClose, onApplied }: Props) {
  const [branch, setBranch] = useState<SketchBranch | null>(null);
  const [instruction, setInstruction] = useState('');
  const [generating, setGenerating] = useState(false);
  const [applying, setApplying] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function generate(n = 3) {
    setGenerating(true);
    setError(null);
    try {
      const r = await fetch(`/api/projects/${slug}/branches`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entityRef: `${entity.type}/${entity.slug}`,
          fieldKey,
          n,
          instruction: instruction.trim() || undefined,
        }),
      });
      if (!r.ok) { const d = await r.json().catch(() => ({})); setError(d.error ?? `HTTP ${r.status}`); return; }
      const data = await r.json();
      setBranch(data.branch);
    } finally {
      setGenerating(false);
    }
  }

  async function apply(variantId: string) {
    if (!branch) return;
    setApplying(variantId);
    setError(null);
    try {
      const r = await fetch(`/api/projects/${slug}/branches/${branch.id}/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ variantId }),
      });
      if (!r.ok) { const d = await r.json().catch(() => ({})); setError(d.error ?? `HTTP ${r.status}`); return; }
      const data = await r.json();
      onApplied(data.entity);
      onClose();
    } finally {
      setApplying(null);
    }
  }

  async function discard() {
    if (!branch) { onClose(); return; }
    if (!confirm('¿Descartar esta rama y sus variantes?')) return;
    await fetch(`/api/projects/${slug}/branches/${branch.id}`, { method: 'DELETE' });
    onClose();
  }

  const scopeLabel = fieldKey
    ? <>Variar campo <strong>{fieldKey}</strong> de <strong>{entity.name}</strong></>
    : <>Variar ficha completa de <strong>{entity.name}</strong></>;

  return (
    <div
      className="fixed inset-0 z-[60] bg-slate-900/50 backdrop-blur-sm flex justify-end animate-fade-in"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-5xl h-full bg-white shadow-2xl flex flex-col overflow-hidden">
        <header className="px-5 py-3 border-b-2 border-emerald-100 bg-gradient-to-r from-emerald-50 to-white flex items-center gap-3">
          <span className="text-2xl">🌿</span>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] uppercase tracking-widest text-emerald-700 font-bold">Sketches paralelos · no contamina el chat</div>
            <h2 className="text-base font-bold text-slate-900">{scopeLabel}</h2>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-lg hover:bg-slate-200 text-slate-500 flex items-center justify-center text-lg">✕</button>
        </header>

        <div className="flex-1 overflow-y-auto p-5 bg-slate-50/40">
          {error && (
            <div className="mb-4 p-3 bg-rose-50 border-2 border-rose-200 text-rose-800 rounded-lg text-sm">
              {error}
            </div>
          )}

          {!branch && !generating && (
            <div className="max-w-xl mx-auto py-12 text-center">
              <div className="text-5xl mb-3">🌿</div>
              <h3 className="text-xl font-bold text-slate-900 mb-2">Explorar variantes</h3>
              <p className="text-sm text-slate-600 mb-5">
                La IA propondrá 3 versiones {fieldKey ? <>del campo <strong>{fieldKey}</strong></> : <>de la ficha entera</>}.
                Las comparas, eliges una o las descartas todas. Es una rama: no afecta al chat principal.
              </p>
              <div className="space-y-3 text-left">
                <label className="block">
                  <span className="text-[11px] uppercase tracking-wider text-slate-500 font-bold">Indicación extra (opcional)</span>
                  <input
                    value={instruction}
                    onChange={(e) => setInstruction(e.target.value)}
                    placeholder='ej. "que sean más oscuras", "una cómica, una poética, una concreta"'
                    className="w-full mt-1 px-3 py-2 text-sm bg-white border-2 border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-300 focus:border-emerald-400"
                  />
                </label>
                <div className="flex gap-2">
                  <button
                    onClick={() => generate(3)}
                    className="flex-1 px-4 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold transition shadow-sm flex items-center justify-center gap-2"
                  >
                    <span>✨</span><span>Generar 3 variantes</span>
                  </button>
                  <button
                    onClick={() => generate(5)}
                    className="px-4 py-3 bg-white hover:bg-slate-50 border-2 border-slate-300 text-slate-800 rounded-xl font-semibold transition"
                  >
                    5
                  </button>
                </div>
                <p className="text-[11px] text-slate-500 text-center">
                  💡 Hace 1 llamada a la IA. La rama se guarda hasta que apliques o descartes.
                </p>
              </div>
            </div>
          )}

          {generating && (
            <div className="py-20 text-center text-slate-600">
              <div className="text-4xl mb-3 animate-pulse">✨</div>
              <p className="text-sm">Generando variantes…</p>
            </div>
          )}

          {branch && (
            <>
              <div className="mb-4 flex items-center gap-3 text-xs text-slate-600">
                <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full font-bold">
                  Rama abierta · {branch.variants.length} variantes
                </span>
                <span>{branch.prompt}</span>
                <div className="flex-1" />
                <button
                  onClick={() => generate(branch.variants.length)}
                  disabled={generating}
                  className="px-2.5 py-1 bg-white border border-slate-300 hover:border-slate-400 text-slate-700 rounded font-semibold transition disabled:opacity-40"
                >
                  ↻ Regenerar
                </button>
              </div>

              <div className={`grid gap-3 ${branch.variants.length >= 4 ? 'grid-cols-2' : 'grid-cols-3'}`}>
                {branch.variants.map((v) => {
                  const isApplying = applying === v.id;
                  return (
                    <article
                      key={v.id}
                      className="bg-white border-2 border-slate-200 hover:border-emerald-400 rounded-xl p-4 transition flex flex-col"
                    >
                      <div className="flex items-center gap-2 mb-3 pb-2 border-b border-slate-100">
                        <span className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-800 font-black flex items-center justify-center text-sm uppercase">
                          {v.id}
                        </span>
                        <div className="text-xs font-bold text-slate-700 leading-tight flex-1">{v.label}</div>
                      </div>
                      <div className="flex-1 text-sm text-slate-800 leading-relaxed max-h-96 overflow-y-auto prose prose-sm max-w-none">
                        {v.value !== undefined ? (
                          <p className="whitespace-pre-wrap">{v.value}</p>
                        ) : (
                          <ReactMarkdown>{v.body ?? ''}</ReactMarkdown>
                        )}
                      </div>
                      <button
                        onClick={() => apply(v.id)}
                        disabled={isApplying || applying !== null}
                        className="mt-3 pt-3 border-t border-slate-100 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg font-bold text-sm transition"
                      >
                        {isApplying ? '⏳ Aplicando…' : '✓ Aplicar esta'}
                      </button>
                    </article>
                  );
                })}
              </div>
            </>
          )}
        </div>

        <footer className="px-5 py-3 border-t-2 border-slate-200 bg-slate-50 flex items-center gap-3 text-xs text-slate-600">
          <span>💡 Aplicar una variante guarda snapshot automáticamente (puedes deshacer en Historial).</span>
          <div className="flex-1" />
          {branch && branch.status === 'open' && (
            <button
              onClick={discard}
              className="px-3 py-1.5 text-slate-600 hover:text-rose-700 hover:bg-rose-50 rounded font-semibold transition"
            >
              Descartar rama
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
