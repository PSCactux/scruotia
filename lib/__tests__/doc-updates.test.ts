import { describe, it, expect } from 'vitest';
import { extractDocUpdate, extractProjectUpdates, extractEntityUpdates } from '../doc-updates';

describe('extractDocUpdate', () => {
  it('returns null content and original text when no block present', () => {
    const r = extractDocUpdate('Solo conversación sin bloque.');
    expect(r.content).toBeNull();
    expect(r.cleanedText).toBe('Solo conversación sin bloque.');
  });

  it('extracts block and strips from text', () => {
    const t = 'Genial, lo apunto.\n\n<<<DOC>>>\nAria, cartógrafa exiliada, dibuja una isla que cambia.\n<<<END>>>';
    const r = extractDocUpdate(t);
    expect(r.content).toBe('Aria, cartógrafa exiliada, dibuja una isla que cambia.');
    expect(r.cleanedText).toBe('Genial, lo apunto.');
  });

  it('uses last block when multiple appear', () => {
    const t = '<<<DOC>>>\nv1\n<<<END>>>\nactualizo:\n<<<DOC>>>\nv2\n<<<END>>>';
    const r = extractDocUpdate(t);
    expect(r.content).toBe('v2');
    expect(r.cleanedText).toBe('actualizo:');
  });

  it('handles block at start of text', () => {
    const t = '<<<DOC>>>\nsolo contenido\n<<<END>>>';
    const r = extractDocUpdate(t);
    expect(r.content).toBe('solo contenido');
    expect(r.cleanedText).toBe('');
  });
});

describe('extractProjectUpdates', () => {
  it('returns empty maps and original text when no blocks present', () => {
    const r = extractProjectUpdates('Conversación sin bloques.');
    expect(r.docs.size).toBe(0);
    expect(r.facts).toEqual([]);
    expect(r.cleanedText).toBe('Conversación sin bloques.');
  });

  it('routes targeted DOC blocks to their artifact id', () => {
    const t = `Vale, anoto.

<<<DOC:step-01-logline>>>
Una farera, un chico y un faro.
<<<END>>>

<<<DOC:step-03-characters>>>
## Mara
- **Rol:** protagonist
<<<END>>>`;
    const r = extractProjectUpdates(t);
    expect(r.docs.get('step-01-logline')).toBe('Una farera, un chico y un faro.');
    expect(r.docs.get('step-03-characters')?.startsWith('## Mara')).toBe(true);
    expect(r.cleanedText).toBe('Vale, anoto.');
  });

  it('keeps last DOC per artifact when multiple appear', () => {
    const t = `<<<DOC:step-01-logline>>>v1<<<END>>>
<<<DOC:step-01-logline>>>v2<<<END>>>`;
    const r = extractProjectUpdates(t);
    expect(r.docs.get('step-01-logline')).toBe('v2');
  });

  it('collects multiple FACT blocks', () => {
    const t = `Vale.
<<<FACT>>>Los 3 protagonistas son animales DIFERENTES.<<<END>>>
<<<FACT>>>Mara tiene 64 años.<<<END>>>`;
    const r = extractProjectUpdates(t);
    expect(r.facts).toEqual([
      'Los 3 protagonistas son animales DIFERENTES.',
      'Mara tiene 64 años.',
    ]);
    expect(r.cleanedText).toBe('Vale.');
  });

  it('handles DOC and FACT blocks intermixed', () => {
    const t = `<<<DOC:step-01-logline>>>L<<<END>>>
<<<FACT>>>F1<<<END>>>
texto
<<<FACT>>>F2<<<END>>>`;
    const r = extractProjectUpdates(t);
    expect(r.docs.get('step-01-logline')).toBe('L');
    expect(r.facts).toEqual(['F1', 'F2']);
    expect(r.cleanedText).toBe('texto');
  });
});

describe('extractEntityUpdates', () => {
  it('parses a CARD block with attrs and body', () => {
    const t = `Vale, anoto.

<<<CARD:personaje:mara>>>
name=Mara
icon=🧭
---
Una farera terca con las manos llenas de sal.
<<<END>>>`;
    const r = extractEntityUpdates(t);
    expect(r.cards).toHaveLength(1);
    expect(r.cards[0].type).toBe('personaje');
    expect(r.cards[0].slug).toBe('mara');
    expect(r.cards[0].attrs).toEqual({ name: 'Mara', icon: '🧭' });
    expect(r.cards[0].body).toBe('Una farera terca con las manos llenas de sal.');
    expect(r.cleanedText).toBe('Vale, anoto.');
  });

  it('parses CARD without attrs block (body only)', () => {
    const t = `<<<CARD:lugar:faro>>>
El faro del cabo, con escalera de caracol.
<<<END>>>`;
    const r = extractEntityUpdates(t);
    expect(r.cards[0].attrs).toEqual({});
    expect(r.cards[0].body).toBe('El faro del cabo, con escalera de caracol.');
  });

  it('parses LINK blocks', () => {
    const t = `<<<LINK:personaje/mara:lugar/faro:vive en>>><<<END>>>
<<<LINK:personaje/mara:personaje/tito:aprendiz>>><<<END>>>`;
    const r = extractEntityUpdates(t);
    expect(r.links).toEqual([
      { from: 'personaje/mara', to: 'lugar/faro', label: 'vive en' },
      { from: 'personaje/mara', to: 'personaje/tito', label: 'aprendiz' },
    ]);
  });

  it('parses DELETE blocks', () => {
    const t = `<<<DELETE:personaje/borrame>>><<<END>>>`;
    const r = extractEntityUpdates(t);
    expect(r.deletes).toEqual([{ type: 'personaje', slug: 'borrame' }]);
  });

  it('handles CARD + LINK + FACT together and strips them all', () => {
    const t = `Genial.
<<<CARD:personaje:mara>>>name=Mara
---
Una farera.
<<<END>>>
<<<LINK:personaje/mara:lugar/faro:vive en>>><<<END>>>
<<<FACT>>>Mara vive sola en el faro.<<<END>>>`;
    const r = extractEntityUpdates(t);
    expect(r.cards).toHaveLength(1);
    expect(r.links).toHaveLength(1);
    expect(r.facts).toEqual(['Mara vive sola en el faro.']);
    expect(r.cleanedText).toBe('Genial.');
  });

  it('parses SUGGEST blocks (question only) and strips them from text', () => {
    const t = `Vale, anotado.

<<<SUGGEST>>>Profundizar en Mara<<<END>>>
<<<SUGGEST>>>Definir el antagonista<<<END>>>`;
    const r = extractEntityUpdates(t);
    expect(r.suggestions).toEqual([
      { question: 'Profundizar en Mara' },
      { question: 'Definir el antagonista' },
    ]);
    expect(r.cleanedText).toBe('Vale, anotado.');
  });

  it('parses SUGGEST blocks with inline answer options', () => {
    const t = `<<<SUGGEST>>>
¿Qué oficio tiene la protagonista?
- Farera
- Cartógrafa
- Pescadora
- Relojera
<<<END>>>`;
    const r = extractEntityUpdates(t);
    expect(r.suggestions).toEqual([
      {
        question: '¿Qué oficio tiene la protagonista?',
        options: ['Farera', 'Cartógrafa', 'Pescadora', 'Relojera'],
      },
    ]);
  });

  it('multi-line question lines join into a single question', () => {
    const t = `<<<SUGGEST>>>
¿Para qué edad
de lectores escribes?
- Infantil
- Juvenil
<<<END>>>`;
    const r = extractEntityUpdates(t);
    expect(r.suggestions[0].question).toBe('¿Para qué edad de lectores escribes?');
    expect(r.suggestions[0].options).toEqual(['Infantil', 'Juvenil']);
  });

  it('tolerates whitespace around colons in CARD identifiers', () => {
    const t = `<<<CARD: personaje : mara >>>name=Mara
---
Una farera.
<<<END>>>`;
    const r = extractEntityUpdates(t);
    expect(r.cards).toHaveLength(1);
    expect(r.cards[0].type).toBe('personaje');
    expect(r.cards[0].slug).toBe('mara');
  });

  it('normalizes loose ids — camelCase, spaces, accents → kebab', () => {
    const t = `<<<CARD:Personaje:Mara Y Tito>>>name=Mara y Tito
---
Dos personajes.
<<<END>>>
<<<LINK:Personaje/Mara Y Tito:Lugar/Faro:viven en>>><<<END>>>`;
    const r = extractEntityUpdates(t);
    expect(r.cards[0].type).toBe('personaje');
    expect(r.cards[0].slug).toBe('mara-y-tito');
    expect(r.links[0]).toEqual({
      from: 'personaje/mara-y-tito',
      to: 'lugar/faro',
      label: 'viven en',
    });
  });
});

describe('extractEntityUpdates — PATCH blocks', () => {
  it('parses a single-line PATCH with multiple fields', () => {
    const t = `<<<PATCH:personaje:mara>>>
want=Que la dejen en paz
need=Aceptar que necesita a alguien
<<<END>>>`;
    const r = extractEntityUpdates(t);
    expect(r.patches).toHaveLength(1);
    expect(r.patches[0].type).toBe('personaje');
    expect(r.patches[0].slug).toBe('mara');
    expect(r.patches[0].fields).toEqual({
      want: 'Que la dejen en paz',
      need: 'Aceptar que necesita a alguien',
    });
  });

  it('parses sentinel fields (__intro, __pendiente, __trailing)', () => {
    const t = `<<<PATCH:personaje:mara>>>
__intro=La farera que no quería visitas
__pendiente=decidir su edad exacta
<<<END>>>`;
    const r = extractEntityUpdates(t);
    expect(r.patches[0].fields).toEqual({
      __intro: 'La farera que no quería visitas',
      __pendiente: 'decidir su edad exacta',
    });
  });

  it('parses heredoc multi-line values (<<<…>>>)', () => {
    const t = `<<<PATCH:personaje:mara>>>
backstory=<<<
Antes de que Tito llegara al faro,
Mara vivía sola.
>>>
arco=positivo
<<<END>>>`;
    const r = extractEntityUpdates(t);
    expect(r.patches[0].fields.backstory).toBe('Antes de que Tito llegara al faro,\nMara vivía sola.');
    expect(r.patches[0].fields.arco).toBe('positivo');
  });

  it('strips PATCH blocks from cleanedText', () => {
    const t = `Listo.\n\n<<<PATCH:personaje:mara>>>want=X<<<END>>>\n\nMás cosas.`;
    const r = extractEntityUpdates(t);
    expect(r.cleanedText).not.toContain('PATCH');
    expect(r.cleanedText).toContain('Listo.');
    expect(r.cleanedText).toContain('Más cosas.');
  });

  it('ignores empty PATCH blocks', () => {
    const r = extractEntityUpdates('<<<PATCH:personaje:mara>>>\n<<<END>>>');
    expect(r.patches).toEqual([]);
  });

  it('normalizes type/slug like CARD does', () => {
    const r = extractEntityUpdates('<<<PATCH: Personaje : Mara Y Tito >>>want=X<<<END>>>');
    expect(r.patches[0].type).toBe('personaje');
    expect(r.patches[0].slug).toBe('mara-y-tito');
  });

  it('tolerates 2-marker variants (<<…>>) when the model emits less than 3', () => {
    const t = `<<PATCH:personaje:bruno>>
Want=finir el mapa de la isla
Need=atreverse a volver
<<END>>`;
    const r = extractEntityUpdates(t);
    expect(r.patches).toHaveLength(1);
    expect(r.patches[0].fields).toMatchObject({
      Want: 'finir el mapa de la isla',
      Need: 'atreverse a volver',
    });
    // And the cleanedText drops the block too.
    expect(r.cleanedText).not.toContain('PATCH');
  });

  it('tolerates 2-marker variants for CARD and FACT', () => {
    const t = `<<CARD:personaje:x>>name=X
---
body
<<END>>
<<FACT>>algo<<END>>`;
    const r = extractEntityUpdates(t);
    expect(r.cards).toHaveLength(1);
    expect(r.facts).toEqual(['algo']);
  });

  it('parses heredoc with mixed marker widths (key=<<… >> on inner)', () => {
    const t = `<<<PATCH:personaje:bruno>>>
backstory=<<
multi
line
>>
<<<END>>>`;
    const r = extractEntityUpdates(t);
    expect(r.patches[0].fields.backstory).toBe('multi\nline');
  });
});

describe('extractEntityUpdates — fenced protocol (~~~skriptia-*)', () => {
  it('parses a fenced CARD with attrs and body', () => {
    const t = `Genial.

~~~skriptia-card personaje:mara
name=Mara
icon=🧭
---
La farera que no quería visitas.
- **Rol:** protagonista
~~~

Listo.`;
    const r = extractEntityUpdates(t);
    expect(r.cards).toHaveLength(1);
    expect(r.cards[0].type).toBe('personaje');
    expect(r.cards[0].slug).toBe('mara');
    expect(r.cards[0].attrs).toEqual({ name: 'Mara', icon: '🧭' });
    expect(r.cards[0].body).toContain('La farera');
    expect(r.cleanedText).toBe('Genial.\n\nListo.');
  });

  it('parses a fenced PATCH with multiple fields', () => {
    const t = `~~~skriptia-patch personaje:bruno
Want=Finir el mapa de la isla
Need=Atreverse a volver
Arco=positivo — de exiliada a guía
~~~`;
    const r = extractEntityUpdates(t);
    expect(r.patches).toHaveLength(1);
    expect(r.patches[0].fields).toEqual({
      Want: 'Finir el mapa de la isla',
      Need: 'Atreverse a volver',
      Arco: 'positivo — de exiliada a guía',
    });
  });

  it('parses fenced PATCH with heredoc value', () => {
    const t = `~~~skriptia-patch personaje:bruno
__trailing=<<<
Relojero que arregla todo menos su propio reloj.
Cada noche da cuerda a uno distinto.
>>>
arco=positivo
~~~`;
    const r = extractEntityUpdates(t);
    expect(r.patches[0].fields.__trailing).toBe(
      'Relojero que arregla todo menos su propio reloj.\nCada noche da cuerda a uno distinto.',
    );
    expect(r.patches[0].fields.arco).toBe('positivo');
  });

  it('parses fenced LINK with label', () => {
    const t = `~~~skriptia-link personaje/mara lugar/faro
label=vive en
~~~`;
    const r = extractEntityUpdates(t);
    expect(r.links).toHaveLength(1);
    expect(r.links[0]).toEqual({ from: 'personaje/mara', to: 'lugar/faro', label: 'vive en' });
  });

  it('parses fenced DELETE with ref on args', () => {
    const t = `~~~skriptia-delete personaje/x
~~~`;
    const r = extractEntityUpdates(t);
    expect(r.deletes).toEqual([{ type: 'personaje', slug: 'x' }]);
  });

  it('parses fenced FACT', () => {
    const t = `~~~skriptia-fact
Mara tiene 64 años cuando empieza la novela.
~~~`;
    const r = extractEntityUpdates(t);
    expect(r.facts).toEqual(['Mara tiene 64 años cuando empieza la novela.']);
  });

  it('parses fenced SUGGEST with options', () => {
    const t = `~~~skriptia-suggest
¿Qué tipo de antagonista?
- humano cercano
- fuerza natural
~~~`;
    const r = extractEntityUpdates(t);
    expect(r.suggestions).toHaveLength(1);
    expect(r.suggestions[0]).toEqual({
      question: '¿Qué tipo de antagonista?',
      options: ['humano cercano', 'fuerza natural'],
    });
  });

  it('legacy <<<…>>> and fenced ~~~ coexist in the same turn', () => {
    const t = `~~~skriptia-card personaje:a
name=A
---
body A
~~~

<<<CARD:personaje:b>>>name=B
---
body B
<<<END>>>`;
    const r = extractEntityUpdates(t);
    expect(r.cards).toHaveLength(2);
    expect(r.cards.map(c => c.slug).sort()).toEqual(['a', 'b']);
  });

  it('strips fenced blocks from cleanedText', () => {
    const t = `Texto antes.

~~~skriptia-patch personaje:x
Want=Y
~~~

Texto después.`;
    const r = extractEntityUpdates(t);
    expect(r.cleanedText).toBe('Texto antes.\n\nTexto después.');
  });
});
