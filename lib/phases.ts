/**
 * Outline phases — the user-facing progression of an outline. Earlier phases
 * gate later ones; the UI dims/hides Phase N+1 controls until Phase N has
 * enough material. Each phase declares the entity types that "count" toward
 * its progress and a threshold for being considered ready.
 *
 * The point: a writer with no logline shouldn't be sketching scenes yet.
 */

import type { Entity } from './entities';

export type PhaseId = 'semilla' | 'huesos' | 'trama' | 'matices';

export type PhaseDef = {
  id: PhaseId;
  label: string;
  description: string;
  /** Entity types that fill this phase's quota. */
  requires: string[];
  /**
   * How many requires-matching entities (with non-empty bodies) are needed
   * for the phase to be considered "ready" — gates the next phase.
   */
  threshold: number;
  /** A short coaching prompt the AI uses when the user enters this phase. */
  coaching: string;
};

export const PHASES: PhaseDef[] = [
  {
    id: 'semilla',
    label: 'La semilla',
    description: 'La idea base: protagonista, antagonista, conflicto, tono. Sin esto, todo lo demás se construye sobre arena.',
    requires: ['logline', 'personaje', 'conflicto', 'tono'],
    threshold: 3,
    coaching: 'Estamos plantando la semilla. Aterrizamos el protagonista, su antagonista, el conflicto central y la voz narrativa. No nos metemos en escenas todavía.',
  },
  {
    id: 'huesos',
    label: 'Los huesos',
    description: 'Estructura, sinopsis, el mundo y sus reglas. Los huesos de la novela.',
    requires: ['estructura', 'sinopsis', 'mundo', 'regla', 'lugar'],
    threshold: 3,
    coaching: 'Pasamos a los huesos: estructura en 3-5 actos, sinopsis, el mundo y sus reglas inviolables. Los detalles concretos vendrán después.',
  },
  {
    id: 'trama',
    label: 'La trama',
    description: 'Escenas, capítulos, hilos. Aquí la historia toma forma escena a escena.',
    requires: ['escena', 'capitulo', 'hilo'],
    threshold: 5,
    coaching: 'Ya tenemos los huesos. Ahora tróceamos la trama en escenas concretas y capítulos. El objetivo: que cada escena tenga POV, conflicto, qué cambia.',
  },
  {
    id: 'matices',
    label: 'Los matices',
    description: 'Temas, motivos, símbolos, preguntas dramáticas. La capa literaria que hace que la novela diga algo.',
    requires: ['tema', 'motivo', 'pregunta', 'relacion'],
    threshold: 2,
    coaching: 'Última capa: temas, motivos visuales, preguntas dramáticas. Lo que hace que la novela diga algo más allá de la trama.',
  },
];

export const PHASES_BY_ID: Record<PhaseId, PhaseDef> = Object.fromEntries(
  PHASES.map(p => [p.id, p]),
) as Record<PhaseId, PhaseDef>;

/**
 * Counts entities that satisfy each phase. An entity counts when its type is
 * in the phase's `requires` AND its body has substantive content (>20 chars
 * of non-template prose).
 */
export function phaseProgress(entities: Entity[]): Record<PhaseId, { count: number; ready: boolean; phase: PhaseDef }> {
  const out = {} as Record<PhaseId, { count: number; ready: boolean; phase: PhaseDef }>;
  for (const phase of PHASES) {
    const matching = entities.filter(e => {
      if (!phase.requires.includes(e.type)) return false;
      const body = (e.body ?? '').trim();
      if (body.length < 20) return false;
      // Skip bodies that are just the template scaffolding (no actual content).
      const proseLines = body.split('\n').filter(l => {
        const t = l.trim();
        return t && !t.startsWith('#') && !t.startsWith('- ') && !t.startsWith('* ') && !/^\(.*\)$/.test(t);
      });
      const hasProse = proseLines.some(l => l.length > 15);
      const hasFilledBullets = body.split('\n').some(l => /^\s*-\s*\*\*[^:]+:\s*\*\*\s*\S+/.test(l) && !/\(\s*$/.test(l));
      return hasProse || hasFilledBullets;
    });
    out[phase.id] = {
      count: matching.length,
      ready: matching.length >= phase.threshold,
      phase,
    };
  }
  return out;
}

/**
 * The "current" phase is the earliest one that isn't ready yet. If all are
 * ready, the project is in "matices" (the last phase stays current).
 */
export function currentPhase(entities: Entity[]): PhaseId {
  const progress = phaseProgress(entities);
  for (const p of PHASES) if (!progress[p.id].ready) return p.id;
  return 'matices';
}
