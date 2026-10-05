/**
 * Helpers that translate the underlying entity graph into a narrative view:
 * human-readable essences, prose previews, beat progress, status summaries.
 *
 * The user-facing canvas talks about "who / where / what happens" — never
 * about types, slugs, templates, or links. These helpers are the bridge.
 */

import type { Entity } from './entities';

/**
 * Returns the single-line "essence" of a personaje for the gallery view.
 * Strategy:
 *  1. Find the first prose line in the body that isn't a bullet, a heading,
 *     or a "**Pendiente:**" line. The personaje template tells the AI to
 *     write a short paragraph of character right after the bullets — that's
 *     what we want here.
 *  2. Take the first sentence of that prose (split on . ? !).
 *  3. Fall back to: the Want bullet ("quiere X"), or just the name.
 */
export function extractEssence(e: Entity): string {
  const body = (e.body ?? '').trim();
  if (!body) return '';

  const lines = body.split('\n');
  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    if (t.startsWith('#')) continue;            // ## Heading
    if (t.startsWith('- ') || t.startsWith('* ')) continue; // bullet
    if (/^\*\*Pendiente/i.test(t)) continue;    // **Pendiente:** ...
    if (/^\(.*\)$/.test(t)) continue;           // (Parenthetical template hint)
    // Found a prose line. Return the first sentence.
    const firstSentence = t.split(/[.?!]/)[0].trim();
    if (firstSentence.length > 10) return firstSentence.slice(0, 140);
    return t.slice(0, 140);
  }

  // Fallback to "want" bullet.
  const wantMatch = body.match(/\*\*\s*Want[^:]*:\s*\*\*\s*([^\n]+)/i);
  if (wantMatch) {
    const w = wantMatch[1].trim().split(/[.?!]/)[0].trim();
    if (w && !/^\(.*\)$/.test(w)) return `quiere ${w}`.slice(0, 140);
  }

  return '';
}

/** Pull a human role label from a personaje body's **Rol:** bullet. */
export function extractRole(e: Entity): string | null {
  const m = e.body.match(/\*\*\s*Rol\s*:\s*\*\*\s*([^\n(]+)/i);
  if (!m) return null;
  const r = m[1].trim().toLowerCase();
  if (!r || /^\(/.test(r)) return null;
  // Map common english template tokens to human Spanish.
  if (r.includes('protagonist')) return 'protagonista';
  if (r.includes('antagonist')) return 'antagonista';
  if (r.includes('deuteragonist')) return 'deuteragonista';
  if (r.includes('mentor')) return 'mentor';
  if (r.includes('rival')) return 'rival';
  if (r.includes('supporting')) return 'secundario';
  return r.slice(0, 30);
}

/**
 * Synthesizes a single short paragraph describing the current state of the
 * story. Pure derivation from entity counts + key essences — no LLM call.
 * The shape stays calm and human ("Aria es una cartógrafa...") rather than
 * statistical ("3 personajes, 1 conflicto...").
 */
export function liveSummary(entities: Entity[], projectTitle: string): string {
  if (entities.length === 0) {
    return `Tu historia aún está vacía. Cuéntale a la IA de qué quieres que vaya — los personajes y el mundo irán apareciendo aquí.`;
  }

  const personajes = entities.filter(e => e.type === 'personaje');
  const protagonista = personajes.find(p => /protagonist/i.test(p.body)) ?? personajes[0];
  const antagonista = personajes.find(p => /antagonist/i.test(p.body) || /rival/i.test(p.body));

  const conflictos = entities.filter(e => e.type === 'conflicto');
  const tono = entities.find(e => e.type === 'tono');
  const mundo = entities.find(e => e.type === 'mundo');
  const logline = entities.find(e => e.type === 'logline');
  const escenas = entities.filter(e => e.type === 'escena');

  const parts: string[] = [];

  if (logline && logline.body.trim()) {
    // Use the logline directly if present — most evocative summary.
    parts.push(logline.body.trim().split('\n')[0]);
  } else if (protagonista) {
    const essence = extractEssence(protagonista);
    if (essence) parts.push(`${protagonista.name} es ${essence.toLowerCase()}.`);
    else parts.push(`${protagonista.name} está en el centro de la historia.`);
  } else {
    parts.push(`Tu historia "${projectTitle}" está tomando forma.`);
  }

  // Layer in conflict if we have it but no logline (logline already covers it).
  if (!logline && conflictos.length > 0 && antagonista) {
    parts.push(`Se enfrenta a ${antagonista.name}.`);
  }

  // Status line.
  const status = storyStatus({ personajes: personajes.length, conflictos: conflictos.length, hasTono: !!tono, hasMundo: !!mundo, escenas: escenas.length });
  if (status) parts.push(status);

  return parts.join(' ');
}

function storyStatus({ personajes, conflictos, hasTono, hasMundo, escenas }: {
  personajes: number; conflictos: number; hasTono: boolean; hasMundo: boolean; escenas: number;
}): string {
  const missing: string[] = [];
  if (personajes < 2) missing.push('algún personaje secundario');
  if (conflictos === 0) missing.push('el conflicto central');
  if (!hasTono) missing.push('el tono y la voz');
  if (!hasMundo) missing.push('el canon del mundo');
  if (missing.length === 0 && escenas === 0) return 'Las bases están cubiertas — buen momento para empezar a sketchar escenas.';
  if (missing.length === 0) return 'Las bases están cubiertas y la trama empieza a tomar forma.';
  if (missing.length === 1) return `Aún falta ${missing[0]}.`;
  return `Aún faltan: ${missing.slice(0, -1).join(', ')} y ${missing[missing.length - 1]}.`;
}

/**
 * Parses the estructura/main entity body into beat completion ticks.
 * Returns 5 beats in order: Setup, Disastro 1, Midpoint (Disastro 2),
 * Disastro 3, Resolución. Each tells whether it has substantive content.
 */
export type Beat = { label: string; key: string; done: boolean };

export function extractBeats(estructura: Entity | undefined): Beat[] {
  const beats: Beat[] = [
    { label: 'Setup', key: 'setup', done: false },
    { label: 'Disastro 1', key: 'd1', done: false },
    { label: 'Midpoint', key: 'mid', done: false },
    { label: 'Disastro 3', key: 'd3', done: false },
    { label: 'Resolución', key: 'res', done: false },
  ];
  if (!estructura || !estructura.body.trim()) return beats;

  const sections = estructura.body.split(/(?:^|\n)##\s+/).slice(1);
  for (const sec of sections) {
    const newlineIdx = sec.indexOf('\n');
    const heading = (newlineIdx === -1 ? sec : sec.slice(0, newlineIdx)).trim().toLowerCase();
    const body = (newlineIdx === -1 ? '' : sec.slice(newlineIdx + 1)).trim();
    if (!body || body.length < 25) continue;
    if (/^\(.*\)$/.test(body)) continue; // template placeholder
    if (heading.startsWith('setup') || heading.startsWith('acto 1')) beats[0].done = true;
    else if (heading.includes('disastro 1') || heading.includes('catalizador')) beats[1].done = true;
    else if (heading.includes('midpoint') || heading.includes('disastro 2') || heading.includes('acto 2b') || heading.includes('acto 2a')) beats[2].done = true;
    else if (heading.includes('disastro 3') || heading.includes('todo está perdido') || heading.includes('noche oscura')) beats[3].done = true;
    else if (heading.startsWith('resoluci') || heading.startsWith('acto 3') || heading.includes('cierre')) beats[4].done = true;
  }
  return beats;
}

/**
 * Pulls a short prose preview from a mundo or sinopsis entity. Strips
 * template scaffolding (headings, parenthetical hints, empty fields) and
 * returns the first 2-3 sentences of actual prose.
 */
export function prosePreview(e: Entity | undefined, maxChars = 280): string {
  if (!e || !e.body.trim()) return '';
  const lines = e.body.split('\n');
  const prose: string[] = [];
  let pickedChars = 0;
  for (const line of lines) {
    const t = line.trim();
    if (!t) {
      if (prose.length > 0 && pickedChars > 80) break;
      continue;
    }
    if (t.startsWith('#')) continue;
    if (t.startsWith('- ') || t.startsWith('* ')) continue;
    if (/^\*\*Pendiente/i.test(t)) break;
    if (/^\(.*\)$/.test(t)) continue;
    prose.push(t);
    pickedChars += t.length;
    if (pickedChars > maxChars) break;
  }
  const joined = prose.join(' ').replace(/\s+/g, ' ').trim();
  if (joined.length <= maxChars) return joined;
  // Clip on the last sentence boundary before maxChars.
  const clipped = joined.slice(0, maxChars);
  const lastDot = Math.max(clipped.lastIndexOf('.'), clipped.lastIndexOf('?'), clipped.lastIndexOf('!'));
  return lastDot > maxChars * 0.5 ? clipped.slice(0, lastDot + 1) : clipped + '…';
}
