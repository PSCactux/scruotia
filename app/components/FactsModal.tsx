'use client';
import { useEffect, useState } from 'react';

export default function FactsModal({
  slug, onClose,
}: { slug: string; onClose: () => void }) {
  const [content, setContent] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    fetch(`/api/projects/${slug}/facts`)
      .then(r => r.json())
      .then(d => { setContent(d.content ?? ''); setLoaded(true); })
      .catch(() => setLoaded(true));
  }, [slug]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function save() {
    setSaving(true);
    try {
      await fetch(`/api/projects/${slug}/facts`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1500);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-6"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden">
        <header className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-slate-900">Hechos canónicos</h2>
            <p className="text-xs text-slate-500">
              Verdad inviolable del proyecto. Se inyecta en cada chat. Si Fase 2 quiere inventar una edad, una distancia o un nombre, debería poder citar este doc.
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-slate-100 text-slate-500 flex items-center justify-center transition">✕</button>
        </header>

        <div className="flex-1 overflow-y-auto p-6">
          {!loaded ? (
            <div className="text-sm text-slate-500">Cargando…</div>
          ) : (
            <textarea
              value={content}
              onChange={e => setContent(e.target.value)}
              placeholder={`Lista de hechos inmutables. Markdown libre, pero los más útiles son hechos atómicos en bullets:\n\n- Mara tiene 64 años al empezar la novela.\n- Del faro al pueblo hay 40 minutos andando.\n- La lámpara del faro se apaga cada noche a las 3:00.\n- Tito nunca miente.`}
              rows={20}
              className="w-full p-4 text-sm font-mono text-slate-900 placeholder:text-slate-400 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-200 resize-y"
            />
          )}
        </div>

        <footer className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-3">
          {savedFlash && <span className="text-xs text-green-600">✓ Guardado</span>}
          <button onClick={onClose} className="px-4 py-1.5 text-sm text-slate-600 hover:text-slate-900 transition">Cerrar</button>
          <button
            onClick={save}
            disabled={saving || !loaded}
            className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition"
          >
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </footer>
      </div>
    </div>
  );
}
