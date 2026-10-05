import { NextRequest } from 'next/server';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { loadProject } from '@/lib/projects';
import { listEntities } from '@/lib/entities';
import { migrateProjectToEntities } from '@/lib/entity-migration';
import { ENTITY_TYPES, getTypeDef } from '@/lib/entity-types';
import { streamChat } from '@/lib/claude';
import { PROJECTS_ROOT } from '@/lib/config';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function POST(_req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const project = await loadProject(PROJECTS_ROOT, slug);
  await migrateProjectToEntities(project.rootPath, project.manifest.methodology);
  const entities = await listEntities(project.rootPath);

  if (entities.length < 2) {
    return new Response('Necesitas al menos 2 entidades para validar coherencia. Habla un poco más con la IA.', {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  let facts = '';
  try {
    facts = (await fs.readFile(path.join(project.rootPath, '00-premise', 'facts.md'), 'utf-8')).trim();
  } catch {/* none */}

  // Build a structured view of the bible grouped by type.
  const byType = new Map<string, typeof entities>();
  for (const e of entities) {
    if (!byType.has(e.type)) byType.set(e.type, []);
    byType.get(e.type)!.push(e);
  }
  const knownIds = new Set(ENTITY_TYPES.map(t => t.id));
  const orderedTypes = [
    ...ENTITY_TYPES.map(t => t.id).filter(id => byType.has(id)),
    ...[...byType.keys()].filter(id => !knownIds.has(id)).sort(),
  ];
  const sections = orderedTypes.map(t => {
    const def = getTypeDef(t);
    const list = byType.get(t)!;
    const body = list.map(e => {
      const links = e.links.length ? `\nVínculos: ${e.links.map(l => `${l.to}${l.label ? ` (${l.label})` : ''}`).join(', ')}` : '';
      return `### ${e.name} [${e.type}/${e.slug}${e.status === 'locked' ? ', 🔒' : ''}]${links}\n${e.body.trim() || '(sin descripción)'}`;
    }).join('\n\n');
    return `## ${def.icon} ${def.pluralLabel} (${list.length})\n${body}`;
  }).join('\n\n');

  const factsBlock = facts ? `\n\nHECHOS CANÓNICOS (verdad inviolable):\n${facts}` : '';

  const systemPrompt = `Eres un editor literario que audita una bible de novela hecha de entidades interconectadas. Revisa TODO el material y devuelve un informe en markdown con secciones FIJAS y en este orden EXACTO. Cada sección empieza con un encabezado "## " seguido de un emoji y un título. Si una sección no tiene hallazgos, escribe el cuerpo "Nada que reportar."

Tu informe DEBE tener exactamente estas 6 secciones, en este orden:

## ❌ Contradicciones factuales
Contradicciones concretas (ej. "Mara tiene 64 años en su ficha pero el hecho canónico dice 70"). Cita siempre el nombre de la entidad afectada.

## 🪢 Cabos sueltos
Elementos introducidos que no se resuelven ni se referencian desde otra entidad.

## 🔗 Vínculos faltantes
Entidades que claramente deberían estar conectadas pero no tienen LINK (ej. un personaje y su lugar habitual).

## 🎭 Coherencia de personajes
Si los wants/needs/arcos son consistentes a través de las menciones en otras entidades.

## 📊 Huecos de densidad
Qué le falta para que Fase 2 pueda escribir sin inventar. Sé concreto.

## 💡 Próximos pasos
1-3 acciones priorizadas que el usuario debería abordar primero.

Cada hallazgo dentro de una sección va como un bullet "- " que empieza con el nombre legible de la entidad afectada en **negrita**, seguido de la explicación. Mantén las explicaciones a 1-2 frases. NO reproduzcas el contenido entero de las entidades, solo apunta el problema. NO añadas otras secciones ni introducciones.

BIBLE DEL PROYECTO "${project.manifest.title}":${factsBlock}

${sections}`;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of streamChat({
          systemPrompt,
          messages: [{ role: 'user', content: 'Audita la bible y devuelve el informe.' }],
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
