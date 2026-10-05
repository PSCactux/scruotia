import { NextRequest } from 'next/server';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { PROJECTS_ROOT } from '@/lib/config';
import { listEntities } from '@/lib/entities';
import { streamChat } from '@/lib/claude';
import { getTypeDef } from '@/lib/entity-types';

export const runtime = 'nodejs';

/**
 * POST /api/projects/[slug]/preview
 *   body: { wordTarget?: number }   // default 500
 *
 * Generates ~N words of the opening chapter using EVERYTHING in the bible
 * as context. Streams plain prose. If the bible is missing critical data,
 * the model writes `[FALTA: descripción]` and stops — so the user sees
 * exactly what's still undefined.
 *
 * Does NOT touch the conversation, does NOT mutate any entity. Pure read.
 * The user can wire its output anywhere (download, save manually, copy).
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { wordTarget?: number };
  const wordTarget = Math.max(200, Math.min(1500, body.wordTarget ?? 500));

  const projectRoot = path.join(PROJECTS_ROOT, slug);
  const entities = await listEntities(projectRoot);
  let facts = '';
  try {
    facts = await fs.readFile(path.join(projectRoot, '00-premise', 'facts.md'), 'utf-8');
  } catch {/* fine */}

  // Build context block grouped by type (so the model can scan).
  const grouped = new Map<string, typeof entities>();
  for (const e of entities) {
    const arr = grouped.get(e.type) ?? [];
    arr.push(e);
    grouped.set(e.type, arr);
  }
  const contextBlocks: string[] = [];
  for (const [type, list] of grouped.entries()) {
    const def = getTypeDef(type);
    contextBlocks.push(`### ${def.icon} ${def.pluralLabel}`);
    for (const e of list) {
      contextBlocks.push(`\n#### ${e.name} (${type}/${e.slug})\n${e.body || '(vacía)'}`);
    }
  }

  const systemPrompt = `Eres novelista. Vas a escribir las primeras ~${wordTarget} palabras del Capítulo 1 de una novela basándote ESTRICTAMENTE en la bible que se te proporciona.

REGLAS ABSOLUTAS:
- Respeta el TONO definido (persona, tiempo verbal, registro, ritmo, POV) — léelo y úsalo.
- Respeta los HECHOS canónicos del proyecto — no contradigas.
- Usa los nombres, lugares y voces tal como aparecen en las entidades.
- NO inventes información que no esté en la bible. Si te falta algo crítico (nombre de un lugar, edad de un personaje, motivación), escribe \`[FALTA: descripción concreta]\` y para. NO rellenes con suposiciones.
- Sin meta-comentario. Sin "Aquí tienes...". Sin marcadores de inicio. Solo prosa narrativa, lista para leer.
- Escribe en español, mismo registro que la muestra de tono si existe.
- Apunta a ~${wordTarget} palabras (puede ser ±20%). No más, no menos drástico.`;

  const userPrompt = `Aquí está la bible completa del proyecto.

═══ HECHOS CANÓNICOS ═══
${facts.trim() || '(sin hechos registrados)'}

═══ ENTIDADES ═══
${contextBlocks.join('\n')}

═══

Escribe ahora las ~${wordTarget} primeras palabras del Capítulo 1. Empieza directamente con la prosa.`;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of streamChat({
          systemPrompt,
          messages: [{ role: 'user', content: userPrompt }],
        })) {
          controller.enqueue(encoder.encode(chunk));
        }
      } catch (err) {
        controller.enqueue(encoder.encode(`\n\n[Error: ${(err as Error).message}]`));
      }
      controller.close();
    },
  });

  return new Response(stream, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
