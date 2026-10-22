import { describe, it, expect, beforeEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { newBranchId, saveBranch, readBranch, deleteBranch, listBranches, parseVariants, type SketchBranch } from '../branches';

async function tmpProject(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'skriptia-branches-'));
}

function makeBranch(overrides: Partial<SketchBranch> = {}): SketchBranch {
  return {
    id: newBranchId(),
    scope: { entityRef: 'personaje/mara', fieldKey: null },
    prompt: 'genera 3 variantes',
    variants: [
      { id: 'a', label: 'Variante A', body: 'cuerpo A', raw: '<<<VARIANT:a:Variante A>>>cuerpo A<<<END>>>' },
      { id: 'b', label: 'Variante B', body: 'cuerpo B', raw: '<<<VARIANT:b:Variante B>>>cuerpo B<<<END>>>' },
    ],
    status: 'open',
    created: new Date().toISOString(),
    ...overrides,
  };
}

describe('newBranchId', () => {
  it('returns kebab-safe id with timestamp prefix', () => {
    const id = newBranchId();
    expect(id).toMatch(/^[0-9]{14}-[a-z0-9]{4}$/);
  });

  it('returns different ids on consecutive calls', () => {
    const ids = new Set([newBranchId(), newBranchId(), newBranchId(), newBranchId()]);
    expect(ids.size).toBeGreaterThan(1);
  });
});

describe('saveBranch / readBranch / deleteBranch', () => {
  let root: string;
  beforeEach(async () => { root = await tmpProject(); });

  it('persists a branch as JSON under 99-ai/branches/', async () => {
    const b = makeBranch();
    await saveBranch(root, b);
    const file = path.join(root, '99-ai', 'branches', `${b.id}.json`);
    const exists = await fs.access(file).then(() => true, () => false);
    expect(exists).toBe(true);
  });

  it('round-trips structure exactly', async () => {
    const b = makeBranch();
    await saveBranch(root, b);
    const got = await readBranch(root, b.id);
    expect(got).toEqual(b);
  });

  it('readBranch returns null when not found', async () => {
    expect(await readBranch(root, '99999999999999-zzzz')).toBe(null);
  });

  it('deleteBranch removes the file silently', async () => {
    const b = makeBranch();
    await saveBranch(root, b);
    await deleteBranch(root, b.id);
    expect(await readBranch(root, b.id)).toBe(null);
  });

  it('rejects invalid ids on save/read/delete', async () => {
    const bad = makeBranch({ id: '../escape' });
    await expect(saveBranch(root, bad)).rejects.toThrow(/invalid branch id/);
  });
});

describe('listBranches', () => {
  let root: string;
  beforeEach(async () => { root = await tmpProject(); });

  it('returns empty array when no branches', async () => {
    expect(await listBranches(root)).toEqual([]);
  });

  it('returns branches newest first', async () => {
    const b1 = makeBranch({ created: '2026-05-15T10:00:00Z' });
    const b2 = makeBranch({ created: '2026-05-17T11:00:00Z' });
    const b3 = makeBranch({ created: '2026-05-16T12:00:00Z' });
    await saveBranch(root, b1);
    await saveBranch(root, b2);
    await saveBranch(root, b3);
    const got = await listBranches(root);
    expect(got.map(b => b.created)).toEqual([
      '2026-05-17T11:00:00Z',
      '2026-05-16T12:00:00Z',
      '2026-05-15T10:00:00Z',
    ]);
  });

  it('supports field-scoped branches with value variants', async () => {
    const b = makeBranch({
      scope: { entityRef: 'personaje/mara', fieldKey: 'Want' },
      variants: [
        { id: 'a', label: 'Guardiana', value: 'que el faro siga encendido', raw: '...' },
        { id: 'b', label: 'Espejo', value: 'tener a alguien a quien enseñar', raw: '...' },
      ],
    });
    await saveBranch(root, b);
    const got = await readBranch(root, b.id);
    expect(got!.scope.fieldKey).toBe('Want');
    expect(got!.variants[0].value).toBe('que el faro siga encendido');
  });
});

describe('parseVariants', () => {
  it('extracts blocks with id, label and content', () => {
    const text = `Aquí van 2 versiones:
<<<VARIANT:a:Guardiana terca>>>
Que el faro siga encendido.
<<<END>>>
<<<VARIANT:b:Espejo>>>
Tener a alguien a quien enseñar.
<<<END>>>`;
    const out = parseVariants(text);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ id: 'a', label: 'Guardiana terca' });
    expect(out[0].content).toBe('Que el faro siga encendido.');
    expect(out[1].id).toBe('b');
  });

  it('normalizes ids (accents, spaces, casing) and dedups collisions', () => {
    const text = `<<<VARIANT: Á : Primera >>>x<<<END>>>
<<<VARIANT:a:Segunda>>>y<<<END>>>
<<<VARIANT:A:Tercera>>>z<<<END>>>`;
    const out = parseVariants(text);
    expect(out.map(v => v.id)).toEqual(['a', 'a-2', 'a-3']);
  });

  it('preserves multi-line content', () => {
    const text = `<<<VARIANT:a:Multi>>>
line 1
line 2
line 3
<<<END>>>`;
    expect(parseVariants(text)[0].content).toBe('line 1\nline 2\nline 3');
  });

  it('returns empty when no blocks present', () => {
    expect(parseVariants('Sin nada que parsear.')).toEqual([]);
  });
});
