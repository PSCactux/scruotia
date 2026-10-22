import { NextRequest, NextResponse } from 'next/server';
import path from 'node:path';
import { PROJECTS_ROOT } from '@/lib/config';
import { readEntity, upsertEntity } from '@/lib/entities';
import { extractEntityUpdates } from '@/lib/doc-updates';
import { mergeBody, parseBody, normalizeKey } from '@/lib/body-fields';
import { streamChat } from '@/lib/claude';
import { getTypeDef } from '@/lib/entity-types';

export const runtime = 'nodejs';

/**
 * POST /api/inline-ai
 *
 * One-shot AI call scoped to a single field of a single entity. Does NOT
 * touch the project conversation — this is the "✨" button in the cards.
 *
 * Body:
 *   {
 *     projectSlug: string,
 *     entityType: string,
 *     entitySlug: string,
 *     fieldKey: string,            // e.g. "want", "rasgo central", "__intro"
 *     instruction?: string,        // optional extra guidance from the user
 *   }
 *
 * Response:
 *   { ok: true, fieldKey, newValue, newBody, applied: boolean }
 *   or { error: string } with non-2xx status
 *
 * Flow:
 *   1. Read the live entity.
 *   2. Ask Claude for ONE PATCH block that updates only the requested field.
 *   3. Parse the response; if a matching PATCH is found, apply it (which
 *      triggers the auto-snapshot from writeEntity, reason='inline-ai').
 *   4. Return the new field value and full body.
 */
export async function POST(req: NextRequest) {
  const body = (await req.json()) as {
    projectSlug?: string;
    entityType?: string;
    entitySlug?: string;
    fieldKey?: string;
    instruction?: string;
  };
  if (!body.projectSlug || !body.entityType || !body.entitySlug || !body.fieldKey) {
    return NextResponse.json({ error: 'projectSlug, entityType, entitySlug and fieldKey are required' }, { status: 400 });
  }

  const projectRoot = path.join(PROJECTS_ROOT, body.projectSlug);
  const entity = await readEntity(projectRoot, body.entityType, body.entitySlug);
  if (!entity) return NextResponse.json({ error: 'entity not found' }, { status: 404 });
  if (entity.status === 'locked') {
    return NextResponse.json({ error: 'entity is locked' }, { status: 409 });
  }

  const typeDef = getTypeDef(entity.type);
  const sentinelHint = body.fieldKey.startsWith('__')
    ? ` (campo especial: ${body.fieldKey === '__intro' ? 'la frase-tagline de la ficha' : body.fieldKey === '__pendiente' ? 'el "Pendiente: ..." al final' : 'la prosa libre tras los bullets'})`
    : '';

  const systemPrompt = `Eres asistente narrativo de Skriptia. Recibirás una entidad de outline y un campo específico de su ficha. Tu único trabajo es proponer un valor concreto para ESE campo, coherente con el resto de la entidad y con el tono general de la historia.

Reglas absolutas:
- Emite EXACTAMENTE un bloque PATCH y nada más. Sin texto antes ni después.
- Formato: <<<PATCH:${entity.type}:${entity.slug}>>>${body.fieldKey}=valor<<<END>>>
- Si el valor es multi-línea usa heredoc: <<<PATCH:...>>>${body.fieldKey}=<<<\\nlínea 1\\nlínea 2\\n>>>\\n<<<END>>>
- NO toques otros campos. NO emitas CARD ni LINK ni FACT. Solo PATCH con UNA key.
- Mantén consistencia con el body actual: no contradigas otros campos ya rellenos.
- El valor debe ser concreto, evocador y conciso. Si es un bullet, una frase. Si es prosa, 1–3 frases.
- En español, mismo registro que la ficha actual.`;

  const userPrompt = `Tipo de entidad: ${typeDef.label} (${entity.type})
Slug: ${entity.slug}
Nombre: ${entity.name}

Body actual (markdown):
${entity.body || '(vacío)'}

Campo a actualizar: ${body.fieldKey}${sentinelHint}
${body.instruction ? `\nInstrucción extra del usuario: ${body.instruction}` : ''}

Devuelve un único bloque PATCH con el nuevo valor para ${body.fieldKey}.`;

  let assistantText = '';
  try {
    for await (const chunk of streamChat({
      systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    })) {
      assistantText += chunk;
    }
  } catch (err) {
    return NextResponse.json({ error: `AI call failed: ${(err as Error).message}` }, { status: 502 });
  }

  const { patches } = extractEntityUpdates(assistantText);
  const targetPatch = patches.find(
    p => p.type === entity.type && p.slug === entity.slug,
  );
  if (!targetPatch) {
    return NextResponse.json({
      ok: false,
      error: 'No PATCH block returned by AI',
      raw: assistantText.slice(0, 500),
    }, { status: 422 });
  }
  // The AI might emit multiple fields; we keep only the one we asked for.
  const normalizedRequested = normalizeKey(body.fieldKey);
  const matchingKey = Object.keys(targetPatch.fields).find(k => normalizeKey(k) === normalizedRequested)
    ?? Object.keys(targetPatch.fields)[0];
  const newValue = targetPatch.fields[matchingKey];

  const newBody = mergeBody(entity.body, { [matchingKey]: newValue });
  await upsertEntity(projectRoot, {
    type: entity.type,
    slug: entity.slug,
    name: entity.name,
    icon: entity.icon,
    body: newBody,
    status: entity.status,
    links: entity.links,
  }, { snapshotReason: 'inline-ai' });

  // Echo back the parsed field value alongside the full body so the UI can
  // refresh the single field in-place without a graph reload.
  const parsed = parseBody(newBody);
  const finalValue = parsed.fields.find(f => normalizeKey(f.key) === normalizedRequested)?.value ?? newValue;

  return NextResponse.json({
    ok: true,
    fieldKey: matchingKey,
    newValue: finalValue,
    newBody,
    applied: true,
  });
}
