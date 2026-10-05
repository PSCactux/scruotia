import { promises as fs } from 'node:fs';
import path from 'node:path';
import { loadMethodology, type Methodology } from './templates';
import { readEntity as readLegacyEntity } from './fs-db';
import {
  parseCharacterCards,
  parseCharacterBibles,
  parseScenes,
  parseVoiceStyle,
  parseWorldCanon,
  parseParagraphFields,
} from './step-views';
import { upsertEntity, slugify } from './entities';

async function hasAnyEntityFile(entitiesRoot: string): Promise<boolean> {
  let typeDirs: string[];
  try {
    typeDirs = (await fs.readdir(entitiesRoot, { withFileTypes: true }))
      .filter(d => d.isDirectory())
      .map(d => d.name);
  } catch {
    return false;
  }
  for (const t of typeDirs) {
    try {
      const files = await fs.readdir(path.join(entitiesRoot, t));
      if (files.some(f => f.endsWith('.md'))) return true;
    } catch {/* skip */}
  }
  return false;
}

/**
 * One-shot migration from legacy Snowflake step files to the new entity
 * graph. Runs on first project load when entities/ doesn't exist yet.
 *
 * Strategy:
 *  - logline → logline/main
 *  - paragraph (5 sentences) → estructura/main with body containing the 5 sections
 *  - voice → tono/main
 *  - character cards → one personaje/<slug> per character
 *  - character bibles → augment matching personaje/<slug>
 *  - world canon → one mundo/main (single doc) preserving section structure
 *  - synopsis → sinopsis/main
 *  - scenes → one escena/<slug> per scene
 *  - scene-narratives → augmented into corresponding escena bodies
 */
export async function migrateProjectToEntities(projectRoot: string, methodologyId: string): Promise<void> {
  // Skip migration if entities/ already contains at least one .md (i.e. it has
  // been migrated before, or the user has populated it manually). Empty
  // directories from a previously failed attempt are NOT considered migrated.
  const entitiesRoot = path.join(projectRoot, 'entities');
  if (await hasAnyEntityFile(entitiesRoot)) return;

  let methodology: Methodology;
  try {
    methodology = await loadMethodology(methodologyId);
  } catch {
    return;
  }

  // Helper to read a step's body.
  async function readStep(outputFile: string | null): Promise<string> {
    if (!outputFile) return '';
    try {
      const e = await readLegacyEntity(projectRoot, outputFile);
      return (e.body ?? '').trim();
    } catch { return ''; }
  }

  for (const step of methodology.steps) {
    if (!step.output_file) continue;
    const body = await readStep(step.output_file);
    if (!body) continue;

    switch (step.ui_kind) {
      case 'single_input':
        // logline
        await upsertEntity(projectRoot, {
          type: 'logline',
          slug: 'main',
          name: 'Logline',
          body,
          status: 'drafting',
        });
        break;

      case 'paragraph_fields': {
        // estructura
        const f = parseParagraphFields(body);
        const rendered = [
          f.setup && `## Setup\n${f.setup}`,
          f.disaster1 && `## Disastro 1\n${f.disaster1}`,
          f.disaster2 && `## Disastro 2\n${f.disaster2}`,
          f.disaster3 && `## Disastro 3\n${f.disaster3}`,
          f.resolution && `## Resolución\n${f.resolution}`,
        ].filter(Boolean).join('\n\n');
        await upsertEntity(projectRoot, {
          type: 'estructura',
          slug: 'main',
          name: 'Estructura en 5 frases',
          body: rendered,
          status: 'drafting',
        });
        break;
      }

      case 'voice_style': {
        const v = parseVoiceStyle(body);
        const lines = [
          v.person && `- **Persona:** ${v.person}`,
          v.tense && `- **Tiempo verbal:** ${v.tense}`,
          v.register && `- **Registro:** ${v.register}`,
          v.pacing && `- **Ritmo:** ${v.pacing}`,
          v.pov && `- **POV:** ${v.pov}`,
        ].filter(Boolean).join('\n');
        const sample = v.sample.trim() ? `\n\n## Muestra\n${v.sample.trim()}` : '';
        const notes = v.notes.trim() ? `\n\n## Notas\n${v.notes.trim()}` : '';
        await upsertEntity(projectRoot, {
          type: 'tono',
          slug: 'main',
          name: 'Tono y voz',
          body: `${lines}${sample}${notes}`,
          status: 'drafting',
        });
        break;
      }

      case 'character_cards': {
        const cards = parseCharacterCards(body);
        for (const c of cards) {
          if (!c.name.trim()) continue;
          const bullets = [
            c.role && `- **Rol:** ${c.role}`,
            c.want && `- **Want:** ${c.want}`,
            c.need && `- **Need:** ${c.need}`,
            c.arc && `- **Arco:** ${c.arc}`,
          ].filter(Boolean).join('\n');
          const desc = c.description.trim() ? `\n\n${c.description.trim()}` : '';
          await upsertEntity(projectRoot, {
            type: 'personaje',
            slug: slugify(c.name),
            name: c.name,
            body: `${bullets}${desc}`,
            status: 'drafting',
          });
        }
        break;
      }

      case 'character_bibles': {
        const bibles = parseCharacterBibles(body);
        for (const b of bibles) {
          if (!b.name.trim()) continue;
          const slug = slugify(b.name);
          // Read existing personaje so we can append bible info to its body.
          const { readEntity } = await import('./entities');
          const existing = await readEntity(projectRoot, 'personaje', slug);
          const bibleBullets = [
            b.role && `- **Rol:** ${b.role}`,
            b.backstory && `- **Backstory:** ${b.backstory}`,
            b.physical && `- **Físico:** ${b.physical}`,
            b.voice && `- **Voz:** ${b.voice}`,
            b.relationships && `- **Relaciones:** ${b.relationships}`,
            b.secrets && `- **Secretos:** ${b.secrets}`,
            b.arc && `- **Arco emocional:** ${b.arc}`,
          ].filter(Boolean).join('\n');
          const notes = b.notes.trim() ? `\n\n${b.notes.trim()}` : '';
          const augmented = existing?.body
            ? `${existing.body}\n\n## Bible\n${bibleBullets}${notes}`
            : `${bibleBullets}${notes}`;
          await upsertEntity(projectRoot, {
            type: 'personaje',
            slug,
            name: b.name,
            body: augmented,
            status: 'drafting',
          });
        }
        break;
      }

      case 'world_canon': {
        const w = parseWorldCanon(body);
        const sections = [
          w.places && `## Lugares\n${w.places}`,
          w.system && `## Sistema\n${w.system}`,
          w.vocabulary && `## Vocabulario\n${w.vocabulary}`,
          w.fauna && `## Fauna y cultura\n${w.fauna}`,
          w.customs && `## Costumbres\n${w.customs}`,
          w.calendar && `## Calendario\n${w.calendar}`,
          w.rules && `## Reglas inviolables\n${w.rules}`,
        ].filter(Boolean).join('\n\n');
        if (sections) {
          await upsertEntity(projectRoot, {
            type: 'mundo',
            slug: 'main',
            name: 'Canon del mundo',
            body: sections,
            status: 'drafting',
          });
          // Each "rule" inside rules also becomes its own regla/<slug>.
          if (w.rules.trim()) {
            const lines = w.rules.split('\n').map(l => l.replace(/^[-*]\s*/, '').trim()).filter(Boolean);
            for (let i = 0; i < lines.length; i++) {
              const r = lines[i];
              await upsertEntity(projectRoot, {
                type: 'regla',
                slug: slugify(r).slice(0, 60) || `regla-${i + 1}`,
                name: r.split('.')[0].slice(0, 80),
                body: r,
                status: 'drafting',
              });
            }
          }
        }
        break;
      }

      case 'scene_table': {
        const scenes = parseScenes(body);
        for (let i = 0; i < scenes.length; i++) {
          const s = scenes[i];
          const summary = s.whatHappens || s.beat || `Escena ${i + 1}`;
          const slug = slugify(`escena-${i + 1}-${summary}`).slice(0, 80);
          const bullets = [
            s.beat && `- **Beat:** ${s.beat}`,
            s.chapter && `- **Capítulo:** ${s.chapter}`,
            s.pov && `- **POV:** ${s.pov}`,
            s.charactersPresent && `- **Personajes presentes:** ${s.charactersPresent}`,
            s.location && `- **Ubicación:** ${s.location}`,
            s.whatHappens && `- **Qué pasa:** ${s.whatHappens}`,
            s.conflict && `- **Conflicto:** ${s.conflict}`,
            s.resolution && `- **Resolución parcial:** ${s.resolution}`,
            s.emotionalStart && `- **Estado emocional inicio:** ${s.emotionalStart}`,
            s.emotionalEnd && `- **Estado emocional fin:** ${s.emotionalEnd}`,
            s.newInfo && `- **Info nueva al lector:** ${s.newInfo}`,
            s.plant && `- **Planta:** ${s.plant}`,
            s.payoff && `- **Paga:** ${s.payoff}`,
            s.targetWords && `- **Target palabras:** ${s.targetWords}`,
          ].filter(Boolean).join('\n');
          await upsertEntity(projectRoot, {
            type: 'escena',
            slug,
            name: `Escena ${i + 1}: ${summary.slice(0, 60)}`,
            body: bullets,
            status: 'drafting',
            order: i + 1,
          });
        }
        break;
      }

      case 'markdown':
      default: {
        // Things like sinopsis / scene-narratives. Use the output_type as guide.
        if (step.output_type === 'structure') {
          await upsertEntity(projectRoot, {
            type: 'sinopsis',
            slug: 'main',
            name: 'Sinopsis',
            body,
            status: 'drafting',
          });
        }
        break;
      }
    }
  }
}
