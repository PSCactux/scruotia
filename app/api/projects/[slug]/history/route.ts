import { NextRequest, NextResponse } from 'next/server';
import path from 'node:path';
import { PROJECTS_ROOT } from '@/lib/config';
import { listSnapshots, readSnapshot } from '@/lib/history';

export const runtime = 'nodejs';

/**
 * GET /api/projects/[slug]/history?type=X&slug=Y
 *   → { snapshots: SnapshotInfo[] }
 *
 * GET /api/projects/[slug]/history?type=X&slug=Y&timestamp=2026-...Z
 *   → { snapshot: { body, frontmatter, reason, timestamp } }
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const url = new URL(req.url);
  const type = url.searchParams.get('type');
  const entitySlug = url.searchParams.get('slug');
  const timestamp = url.searchParams.get('timestamp');
  if (!type || !entitySlug) {
    return NextResponse.json({ error: 'type and slug query params required' }, { status: 400 });
  }
  const projectRoot = path.join(PROJECTS_ROOT, slug);

  if (timestamp) {
    const snap = await readSnapshot(projectRoot, type, entitySlug, timestamp);
    if (!snap) return NextResponse.json({ error: 'snapshot not found' }, { status: 404 });
    return NextResponse.json({ snapshot: snap });
  }
  const snapshots = await listSnapshots(projectRoot, type, entitySlug);
  return NextResponse.json({ snapshots });
}
