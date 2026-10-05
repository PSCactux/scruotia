'use client';
import { useState, useEffect } from 'react';
import {
  parseCharacterBibles, serializeCharacterBibles, emptyCharacterBible, type CharacterBible,
} from '@/lib/step-views';

const ROLE_OPTIONS = ['protagonist', 'antagonist', 'deuteragonist', 'mentor', 'supporting'];

const FIELDS: Array<{ key: keyof Omit<CharacterBible, 'name' | 'role' | 'notes'>; label: string; rows: number; placeholder: string }> = [
  { key: 'backstory', label: 'Backstory', rows: 3, placeholder: 'Pasado relevante del personaje…' },
  { key: 'physical', label: 'Físico', rows: 2, placeholder: 'Apariencia, gestos, edad…' },
  { key: 'voice', label: 'Voz', rows: 2, placeholder: 'Cómo habla, registro, muletillas…' },
  { key: 'relationships', label: 'Relaciones', rows: 2, placeholder: 'Con quién, qué vínculo…' },
  { key: 'secrets', label: 'Secretos', rows: 2, placeholder: 'Qué oculta…' },
  { key: 'arc', label: 'Arco emocional', rows: 2, placeholder: 'Transformación durante la novela…' },
];

export default function CharacterBiblesView({
  value, onChange,
}: { value: string; onChange: (next: string) => void }) {
  const [bibles, setBibles] = useState<CharacterBible[]>(parseCharacterBibles(value));

  useEffect(() => { setBibles(parseCharacterBibles(value)); }, [value]);

  function persist(next: CharacterBible[]) {
    setBibles(next);
    onChange(serializeCharacterBibles(next));
  }

  function update(idx: number, patch: Partial<CharacterBible>) {
    persist(bibles.map((b, i) => (i === idx ? { ...b, ...patch } : b)));
  }

  function add() {
    persist([...bibles, { ...emptyCharacterBible(), name: 'Sin nombre' }]);
  }

  function remove(idx: number) {
    persist(bibles.filter((_, i) => i !== idx));
  }

  return (
    <div className="space-y-4">
      {bibles.map((b, i) => (
        <div key={i} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between gap-3">
            <input
              type="text"
              value={b.name}
              onChange={e => update(i, { name: e.target.value })}
              placeholder="Nombre"
              className="text-lg font-semibold text-slate-900 bg-transparent focus:outline-none flex-1 min-w-0"
            />
            <select
              value={b.role}
              onChange={e => update(i, { role: e.target.value })}
              className="px-2 py-1 text-sm bg-white border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-200"
            >
              <option value="">— rol —</option>
              {ROLE_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
            <button
              onClick={() => remove(i)}
              className="text-xs text-slate-400 hover:text-red-600 transition shrink-0"
              title="Eliminar personaje"
            >
              ✕
            </button>
          </div>
          <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-3">
            {FIELDS.map(f => (
              <div key={f.key}>
                <label className="block text-[10px] uppercase tracking-wide text-slate-500 font-medium mb-1">{f.label}</label>
                <textarea
                  value={b[f.key]}
                  onChange={e => update(i, { [f.key]: e.target.value } as Partial<CharacterBible>)}
                  rows={f.rows}
                  placeholder={f.placeholder}
                  className="w-full px-2 py-1.5 text-sm bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-200 resize-y"
                />
              </div>
            ))}
            <div className="md:col-span-2">
              <label className="block text-[10px] uppercase tracking-wide text-slate-500 font-medium mb-1">Notas adicionales</label>
              <textarea
                value={b.notes}
                onChange={e => update(i, { notes: e.target.value })}
                rows={2}
                placeholder="Cualquier otra cosa relevante…"
                className="w-full px-2 py-1.5 text-sm bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-200 resize-y"
              />
            </div>
          </div>
        </div>
      ))}

      <button
        onClick={add}
        className="w-full rounded-xl border-2 border-dashed border-slate-300 text-slate-500 hover:border-indigo-300 hover:text-indigo-600 hover:bg-indigo-50/30 p-6 transition text-sm font-medium"
      >
        + Añadir bible de personaje
      </button>
    </div>
  );
}
