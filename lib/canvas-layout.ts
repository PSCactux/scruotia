/**
 * Groups entity types into 4 layout zones for the v3 canvas. The "spine"
 * zone is always visible — these are the essentials a writer thinks about
 * every day. The other three zones live behind collapsible accordions so
 * the canvas never overwhelms with 30+ cards at once.
 */

export type CanvasZone = {
  id: 'espina' | 'estructura' | 'mundo' | 'trama' | 'detalles';
  label: string;
  icon: string;
  /** Type ids that belong to this zone. */
  types: string[];
  /** When true, the zone renders inline (no accordion wrapper). */
  alwaysOpen: boolean;
  /** A short subtitle shown in the accordion header. */
  description?: string;
};

export const CANVAS_ZONES: CanvasZone[] = [
  {
    id: 'espina',
    label: 'Espina dorsal',
    icon: '✨',
    types: ['logline', 'personaje', 'conflicto', 'tono'],
    alwaysOpen: true,
  },
  {
    id: 'estructura',
    label: 'Estructura',
    icon: '🏗️',
    types: ['estructura', 'sinopsis', 'tema', 'pregunta'],
    alwaysOpen: false,
    description: 'Backbone narrativo, sinopsis, temas y preguntas dramáticas',
  },
  {
    id: 'mundo',
    label: 'Mundo y reglas',
    icon: '🌍',
    types: ['mundo', 'regla', 'lugar', 'faccion', 'objeto', 'relacion', 'motivo'],
    alwaysOpen: false,
    description: 'Canon, lugares, facciones, objetos, relaciones',
  },
  {
    id: 'trama',
    label: 'Trama y escenas',
    icon: '🎬',
    types: ['hilo', 'capitulo', 'escena'],
    alwaysOpen: false,
    description: 'Hilos, capítulos y escenas concretas',
  },
];

/** Returns the zone id for a given entity type. Unknown types → 'detalles'. */
export function zoneForType(typeId: string): CanvasZone['id'] {
  for (const z of CANVAS_ZONES) {
    if (z.types.includes(typeId)) return z.id;
  }
  return 'detalles';
}

/** When the AI just touched an entity in a collapsed zone, we'll auto-open it. */
export function zoneForTouchedIds(touchedIds: string[]): Set<CanvasZone['id']> {
  const out = new Set<CanvasZone['id']>();
  for (const id of touchedIds) {
    const type = id.split('/')[0];
    if (!type) continue;
    out.add(zoneForType(type));
  }
  return out;
}
