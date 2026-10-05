// ---------- paragraph_fields ----------
export type ParagraphFields = {
  setup: string;
  disaster1: string;
  disaster2: string;
  disaster3: string;
  resolution: string;
};

const PARAGRAPH_LABELS: Array<{ key: keyof ParagraphFields; heading: string }> = [
  { key: 'setup', heading: 'Setup' },
  { key: 'disaster1', heading: 'Disastro 1' },
  { key: 'disaster2', heading: 'Disastro 2' },
  { key: 'disaster3', heading: 'Disastro 3' },
  { key: 'resolution', heading: 'Resolución' },
];

export function parseParagraphFields(md: string): ParagraphFields {
  const empty: ParagraphFields = { setup: '', disaster1: '', disaster2: '', disaster3: '', resolution: '' };
  if (!md.trim()) return empty;
  // Split on ## headings
  const sections = md.split(/(^|\n)##\s+/).slice(1); // first element before first heading is dropped
  // sections is like: ['Setup\nbody...', 'Disastro 1\nbody...', ...]
  for (const sec of sections) {
    const newlineIdx = sec.indexOf('\n');
    const headingRaw = (newlineIdx === -1 ? sec : sec.slice(0, newlineIdx)).trim();
    const body = (newlineIdx === -1 ? '' : sec.slice(newlineIdx + 1)).trim();
    const match = PARAGRAPH_LABELS.find(p => headingRaw.toLowerCase().startsWith(p.heading.toLowerCase()));
    if (match) empty[match.key] = body;
  }
  return empty;
}

export function serializeParagraphFields(f: ParagraphFields): string {
  return PARAGRAPH_LABELS
    .map(({ key, heading }) => `## ${heading}\n${f[key].trim()}`)
    .join('\n\n');
}

// ---------- character_cards ----------
export type CharacterCard = {
  name: string;
  role: string;
  want: string;
  need: string;
  arc: string;
  description: string;
};

export function emptyCharacter(): CharacterCard {
  return { name: '', role: '', want: '', need: '', arc: '', description: '' };
}

const CARD_FIELD_KEYS: Array<{ key: keyof Omit<CharacterCard, 'name' | 'description'>; label: string }> = [
  { key: 'role', label: 'Rol' },
  { key: 'want', label: 'Want' },
  { key: 'need', label: 'Need' },
  { key: 'arc', label: 'Arco' },
];

export function parseCharacterCards(md: string): CharacterCard[] {
  if (!md.trim()) return [];
  // Split on ## headings (heading itself is the character name)
  const parts = md.split(/(^|\n)##\s+/).slice(1);
  const cards: CharacterCard[] = [];
  for (const part of parts) {
    const newlineIdx = part.indexOf('\n');
    const name = (newlineIdx === -1 ? part : part.slice(0, newlineIdx)).trim();
    const body = (newlineIdx === -1 ? '' : part.slice(newlineIdx + 1));
    if (!name) continue;
    const card: CharacterCard = { ...emptyCharacter(), name };

    // Parse bullet fields: "- **Label:** value"
    const lines = body.split('\n');
    const descLines: string[] = [];
    for (const line of lines) {
      const m = line.match(/^\s*-\s*\*\*([^*]+):\*\*\s*(.*)$/);
      if (m) {
        const labelLower = m[1].trim().toLowerCase();
        const found = CARD_FIELD_KEYS.find(f => f.label.toLowerCase() === labelLower);
        if (found) {
          card[found.key] = m[2].trim();
          continue;
        }
      }
      descLines.push(line);
    }
    card.description = descLines.join('\n').trim();
    cards.push(card);
  }
  return cards;
}

export function serializeCharacterCards(cards: CharacterCard[]): string {
  return cards
    .filter(c => c.name.trim())
    .map(c => {
      const bullets = CARD_FIELD_KEYS
        .filter(f => c[f.key].trim())
        .map(f => `- **${f.label}:** ${c[f.key].trim()}`)
        .join('\n');
      const desc = c.description.trim() ? `\n\n${c.description.trim()}` : '';
      return `## ${c.name.trim()}\n${bullets}${desc}`;
    })
    .join('\n\n');
}

// ---------- character_bibles ----------
export type CharacterBible = {
  name: string;
  role: string;
  backstory: string;
  physical: string;
  voice: string;
  relationships: string;
  secrets: string;
  arc: string;
  notes: string;
};

export function emptyCharacterBible(): CharacterBible {
  return { name: '', role: '', backstory: '', physical: '', voice: '', relationships: '', secrets: '', arc: '', notes: '' };
}

const BIBLE_FIELD_KEYS: Array<{ key: keyof Omit<CharacterBible, 'name' | 'notes'>; label: string }> = [
  { key: 'role', label: 'Rol' },
  { key: 'backstory', label: 'Backstory' },
  { key: 'physical', label: 'Físico' },
  { key: 'voice', label: 'Voz' },
  { key: 'relationships', label: 'Relaciones' },
  { key: 'secrets', label: 'Secretos' },
  { key: 'arc', label: 'Arco emocional' },
];

export function parseCharacterBibles(md: string): CharacterBible[] {
  if (!md.trim()) return [];
  const parts = md.split(/(^|\n)##\s+/).slice(1);
  const bibles: CharacterBible[] = [];
  for (const part of parts) {
    const newlineIdx = part.indexOf('\n');
    const name = (newlineIdx === -1 ? part : part.slice(0, newlineIdx)).trim();
    const body = (newlineIdx === -1 ? '' : part.slice(newlineIdx + 1));
    if (!name) continue;
    const bible: CharacterBible = { ...emptyCharacterBible(), name };

    const lines = body.split('\n');
    const notesLines: string[] = [];
    for (const line of lines) {
      const m = line.match(/^\s*-\s*\*\*([^*]+):\*\*\s*(.*)$/);
      if (m) {
        const labelLower = m[1].trim().toLowerCase();
        const found = BIBLE_FIELD_KEYS.find(f => f.label.toLowerCase() === labelLower);
        if (found) {
          bible[found.key] = m[2].trim();
          continue;
        }
      }
      notesLines.push(line);
    }
    bible.notes = notesLines.join('\n').trim();
    bibles.push(bible);
  }
  return bibles;
}

export function serializeCharacterBibles(bibles: CharacterBible[]): string {
  return bibles
    .filter(b => b.name.trim())
    .map(b => {
      const bullets = BIBLE_FIELD_KEYS
        .filter(f => b[f.key].trim())
        .map(f => `- **${f.label}:** ${b[f.key].trim()}`)
        .join('\n');
      const notes = b.notes.trim() ? `\n\n${b.notes.trim()}` : '';
      return `## ${b.name.trim()}\n${bullets}${notes}`;
    })
    .join('\n\n');
}

// ---------- scene_table ----------
export type Scene = {
  beat: string;
  chapter: string;
  pov: string;
  charactersPresent: string;
  location: string;
  whatHappens: string;
  conflict: string;
  resolution: string;
  emotionalStart: string;
  emotionalEnd: string;
  newInfo: string;
  plant: string;
  payoff: string;
  targetWords: string;
};

export function emptyScene(): Scene {
  return {
    beat: '', chapter: '', pov: '', charactersPresent: '',
    location: '', whatHappens: '', conflict: '', resolution: '',
    emotionalStart: '', emotionalEnd: '', newInfo: '',
    plant: '', payoff: '', targetWords: '',
  };
}

const SCENE_FIELD_KEYS: Array<{ key: keyof Scene; label: string }> = [
  { key: 'beat', label: 'Beat' },
  { key: 'chapter', label: 'Capítulo' },
  { key: 'pov', label: 'POV' },
  { key: 'charactersPresent', label: 'Personajes presentes' },
  { key: 'location', label: 'Ubicación' },
  { key: 'whatHappens', label: 'Qué pasa' },
  { key: 'conflict', label: 'Conflicto' },
  { key: 'resolution', label: 'Resolución parcial' },
  { key: 'emotionalStart', label: 'Estado emocional inicio' },
  { key: 'emotionalEnd', label: 'Estado emocional fin' },
  { key: 'newInfo', label: 'Info nueva al lector' },
  { key: 'plant', label: 'Planta' },
  { key: 'payoff', label: 'Paga' },
  { key: 'targetWords', label: 'Target palabras' },
];

export function parseScenes(md: string): Scene[] {
  if (!md.trim()) return [];
  const parts = md.split(/(^|\n)##\s+/).slice(1);
  const scenes: Scene[] = [];
  for (const part of parts) {
    const newlineIdx = part.indexOf('\n');
    const body = (newlineIdx === -1 ? '' : part.slice(newlineIdx + 1));
    const scene = emptyScene();
    const lines = body.split('\n');
    for (const line of lines) {
      const m = line.match(/^\s*-\s*\*\*([^*]+):\*\*\s*(.*)$/);
      if (m) {
        const labelLower = m[1].trim().toLowerCase();
        const found = SCENE_FIELD_KEYS.find(f => f.label.toLowerCase() === labelLower);
        if (found) {
          scene[found.key] = m[2].trim();
        }
      }
    }
    // Only push if at least one field has content
    if (Object.values(scene).some(v => v.trim())) {
      scenes.push(scene);
    }
  }
  return scenes;
}

export function serializeScenes(scenes: Scene[]): string {
  return scenes
    .map((s, i) => {
      const bullets = SCENE_FIELD_KEYS
        .map(f => `- **${f.label}:** ${s[f.key].trim()}`)
        .join('\n');
      return `## Escena ${i + 1}\n${bullets}`;
    })
    .join('\n\n');
}

// ---------- voice_style ----------
export type VoiceStyle = {
  person: string;
  tense: string;
  register: string;
  pacing: string;
  pov: string;
  sample: string;
  notes: string;
};

export function emptyVoiceStyle(): VoiceStyle {
  return { person: '', tense: '', register: '', pacing: '', pov: '', sample: '', notes: '' };
}

const VOICE_FIELD_KEYS: Array<{ key: keyof Omit<VoiceStyle, 'sample' | 'notes'>; label: string }> = [
  { key: 'person', label: 'Persona' },
  { key: 'tense', label: 'Tiempo verbal' },
  { key: 'register', label: 'Registro' },
  { key: 'pacing', label: 'Ritmo' },
  { key: 'pov', label: 'POV' },
];

export function parseVoiceStyle(md: string): VoiceStyle {
  const v = emptyVoiceStyle();
  if (!md.trim()) return v;

  const parts = md.split(/(^|\n)##\s+/).slice(1);
  for (const part of parts) {
    const newlineIdx = part.indexOf('\n');
    const heading = (newlineIdx === -1 ? part : part.slice(0, newlineIdx)).trim().toLowerCase();
    const body = (newlineIdx === -1 ? '' : part.slice(newlineIdx + 1)).trim();
    if (heading.startsWith('muestra') || heading.startsWith('sample')) {
      v.sample = body;
    } else if (heading.startsWith('notas') || heading.startsWith('notes')) {
      v.notes = body;
    }
  }

  // Parse top-level bullet fields (above any ## heading)
  const beforeHeadings = md.split(/^##\s+/m)[0];
  for (const line of beforeHeadings.split('\n')) {
    const m = line.match(/^\s*-\s*\*\*([^*]+):\*\*\s*(.*)$/);
    if (m) {
      const labelLower = m[1].trim().toLowerCase();
      const found = VOICE_FIELD_KEYS.find(f => f.label.toLowerCase() === labelLower);
      if (found) v[found.key] = m[2].trim();
    }
  }
  return v;
}

export function serializeVoiceStyle(v: VoiceStyle): string {
  const bullets = VOICE_FIELD_KEYS
    .map(f => `- **${f.label}:** ${v[f.key].trim()}`)
    .join('\n');
  const sample = v.sample.trim() ? `\n\n## Muestra\n${v.sample.trim()}` : '';
  const notes = v.notes.trim() ? `\n\n## Notas\n${v.notes.trim()}` : '';
  return `${bullets}${sample}${notes}`;
}

// ---------- world_canon ----------
export type WorldCanon = {
  places: string;
  system: string;
  vocabulary: string;
  fauna: string;
  customs: string;
  calendar: string;
  rules: string;
};

export function emptyWorldCanon(): WorldCanon {
  return { places: '', system: '', vocabulary: '', fauna: '', customs: '', calendar: '', rules: '' };
}

const WORLD_SECTION_KEYS: Array<{ key: keyof WorldCanon; heading: string }> = [
  { key: 'places', heading: 'Lugares' },
  { key: 'system', heading: 'Sistema' },
  { key: 'vocabulary', heading: 'Vocabulario' },
  { key: 'fauna', heading: 'Fauna y cultura' },
  { key: 'customs', heading: 'Costumbres' },
  { key: 'calendar', heading: 'Calendario' },
  { key: 'rules', heading: 'Reglas inviolables' },
];

export function parseWorldCanon(md: string): WorldCanon {
  const w = emptyWorldCanon();
  if (!md.trim()) return w;
  const parts = md.split(/(^|\n)##\s+/).slice(1);
  for (const part of parts) {
    const newlineIdx = part.indexOf('\n');
    const heading = (newlineIdx === -1 ? part : part.slice(0, newlineIdx)).trim();
    const body = (newlineIdx === -1 ? '' : part.slice(newlineIdx + 1)).trim();
    const match = WORLD_SECTION_KEYS.find(s => heading.toLowerCase().startsWith(s.heading.toLowerCase()));
    if (match) w[match.key] = body;
  }
  return w;
}

export function serializeWorldCanon(w: WorldCanon): string {
  return WORLD_SECTION_KEYS
    .filter(s => w[s.key].trim())
    .map(s => `## ${s.heading}\n${w[s.key].trim()}`)
    .join('\n\n');
}
