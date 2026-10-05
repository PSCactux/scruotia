'use client';
import { useState, useEffect } from 'react';
import { parseVoiceStyle, serializeVoiceStyle, type VoiceStyle } from '@/lib/step-views';

const PERSON_OPTIONS = ['1ª persona', '3ª limitada', '3ª omnisciente'];
const TENSE_OPTIONS = ['pasado', 'presente'];
const REGISTER_OPTIONS = ['coloquial', 'neutro', 'culto', 'literario', 'infantil'];
const PACING_OPTIONS = ['rápido', 'medio', 'reflexivo'];
const POV_OPTIONS = ['fijo en un personaje', 'rotativo entre varios'];

type SelectField = {
  key: keyof Pick<VoiceStyle, 'person' | 'tense' | 'register' | 'pacing' | 'pov'>;
  label: string;
  options: string[];
};

const SELECTS: SelectField[] = [
  { key: 'person', label: 'Persona', options: PERSON_OPTIONS },
  { key: 'tense', label: 'Tiempo verbal', options: TENSE_OPTIONS },
  { key: 'register', label: 'Registro', options: REGISTER_OPTIONS },
  { key: 'pacing', label: 'Ritmo', options: PACING_OPTIONS },
  { key: 'pov', label: 'POV', options: POV_OPTIONS },
];

export default function VoiceStyleView({
  value, onChange,
}: { value: string; onChange: (next: string) => void }) {
  const [v, setV] = useState<VoiceStyle>(parseVoiceStyle(value));

  useEffect(() => { setV(parseVoiceStyle(value)); }, [value]);

  function persist(next: VoiceStyle) {
    setV(next);
    onChange(serializeVoiceStyle(next));
  }

  function update<K extends keyof VoiceStyle>(key: K, val: string) {
    persist({ ...v, [key]: val });
  }

  return (
    <div className="space-y-3">
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 py-2 border-b border-slate-200 bg-slate-50">
          <span className="text-xs uppercase tracking-wide text-slate-500 font-medium">Parámetros narrativos</span>
        </div>
        <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {SELECTS.map(({ key, label, options }) => (
            <label key={key} className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wide text-slate-500">{label}</span>
              <select
                value={v[key]}
                onChange={e => update(key, e.target.value)}
                className="px-2 py-1.5 text-sm bg-white border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-200"
              >
                <option value="">— elegir —</option>
                {options.map(o => <option key={o} value={o}>{o}</option>)}
                {v[key] && !options.includes(v[key]) && <option value={v[key]}>{v[key]} (custom)</option>}
              </select>
            </label>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 py-2 border-b border-slate-200 bg-slate-50">
          <span className="text-xs uppercase tracking-wide text-slate-500 font-medium">Muestra de tono (3-6 frases)</span>
        </div>
        <textarea
          value={v.sample}
          onChange={e => update('sample', e.target.value)}
          placeholder="Escribe (o pídele a la IA) un párrafo que ejemplifique el tono exacto que quieres en Fase 2."
          rows={6}
          className="w-full p-4 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none resize-y min-h-[120px]"
        />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 py-2 border-b border-slate-200 bg-slate-50">
          <span className="text-xs uppercase tracking-wide text-slate-500 font-medium">Notas (opcional)</span>
        </div>
        <textarea
          value={v.notes}
          onChange={e => update('notes', e.target.value)}
          placeholder="Longitud objetivo de capítulo, qué evitar, recurrencias estilísticas, referencias..."
          rows={4}
          className="w-full p-4 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none resize-y min-h-[80px]"
        />
      </div>
    </div>
  );
}
