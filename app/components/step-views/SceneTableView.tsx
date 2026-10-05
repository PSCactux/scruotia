'use client';
import { useState, useEffect } from 'react';
import { parseScenes, serializeScenes, emptyScene, type Scene } from '@/lib/step-views';

const BEAT_OPTIONS = [
  'Apertura',
  'Setup',
  'Catalizador',
  'Debate',
  'Cruce al Acto 2',
  'Diversión y juegos',
  'B-Story',
  'Midpoint',
  'Los malos aprietan',
  'Todo está perdido',
  'Noche oscura del alma',
  'Cruce al Acto 3',
  'Final',
  'Cierre',
];

const BEAT_COLORS: Record<string, string> = {
  'Apertura': 'bg-slate-100 text-slate-700',
  'Setup': 'bg-blue-100 text-blue-700',
  'Catalizador': 'bg-amber-100 text-amber-700',
  'Debate': 'bg-slate-100 text-slate-700',
  'Cruce al Acto 2': 'bg-amber-100 text-amber-700',
  'Diversión y juegos': 'bg-emerald-100 text-emerald-700',
  'B-Story': 'bg-purple-100 text-purple-700',
  'Midpoint': 'bg-orange-100 text-orange-700',
  'Los malos aprietan': 'bg-rose-100 text-rose-700',
  'Todo está perdido': 'bg-red-100 text-red-700',
  'Noche oscura del alma': 'bg-slate-200 text-slate-800',
  'Cruce al Acto 3': 'bg-amber-100 text-amber-700',
  'Final': 'bg-indigo-100 text-indigo-700',
  'Cierre': 'bg-slate-100 text-slate-700',
};

type FieldDef = { key: keyof Scene; label: string; placeholder?: string; rows?: number };

const ONE_LINE_FIELDS: FieldDef[] = [
  { key: 'chapter', label: 'Capítulo', placeholder: '1, 2, "Prólogo"...' },
  { key: 'pov', label: 'POV', placeholder: 'Personaje narrador' },
  { key: 'charactersPresent', label: 'Personajes presentes', placeholder: 'Aria, Lia, Elias' },
  { key: 'location', label: 'Ubicación', placeholder: 'Mercado del distrito alto' },
  { key: 'targetWords', label: 'Target palabras', placeholder: '800' },
];

const CORE_FIELDS: FieldDef[] = [
  { key: 'whatHappens', label: 'Qué pasa', rows: 2 },
  { key: 'conflict', label: 'Conflicto', rows: 2 },
  { key: 'resolution', label: 'Resolución parcial', rows: 2 },
];

const DENSITY_FIELDS: FieldDef[] = [
  { key: 'emotionalStart', label: 'Estado emocional inicio (POV)' },
  { key: 'emotionalEnd', label: 'Estado emocional fin (POV)' },
  { key: 'newInfo', label: 'Info nueva al lector', rows: 2 },
  { key: 'plant', label: 'Planta (qué siembra)' },
  { key: 'payoff', label: 'Paga (qué cobra)' },
];

export default function SceneTableView({
  value, onChange,
}: { value: string; onChange: (next: string) => void }) {
  const [scenes, setScenes] = useState<Scene[]>(parseScenes(value));
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});

  useEffect(() => { setScenes(parseScenes(value)); }, [value]);

  function persist(next: Scene[]) {
    setScenes(next);
    onChange(serializeScenes(next));
  }

  function update(idx: number, patch: Partial<Scene>) {
    persist(scenes.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  }

  function add() {
    const newIdx = scenes.length;
    persist([...scenes, emptyScene()]);
    setExpanded(e => ({ ...e, [newIdx]: true }));
  }

  function remove(idx: number) {
    persist(scenes.filter((_, i) => i !== idx));
  }

  function move(idx: number, dir: -1 | 1) {
    const next = [...scenes];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    persist(next);
  }

  function toggleExpand(idx: number) {
    setExpanded(e => ({ ...e, [idx]: !e[idx] }));
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between px-1">
        <span className="text-xs uppercase tracking-wide text-slate-500 font-medium">
          Lista de escenas ({scenes.length})
        </span>
        <button
          onClick={add}
          className="px-3 py-1 text-xs bg-indigo-600 hover:bg-indigo-700 text-white rounded-md font-medium transition"
        >
          + Añadir escena
        </button>
      </div>

      {scenes.map((s, i) => {
        const isExpanded = expanded[i] ?? false;
        return (
          <div key={i} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-3 py-2 border-b border-slate-200 bg-slate-50 flex items-center gap-2">
              <span className="text-xs text-slate-500 font-mono w-8">#{i + 1}</span>
              <select
                value={s.beat}
                onChange={e => update(i, { beat: e.target.value })}
                className={`px-2 py-1 text-xs rounded-md border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-200 ${
                  s.beat ? (BEAT_COLORS[s.beat] ?? 'bg-slate-100 text-slate-700') : 'bg-white text-slate-400'
                }`}
              >
                <option value="">— beat —</option>
                {BEAT_OPTIONS.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
              <div className="flex-1" />
              <button onClick={() => toggleExpand(i)} className="text-xs text-indigo-600 hover:text-indigo-800" title={isExpanded ? 'Colapsar' : 'Expandir densidad'}>
                {isExpanded ? '− detalles' : '+ detalles'}
              </button>
              <button onClick={() => move(i, -1)} className="text-slate-400 hover:text-slate-700 text-xs px-1" title="Subir">↑</button>
              <button onClick={() => move(i, 1)} className="text-slate-400 hover:text-slate-700 text-xs px-1" title="Bajar">↓</button>
              <button onClick={() => remove(i)} className="text-slate-400 hover:text-red-600 text-xs px-1" title="Eliminar">✕</button>
            </div>

            <div className="p-3 grid grid-cols-2 md:grid-cols-5 gap-2">
              {ONE_LINE_FIELDS.map(f => (
                <label key={f.key} className="flex flex-col gap-1">
                  <span className="text-[10px] uppercase tracking-wide text-slate-500">{f.label}</span>
                  <input
                    value={s[f.key]}
                    onChange={e => update(i, { [f.key]: e.target.value } as Partial<Scene>)}
                    placeholder={f.placeholder}
                    className="px-2 py-1 text-xs bg-white border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  />
                </label>
              ))}
            </div>

            <div className="px-3 pb-3 grid grid-cols-1 md:grid-cols-3 gap-2">
              {CORE_FIELDS.map(f => (
                <label key={f.key} className="flex flex-col gap-1">
                  <span className="text-[10px] uppercase tracking-wide text-slate-500">{f.label}</span>
                  <textarea
                    value={s[f.key]}
                    onChange={e => update(i, { [f.key]: e.target.value } as Partial<Scene>)}
                    rows={f.rows ?? 2}
                    className="px-2 py-1 text-xs bg-white border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-200 resize-y"
                  />
                </label>
              ))}
            </div>

            {isExpanded && (
              <div className="px-3 pb-3 pt-2 border-t border-slate-100 bg-slate-50/40">
                <div className="text-[10px] uppercase tracking-wide text-slate-500 font-medium mb-2">
                  Densidad para Fase 2 (evita que invente)
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {DENSITY_FIELDS.map(f => (
                    <label key={f.key} className="flex flex-col gap-1">
                      <span className="text-[10px] uppercase tracking-wide text-slate-500">{f.label}</span>
                      <textarea
                        value={s[f.key]}
                        onChange={e => update(i, { [f.key]: e.target.value } as Partial<Scene>)}
                        rows={f.rows ?? 1}
                        className="px-2 py-1 text-xs bg-white border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-200 resize-y"
                      />
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}

      {scenes.length === 0 && (
        <div className="px-3 py-12 text-center text-sm text-slate-500 bg-white rounded-xl border border-slate-200">
          Aún no hay escenas. Charla con la IA o haz click en &ldquo;+ Añadir escena&rdquo; para crear la primera.
        </div>
      )}
    </div>
  );
}
