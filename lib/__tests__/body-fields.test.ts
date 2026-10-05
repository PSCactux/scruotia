import { describe, it, expect } from 'vitest';
import { parseBody, renderBody, mergeBody, getField, normalizeKey } from '../body-fields';

const MARA_BODY = `La farera que no quería visitas.

- **Oficio**: farera, sesenta y tantos, manos de cuerda y sal. Ya casi no baja al pueblo.
- **Rasgo central**: terca, como el propio faro. Simetría deliberada.
- **Pasado**: treinta años sola en el cabo; heredó el faro de su padre, **Ezequiel**.
- **Lo que quiere**: que la dejen en paz. Aunque no es verdad.
- **Lo que se lo impide**: que Tito no se va, y que ella misma no sabe pedir compañía.
- **Arco**: pasa de "la bruja del faro" a maestra.`;

const ESCENA_BODY = `- **Beat:** Apertura
- **Capítulo:** Cap. 1 — La luz de las tres
- **POV:** Mara
- **Personajes presentes:** Mara (sola, hablando con el faro)
- **Ubicación:** la sala de la lámpara, de madrugada.
- **Qué pasa:** Mara sube los 112 escalones para encender la lámpara a mano.
- **Target palabras:** 700-900

**Pendiente:** decidir la primera frase exacta (importa muchísimo).`;

const MUNDO_BODY = `## Lugares
El faro del cabo. El pueblo al otro lado del istmo.

## Sistema
La marea corta el camino al pueblo dos veces al día.

## Vocabulario
- "la lámpara" = la sala más alta del faro
- "el otro lado" = el pueblo`;

describe('normalizeKey', () => {
  it('strips accents and lowercases', () => {
    expect(normalizeKey('Lo Que QUIERE')).toBe('lo que quiere');
    expect(normalizeKey('Rasgo Central')).toBe('rasgo central');
    expect(normalizeKey('  ubicación  ')).toBe('ubicacion');
  });
});

describe('parseBody', () => {
  it('extracts intro + 6 fields from Mara body (Spanish keys, mixed `- **K**:` and `- **K:**`)', () => {
    const parsed = parseBody(MARA_BODY);
    expect(parsed.intro).toBe('La farera que no quería visitas.');
    expect(parsed.fields).toHaveLength(6);
    expect(parsed.fields[0]).toEqual({ key: 'Oficio', value: 'farera, sesenta y tantos, manos de cuerda y sal. Ya casi no baja al pueblo.' });
    expect(parsed.fields[3].key).toBe('Lo que quiere');
    expect(parsed.fields[5].key).toBe('Arco');
    expect(parsed.sections).toHaveLength(0);
    expect(parsed.pendiente).toBe('');
  });

  it('extracts a Pendiente line from an escena body', () => {
    const parsed = parseBody(ESCENA_BODY);
    expect(parsed.fields).toHaveLength(7);
    expect(getField(parsed, 'beat')).toBe('Apertura');
    expect(getField(parsed, /target/i)).toBe('700-900');
    expect(parsed.pendiente).toMatch(/primera frase exacta/);
  });

  it('extracts ## sections from a mundo body and keeps in-section bullets within the section body', () => {
    const parsed = parseBody(MUNDO_BODY);
    expect(parsed.fields).toHaveLength(0); // bullets live inside ## Vocabulario, not top-level
    const vocab = parsed.sections.find(s => s.title === 'Vocabulario');
    expect(vocab?.body).toContain('"la lámpara" = la sala más alta del faro');
    expect(parsed.sections.map(s => s.title)).toEqual(['Lugares', 'Sistema', 'Vocabulario']);
  });

  it('returns empty BodyFields for empty input', () => {
    const parsed = parseBody('');
    expect(parsed.intro).toBe('');
    expect(parsed.fields).toEqual([]);
    expect(parsed.sections).toEqual([]);
    expect(parsed.pendiente).toBe('');
  });
});

describe('renderBody', () => {
  it('round-trips intro + fields + pendiente canonically', () => {
    const parsed = parseBody(MARA_BODY);
    const out = renderBody(parsed);
    // Canonical: `- **Key:** value` (with colon inside the bold).
    expect(out).toContain('- **Oficio:** farera, sesenta y tantos');
    expect(out).toContain('La farera que no quería visitas.');
    expect(parseBody(out).fields).toHaveLength(parsed.fields.length);
  });

  it('round-trips ## sections', () => {
    const parsed = parseBody(MUNDO_BODY);
    const out = renderBody(parsed);
    expect(out).toContain('## Lugares');
    expect(out).toContain('## Sistema');
    expect(out).toContain('"la lámpara" = la sala más alta del faro');
    expect(parseBody(out).sections).toHaveLength(parsed.sections.length);
  });

  it('idempotent: parse → render → parse → render is stable', () => {
    const once = renderBody(parseBody(MARA_BODY));
    const twice = renderBody(parseBody(once));
    expect(twice).toBe(once);
  });
});

describe('mergeBody', () => {
  it('updates an existing field by normalized key, preserves all others', () => {
    const out = mergeBody(MARA_BODY, { 'lo que quiere': 'Enseñar a Tito a encender la lámpara' });
    const parsed = parseBody(out);
    expect(getField(parsed, 'lo que quiere')).toBe('Enseñar a Tito a encender la lámpara');
    expect(getField(parsed, 'oficio')).toMatch(/farera, sesenta/);
    expect(parsed.fields).toHaveLength(6); // no field added
  });

  it('appends a new field if key does not exist yet', () => {
    const out = mergeBody(MARA_BODY, { 'Need': 'Aceptar que necesita a alguien' });
    const parsed = parseBody(out);
    expect(parsed.fields).toHaveLength(7);
    expect(getField(parsed, 'need')).toBe('Aceptar que necesita a alguien');
  });

  it('updates pendiente via __pendiente sentinel', () => {
    const out = mergeBody(ESCENA_BODY, { __pendiente: 'resuelto: la frase es "El faro no duerme."' });
    expect(parseBody(out).pendiente).toMatch(/El faro no duerme/);
  });

  it('updates intro via __intro sentinel', () => {
    const out = mergeBody(MARA_BODY, { __intro: 'La farera que acabó enseñando.' });
    expect(parseBody(out).intro).toBe('La farera que acabó enseñando.');
  });

  it('accent-insensitive key matching', () => {
    const out = mergeBody(ESCENA_BODY, { 'ubicación': 'en la escalera de caracol, al alba' });
    expect(getField(parseBody(out), 'ubicacion')).toBe('en la escalera de caracol, al alba');
  });
});
