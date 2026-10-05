import { NextRequest } from 'next/server';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { loadProject } from '@/lib/projects';
import { listEntities, type Entity } from '@/lib/entities';
import { migrateProjectToEntities } from '@/lib/entity-migration';
import { ENTITY_TYPES, getTypeDef } from '@/lib/entity-types';
import { PROJECTS_ROOT } from '@/lib/config';

export const runtime = 'nodejs';

function anchor(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export async function GET(_: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const project = await loadProject(PROJECTS_ROOT, slug);
  await migrateProjectToEntities(project.rootPath, project.manifest.methodology);
  const entities = await listEntities(project.rootPath);

  let facts = '';
  try {
    facts = (await fs.readFile(path.join(project.rootPath, '00-premise', 'facts.md'), 'utf-8')).trim();
  } catch {/* none */}

  // Group entities by type (ordered by catalog, then alphabetically by name).
  const grouped = new Map<string, Entity[]>();
  for (const e of entities) {
    if (!grouped.has(e.type)) grouped.set(e.type, []);
    grouped.get(e.type)!.push(e);
  }
  const knownIds = new Set(ENTITY_TYPES.map(t => t.id));
  const knownInUse = ENTITY_TYPES.filter(t => grouped.has(t.id)).map(t => t.id);
  const unknownInUse = [...grouped.keys()].filter(id => !knownIds.has(id)).sort();
  const typeOrder = [...knownInUse, ...unknownInUse];

  const out: string[] = [];

  out.push(`# ${project.manifest.title}`);
  out.push('');
  out.push(`> Bundle de bible para Fase 2 — generado: ${new Date().toISOString()}`);
  out.push('');

  // Contract block.
  out.push('## Instrucciones para Fase 2 (NO BORRAR)');
  out.push('');
  out.push('1. Este bundle es la **única fuente de verdad** para escribir la novela.');
  out.push('2. Si un dato concreto (nombre, edad, distancia, color, regla del mundo) no aparece aquí, **NO lo inventes**: escribe `[FALTA: <descripción>]` en su lugar y para.');
  out.push('3. Las entidades marcadas con 🔒 son canon inviolable. Si una escena las contradice, el error está en la escena.');
  out.push('4. La sección "Hechos canónicos" tiene prioridad sobre cualquier otra sección si hay conflicto.');
  out.push('5. La sección "Tono y voz" define el tono. Imítalo, no lo redescubras capítulo a capítulo.');
  out.push('');
  out.push('---');
  out.push('');

  // TOC.
  out.push('## Índice');
  out.push('');
  if (facts) out.push('- [Hechos canónicos](#hechos-can-nicos)');
  for (const t of typeOrder) {
    const def = getTypeDef(t);
    out.push(`- [${def.icon} ${def.pluralLabel}](#${anchor(def.pluralLabel)})`);
  }
  out.push('');

  // Facts.
  if (facts) {
    out.push('---');
    out.push('');
    out.push('## Hechos canónicos');
    out.push('');
    out.push('> Verdad inviolable. Sobre cualquier sección posterior, esta gana.');
    out.push('');
    out.push(facts);
    out.push('');
  }

  // Entities grouped by type.
  for (const t of typeOrder) {
    const def = getTypeDef(t);
    const list = grouped.get(t)!.slice().sort((a, b) => {
      const oa = (a as Entity & { order?: number }).order;
      const ob = (b as Entity & { order?: number }).order;
      if (typeof oa === 'number' && typeof ob === 'number') return oa - ob;
      return a.name.localeCompare(b.name);
    });
    out.push('---');
    out.push('');
    out.push(`## ${def.icon} ${def.pluralLabel}`);
    out.push('');
    for (const e of list) {
      const lockTag = e.status === 'locked' ? ' 🔒' : '';
      out.push(`### ${e.icon ?? def.icon} ${e.name}${lockTag}`);
      out.push('');
      if (e.links.length > 0) {
        const linkLines = e.links.map(l => {
          const target = entities.find(x => `${x.type}/${x.slug}` === l.to);
          const name = target ? `${target.icon ?? '•'} ${target.name}` : l.to;
          return `- ${name}${l.label ? ` — ${l.label}` : ''}`;
        });
        out.push('**Vínculos:**');
        out.push('');
        out.push(linkLines.join('\n'));
        out.push('');
      }
      if (e.body.trim()) {
        out.push(e.body.trim());
        out.push('');
      }
    }
  }

  const markdown = out.join('\n');
  const filename = `${slug}-bible.md`;

  return new Response(markdown, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
