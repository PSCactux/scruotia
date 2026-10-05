import { NextRequest } from 'next/server';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { streamChat, type ChatMessage } from '@/lib/claude';
import { loadProject } from '@/lib/projects';
import {
  saveMainConversation,
  type ConvMessage,
} from '@/lib/conversations';
import {
  listEntities,
  upsertEntity,
  deleteEntity,
  slugify,
  type Entity,
} from '@/lib/entities';
import { migrateProjectToEntities } from '@/lib/entity-migration';
import { ENTITY_TYPES, getTypeDef } from '@/lib/entity-types';
import { extractEntityUpdates } from '@/lib/doc-updates';
import { mergeBody } from '@/lib/body-fields';
import { logRawTurn } from '@/lib/raw-log';
import { phaseProgress, currentPhase, PHASES_BY_ID } from '@/lib/phases';
import { PROJECTS_ROOT } from '@/lib/config';

export const runtime = 'nodejs';

// ---------- POST handler ----------

type Body = {
  projectSlug: string;
  messages: ChatMessage[];
  mode?: 'refine' | 'project';
  focusEntity?: string | null; // "type/slug"
  // refine mode (inline-edit modal):
  stepId?: string;
  selection?: string;
  transient?: boolean;
};

export async function POST(req: NextRequest) {
  const body = (await req.json()) as Body;
  const project = await loadProject(PROJECTS_ROOT, body.projectSlug);
  await migrateProjectToEntities(project.rootPath, project.manifest.methodology);

  if (body.mode === 'refine') {
    return handleRefine({ body, project });
  }
  return handleProject({ body, project });
}

// ---------- helpers ----------

async function loadFacts(projectRoot: string): Promise<string> {
  try {
    const c = await fs.readFile(path.join(projectRoot, '00-premise', 'facts.md'), 'utf-8');
    return c.trim();
  } catch { return ''; }
}

async function loadReferences(projectRoot: string): Promise<string> {
  const refsDir = path.join(projectRoot, 'references');
  try {
    const files = await fs.readdir(refsDir);
    const samples: string[] = [];
    for (const file of files.slice(0, 5)) {
      if (file.startsWith('.')) continue;
      try {
        const content = await fs.readFile(path.join(refsDir, file), 'utf-8');
        const truncated = content.length > 4000 ? content.slice(0, 4000) + '\n... [truncado]' : content;
        samples.push(`--- ${file} ---\n${truncated}`);
      } catch {/* ignore */}
    }
    if (samples.length === 0) return '';
    return `\n\nREFERENCIAS DE ESTILO DEL USUARIO (extractos de su voz/tono — imita registro y voz, NO copies):\n${samples.join('\n\n')}`;
  } catch { return ''; }
}

async function appendFacts(projectRoot: string, facts: string[]): Promise<void> {
  if (facts.length === 0) return;
  const file = path.join(projectRoot, '00-premise', 'facts.md');
  let existing = '';
  try { existing = await fs.readFile(file, 'utf-8'); } catch {/* none */}
  const seen = new Set(existing.split('\n').map(l => l.replace(/^[-*]\s*/, '').trim().toLowerCase()).filter(Boolean));
  const fresh = facts.filter(f => !seen.has(f.toLowerCase()));
  if (fresh.length === 0) return;
  const block = fresh.map(f => `- ${f}`).join('\n');
  const next = existing.trim() ? `${existing.trim()}\n${block}\n` : `${block}\n`;
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, next, 'utf-8');
}

// ---------- project-centric handler ----------

function renderEntityForPrompt(e: Entity): string {
  const head = `${e.icon ?? '•'} ${e.name} (type=${e.type}, slug=${e.slug}${e.status === 'locked' ? ', 🔒 BLOQUEADO' : ''})`;
  const links = e.links.length > 0
    ? `\nVínculos: ${e.links.map(l => `${l.to}${l.label ? ` (${l.label})` : ''}`).join(', ')}`
    : '';
  const body = e.body.trim() ? `\n${e.body.trim()}` : '\n(sin descripción aún)';
  return `### ${head}${links}${body}`;
}

function buildCoachingHints(entities: Entity[]): string {
  const counts: Record<string, number> = {};
  for (const e of entities) counts[e.type] = (counts[e.type] ?? 0) + 1;
  const hints: string[] = [];
  if ((counts['logline'] ?? 0) === 0) hints.push('Aún no hay logline. Si ya tienes idea, dispárala en una frase.');
  if ((counts['personaje'] ?? 0) < 2 && entities.length > 1) hints.push('Sólo hay 0-1 personajes. Una historia normalmente necesita protagonista + antagonista (o tensión equivalente).');
  if ((counts['conflicto'] ?? 0) === 0 && (counts['personaje'] ?? 0) >= 1) hints.push('Hay personajes pero ningún conflicto definido aún.');
  if ((counts['tono'] ?? 0) === 0) hints.push('Falta el tono/voz: persona, tiempo verbal, registro.');
  if ((counts['lugar'] ?? 0) === 0 && (counts['personaje'] ?? 0) >= 1) hints.push('Ningún lugar definido — ¿dónde transcurre?');
  if ((counts['mundo'] ?? 0) === 0 && (counts['regla'] ?? 0) === 0 && entities.length >= 4) hints.push('No hay canon del mundo aún. ¿Hay reglas inviolables?');
  if ((counts['escena'] ?? 0) === 0 && (counts['estructura'] ?? 0) >= 1) hints.push('Ya hay estructura: buen momento para empezar a sketchar escenas concretas.');
  if (hints.length === 0) return '';
  return `\n\nQUÉ FALTA O ESTÁ FLOJO (úsalo solo como guía interna; NO recites esta lista al usuario, pero sí integra UNA pregunta natural en tu próxima respuesta si aplica):\n- ${hints.join('\n- ')}`;
}

async function handleProject({
  body, project,
}: {
  body: Body;
  project: Awaited<ReturnType<typeof loadProject>>;
}): Promise<Response> {
  const entities = await listEntities(project.rootPath);
  const facts = await loadFacts(project.rootPath);
  const referencesBlock = await loadReferences(project.rootPath);
  const lockedRefs = entities.filter(e => e.status === 'locked').map(e => `${e.type}/${e.slug} (${e.name})`);

  // Group entities by type for the prompt.
  const byType = new Map<string, Entity[]>();
  for (const e of entities) {
    if (!byType.has(e.type)) byType.set(e.type, []);
    byType.get(e.type)!.push(e);
  }

  // Render the catalog of known entity types — with their recommended body
  // template — so the AI emits cards with consistent structure across
  // instances of the same type (every personaje gets the same fields, etc.).
  const ontologyBlock = ENTITY_TYPES
    .map(t => {
      const head = `- ${t.icon} **${t.label}** (\`${t.id}\`): ${t.description}`;
      if (!t.bodyTemplate) return head;
      return `${head}\n  Template para el body de cada \`${t.id}\` (síguelo):\n  \`\`\`\n${t.bodyTemplate.split('\n').map(l => '  ' + l).join('\n')}\n  \`\`\``;
    })
    .join('\n\n');

  // Render current state.
  const stateBlocks: string[] = [];
  for (const t of ENTITY_TYPES) {
    const list = byType.get(t.id);
    if (!list || list.length === 0) continue;
    stateBlocks.push(`## ${t.icon} ${t.pluralLabel} (${list.length})\n\n${list.map(renderEntityForPrompt).join('\n\n')}`);
  }
  // Any unknown types (AI-spawned) at the end.
  for (const [type, list] of byType) {
    if (ENTITY_TYPES.find(t => t.id === type)) continue;
    const def = getTypeDef(type);
    stateBlocks.push(`## ${def.icon} ${def.label} (${list.length})\n\n${list.map(renderEntityForPrompt).join('\n\n')}`);
  }
  const stateBlock = stateBlocks.length > 0
    ? `\n\nESTADO ACTUAL DE LA BIBLE:\n\n${stateBlocks.join('\n\n')}`
    : '\n\nESTADO ACTUAL DE LA BIBLE: vacío. Es el primer turno — invita al usuario a soltar de qué va su historia, sin pedir estructura.';

  const focusBlock = body.focusEntity
    ? `\n\nFOCO ACTUAL: el usuario está mirando la tarjeta "${body.focusEntity}". Profundiza ahí, pero no ignores el resto del contexto.`
    : '';

  const lockedNote = lockedRefs.length > 0
    ? `\n\nENTIDADES BLOQUEADAS (canon inviolable — NUNCA reescribas su body con un CARD ni las borres): ${lockedRefs.join(', ')}.`
    : '';

  const factsBlock = facts
    ? `\n\nHECHOS CANÓNICOS (verdad inviolable del proyecto — NO los contradigas, ni siquiera en turnos posteriores):\n${facts}`
    : '';

  const coachingHints = buildCoachingHints(entities);

  // Phase awareness — what's the current outline phase, and what counts as
  // "ready" for it? The AI uses this to avoid pushing scenes before the
  // semilla is closed.
  const phaseId = currentPhase(entities);
  const phaseDef = PHASES_BY_ID[phaseId];
  const phaseStats = phaseProgress(entities);
  const phaseBlock = `

FASE ACTUAL: ${phaseDef.label.toUpperCase()} (${phaseStats[phaseId].count}/${phaseDef.threshold} elementos listos)
${phaseDef.coaching}
${phaseStats[phaseId].ready ? 'La fase está cubierta — puedes proponer pasar a la siguiente cuando el usuario quiera.' : 'NO empujes contenido de fases posteriores (escenas, capítulos, motivos…) hasta que ésta esté firme.'}`;

  const systemPrompt = `Eres un co-autor literario. El usuario habla libremente sobre su novela; tú escuchas, preguntas, y estructuras lo que dice en una "bible" viva hecha de tarjetas (entidades). NO sigues un wizard ni un orden — extrae lo que el usuario dice y crea/actualiza las entidades que apliquen.

PROYECTO: "${project.manifest.title}"

CÓMO HABLAS:
- Cálido, curioso, conciso. Sin "¡excelente!", sin párrafos relleno.
- UNA pregunta concreta por turno, si necesitas info. Si ya la tienes, NO repreguntes.
- Si el usuario te corrige o cambia algo, aplícalo en TODAS las entidades afectadas.
- Sugiere proactivamente (sin imponer): "¿quieres que profundicemos en el conflicto?" cuando veas un hueco, pero nunca recites listas de pasos.
- Responde siempre en español.

ONTOLOGÍA DE ENTIDADES DISPONIBLES (puedes inventar tipos nuevos si NO encaja con ninguno, pero úsalos solo cuando sea claramente necesario):
${ontologyBlock}

PROTOCOLO DE AUTO-GUARDADO (silencioso — no lo menciones al usuario, no expliques que vas a guardar):

Usamos **fences markdown** (\`~~~\`) para todos los bloques. Es lo más robusto: los modelos los emiten consistentemente y el parser nunca se confunde.

═══ CARD — crear o reemplazar una entidad ═══

~~~scruotia-card type:slug
name=Nombre legible
icon=emoji opcional
---
(cuerpo markdown completo — descripción, viñetas, lo que aplique)
~~~

- \`type\` y \`slug\` van separados por \`:\` (slug en kebab-case).
- Atributos (\`name\`, \`icon\`) van antes del separador \`---\`; el body markdown va después.
- El body es la versión COMPLETA de la entidad, no un diff. Si actualizas una existente, reemite el body entero.
- Si la entidad está BLOQUEADA, NO la reescribas.

═══ PATCH — modificar solo algunos campos sin tocar el resto ═══

~~~scruotia-patch type:slug
Want=Que la dejen en paz
Need=Aceptar que necesita a alguien
~~~

REGLAS:
1. Una línea por campo (\`clave=valor\`). NO dos campos en la misma línea.
2. La clave coincide con un bullet del template (case-insensitive, acentos ignorados):
   - Personaje: \`Rol\`, \`Want\`, \`Need\`, \`Arco\`, \`Voz\`, \`Backstory\`, \`Secretos\`, \`Especie\`, \`Edad\`, \`Relaciones clave\`…
   - Escena: \`Beat\`, \`POV\`, \`Ubicación\`, \`Personajes presentes\`, \`Qué pasa\`, \`Conflicto\`, \`Resolución parcial\`, \`Planta\`, \`Paga\`, \`Target palabras\`…
   - Lugar: \`Tipo\`, \`Descripción física\`, \`Sensaciones\`, \`Quién aparece aquí\`, \`Eventos clave\`…
3. Claves especiales (sentinels):
   - \`__intro\` = la frase-tagline antes de los bullets
   - \`__pendiente\` = la línea \`**Pendiente:** ...\` al final
   - \`__trailing\` = prosa libre tras los bullets
4. Para valores MULTI-LÍNEA usa heredoc \`<<<\` … \`>>>\` (cada delimitador en su línea):

~~~scruotia-patch personaje:mara
backstory=<<<
Antes de que Tito llegara al faro,
Mara nunca había enseñado a nadie el oficio.
>>>
arco=positivo
~~~

Cuándo PATCH vs CARD:
- PATCH = "expande solo Want", "corrige el rasgo central", "añade el arco".
- CARD = "reescribe el personaje entero", "esta entidad es nueva".
- Si dudas, usa CARD con el body completo — siempre es seguro.
- NUNCA mezcles PATCH y CARD para la MISMA entidad en el mismo turno.
- Si la entidad está BLOQUEADA, no la patchees.

═══ LINK — vincular dos entidades ═══

~~~scruotia-link personaje/mara lugar/faro
label=vive en
~~~

(El \`label=\` es opcional. Las dos refs separadas por espacio.)

═══ DELETE — borrar una entidad creada por error ═══

~~~scruotia-delete personaje/x
~~~

═══ FACT — hecho INMUTABLE del proyecto (edades, distancias, reglas que nunca cambian) ═══

~~~scruotia-fact
Mara tiene 64 años cuando empieza la novela.
~~~

═══ SUGGEST — preguntas con respuesta cliclable (la UI las pinta como botones) ═══

~~~scruotia-suggest
¿Qué oficio tiene la protagonista?
- Farera
- Cartógrafa
- Pescadora
- Relojera
~~~

~~~scruotia-suggest
Profundizar en el conflicto central
~~~

- Las opciones (bullets) son opcionales: útiles para respuestas discretas, omítelas para preguntas abiertas.
- Máximo 4 opciones, atómicas y distintas.
- Máximo 2-3 SUGGEST por turno. 2 buenas > 5 mediocres.
- NO menciones SUGGEST en tu texto — son botones silenciosos.

═══ COMPATIBILIDAD ═══
El parser ACEPTA TAMBIÉN el formato antiguo con chevrons \`<<<CARD:...>>>...<<<END>>>\` por retrocompatibilidad, pero EMITE SIEMPRE el nuevo con fences. El nuevo es más robusto y el preferido.

REGLAS DE EXTRACCIÓN:
- Cuando el usuario menciona personajes, lugares, objetos, reglas, conflictos → CREA o ACTUALIZA las entidades correspondientes en el MISMO turno.
- Si el usuario menciona algo importante que no encaja en una entidad existente, créala (no la guardes "para después").
- Si dos entidades están claramente vinculadas (Mara vive en el faro / Mara es amiga de Tito / la tormenta amenaza el faro), emite un LINK.
- Hechos atómicos inmutables → FACT. No abuses: solo cosas que NUNCA cambiarán (ej. "el faro está en una isla sin puente", "Mara tiene 64 años al empezar la novela").
- Si el usuario te corrige un hecho que tú habías escrito mal, REEMITE la CARD afectada con la versión correcta y, si aplica, un FACT que aclare la verdad.

ESTRUCTURA DE LOS BODIES (muy importante para que la bible sea consistente):
- Cada tipo con \`Template para el body\` arriba define EXACTAMENTE el formato del body. Sigue esa estructura literalmente — mismos campos, mismo orden, mismas negritas.
- Rellena los campos que el usuario ya haya respondido o que se infieran sin inventar. Para los campos que NO sepas todavía, deja la línea presente pero con valor vacío o "(por definir)". NO inventes para rellenar.
- Lo desconocido va al final en una línea **Pendiente:** que enumere brevemente qué falta resolver de esa entidad. El usuario lo verá de un vistazo.
- Si una entidad existente NO sigue su template (porque viene de antes, de migración legacy o de un turno temprano), REFORMATÉALA al template la próxima vez que la actualices, preservando TODA la información que ya tuviera. Mover datos de un párrafo libre a sus campos correctos es siempre legítimo.
- Todos los tipos conocidos tienen template; sigue el template aunque algunos campos queden vacíos.

CAPÍTULOS Y ESCENAS NO-CONSECUTIVOS:
- Si vas a sketchar SÓLO los capítulos clave (apertura / giro / midpoint / cierre, p.ej. caps 1, 5, 9, 12) y NO todos los intermedios, EXPLÍCALO EXPLÍCITAMENTE en tu respuesta conversacional ANTES de emitir las cards. Algo como "Voy a marcar primero los 4 capítulos ancla; los intermedios los sketchamos cuando estos cuatro estén firmes." Si no lo dices, el usuario va a pensar que se han perdido capítulos.
- Misma regla para escenas: si solo sketchas las escenas ancla (apertura, midpoint, clímax), dilo. La UI muestra los huecos como placeholders, pero el usuario debe oírlo de tu boca también.
- Cuando rellenes el campo "**Número:** N" de un capítulo, asegúrate de que coincide con el número en el nombre ("Cap. N — Título") — la UI ordena por ese campo.

FASES DEL OUTLINE (respétalas, no empujes prematuro):
- **Fase 1: La semilla** — logline, personajes principales, conflicto central, tono. Si esto no está, NO sketches escenas ni capítulos ni desarrolles motivos literarios.
- **Fase 2: Los huesos** — estructura, sinopsis, mundo, reglas, lugares clave. Aquí la novela toma forma.
- **Fase 3: La trama** — escenas, capítulos, hilos de subtrama. Sólo cuando los huesos están claros.
- **Fase 4: Los matices** — temas, motivos, símbolos, preguntas dramáticas, relaciones finas.
Si el usuario pide algo que pertenece a una fase posterior pero la actual no está cubierta, ofrécelo PERO marca que es prematuro. Algo como: "Podemos sketchar escenas si quieres, pero aún no tenemos conflicto central — sería más sólido cerrar la semilla primero. ¿Avanzamos igualmente?"
${phaseBlock}${factsBlock}${lockedNote}${stateBlock}${focusBlock}${coachingHints}${referencesBlock}`;

  const encoder = new TextEncoder();
  let assistantText = '';

  // Helper to emit a status marker inline in the stream so the client can
  // distinguish "still writing prose" from "applying changes". The client
  // strips these markers from display (see stripBlocks in ChatColumn).
  const emitStatus = (controller: ReadableStreamDefaultController, phase: string, data: Record<string, unknown> = {}) => {
    const payload = JSON.stringify({ phase, ...data });
    controller.enqueue(encoder.encode(`\n~~~scruotia-status\n${payload}\n~~~\n`));
  };

  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of streamChat({ systemPrompt, messages: body.messages })) {
          assistantText += chunk;
          controller.enqueue(encoder.encode(chunk));
        }
      } catch (err) {
        const errMsg = `\n\n[Error: ${(err as Error).message}]`;
        assistantText += errMsg;
        controller.enqueue(encoder.encode(errMsg));
      }

      // ── End of prose ──
      // Parse once to know what's coming so we can announce it. The client
      // unblocks the input as soon as it sees the "applying" marker, so the
      // user can start typing the next message while we write to disk.
      const parsed = extractEntityUpdates(assistantText);
      const counts = {
        cards: parsed.cards.length,
        patches: parsed.patches.length,
        links: parsed.links.length,
        deletes: parsed.deletes.length,
        facts: parsed.facts.length,
      };
      const hasWork = counts.cards + counts.patches + counts.links + counts.deletes + counts.facts > 0;
      if (hasWork) emitStatus(controller, 'applying', counts);

      // Forensics: persist the raw assistant text BEFORE we strip it. Survives
      // future "why did entity X end up empty?" debugging. Also log the last
      // user turn so we have both sides paired.
      const lastUserMsg = [...body.messages].reverse().find(m => m.role === 'user');
      if (lastUserMsg) {
        await logRawTurn(project.rootPath, 'user', lastUserMsg.content);
      }
      await logRawTurn(project.rootPath, 'assistant', assistantText, {
        focus: body.focusEntity ?? '',
      });

      try {
        const { cards, patches, links, deletes, facts: newFacts, suggestions, cleanedText } = parsed;

        // Build lookup of existing entities for locked check + link merging.
        const lockedIds = new Set<string>(entities.filter(e => e.status === 'locked').map(e => `${e.type}/${e.slug}`));
        const existingMap = new Map<string, Entity>(entities.map(e => [`${e.type}/${e.slug}`, e]));

        // Apply card upserts (skip locked).
        const touched: string[] = [];
        for (const c of cards) {
          const key = `${c.type}/${c.slug}`;
          if (lockedIds.has(key)) continue;
          const existing = existingMap.get(key);
          const incomingBody = (c.body ?? '').trim();
          // GUARD: never let an empty CARD body wipe out a populated entity.
          // The AI sometimes emits ~~~scruotia-card type:slug~~~ with no body
          // — that used to silently overwrite previous content with "". From
          // now on, if there's nothing new and there IS something old, skip
          // (we still update name/icon if those changed).
          if (!incomingBody && existing && (existing.body ?? '').trim().length > 0) {
            const newName = c.attrs.name || existing.name;
            const newIcon = c.attrs.icon || existing.icon;
            if (newName !== existing.name || newIcon !== existing.icon) {
              await upsertEntity(project.rootPath, {
                type: c.type,
                slug: c.slug,
                name: newName,
                icon: newIcon,
                body: existing.body,
                status: existing.status,
                links: existing.links,
              }, { snapshotReason: 'chat' });
              touched.push(key);
            }
            console.warn(`[chat] skipped empty-body CARD for ${key} (preserved existing body)`);
            continue;
          }
          try {
            const name = c.attrs.name || existing?.name || c.slug;
            const icon = c.attrs.icon || existing?.icon;
            await upsertEntity(project.rootPath, {
              type: c.type,
              slug: c.slug,
              name,
              icon,
              body: c.body,
              status: existing?.status ?? 'drafting',
            }, { snapshotReason: 'chat' });
            touched.push(key);
          } catch (writeErr) {
            console.error(`Failed to write entity ${key}:`, writeErr);
          }
        }

        // Apply PATCH blocks (skip locked). Patches use mergeBody to update a
        // subset of fields without disturbing the rest. Re-reads the current
        // body each time so consecutive patches in the same turn compose.
        for (const p of patches) {
          const key = `${p.type}/${p.slug}`;
          if (lockedIds.has(key)) continue;
          const current = existingMap.get(key);
          if (!current) {
            // No existing entity to patch — fall back to creating a stub with
            // just the patched fields as a body. Better than silently dropping.
            const body = mergeBody('', p.fields);
            await upsertEntity(project.rootPath, {
              type: p.type, slug: p.slug, name: p.slug, body, status: 'drafting',
            }, { snapshotReason: 'chat' });
            touched.push(key);
            continue;
          }
          try {
            const newBody = mergeBody(current.body, p.fields);
            await upsertEntity(project.rootPath, {
              type: p.type,
              slug: p.slug,
              name: current.name,
              icon: current.icon,
              body: newBody,
              status: current.status,
              links: current.links,
            }, { snapshotReason: 'chat' });
            if (!touched.includes(key)) touched.push(key);
          } catch (writeErr) {
            console.error(`Failed to patch entity ${key}:`, writeErr);
          }
        }

        // Apply link mutations: append to the `from` entity's links field if absent.
        for (const l of links) {
          const [fromType, fromSlug] = l.from.split('/');
          if (!fromType || !fromSlug) continue;
          if (lockedIds.has(l.from)) continue;
          const existing = existingMap.get(l.from);
          const links = existing?.links ? [...existing.links] : [];
          const alreadyThere = links.find(x => x.to === l.to && x.label === l.label);
          if (alreadyThere) continue;
          links.push({ to: l.to, label: l.label });
          await upsertEntity(project.rootPath, {
            type: fromType,
            slug: fromSlug,
            name: existing?.name ?? fromSlug,
            icon: existing?.icon,
            body: existing?.body ?? '',
            status: existing?.status ?? 'drafting',
            links,
          }, { snapshotReason: 'chat' });
        }

        // Apply deletes (skip locked).
        for (const d of deletes) {
          const key = `${d.type}/${d.slug}`;
          if (lockedIds.has(key)) continue;
          await deleteEntity(project.rootPath, d.type, d.slug, { snapshotReason: 'chat' });
        }

        // Append facts.
        if (newFacts.length > 0) {
          await appendFacts(project.rootPath, newFacts);
        }

        // Persist conversation (clean text, no blocks). Include the
        // assistant's proposed suggestions and the entities it touched so the
        // UI can re-render the buttons + change-indicators after a reload.
        const finalMessages: ConvMessage[] = [
          ...(body.messages as ConvMessage[]),
          {
            role: 'assistant',
            content: cleanedText || assistantText,
            ts: new Date().toISOString(),
            focusArtifact: body.focusEntity ?? null,
            suggestions: suggestions.length > 0 ? suggestions : undefined,
            touched: touched.length > 0 ? touched : undefined,
          },
        ];
        await saveMainConversation(project.rootPath, { messages: finalMessages });

        if (touched.length > 0 || newFacts.length > 0 || deletes.length > 0) {
          console.log(`[chat] project ${project.slug} — touched [${touched.join(', ')}] · +${newFacts.length} facts · -${deletes.length} deletes`);
        }
        void slugify;

        // Announce that everything's been written. The client uses this to
        // clear the "applying" badge and pop the success pills with the
        // actual touched ids.
        if (hasWork) {
          emitStatus(controller, 'done', {
            touched,
            facts: newFacts.length,
            deletes: deletes.map(d => `${d.type}/${d.slug}`),
          });
        }
      } catch (saveErr) {
        console.error('[chat] post-stream processing failed:', saveErr);
        emitStatus(controller, 'error', { message: (saveErr as Error).message });
      }
      controller.close();
    },
  });

  return new Response(stream, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}

// ---------- refine handler (inline-edit modal — operates on raw markdown) ----------

async function handleRefine({
  body, project,
}: {
  body: Body;
  project: Awaited<ReturnType<typeof loadProject>>;
}): Promise<Response> {
  const selection = body.selection?.trim() ?? '';
  const facts = await loadFacts(project.rootPath);
  const factsBlock = facts ? `\n\nHECHOS CANÓNICOS (no contradigas):\n${facts}` : '';

  const systemPrompt = `Eres un editor literario. El usuario te ha pasado una selección de texto y te pide cambios. Devuelve el documento COMPLETO actualizado dentro de un bloque <<<DOC>>>...<<<END>>>, sin diff ni parche.

SELECCIÓN DEL USUARIO:
"""
${selection}
"""${factsBlock}

Responde en español. Mantén todo el resto del documento intacto, solo aplica el cambio pedido sobre la selección.`;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of streamChat({ systemPrompt, messages: body.messages })) {
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
