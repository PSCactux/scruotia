import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, promises as fsp } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { readEntity, writeEntity, listEntities, type Entity } from '../fs-db';

let testDir: string;

beforeEach(() => {
  testDir = mkdtempSync(path.join(tmpdir(), 'scruotia-'));
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

describe('fs-db', () => {
  it('writes and reads back an entity with frontmatter', async () => {
    const entity: Entity = {
      id: 'logline',
      type: 'premise',
      status: 'defined',
      summary: 'Una sola frase',
      body: 'Una cartógrafa busca el camino a casa y encuentra otro.',
      related: [],
    };
    await writeEntity(testDir, '00-premise/logline.md', entity);
    const read = await readEntity(testDir, '00-premise/logline.md');
    expect(read.id).toBe('logline');
    expect(read.body.trim()).toBe('Una cartógrafa busca el camino a casa y encuentra otro.');
    expect(read.status).toBe('defined');
  });

  it('lists entities in a folder', async () => {
    await writeEntity(testDir, '02-characters/aria.md', {
      id: 'aria', type: 'character', status: 'stub', summary: 'protag', body: '', related: [],
    });
    await writeEntity(testDir, '02-characters/elias.md', {
      id: 'elias', type: 'character', status: 'stub', summary: 'antag', body: '', related: [],
    });
    const list = await listEntities(testDir, '02-characters');
    expect(list).toHaveLength(2);
    expect(list.map(e => e.id).sort()).toEqual(['aria', 'elias']);
  });

  it('returns [] for a missing directory', async () => {
    expect(await listEntities(testDir, 'does-not-exist')).toEqual([]);
  });

  it('ignores non-markdown files', async () => {
    await writeEntity(testDir, '02-characters/aria.md', {
      id: 'aria', type: 'character', status: 'stub', summary: '', body: '', related: [],
    });
    await fsp.writeFile(path.join(testDir, '02-characters', 'notes.txt'), 'ignore me');
    const list = await listEntities(testDir, '02-characters');
    expect(list).toHaveLength(1);
  });

  it('round-trips arrays in frontmatter', async () => {
    const e: Entity = {
      id: 'aria', type: 'character', status: 'defined',
      summary: 's', body: 'b', related: ['elias', 'mira'],
    };
    await writeEntity(testDir, 'x.md', e);
    const back = await readEntity(testDir, 'x.md');
    expect(back.related).toEqual(['elias', 'mira']);
  });

  it('writes valid YAML frontmatter to disk', async () => {
    await writeEntity(testDir, 'x.md', {
      id: 'x', type: 't', status: 'stub', summary: 's', body: 'hi', related: [],
    });
    const raw = await fsp.readFile(path.join(testDir, 'x.md'), 'utf-8');
    expect(raw.startsWith('---')).toBe(true);
    expect(raw).toContain('id: x');
  });

  it('rejects path traversal attempts', async () => {
    await expect(readEntity(testDir, '../../../etc/passwd')).rejects.toThrow(/traversal/);
    await expect(writeEntity(testDir, '../escaped.md', {
      id: 'x', type: 't', status: 'stub', summary: '', body: '', related: [],
    })).rejects.toThrow(/traversal/);
  });
});
