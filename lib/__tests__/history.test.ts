import { describe, it, expect, beforeEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { writeEntity, readEntity, type Entity } from '../entities';
import { snapshotEntity, listSnapshots, readSnapshot, restoreSnapshot, pruneSnapshots } from '../history';

async function tmpProject(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'scruotia-history-'));
  return root;
}

function makeEntity(overrides: Partial<Entity> = {}): Entity {
  return {
    type: 'personaje',
    slug: 'mara',
    name: 'Mara',
    icon: '🧭',
    status: 'drafting',
    links: [],
    created: '2026-05-16T00:00:00Z',
    updated: '2026-05-16T00:00:00Z',
    body: 'v1 body',
    ...overrides,
  };
}

const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

describe('snapshotEntity (direct API)', () => {
  let root: string;
  beforeEach(async () => { root = await tmpProject(); });

  it('returns null if the entity does not exist yet', async () => {
    const ts = await snapshotEntity(root, 'personaje', 'inexistente', 'edit');
    expect(ts).toBe(null);
  });

  it('saves a snapshot file under .history/<type>/<slug>/<ts>.md', async () => {
    await writeEntity(root, makeEntity({ body: 'v1' })); // no snapshot (file didn't exist)
    const ts = await snapshotEntity(root, 'personaje', 'mara', 'manual');
    expect(ts).toMatch(/^20\d\d-/);
    const dir = path.join(root, '.history', 'personaje', 'mara');
    const files = await fs.readdir(dir);
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/\.md$/);
    const raw = await fs.readFile(path.join(dir, files[0]), 'utf-8');
    expect(raw).toContain('v1');
    expect(raw).toContain('_snapshotReason: manual');
  });

});

describe('autosnapshot integration via writeEntity / deleteEntity', () => {
  let root: string;
  beforeEach(async () => { root = await tmpProject(); });

  it('first writeEntity does not snapshot (no previous file)', async () => {
    await writeEntity(root, makeEntity({ body: 'v1' }));
    expect(await listSnapshots(root, 'personaje', 'mara')).toEqual([]);
  });

  it('subsequent writeEntity snapshots the previous version with reason=edit by default', async () => {
    await writeEntity(root, makeEntity({ body: 'v1' }));
    await wait(2);
    await writeEntity(root, makeEntity({ body: 'v2' }));
    const snaps = await listSnapshots(root, 'personaje', 'mara');
    expect(snaps).toHaveLength(1);
    expect(snaps[0].reason).toBe('edit');
    expect(snaps[0].bodyPreview).toContain('v1');
  });

  it('honors a custom snapshotReason from the writer', async () => {
    await writeEntity(root, makeEntity({ body: 'v1' }));
    await wait(2);
    await writeEntity(root, makeEntity({ body: 'v2' }), { snapshotReason: 'chat' });
    expect((await listSnapshots(root, 'personaje', 'mara'))[0].reason).toBe('chat');
  });
});

describe('listSnapshots ordering', () => {
  let root: string;
  beforeEach(async () => { root = await tmpProject(); });

  it('returns snapshots newest first', async () => {
    await writeEntity(root, makeEntity({ body: 'v1' })); // no snap
    await wait(2);
    await writeEntity(root, makeEntity({ body: 'v2 with prose' })); // snap of v1
    await wait(2);
    await writeEntity(root, makeEntity({ body: 'v3 even later' }), { snapshotReason: 'chat' }); // snap of v2
    const snaps = await listSnapshots(root, 'personaje', 'mara');
    expect(snaps).toHaveLength(2);
    expect(snaps[0].reason).toBe('chat');
    expect(snaps[0].bodyPreview).toContain('v2');
    expect(snaps[1].bodyPreview).toContain('v1');
  });
});

describe('readSnapshot + restoreSnapshot', () => {
  let root: string;
  beforeEach(async () => { root = await tmpProject(); });

  it('readSnapshot returns the saved body and strips _snapshot* meta', async () => {
    await writeEntity(root, makeEntity({ body: 'v1 immortal' }));
    const ts = await snapshotEntity(root, 'personaje', 'mara', 'manual');
    expect(ts).not.toBe(null);
    const snap = await readSnapshot(root, 'personaje', 'mara', ts!);
    expect(snap).not.toBe(null);
    expect(snap!.body.trim()).toBe('v1 immortal');
    expect(snap!.frontmatter._snapshotTs).toBeUndefined();
    expect(snap!.frontmatter._snapshotReason).toBeUndefined();
    expect(snap!.frontmatter.name).toBe('Mara');
  });

  it('restoreSnapshot writes the snapshot body over the live file', async () => {
    await writeEntity(root, makeEntity({ body: 'v1 ORIGINAL' }));
    const ts = await snapshotEntity(root, 'personaje', 'mara', 'manual');
    await wait(2);
    await writeEntity(root, makeEntity({ body: 'v2 REPLACED' }));

    const ok = await restoreSnapshot(root, 'personaje', 'mara', ts!);
    expect(ok).toBe(true);
    const restored = await readEntity(root, 'personaje', 'mara');
    expect(restored!.body.trim()).toBe('v1 ORIGINAL');
  });

  it('restoreSnapshot snapshots the current live state with reason=pre-restore', async () => {
    await writeEntity(root, makeEntity({ body: 'v1' }));
    const ts1 = await snapshotEntity(root, 'personaje', 'mara', 'manual'); // snap of v1
    await wait(2);
    await writeEntity(root, makeEntity({ body: 'v2 about to be undone' })); // auto-snap of v1 (edit)
    await restoreSnapshot(root, 'personaje', 'mara', ts1!); // pre-restore snap of v2 + write v1 over
    const snaps = await listSnapshots(root, 'personaje', 'mara');
    // Snapshots now: manual(v1) + edit(v1) + pre-restore(v2) = 3
    expect(snaps).toHaveLength(3);
    expect(snaps.some(s => s.reason === 'pre-restore' && s.bodyPreview.includes('v2'))).toBe(true);
  });

  it('returns false if the snapshot does not exist', async () => {
    expect(await restoreSnapshot(root, 'personaje', 'mara', '2099-01-01T00:00:00.000Z')).toBe(false);
  });
});

describe('deleteEntity snapshots before removing', () => {
  let root: string;
  beforeEach(async () => { root = await tmpProject(); });

  it('deletes the live file but keeps a snapshot reachable via readSnapshot', async () => {
    const { deleteEntity } = await import('../entities');
    await writeEntity(root, makeEntity({ body: 'final words' }));
    await deleteEntity(root, 'personaje', 'mara');
    expect(await readEntity(root, 'personaje', 'mara')).toBe(null);
    const snaps = await listSnapshots(root, 'personaje', 'mara');
    expect(snaps).toHaveLength(1);
    expect(snaps[0].reason).toBe('delete');
    expect(snaps[0].bodyPreview).toContain('final words');
  });
});

describe('pruneSnapshots', () => {
  let root: string;
  beforeEach(async () => { root = await tmpProject(); });

  it('keeps everything when under KEEP_RECENT (10)', async () => {
    // 6 writes → 5 snapshots (first write doesn't snap), well under 10.
    for (let i = 1; i <= 6; i++) {
      await writeEntity(root, makeEntity({ body: `v${i}` }));
      await wait(2);
    }
    expect(await listSnapshots(root, 'personaje', 'mara')).toHaveLength(5);
  });

  it('keeps 10 newest + 1 per older day when over KEEP_RECENT', async () => {
    // Synthesize 13 snapshots directly so the per-day rule is exercised.
    const dir = path.join(root, '.history', 'personaje', 'mara');
    await fs.mkdir(dir, { recursive: true });
    const stamps = [
      '2026-05-16T10-00-00.000Z', '2026-05-16T11-00-00.000Z',
      '2026-05-16T12-00-00.000Z', '2026-05-16T13-00-00.000Z',
      '2026-05-16T14-00-00.000Z', '2026-05-16T15-00-00.000Z',
      '2026-05-16T16-00-00.000Z', '2026-05-16T17-00-00.000Z',
      '2026-05-16T18-00-00.000Z', '2026-05-16T19-00-00.000Z', // ↑ newest 10
      '2026-05-15T09-00-00.000Z', '2026-05-15T10-00-00.000Z', // 2 older same day
      '2026-05-14T12-00-00.000Z',                              // 1 older other day
    ];
    for (const s of stamps) {
      await fs.writeFile(
        path.join(dir, `${s}.md`),
        `---\n_snapshotTs: ${s.replace(/T(\d{2})-(\d{2})-/, 'T$1:$2:')}\n_snapshotReason: synthetic\n---\nbody-${s}`,
        'utf-8',
      );
    }
    await pruneSnapshots(root, 'personaje', 'mara');
    const remaining = await fs.readdir(dir);
    expect(remaining).toHaveLength(12); // 10 newest + 1 per older day (2 distinct days)
    expect(remaining).toContain('2026-05-15T10-00-00.000Z.md');
    expect(remaining).not.toContain('2026-05-15T09-00-00.000Z.md');
    expect(remaining).toContain('2026-05-14T12-00-00.000Z.md');
  });
});
