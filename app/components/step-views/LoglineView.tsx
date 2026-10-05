'use client';
import { useState, useEffect } from 'react';

export default function LoglineView({
  value, onChange,
}: { value: string; onChange: (next: string) => void }) {
  const [local, setLocal] = useState(value);
  useEffect(() => { setLocal(value); }, [value]);

  const words = local.trim().split(/\s+/).filter(Boolean).length;
  const overLimit = words > 15;

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-4 py-2 border-b border-slate-200 flex items-center justify-between bg-slate-50">
        <span className="text-xs uppercase tracking-wide text-slate-500 font-medium">Logline</span>
        <span className={`text-xs ${overLimit ? 'text-red-600 font-medium' : 'text-slate-400'}`}>
          {words}/15 palabras
        </span>
      </div>
      <input
        type="text"
        value={local}
        onChange={e => { setLocal(e.target.value); onChange(e.target.value); }}
        placeholder="Una sola frase con protagonista, conflicto y stakes…"
        className="w-full px-4 py-4 text-base text-slate-900 placeholder:text-slate-400 focus:outline-none"
      />
    </div>
  );
}
