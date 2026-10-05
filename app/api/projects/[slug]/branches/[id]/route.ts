import { NextRequest, NextResponse } from 'next/server';
import path from 'node:path';
import { PROJECTS_ROOT } from '@/lib/config';
import { readBranch, deleteBranch, saveBranch } from '@/lib/branches';

export const runtime = 'nodejs';

/**
 * GET    /api/projects/[slug]/branches/[id] → { branch } or 404
 * DELETE /api/projects/[slug]/branches/[id]
 *   Default: hard delete (removes the JSON file).
 *   With `?mark=discarded`: soft delete (marks status='discarded' but keeps
 *   it on disk for audit/history).
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await ctx.params;
  const projectRoot = path.join(PROJECTS_ROOT, slug);
  const branch = await readBranch(projectRoot, id);
  if (!branch) return NextResponse.json({ error: 'branch not found' }, { status: 404 });
  return NextResponse.json({ branch });
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await ctx.params;
  const url = new URL(req.url);
  const projectRoot = path.join(PROJECTS_ROOT, slug);

  if (url.searchParams.get('mark') === 'discarded') {
    const branch = await readBranch(projectRoot, id);
    if (!branch) return NextResponse.json({ error: 'branch not found' }, { status: 404 });
    branch.status = 'discarded';
    await saveBranch(projectRoot, branch);
    return NextResponse.json({ ok: true, branch });
  }
  await deleteBranch(projectRoot, id);
  return NextResponse.json({ ok: true });
}
