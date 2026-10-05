/**
 * Story Pulse — deterministic health diagnosis of a project. No LLM call.
 * Cheap enough to run on every entity change. Surfaces "what's missing /
 * broken / pending" so the user sees the state of their bible without
 * asking for an audit.
 *
 * This is the engine; UI lives in `app/components/StoryPulse.tsx`.
 */

import type { Entity } from './entities';
import { PHASES, type PhaseId } from './phases';
import { parseBody } from './body-fields';

export type PhasePulse = {
  id: PhaseId;
  label: string;
  /** 0..1 — count of phase-relevant entities with substantive bodies / threshold. */
  coverage: number;
  count: number;
  threshold: number;
  /** True when this is the earliest non-ready phase — the one the user should focus on. */
  current: boolean;
};

export type GhostEntity = {
  id: string;              // "type/slug"
  name: string;
  type: string;
  reason: 'empty-body' | 'template-only' | 'no-prose';
};

export type Pendiente = {
  id: string;
  name: string;
  type: string;
  text: string;
};

export type BrokenLink = {
  from: string;
  to: string;
  label?: string;
};

export type Pulse = {
  phases: PhasePulse[];
  /** Overall coverage 0..1 — average of phase coverages. */
  overall: number;
  ghosts: GhostEntity[];
  pendientes: Pendiente[];
  brokenLinks: BrokenLink[];
  /** Sum of actionable issues (ghosts + pendientes + brokenLinks). */
  issueCount: number;
};

/**
 * An entity counts toward phase coverage when (a) its type matches the phase
 * requirements and (b) its body has substantive content — prose ≥ 15 chars
 * or at least one filled-in bullet (a bullet whose value is non-empty and
 * doesn't look like a parenthetical placeholder).
 */
function hasSubstance(body: string): boolean {
  const trimmed = (body ?? '').trim();
  if (trimmed.length < 20) return false;
  const parsed = parseBody(trimmed);
  if (parsed.intro && parsed.intro.length > 15) return true;
  if (parsed.trailingProse && parsed.trailingProse.length > 15) return true;
  if (parsed.sections.some(s => s.body.trim().length > 15)) return true;
  for (const f of parsed.fields) {
    const v = f.value.trim();
    if (!v) continue;
    if (/^\(.*\)$/.test(v)) continue;          // pure parenthetical placeholder
    if (v.length > 2) return true;
  }
  return false;
}

/** Detect "ghost" entities — exist but have no real content. */
function isGhost(entity: Entity): GhostEntity | null {
  const body = (entity.body ?? '').trim();
  const id = `${entity.type}/${entity.slug}`;
  if (body.length === 0) return { id, name: entity.name, type: entity.type, reason: 'empty-body' };
  if (body.length < 40) return { id, name: entity.name, type: entity.type, reason: 'empty-body' };
  const parsed = parseBody(body);
  // All bullets look like placeholders `(...)` and no prose / sections.
  const allPlaceholder = parsed.fields.length > 0
    && parsed.fields.every(f => !f.value.trim() || /^\(.*\)$/.test(f.value.trim()));
  if (allPlaceholder && !parsed.intro && !parsed.trailingProse && parsed.sections.every(s => !s.body.trim())) {
    return { id, name: entity.name, type: entity.type, reason: 'template-only' };
  }
  if (!hasSubstance(body)) return { id, name: entity.name, type: entity.type, reason: 'no-prose' };
  return null;
}

export function computePulse(entities: Entity[]): Pulse {
  const idSet = new Set(entities.map(e => `${e.type}/${e.slug}`));

  // Phase coverage — mirrors lib/phases.phaseProgress but produces UI-ready shape.
  const substantialByType: Record<string, number> = {};
  for (const e of entities) if (hasSubstance(e.body)) {
    substantialByType[e.type] = (substantialByType[e.type] ?? 0) + 1;
  }
  let earliestNonReady: PhaseId | null = null;
  const phases: PhasePulse[] = PHASES.map(p => {
    const count = p.requires.reduce((sum, t) => sum + (substantialByType[t] ?? 0), 0);
    const coverage = Math.min(1, count / p.threshold);
    const ready = count >= p.threshold;
    if (!ready && !earliestNonReady) earliestNonReady = p.id;
    return { id: p.id, label: p.label, coverage, count, threshold: p.threshold, current: false };
  });
  const currentId: PhaseId = earliestNonReady ?? 'matices';
  for (const p of phases) p.current = p.id === currentId;

  const overall = phases.reduce((s, p) => s + p.coverage, 0) / phases.length;

  // Ghosts.
  const ghosts: GhostEntity[] = [];
  for (const e of entities) {
    const g = isGhost(e);
    if (g) ghosts.push(g);
  }

  // Pendientes.
  const pendientes: Pendiente[] = [];
  for (const e of entities) {
    const parsed = parseBody(e.body);
    const text = parsed.pendiente.trim();
    if (text && !/^\(.*\)$/.test(text)) {
      pendientes.push({ id: `${e.type}/${e.slug}`, name: e.name, type: e.type, text });
    }
  }

  // Broken links — point to a `type/slug` that does not exist.
  const brokenLinks: BrokenLink[] = [];
  for (const e of entities) {
    for (const l of e.links) {
      if (!idSet.has(l.to)) {
        brokenLinks.push({ from: `${e.type}/${e.slug}`, to: l.to, label: l.label });
      }
    }
  }

  return {
    phases,
    overall,
    ghosts,
    pendientes,
    brokenLinks,
    issueCount: ghosts.length + pendientes.length + brokenLinks.length,
  };
}
