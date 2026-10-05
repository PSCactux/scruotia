/**
 * Per-entity snapshot history. Every mutation (upsert or delete) saves a
 * copy of the previous file under `<project>/.history/<type>/<slug>/<ts>.md`
 * so the user can browse versions and restore one with a single click.
 *
 * Storage shape:
 *   projects/<slug>/
 *     .history/
 *       <type>/
 *         <slug>/
 *           2026-05-16T21-34-56.789Z.md   ← snapshot (ts in filename uses '-')
 *
 * Snapshots add two private frontmatter keys so we can list them without
 * parsing filenames: `_snapshotTs` (real ISO) and `_snapshotReason`
 * ('edit' | 'chat' | 'delete' | 'lock' | 'pre-restore' | string). Those keys
 * are stripped when restoring.
 *
 * Pruning keeps at most KEEP_RECENT snapshots verbatim, then one per day for
 * older history. Runs after every snapshot creation.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';

const HISTORY_DIR = '.history';
const KEEP_RECENT = 10;

const TYPE_RE = /^[a-z][a-z0-9-]*$/;
const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

export type SnapshotInfo = {
  /** ISO timestamp (with colons). */
  timestamp: string;
  /** Why the snapshot was made — 'edit', 'chat', 'delete', 'lock', 'pre-restore', or a custom string. */
  reason: string;
  /** Size of the snapshot file in bytes. */
  bytes: number;
  /** First 120 chars of the body, whitespace-collapsed. */
  bodyPreview: string;
};

export type SnapshotPayload = {
  timestamp: string;
  reason: string;
  body: string;
  frontmatter: Record<string, unknown>;
};

async function fileExists(p: string): Promise<boolean> {
  try { await fs.access(p); return true; } catch { return false; }
}

function historyDir(projectRoot: string, type: string, slug: string): string {
  if (!TYPE_RE.test(type)) throw new Error(`invalid entity type: ${type}`);
  if (!SLUG_RE.test(slug)) throw new Error(`invalid entity slug: ${slug}`);
  return path.join(projectRoot, HISTORY_DIR, type, slug);
}

function liveFile(projectRoot: string, type: string, slug: string): string {
  return path.join(projectRoot, 'entities', type, `${slug}.md`);
}

function isoToKey(iso: string): string {
  // Filename-safe: replace colons (forbidden on Windows) with dashes.
  return iso.replace(/:/g, '-');
}

function keyToIso(key: string): string {
  // 2026-05-16T21-34-56.789Z -> 2026-05-16T21:34:56.789Z
  return key.replace(/T(\d{2})-(\d{2})-/, 'T$1:$2:');
}

/**
 * Snapshot the current live file for an entity, if it exists. If the entity
 * doesn't exist yet (entirely new), this is a no-op. Always followed by
 * auto-pruning. The frontmatter is decorated with `_snapshotTs` and
 * `_snapshotReason` for fast listing without re-reading every file.
 */
export async function snapshotEntity(
  projectRoot: string,
  type: string,
  slug: string,
  reason: string = 'edit',
): Promise<string | null> {
  const live = liveFile(projectRoot, type, slug);
  let current: string;
  try {
    current = await fs.readFile(live, 'utf-8');
  } catch {
    return null;
  }
  let ts = new Date().toISOString();
  const dir = historyDir(projectRoot, type, slug);
  await fs.mkdir(dir, { recursive: true });
  // If two snapshots fire in the same millisecond (rare but possible on
  // restoreSnapshot), bump the suffix until the path is free.
  let dest = path.join(dir, `${isoToKey(ts)}.md`);
  let suffix = 0;
  while (await fileExists(dest)) {
    suffix++;
    dest = path.join(dir, `${isoToKey(ts)}-${suffix}.md`);
  }
  if (suffix > 0) {
    // Embed the suffix in the stored timestamp so list/read keep coherent.
    ts = `${ts.replace(/Z$/, '')}-${suffix}Z`;
  }

  const parsed = matter(current);
  const decoratedFm = { ...parsed.data, _snapshotTs: ts, _snapshotReason: reason };
  const out = matter.stringify(parsed.content, decoratedFm);
  await fs.writeFile(dest, out, 'utf-8');

  await pruneSnapshots(projectRoot, type, slug);
  return ts;
}

/**
 * List snapshots for an entity, newest first. Returns metadata only — call
 * `readSnapshot` for the full body.
 */
export async function listSnapshots(
  projectRoot: string,
  type: string,
  slug: string,
): Promise<SnapshotInfo[]> {
  const dir = historyDir(projectRoot, type, slug);
  let files: string[];
  try {
    files = await fs.readdir(dir);
  } catch {
    return [];
  }
  const out: SnapshotInfo[] = [];
  for (const file of files) {
    if (!file.endsWith('.md')) continue;
    const full = path.join(dir, file);
    let raw: string;
    let stat: { size: number };
    try {
      raw = await fs.readFile(full, 'utf-8');
      stat = await fs.stat(full);
    } catch { continue; }
    const parsed = matter(raw);
    const ts = (parsed.data._snapshotTs as string) ?? keyToIso(file.replace(/\.md$/, ''));
    const reason = (parsed.data._snapshotReason as string) ?? 'unknown';
    out.push({
      timestamp: ts,
      reason,
      bytes: stat.size,
      bodyPreview: parsed.content.replace(/\s+/g, ' ').trim().slice(0, 120),
    });
  }
  return out.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

/** Read a single snapshot by its ISO timestamp. Returns null if not found. */
export async function readSnapshot(
  projectRoot: string,
  type: string,
  slug: string,
  timestamp: string,
): Promise<SnapshotPayload | null> {
  const dir = historyDir(projectRoot, type, slug);
  const file = path.join(dir, `${isoToKey(timestamp)}.md`);
  let raw: string;
  try {
    raw = await fs.readFile(file, 'utf-8');
  } catch {
    return null;
  }
  const parsed = matter(raw);
  const reason = (parsed.data._snapshotReason as string) ?? 'unknown';
  const fm = { ...parsed.data };
  delete fm._snapshotTs;
  delete fm._snapshotReason;
  return { timestamp, reason, body: parsed.content, frontmatter: fm };
}

/**
 * Restore an entity to a previous snapshot. Before overwriting, snapshots
 * the current state with reason='pre-restore' so the user can always undo
 * the restore itself. Returns true on success, false if the snapshot or
 * the live file is missing.
 */
export async function restoreSnapshot(
  projectRoot: string,
  type: string,
  slug: string,
  timestamp: string,
): Promise<boolean> {
  const snap = await readSnapshot(projectRoot, type, slug, timestamp);
  if (!snap) return false;
  await snapshotEntity(projectRoot, type, slug, 'pre-restore');

  const fm: Record<string, unknown> = { ...snap.frontmatter };
  fm.updated = new Date().toISOString();
  const out = matter.stringify(snap.body, fm);
  const live = liveFile(projectRoot, type, slug);
  await fs.mkdir(path.dirname(live), { recursive: true });
  await fs.writeFile(live, out, 'utf-8');
  return true;
}

/**
 * Keep snapshots tidy. Conserves the KEEP_RECENT newest verbatim and one
 * snapshot per day for everything older. Runs after every snapshotEntity.
 */
export async function pruneSnapshots(
  projectRoot: string,
  type: string,
  slug: string,
): Promise<void> {
  const dir = historyDir(projectRoot, type, slug);
  let files: string[];
  try {
    files = await fs.readdir(dir);
  } catch {
    return;
  }
  const sorted = files.filter(f => f.endsWith('.md')).sort().reverse(); // newest first
  if (sorted.length <= KEEP_RECENT) return;

  const recent = sorted.slice(0, KEEP_RECENT);
  const older = sorted.slice(KEEP_RECENT);
  const keepOlder = new Set<string>();
  const seenDay = new Set<string>();
  for (const f of older) {
    const day = f.slice(0, 10); // YYYY-MM-DD
    if (!seenDay.has(day)) {
      seenDay.add(day);
      keepOlder.add(f);
    }
  }
  const keep = new Set([...recent, ...keepOlder]);
  for (const f of sorted) {
    if (!keep.has(f)) {
      await fs.unlink(path.join(dir, f)).catch(() => {});
    }
  }
}
