'use client';
import { useState } from 'react';
import { getTypeDef } from '@/lib/entity-types';
import type { Pulse } from '@/lib/pulse';

type Props = {
  pulse: Pulse;
  /** Called when the user clicks "Resolver con IA" on a ghost/pendiente. */
  onAction?: (prompt: string) => void;
  /** Called when the user clicks an entity to focus it. */
  onFocus?: (id: string) => void;
};

/**
 * Story Pulse — always-visible health strip in the project header. Click
 * the strip to expand a drawer with actionable detail. Drives the user to
 * fix gaps (ghosts, pendientes, broken links) without leaving the page.
 *
 * Lives at the top of the project view, between header and chat/canvas.
 */
export default function StoryPulse({ pulse, onAction, onFocus }: Props) {
  const [open, setOpen] = useState(false);
  const pct = Math.round(pulse.overall * 100);
  return (
    <>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full px-6 py-2 bg-gradient-to-r from-slate-50 via-white to-slate-50 hover:from-indigo-50/40 hover:to-indigo-50/40 transition flex items-center gap-4 border-b border-slate-200 group"
        title="Click para ver el detalle"
      >
        <span className="text-[10px] uppercase tracking-widest text-slate-500 font-bold shrink-0">Pulso</span>
        <div className="flex-1 flex items-center gap-2 min-w-0">
          {pulse.phases.map(p => (
            <div key={p.id} className="flex-1 group/phase" title={`${p.label} — ${p.count}/${p.threshold}`}>
              <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all ${
                    p.coverage >= 1 ? 'bg-emerald-500' :
                    p.coverage > 0 ? (p.current ? 'bg-indigo-500' : 'bg-indigo-300') :
                    'bg-slate-200'
                  }`}
                  style={{ width: `${Math.max(4, p.coverage * 100)}%` }}
                />
              </div>
              <div className={`mt-0.5 text-[10px] font-semibold truncate text-left ${
                p.current ? 'text-indigo-700' : p.coverage >= 1 ? 'text-emerald-700' : 'text-slate-500'
              }`}>
                {p.label.replace('La ', '').replace('Los ', '')}
                {p.current && ' ●'}
                <span className="text-slate-400 ml-1">{p.count}/{p.threshold}</span>
              </div>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2 pl-3 border-l border-slate-200 shrink-0">
          <span className="text-xs font-mono text-slate-700">{pct}%</span>
          {pulse.issueCount > 0 && (
            <span className="px-2 py-0.5 bg-amber-100 border border-amber-300 text-amber-800 rounded-full text-[10px] font-bold">
              {pulse.issueCount} {pulse.issueCount === 1 ? 'aviso' : 'avisos'}
            </span>
          )}
          <span className={`text-slate-400 text-sm transition-transform ${open ? 'rotate-180' : ''}`}>▾</span>
        </div>
      </button>

      {open && <PulseDrawer pulse={pulse} onClose={() => setOpen(false)} onAction={onAction} onFocus={onFocus} />}
    </>
  );
}

function PulseDrawer({ pulse, onClose, onAction, onFocus }: {
  pulse: Pulse; onClose: () => void;
  onAction?: (prompt: string) => void;
  onFocus?: (id: string) => void;
}) {
  return (
    <div className="fixed inset-0 z-40 bg-slate-900/30 backdrop-blur-sm animate-fade-in" onClick={onClose}>
      <div
        className="absolute top-[110px] left-0 right-0 bg-white border-b-2 border-slate-200 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="max-w-6xl mx-auto px-6 py-5">
          <div className="grid grid-cols-3 gap-6">
            <PulseColumn title="Fases" icon="🌱" emptyLabel="" count={pulse.phases.length}>
              {pulse.phases.map(p => (
                <div key={p.id} className="text-sm">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`font-semibold flex-1 ${p.current ? 'text-indigo-800' : 'text-slate-800'}`}>
                      {p.label}{p.current && ' ●'}
                    </span>
                    <span className="text-xs text-slate-500 font-mono">{p.count}/{p.threshold}</span>
                  </div>
                  <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${p.coverage >= 1 ? 'bg-emerald-500' : 'bg-indigo-400'}`}
                      style={{ width: `${Math.max(2, p.coverage * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </PulseColumn>

            <PulseColumn title={`Entidades vacías (${pulse.ghosts.length})`} icon="👻" emptyLabel="✓ Sin entidades fantasma" count={pulse.ghosts.length}>
              {pulse.ghosts.map(g => {
                const def = getTypeDef(g.type);
                const prompt = `La entidad ${g.id} ("${g.name}") está casi vacía. Rellena su ficha con detalles concretos que encajen con lo que ya sabemos del proyecto. Emite el bloque <<<CARD:${g.id.replace('/', ':')}>>> con el body completo.`;
                return (
                  <button
                    key={g.id}
                    onClick={() => { onAction?.(prompt); onClose(); }}
                    className="w-full text-left p-2.5 rounded-lg border-2 border-amber-200 bg-amber-50/60 hover:border-amber-400 hover:bg-amber-50 transition"
                  >
                    <div className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
                      <span>{def.icon}</span><span>{g.name}</span>
                    </div>
                    <div className="text-xs text-slate-600 mt-0.5">{ghostReasonLabel(g.reason)}</div>
                    <div className="mt-1.5 text-[11px] text-indigo-700 font-bold">✨ Pedir a la IA que la rellene →</div>
                  </button>
                );
              })}
            </PulseColumn>

            <PulseColumn title={`Pendientes (${pulse.pendientes.length})`} icon="📝" emptyLabel="✓ Sin pendientes" count={pulse.pendientes.length}>
              {pulse.pendientes.map(p => {
                const def = getTypeDef(p.type);
                const prompt = `En ${p.type}/${p.id.split('/')[1]} ("${p.name}") hay un pendiente: "${p.text}". Resuélvelo de forma concreta — propón la decisión que mejor encaja con la historia y emite el <<<CARD:...>>> actualizado.`;
                return (
                  <button
                    key={p.id}
                    onClick={() => { onAction?.(prompt); onClose(); }}
                    className="w-full text-left p-2.5 rounded-lg border-2 border-violet-200 bg-violet-50/60 hover:border-violet-400 hover:bg-violet-50 transition"
                  >
                    <div className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
                      <span>{def.icon}</span><span>{p.name}</span>
                    </div>
                    <div className="text-xs text-slate-700 mt-0.5 italic line-clamp-2">&quot;{p.text}&quot;</div>
                    <div className="mt-1.5 text-[11px] text-indigo-700 font-bold">✨ Resolver con IA →</div>
                  </button>
                );
              })}
            </PulseColumn>
          </div>

          {pulse.brokenLinks.length > 0 && (
            <div className="mt-5 pt-4 border-t border-slate-100">
              <div className="text-[11px] uppercase tracking-wider text-rose-600 font-bold mb-1.5 flex items-center gap-1.5">
                <span>🔗</span><span>Links rotos ({pulse.brokenLinks.length})</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {pulse.brokenLinks.map((bl, i) => (
                  <button
                    key={i}
                    onClick={() => { onFocus?.(bl.from); onClose(); }}
                    className="text-xs px-2 py-1 bg-rose-50 border border-rose-200 text-rose-900 rounded-md font-mono hover:bg-rose-100 transition"
                    title="Ver entidad origen"
                  >
                    {bl.from} → {bl.to}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <button
          onClick={onClose}
          className="absolute top-3 right-4 w-8 h-8 rounded-lg hover:bg-slate-100 text-slate-500 flex items-center justify-center"
          title="Cerrar"
        >✕</button>
      </div>
    </div>
  );
}

function PulseColumn({ title, icon, emptyLabel, count, children }: {
  title: string; icon: string; emptyLabel: string; count: number; children: React.ReactNode;
}) {
  return (
    <div>
      <h3 className="text-[11px] uppercase tracking-wider text-slate-600 font-bold mb-2 flex items-center gap-1.5">
        <span>{icon}</span><span>{title}</span>
      </h3>
      {count === 0
        ? <div className="text-xs text-slate-400 italic px-2 py-3">{emptyLabel}</div>
        : <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">{children}</div>}
    </div>
  );
}

function ghostReasonLabel(r: 'empty-body' | 'template-only' | 'no-prose'): string {
  if (r === 'empty-body') return 'Sin contenido — solo metadata.';
  if (r === 'template-only') return 'Solo el template, sin valores rellenos.';
  return 'Sin prosa ni datos concretos.';
}
