'use client';
import { useState, useEffect } from 'react';
import { parseWorldCanon, serializeWorldCanon, type WorldCanon } from '@/lib/step-views';

type Section = {
  key: keyof WorldCanon;
  heading: string;
  placeholder: string;
  emphasis?: boolean;
};

const SECTIONS: Section[] = [
  { key: 'places', heading: 'Lugares', placeholder: 'Descripción física de los lugares clave (ciudades, paisajes, edificios). Sin esto Fase 2 inventa cada decorado.' },
  { key: 'system', heading: 'Sistema', placeholder: 'Reglas del sistema mágico, tecnológico o social. Cómo funciona y qué cuesta.' },
  { key: 'vocabulary', heading: 'Vocabulario', placeholder: 'Términos propios del mundo con definición breve (palabras inventadas, jerga, títulos).' },
  { key: 'fauna', heading: 'Fauna y cultura', placeholder: 'Animales, criaturas, costumbres distintivas del entorno.' },
  { key: 'customs', heading: 'Costumbres', placeholder: 'Rituales, normas sociales, festividades que influyen en la trama.' },
  { key: 'calendar', heading: 'Calendario', placeholder: 'Estructura del año, meses, días, estaciones si difieren del mundo real.' },
  { key: 'rules', heading: 'Reglas inviolables', placeholder: 'Verdades del mundo que NO pueden romperse en ninguna escena. Fase 2 las tratará como dogma.', emphasis: true },
];

export default function WorldCanonView({
  value, onChange,
}: { value: string; onChange: (next: string) => void }) {
  const [w, setW] = useState<WorldCanon>(parseWorldCanon(value));

  useEffect(() => { setW(parseWorldCanon(value)); }, [value]);

  function persist(next: WorldCanon) {
    setW(next);
    onChange(serializeWorldCanon(next));
  }

  function update<K extends keyof WorldCanon>(key: K, val: string) {
    persist({ ...w, [key]: val });
  }

  return (
    <div className="space-y-3">
      {SECTIONS.map(({ key, heading, placeholder, emphasis }) => (
        <div
          key={key}
          className={`bg-white rounded-xl border shadow-sm overflow-hidden ${
            emphasis ? 'border-amber-300 ring-1 ring-amber-100' : 'border-slate-200'
          }`}
        >
          <div className={`px-4 py-2 border-b ${
            emphasis ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-slate-50'
          }`}>
            <span className={`text-xs uppercase tracking-wide font-medium ${
              emphasis ? 'text-amber-800' : 'text-slate-500'
            }`}>{heading}</span>
          </div>
          <textarea
            value={w[key]}
            onChange={e => update(key, e.target.value)}
            placeholder={placeholder}
            rows={4}
            className="w-full p-4 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none resize-y min-h-[80px]"
          />
        </div>
      ))}
    </div>
  );
}
