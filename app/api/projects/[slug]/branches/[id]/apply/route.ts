import { NextRequest, NextResponse } from 'next/server';
import path from 'node:path';
import { PROJECTS_ROOT } from '@/lib/config';
import { readBranch, saveBranch } from '@/lib/branches';
import { readEntity, upsertEntity } from '@/lib/entities';
import { mergeBody } from '@/lib/body-fields';

export const runtime = 'nodejs';

/**
 * POST /api/projects/[slug]/branches/[id]/apply
 *   body: { variantId: string }
 *
 * Applies the chosen variant to the entity referenced by the branch.
 *  - Field-scoped branches → mergeBody({ [fieldKey]: variant.value })
 *  - Full-entity branches  → replace body entirely with variant.body
 *
 * The pre-apply snapshot is automatic (writeEntity hook in lib/entities).
 * After success, the branch is marked status='merged' with applied={id, ts}.
 *
 * Returns { ok: true, entity, branch }.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await ctx.params;
  const body = (await req.json()) as { variantId?: string };
  if (!body.variantId) {
    return NextResponse.json({ error: 'variantId required' }, { status: 400 });
  }
  const projectRoot = path.join(PROJECTS_ROOT, slug);
  const branch = await readBranch(projectRoot, id);
  if (!branch) return NextResponse.json({ error: 'branch not found' }, { status: 404 });
  if (branch.status !== 'open') {
    return NextResponse.json({ error: `branch is ${branch.status}, cannot apply` }, { status: 409 });
  }
  const variant = branch.variants.find(v => v.id === body.variantId);
  if (!variant) return NextResponse.json({ error: 'variant not found' }, { status: 404 });

  const [entityType, entitySlug] = branch.scope.entityRef.split('/');
  const entity = await readEntity(projectRoot, entityType, entitySlug);
  if (!entity) return NextResponse.json({ error: 'entity not found' }, { status: 404 });
  if (entity.status === 'locked') {
    return NextResponse.json({ error: 'entity is locked' }, { status: 409 });
  }

  let newBody: string;
  if (branch.scope.fieldKey) {
    if (typeof variant.value !== 'string') {
      return NextResponse.json({ error: 'variant has no value for field-scoped branch' }, { status: 422 });
    }
    newBody = mergeBody(entity.body, { [branch.scope.fieldKey]: variant.value });
  } else {
    if (typeof variant.body !== 'string') {
      return NextResponse.json({ error: 'variant has no body for full-entity branch' }, { status: 422 });
    }
    newBody = variant.body;
  }

  await upsertEntity(projectRoot, {
    type: entity.type,
    slug: entity.slug,
    name: entity.name,
    icon: entity.icon,
    body: newBody,
    status: entity.status,
    links: entity.links,
  }, { snapshotReason: 'sketch-merge' });

  branch.status = 'merged';
  branch.applied = { variantId: variant.id, ts: new Date().toISOString() };
  await saveBranch(projectRoot, branch);

  const fresh = await readEntity(projectRoot, entityType, entitySlug);
  return NextResponse.json({ ok: true, entity: fresh, branch });
}
