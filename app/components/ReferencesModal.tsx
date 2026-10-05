'use client';
import { useEffect, useState } from 'react';

type Ref = { name: string; size: number };

export default function ReferencesModal({
  slug, onClose,
}: { slug: string; onClose: () => void }) {
  const [refs, setRefs] = useState<Ref[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const r = await fetch(`/api/projects/${slug}/references`);
    const data = await r.json();
    setRefs(data.references ?? []);
  }

  useEffect(() => { load(); }, [slug]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const content = await file.text();
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const r = await fetch(`/api/projects/${slug}/references`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: safeName, content }),
      });
      if (!r.ok) {
        const d = await r.json();
        setError(d?.error ?? 'Error');
      } else {
        await load();
      }
    } finally {
      setBusy(false);
      e.target.value = '';
    }
  }

  async function remove(name: string) {
    if (!confirm(`¿Eliminar "${name}"?`)) return;
    await fetch(`/api/projects/${slug}/references?file=${encodeURIComponent(name)}`, { method: 'DELETE' });
    await load();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-6"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden">
        <header className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-slate-900">Referencias de estilo</h2>
            <p className="text-xs text-slate-500">Archivos .md o .txt que la IA usará como guía de voz y registro al escribir tu novela.</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-slate-100 text-slate-500 flex items-center justify-center transition">✕</button>
        </header>

        <div className="flex-1 overflow-y-auto p-6 space-y-2">
          {refs.length === 0 && (
            <div className="text-sm text-slate-500 bg-slate-50 rounded-xl p-4">
              Aún no hay referencias. Sube archivos .md o .txt con prosa que represente tu voz (ej. capítulos de otras novelas tuyas).
            </div>
          )}
          {refs.map(r => (
            <div key={r.name} className="flex items-center justify-between gap-2 px-4 py-2 bg-slate-50 rounded-lg">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-slate-900 truncate">{r.name}</div>
                <div className="text-xs text-slate-500">{(r.size / 1024).toFixed(1)} KB</div>
              </div>
              <button onClick={() => remove(r.name)} className="text-xs text-slate-400 hover:text-red-600 transition">✕</button>
            </div>
          ))}
        </div>

        <footer className="px-6 py-4 border-t border-slate-200 bg-slate-50">
          {error && <div className="text-xs text-red-600 mb-2">{error}</div>}
          <label className="block">
            <input type="file" accept=".md,.txt" onChange={handleFile} disabled={busy} className="hidden" />
            <span className={`inline-block px-4 py-2 text-sm rounded-lg font-medium transition cursor-pointer ${busy ? 'bg-slate-200 text-slate-500' : 'bg-indigo-600 hover:bg-indigo-700 text-white'}`}>
              {busy ? 'Subiendo…' : '+ Subir referencia'}
            </span>
          </label>
        </footer>
      </div>
    </div>
  );
}
