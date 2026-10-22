import { describe, it, expect, beforeAll } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { computePulse } from '../pulse';
import { listEntities, writeEntity } from '../entities';

// Small invented fixture project, written to a temp dir so the test
// exercises the real filesystem loader (listEntities) end to end.
async function fixtureProject(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'skriptia-pulse-'));
  const base = { status: 'drafting' as const, created: '2026-05-16T00:00:00Z', updated: '2026-05-16T00:00:00Z' };
  await writeEntity(root, {
    ...base, type: 'personaje', slug: 'mara', name: 'Mara',
    links: [{ to: 'lugar/faro', label: 'vive en' }],
    body: 'La farera que no quería visitas.\n\n- **Rol:** protagonista\n- **Want:** que la dejen en paz\n- **Need:** aceptar que necesita a alguien\n\n**Pendiente:** decidir su edad exacta.',
  });
  await writeEntity(root, {
    ...base, type: 'lugar', slug: 'faro', name: 'El faro',
    links: [],
    body: 'Un faro en un cabo que la marea separa del pueblo dos veces al día.',
  });
  await writeEntity(root, {
    ...base, type: 'escena', slug: 'esc-01-01', name: 'La luz de las tres',
    links: [{ to: 'personaje/mara' }],
    body: '- **Beat:** Apertura\n- **POV:** Mara\n- **Qué pasa:** Mara enciende la lámpara a mano.\n\n**Pendiente:** decidir la primera frase.',
  });
  return root;
}

describe('computePulse — on a fixture project', () => {
  let root: string;
  beforeAll(async () => { root = await fixtureProject(); });

  it('returns a pulse with all 4 phases and overall score', async () => {
    const entities = await listEntities(root);
    const pulse = computePulse(entities);

    expect(pulse.phases).toHaveLength(4);
    expect(pulse.phases.map(p => p.id)).toEqual(['semilla', 'huesos', 'trama', 'matices']);
    expect(pulse.overall).toBeGreaterThan(0);
    expect(pulse.overall).toBeLessThanOrEqual(1);
  });

  it('flags exactly one phase as current (the earliest non-ready, or matices if all ready)', async () => {
    const entities = await listEntities(root);
    const pulse = computePulse(entities);
    const currents = pulse.phases.filter(p => p.current);
    expect(currents).toHaveLength(1);
  });

  it('detects explicit Pendiente lines', async () => {
    const entities = await listEntities(root);
    const pulse = computePulse(entities);
    expect(pulse.pendientes.length).toBeGreaterThan(0);
    // Every pendiente has non-empty text.
    for (const p of pulse.pendientes) expect(p.text.trim()).not.toBe('');
  });

  it('issueCount sums ghosts + pendientes + brokenLinks', async () => {
    const entities = await listEntities(root);
    const pulse = computePulse(entities);
    expect(pulse.issueCount).toBe(pulse.ghosts.length + pulse.pendientes.length + pulse.brokenLinks.length);
  });
});

describe('computePulse — synthetic ghost / broken-link cases', () => {
  const minimal = (overrides: Partial<{ type: string; slug: string; body: string; links: Array<{ to: string }> }>) => ({
    type: 'personaje',
    slug: 'x',
    name: 'X',
    status: 'drafting' as const,
    links: [],
    created: '2026-05-16T00:00:00Z',
    updated: '2026-05-16T00:00:00Z',
    body: '',
    ...overrides,
  });

  it('flags an empty-body entity as ghost', () => {
    const pulse = computePulse([minimal({ slug: 'fantasma', body: '' })]);
    expect(pulse.ghosts).toHaveLength(1);
    expect(pulse.ghosts[0].reason).toBe('empty-body');
  });

  it('flags a body that is just template placeholders as template-only ghost', () => {
    const pulse = computePulse([
      minimal({ slug: 'plantilla', body: '- **Rol:** (protagonist | antagonist)\n- **Want:** (qué persigue)' }),
    ]);
    expect(pulse.ghosts).toHaveLength(1);
    expect(pulse.ghosts[0].reason).toBe('template-only');
  });

  it('does NOT flag a substantive body as ghost', () => {
    const pulse = computePulse([
      minimal({ slug: 'real', body: 'Una farera terca, sesenta y tantos, que heredó el faro de su padre.\n\n- **Rol:** protagonista\n- **Want:** que la dejen en paz' }),
    ]);
    expect(pulse.ghosts).toHaveLength(0);
  });

  it('detects broken links (links to a slug that does not exist)', () => {
    const pulse = computePulse([
      minimal({ slug: 'a', body: 'prose enough to count'.repeat(3), links: [{ to: 'personaje/inexistente' }] }),
    ]);
    expect(pulse.brokenLinks).toHaveLength(1);
    expect(pulse.brokenLinks[0]).toMatchObject({ from: 'personaje/a', to: 'personaje/inexistente' });
  });

  it('does NOT flag a link as broken when the target exists', () => {
    const pulse = computePulse([
      minimal({ slug: 'a', body: 'prose enough to count'.repeat(3), links: [{ to: 'personaje/b' }] }),
      minimal({ slug: 'b', body: 'prose enough to count'.repeat(3) }),
    ]);
    expect(pulse.brokenLinks).toHaveLength(0);
  });
});
