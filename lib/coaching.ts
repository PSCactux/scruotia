import type { Entity } from './entities';

export type Suggestion = { label: string; prompt: string };

/**
 * Looks at the current entity graph and proposes 0-6 next-step prompts the
 * user can fire with one click. Deterministic — no LLM call. The list orders
 * by what's missing first (logline → personajes → conflicto → tono → ...).
 */
export function computeSuggestions(entities: Entity[]): Suggestion[] {
  const counts: Record<string, number> = {};
  for (const e of entities) counts[e.type] = (counts[e.type] ?? 0) + 1;

  const out: Suggestion[] = [];

  if ((counts['logline'] ?? 0) === 0) {
    out.push({
      label: '🪧 Resumir en una frase',
      prompt: 'Vamos a destilar la idea en una logline de máximo 15 palabras. ¿Cuál sería?',
    });
  }
  if ((counts['personaje'] ?? 0) < 2) {
    out.push({
      label: '👤 Definir personajes',
      prompt: '¿Quiénes son los personajes principales? Para cada uno: ¿qué quiere y qué le impide tenerlo?',
    });
  }
  if ((counts['conflicto'] ?? 0) === 0 && (counts['personaje'] ?? 0) >= 1) {
    out.push({
      label: '⚔️ Definir conflicto',
      prompt: '¿Cuál es el conflicto central? ¿Qué fuerza se opone al protagonista?',
    });
  }
  if ((counts['tono'] ?? 0) === 0 && entities.length >= 2) {
    out.push({
      label: '🎨 Tono y voz',
      prompt: '¿Cómo quieres que suene la novela? Persona, tiempo verbal, registro, ejemplo de párrafo.',
    });
  }
  if ((counts['lugar'] ?? 0) === 0 && (counts['personaje'] ?? 0) >= 1) {
    out.push({
      label: '📍 Lugares',
      prompt: '¿Dónde transcurre la historia? Descríbeme los lugares clave.',
    });
  }
  if ((counts['mundo'] ?? 0) === 0 && (counts['regla'] ?? 0) === 0 && entities.length >= 4) {
    out.push({
      label: '🌍 Canon del mundo',
      prompt: 'Hablemos del mundo: reglas inviolables, sistema, vocabulario propio.',
    });
  }
  if ((counts['estructura'] ?? 0) === 0 && (counts['personaje'] ?? 0) >= 1 && (counts['conflicto'] ?? 0) >= 1) {
    out.push({
      label: '🏗️ Estructura',
      prompt: 'Hablemos de la estructura: setup, 3 disastros, resolución.',
    });
  }
  if ((counts['escena'] ?? 0) === 0 && (counts['estructura'] ?? 0) >= 1) {
    out.push({
      label: '🎬 Sketchar primeras escenas',
      prompt: 'Empecemos a sketchar escenas. ¿Cuál es la escena de apertura?',
    });
  }
  if (out.length === 0 && entities.length > 0) {
    // Story is well-covered — offer expansion suggestions.
    out.push({
      label: '✨ Profundizar lo que tengo',
      prompt: 'La bible está bastante completa. ¿Por dónde profundizarías para que la Fase 2 no invente nada?',
    });
    out.push({
      label: '🔍 Audita y dime qué falla',
      prompt: 'Repasa todo lo que hemos definido y dime qué incoherencias, cabos sueltos o huecos ves.',
    });
  }

  return out;
}
