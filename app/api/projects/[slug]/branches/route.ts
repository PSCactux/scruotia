import { NextRequest, NextResponse } from 'next/server';
import path from 'node:path';
import { PROJECTS_ROOT } from '@/lib/config';
import { readEntity } from '@/lib/entities';
import { streamChat } from '@/lib/claude';
import { getTypeDef } from '@/lib/entity-types';
import { parseBody, getField } from '@/lib/body-fields';
import {
  newBranchId,
  parseVariants,
  saveBranch,
  listBranches,
  type SketchBranch,
  type SketchVariant,
} from '@/lib/branches';

export const runtime = 'nodejs';

/**
 * GET /api/projects/[slug]/branches
 *   → { branches: SketchBranch[] }   (all, newest first)
 *
 * POST /api/projects/[slug]/branches
 *   body: { entityRef: "type/slug", fieldKey?: string, n?: number, instruction?: string }
 *   → { branch: SketchBranch }
 *
 *   Triggers a single AI call that emits N <<<VARIANT>>> blocks. Persists
 *   the branch to disk (status='open') and returns it. Does NOT mutate the
 *   underlying entity — that only happens on POST /apply.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const projectRoot = path.join(PROJECTS_ROOT, slug);
  const branches = await listBranches(projectRoot);
  return NextResponse.json({ branches });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const body = (await req.json()) as {
    entityRef?: string;
    fieldKey?: string;
    n?: number;
    instruction?: string;
  };
  if (!body.entityRef || !/^[a-z0-9-]+\/[a-z0-9-]+$/.test(body.entityRef)) {
    return NextResponse.json({ error: 'entityRef ("type/slug") required' }, { status: 400 });
  }
  const [entityType, entitySlug] = body.entityRef.split('/');
  const projectRoot = path.join(PROJECTS_ROOT, slug);
  const entity = await readEntity(projectRoot, entityType, entitySlug);
  if (!entity) return NextResponse.json({ error: 'entity not found' }, { status: 404 });

  const n = Math.max(2, Math.min(5, body.n ?? 3));
  const fieldKey = body.fieldKey?.trim() || null;
  const typeDef = getTypeDef(entity.type);

  const currentValue = fieldKey
    ? getField(parseBody(entity.body), fieldKey)
    : entity.body;

  const systemPrompt = `Eres asistente narrativo de Scruotia. Tu trabajo es proponer ${n} variantes distintas y bien diferenciadas del ${fieldKey ? `campo "${fieldKey}" de una entidad` : 'cuerpo completo de una entidad'}, para que el usuario elija.

REGLAS ABSOLUTAS:
- Emite EXACTAMENTE ${n} bloques <<<VARIANT:id:label>>>...<<<END>>>.
- Los ids son 'a', 'b', 'c', etc.
- El label es 1-4 palabras que resuman el ángulo (ej. "Más concreta", "Espejo", "Tono oscuro").
- Cada variante debe ser claramente DISTINTA de las otras (distinto ángulo, no mismo concepto re-frasado).
- Sin texto antes, entre o después de los bloques.
${fieldKey
  ? `- El contenido de cada VARIANT es SOLO el nuevo valor del campo "${fieldKey}", sin etiqueta, sin viñetas, en frase(s) directas.`
  : `- El contenido de cada VARIANT es el cuerpo markdown COMPLETO del template del tipo ${typeDef.label}, igual que harías con un CARD.`
}
- Mantén coherencia con lo que ya está en la entidad — no contradigas hechos canónicos.
- En español, mismo registro que la ficha actual.`;

  const userPrompt = `Tipo: ${typeDef.label} (${entity.type})
Nombre: ${entity.name}
Slug: ${entity.slug}

Body actual:
${entity.body || '(vacío)'}

${fieldKey ? `Campo a variar: ${fieldKey}\nValor actual: ${currentValue || '(vacío)'}\n` : 'Vas a variar el cuerpo completo.\n'}
${body.instruction ? `Indicación extra del usuario: ${body.instruction}\n` : ''}
Genera ${n} variantes distintas.`;

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

  const parsed = parseVariants(assistantText);
  if (parsed.length === 0) {
    return NextResponse.json({
      error: 'No VARIANT blocks returned by AI',
      raw: assistantText.slice(0, 500),
    }, { status: 422 });
  }

  const variants: SketchVariant[] = parsed.map(v => ({
    id: v.id,
    label: v.label,
    raw: v.raw,
    ...(fieldKey ? { value: v.content } : { body: v.content }),
  }));

  const branch: SketchBranch = {
    id: newBranchId(),
    scope: { entityRef: body.entityRef, fieldKey },
    prompt: body.instruction ?? `${n} variantes`,
    variants,
    status: 'open',
    created: new Date().toISOString(),
  };
  await saveBranch(projectRoot, branch);
  return NextResponse.json({ branch });
}
