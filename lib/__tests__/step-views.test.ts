import { describe, it, expect } from 'vitest';
import {
  parseParagraphFields, serializeParagraphFields,
  parseCharacterCards, serializeCharacterCards, emptyCharacter,
  parseCharacterBibles, serializeCharacterBibles, emptyCharacterBible,
  parseScenes, serializeScenes, emptyScene,
  parseVoiceStyle, serializeVoiceStyle, emptyVoiceStyle,
  parseWorldCanon, serializeWorldCanon, emptyWorldCanon,
} from '../step-views';

describe('paragraph_fields', () => {
  it('round-trips through markdown', () => {
    const f = { setup: 'A', disaster1: 'B', disaster2: 'C', disaster3: 'D', resolution: 'E' };
    expect(parseParagraphFields(serializeParagraphFields(f))).toEqual(f);
  });

  it('returns empty when md is blank', () => {
    expect(parseParagraphFields('')).toEqual({ setup: '', disaster1: '', disaster2: '', disaster3: '', resolution: '' });
  });

  it('parses out-of-order headings', () => {
    const md = '## Disastro 1\nfoo\n\n## Setup\nbar';
    const f = parseParagraphFields(md);
    expect(f.setup).toBe('bar');
    expect(f.disaster1).toBe('foo');
  });
});

describe('character_cards', () => {
  it('parses + serializes a single character', () => {
    const md = '## Aria\n- **Rol:** protagonist\n- **Want:** vengarse\n- **Need:** perdón\n- **Arco:** positivo\n\nAria es una cartógrafa.';
    const cards = parseCharacterCards(md);
    expect(cards).toHaveLength(1);
    expect(cards[0].name).toBe('Aria');
    expect(cards[0].role).toBe('protagonist');
    expect(cards[0].want).toBe('vengarse');
    expect(cards[0].description).toBe('Aria es una cartógrafa.');
  });

  it('round-trips multiple cards', () => {
    const cards = [
      { ...emptyCharacter(), name: 'Aria', role: 'protag', want: 'X', need: 'Y', arc: 'positivo', description: 'desc1' },
      { ...emptyCharacter(), name: 'Elias', role: 'antag', want: 'P', need: 'Q', arc: 'negativo', description: 'desc2' },
    ];
    expect(parseCharacterCards(serializeCharacterCards(cards))).toEqual(cards);
  });

  it('returns empty array for blank md', () => {
    expect(parseCharacterCards('')).toEqual([]);
  });
});

describe('character_bibles', () => {
  it('round-trips one bible with all fields', () => {
    const b = {
      ...emptyCharacterBible(),
      name: 'Aria',
      role: 'protagonist',
      backstory: 'Perdió a sus padres',
      physical: 'alta, pelo negro',
      voice: 'rápida, argot',
      relationships: 'con Lia, lealtad absoluta',
      secrets: 'quemó el mapa de su maestro',
      arc: 'de desconfianza a confianza',
      notes: 'Nota extra.',
    };
    const round = parseCharacterBibles(serializeCharacterBibles([b]));
    expect(round).toHaveLength(1);
    expect(round[0]).toEqual(b);
  });

  it('returns [] for blank md', () => {
    expect(parseCharacterBibles('')).toEqual([]);
  });
});

describe('scene_table', () => {
  it('round-trips multiple scenes with enriched fields', () => {
    const s1 = {
      ...emptyScene(),
      beat: 'Setup', chapter: '1', pov: 'Aria', charactersPresent: 'Aria, Lia',
      location: 'Mercado', whatHappens: 'Roba un pan', conflict: 'Guardias persiguen',
      resolution: 'Escapa', emotionalStart: 'hambre', emotionalEnd: 'culpa',
      newInfo: 'hay hambruna', plant: 'navaja oculta', payoff: '', targetWords: '900',
    };
    const s2 = {
      ...emptyScene(),
      beat: 'Catalizador', chapter: '2', pov: 'Elias', location: 'Castillo',
      whatHappens: 'Recibe orden', conflict: 'Duda moral', resolution: 'Acepta',
    };
    const round = parseScenes(serializeScenes([s1, s2]));
    expect(round).toEqual([s1, s2]);
  });

  it('skips fully-empty scenes', () => {
    const md = '## Escena 1\n- **Beat:**\n- **POV:**\n- **Ubicación:**\n- **Qué pasa:**\n- **Conflicto:**\n- **Resolución parcial:**';
    expect(parseScenes(md)).toEqual([]);
  });

  it('keeps backward compatibility with old 6-field scenes', () => {
    const md = '## Escena 1\n- **Beat:** Setup\n- **POV:** Aria\n- **Ubicación:** Mercado\n- **Qué pasa:** Roba\n- **Conflicto:** Guardias\n- **Resolución parcial:** Escapa';
    const out = parseScenes(md);
    expect(out).toHaveLength(1);
    expect(out[0].beat).toBe('Setup');
    expect(out[0].pov).toBe('Aria');
    expect(out[0].chapter).toBe('');
    expect(out[0].emotionalStart).toBe('');
  });
});

describe('voice_style', () => {
  it('round-trips a full voice doc', () => {
    const v = {
      ...emptyVoiceStyle(),
      person: '3ª limitada',
      tense: 'pasado',
      register: 'literario',
      pacing: 'medio',
      pov: 'rotativo entre 3 personajes',
      sample: 'Lo último que oyó Aria fue el rumor de la marea bajo el muelle.',
      notes: 'Capítulos de 2-3k palabras. Sin prólogos.',
    };
    expect(parseVoiceStyle(serializeVoiceStyle(v))).toEqual(v);
  });

  it('returns empty for blank md', () => {
    expect(parseVoiceStyle('')).toEqual(emptyVoiceStyle());
  });
});

describe('world_canon', () => {
  it('round-trips all sections', () => {
    const w = {
      places: 'Ciudad alta y ciudad baja, separadas por un muro.',
      system: 'La magia consume memoria.',
      vocabulary: 'memoriarcas, sombrahilo',
      fauna: 'Los lobos hablan.',
      customs: 'Se entierra a los muertos al amanecer.',
      calendar: '13 meses de 28 días.',
      rules: 'No se puede mentir bajo la luna llena.',
    };
    expect(parseWorldCanon(serializeWorldCanon(w))).toEqual(w);
  });

  it('returns empty for blank md', () => {
    expect(parseWorldCanon('')).toEqual(emptyWorldCanon());
  });

  it('handles partially-filled canon', () => {
    const w = { ...emptyWorldCanon(), places: 'Solo dos ciudades.', rules: 'No matar.' };
    expect(parseWorldCanon(serializeWorldCanon(w))).toEqual(w);
  });
});
