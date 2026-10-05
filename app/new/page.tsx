'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function NewProjectPage() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const r = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, methodology: 'snowflake', genre: 'generic' }),
    });
    const data = await r.json();
    router.push(`/p/${data.project.slug}`);
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-sm p-8">
        <div className="text-4xl mb-2 text-center">📖</div>
        <h1 className="text-2xl font-semibold text-slate-900 mb-1 text-center">Nuevo proyecto</h1>
        <p className="text-sm text-slate-500 mb-6 text-center">Sólo necesitamos un título. El resto lo descubrimos hablando.</p>
        <form onSubmit={submit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Título de la novela</label>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              required
              autoFocus
              placeholder="Ej. La farera del cabo"
              className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-200"
            />
          </div>
          <button
            disabled={busy || !title}
            className="w-full px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white rounded-lg text-sm font-medium transition"
          >
            {busy ? 'Creando…' : 'Crear y empezar a hablar →'}
          </button>
        </form>
      </div>
    </div>
  );
}
