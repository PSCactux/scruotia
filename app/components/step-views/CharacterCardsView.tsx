'use client';
import { useState, useEffect } from 'react';
import { parseCharacterCards, serializeCharacterCards, emptyCharacter, type CharacterCard } from '@/lib/step-views';

const ROLE_OPTIONS = ['protagonist', 'antagonist', 'deuteragonist', 'mentor', 'supporting'];
const ARC_OPTIONS = ['positivo', 'negativo', 'plano', 'corrupción', 'redención'];

export default function CharacterCardsView({
  value, onChange,
}: { value: string; onChange: (next: string) => void }) {
  const [cards, setCards] = useState<CharacterCard[]>(parseCharacterCards(value));

  useEffect(() => {
    setCards(parseCharacterCards(value));
  }, [value]);

  function persist(next: CharacterCard[]) {
    setCards(next);
    onChange(serializeCharacterCards(next));
  }

  function updateCard(idx: number, patch: Partial<CharacterCard>) {
    persist(cards.map((c, i) => (i === idx ? { ...c, ...patch } : c)));
  }

  function addCard() {
    persist([...cards, { ...emptyCharacter(), name: 'Sin nombre' }]);
  }

  function removeCard(idx: number) {
    persist(cards.filter((_, i) => i !== idx));
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {cards.map((c, i) => (
          <div key={i} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-4 py-2 border-b border-slate-200 bg-slate-50 flex items-center justify-between gap-2">
              <input
                type="text"
                value={c.name}
                onChange={e => updateCard(i, { name: e.target.value })}
                placeholder="Nombre"
                className="font-medium text-slate-900 bg-transparent focus:outline-none flex-1 min-w-0"
              />
              <button
                onClick={() => removeCard(i)}
                className="text-xs text-slate-400 hover:text-red-600 transition shrink-0"
                title="Eliminar personaje"
              >
                ✕
              </button>
            </div>
            <div className="p-4 space-y-2 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <Field label="Rol">
                  <select
                    value={c.role}
                    onChange={e => updateCard(i, { role: e.target.value })}
                    className="w-full px-2 py-1 text-sm bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  >
                    <option value="">—</option>
                    {ROLE_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </Field>
                <Field label="Arco">
                  <select
                    value={c.arc}
                    onChange={e => updateCard(i, { arc: e.target.value })}
                    className="w-full px-2 py-1 text-sm bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  >
                    <option value="">—</option>
                    {ARC_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </Field>
              </div>
              <Field label="Want (deseo externo)">
                <input
                  type="text"
                  value={c.want}
                  onChange={e => updateCard(i, { want: e.target.value })}
                  className="w-full px-2 py-1 text-sm bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-200"
                />
              </Field>
              <Field label="Need (necesidad interna)">
                <input
                  type="text"
                  value={c.need}
                  onChange={e => updateCard(i, { need: e.target.value })}
                  className="w-full px-2 py-1 text-sm bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-200"
                />
              </Field>
              <Field label="Descripción">
                <textarea
                  value={c.description}
                  onChange={e => updateCard(i, { description: e.target.value })}
                  rows={2}
                  className="w-full px-2 py-1 text-sm bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-200 resize-y"
                />
              </Field>
            </div>
          </div>
        ))}

        <button
          onClick={addCard}
          className="rounded-xl border-2 border-dashed border-slate-300 text-slate-500 hover:border-indigo-300 hover:text-indigo-600 hover:bg-indigo-50/30 p-6 transition text-sm font-medium min-h-[140px]"
        >
          + Añadir personaje
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[10px] uppercase tracking-wide text-slate-500 font-medium mb-0.5">{label}</label>
      {children}
    </div>
  );
}
