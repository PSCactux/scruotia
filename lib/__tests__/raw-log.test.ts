import { describe, it, expect, beforeEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { logRawTurn, listRawTurns } from '../raw-log';

async function tmpProject(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'skriptia-raw-'));
}

describe('logRawTurn', () => {
  let root: string;
  beforeEach(async () => { root = await tmpProject(); });

  it('writes a file under 99-ai/raw-turns/ with frontmatter + body', async () => {
    const file = await logRawTurn(root, 'assistant', 'hola raw content');
    expect(file).not.toBe(null);
    const raw = await fs.readFile(file!, 'utf-8');
    expect(raw).toContain('role: assistant');
    expect(raw).toContain('chars: 16');
    expect(raw).toMatch(/ts: 20\d\d-/);
    expect(raw.endsWith('hola raw content')).toBe(true);
  });

  it('persists user turn too', async () => {
    await logRawTurn(root, 'user', 'mi mensaje');
    const turns = await listRawTurns(root);
    expect(turns).toHaveLength(1);
    expect(turns[0].role).toBe('user');
  });

  it('includes custom metadata in frontmatter when provided', async () => {
    const file = await logRawTurn(root, 'assistant', 'x', { focus: 'personaje/mara', model: 'opus-4-7' });
    const raw = await fs.readFile(file!, 'utf-8');
    expect(raw).toContain('focus: "personaje/mara"');
    expect(raw).toContain('model: "opus-4-7"');
  });

  it('listRawTurns returns newest first with role + ts parsed', async () => {
    await logRawTurn(root, 'user', 'a');
    await new Promise(r => setTimeout(r, 5));
    await logRawTurn(root, 'assistant', 'b');
    await new Promise(r => setTimeout(r, 5));
    await logRawTurn(root, 'user', 'c');
    const turns = await listRawTurns(root);
    expect(turns).toHaveLength(3);
    expect(turns[0].ts.localeCompare(turns[1].ts)).toBeGreaterThan(0);
    expect(turns[1].ts.localeCompare(turns[2].ts)).toBeGreaterThan(0);
    expect(turns.map(t => t.role)).toEqual(['user', 'assistant', 'user']);
  });

  it('returns empty list when no log directory exists', async () => {
    expect(await listRawTurns(root)).toEqual([]);
  });

  it('does not throw on writeFile errors (best-effort)', async () => {
    // Pass an unwritable parent (file masquerading as dir) — should swallow.
    const fake = await fs.mkdtemp(path.join(os.tmpdir(), 'skriptia-fakeroot-'));
    await fs.writeFile(path.join(fake, '99-ai'), 'I am a file, not a dir');
    const result = await logRawTurn(fake, 'user', 'x');
    expect(result).toBe(null);
  });
});
