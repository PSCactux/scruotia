'use client';
import { useMemo } from 'react';
import { getTypeDef } from '@/lib/entity-types';
import type { Entity } from '@/lib/entities';

/**
 * Core types we count toward "story coverage". The user can ignore them, but
 * a story with zero of these is incomplete in a way worth surfacing.
 */
const CORE_TYPES = ['logline', 'personaje', 'conflicto', 'tono', 'lugar', 'escena'] as const;

export default function StoryStatus({
  entities, tagline,
}: { entities: Entity[]; tagline?: string | null }) {
  const stats = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const e of entities) counts[e.type] = (counts[e.type] ?? 0) + 1;

    const filledCore = CORE_TYPES.filter(t => (counts[t] ?? 0) > 0);
    const missingCore = CORE_TYPES.filter(t => (counts[t] ?? 0) === 0);
    const totalLocked = entities.filter(e => e.status === 'locked').length;
    const coveragePct = Math.round((filledCore.length / CORE_TYPES.length) * 100);

    return { counts, filledCore, missingCore, totalLocked, coveragePct };
  }, [entities]);

  const { filledCore, missingCore, totalLocked, coveragePct } = stats;

  return (
    <div className="px-5 pt-4 pb-3 border-b-2 border-slate-200 bg-gradient-to-br from-indigo-50 to-white">
      {/* Tagline — single-line story summary, always visible when logline exists. */}
      {tagline && (
        <div className="mb-3 text-[13px] text-slate-700 leading-snug italic line-clamp-2 border-l-2 border-indigo-300 pl-2.5">
          {tagline}
        </div>
      )}

      <div className="flex items-center justify-between mb-2">
        <h2 className="font-bold text-slate-900 text-sm">Cobertura</h2>
        <div className="flex items-center gap-2 text-xs font-medium text-slate-600">
          <span className="text-slate-700 font-bold">{coveragePct}%</span>
          <span className="text-slate-400">·</span>
          <span>
            <span className="text-slate-900 font-bold">{entities.length}</span> {entities.length === 1 ? 'tarjeta' : 'tarjetas'}
          </span>
          {totalLocked > 0 && (
            <span className="px-1.5 py-0.5 bg-amber-100 text-amber-800 rounded-full">🔒 {totalLocked}</span>
          )}
        </div>
      </div>

      {/* Coverage segmented bar */}
      <div className="flex gap-1 mb-1.5">
        {CORE_TYPES.map(t => {
          const def = getTypeDef(t);
          const filled = filledCore.includes(t);
          return (
            <div
              key={t}
              title={`${def.icon} ${def.label} — ${filled ? '✓' : 'falta'}`}
              className={`flex-1 h-2 rounded-full transition ${
                filled
                  ? 'bg-indigo-500 shadow-sm'
                  : 'bg-slate-200 border border-slate-300'
              }`}
            />
          );
        })}
      </div>
      <div className="text-[11px] text-slate-500">
        {missingCore.length > 0 ? (
          <span>Falta: <span className="text-sm">{missingCore.map(t => getTypeDef(t).icon).join(' ')}</span></span>
        ) : (
          <span className="text-emerald-700 font-semibold">✓ Bases cubiertas</span>
        )}
      </div>
    </div>
  );
}
