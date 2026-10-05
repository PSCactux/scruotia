'use client';
import { useState, useEffect } from 'react';
import { parseParagraphFields, serializeParagraphFields, type ParagraphFields } from '@/lib/step-views';

const FIELDS: Array<{ key: keyof ParagraphFields; label: string; placeholder: string }> = [
  { key: 'setup', label: 'Setup', placeholder: 'El mundo normal del protagonista antes de que algo se rompa.' },
  { key: 'disaster1', label: 'Disastro 1', placeholder: 'Final del acto 1 — el evento que rompe el statu quo.' },
  { key: 'disaster2', label: 'Disastro 2 (midpoint)', placeholder: 'El giro que cambia todo a mitad de novela.' },
  { key: 'disaster3', label: 'Disastro 3', placeholder: 'Final del acto 2 — el peor momento, todo está perdido.' },
  { key: 'resolution', label: 'Resolución', placeholder: 'Cómo se resuelve el conflicto y qué cambió.' },
];

export default function ParagraphFieldsView({
  value, onChange,
}: { value: string; onChange: (next: string) => void }) {
  const [fields, setFields] = useState<ParagraphFields>(parseParagraphFields(value));

  useEffect(() => {
    setFields(parseParagraphFields(value));
  }, [value]);

  function update<K extends keyof ParagraphFields>(key: K, val: string) {
    const next = { ...fields, [key]: val };
    setFields(next);
    onChange(serializeParagraphFields(next));
  }

  return (
    <div className="space-y-3">
      {FIELDS.map(({ key, label, placeholder }) => (
        <div key={key} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 py-2 border-b border-slate-200 bg-slate-50">
            <span className="text-xs uppercase tracking-wide text-slate-500 font-medium">{label}</span>
          </div>
          <textarea
            value={fields[key]}
            onChange={e => update(key, e.target.value)}
            placeholder={placeholder}
            className="w-full p-4 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none resize-y min-h-[80px]"
            rows={3}
          />
        </div>
      ))}
    </div>
  );
}
