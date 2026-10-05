import { NextRequest, NextResponse } from 'next/server';
import path from 'node:path';
import { PROJECTS_ROOT } from '@/lib/config';
import { restoreSnapshot } from '@/lib/history';
import { readEntity } from '@/lib/entities';

export const runtime = 'nodejs';

/**
 * POST /api/projects/[slug]/history/restore
 *   body: { type, slug, timestamp }
 *   → { ok: true, entity }
 *
 * Restores the entity to the given snapshot. The current live state is
 * auto-saved as a 'pre-restore' snapshot inside restoreSnapshot, so the
 * restore itself is also undoable.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const { type, slug: entitySlug, timestamp } = (await req.json()) as {
    type?: string; slug?: string; timestamp?: string;
  };
  if (!type || !entitySlug || !timestamp) {
    return NextResponse.json({ error: 'type, slug and timestamp required' }, { status: 400 });
  }
  const projectRoot = path.join(PROJECTS_ROOT, slug);
  const ok = await restoreSnapshot(projectRoot, type, entitySlug, timestamp);
  if (!ok) return NextResponse.json({ error: 'snapshot not found' }, { status: 404 });
  const entity = await readEntity(projectRoot, type, entitySlug);
  return NextResponse.json({ ok: true, entity });
}
