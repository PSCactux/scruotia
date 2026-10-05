/**
 * Catalog of starter entity types. The AI can mention these by type id when
 * emitting <<<CARD:type:slug>>> blocks. It can also invent new type ids at
 * runtime — they'll show up in the canvas as a generic column.
 */

export type EntityTypeDef = {
  id: string;
  label: string;
  pluralLabel: string;
  icon: string;
  // Tailwind color family used for badges, borders, and accents.
  color: 'indigo' | 'emerald' | 'amber' | 'rose' | 'pink' | 'red' | 'violet' | 'cyan' | 'orange' | 'sky' | 'slate' | 'yellow' | 'fuchsia' | 'teal' | 'lime';
  description: string;
  // When the AI doesn't know what to ask, these are good follow-ups.
  prompts: string[];
  /**
   * Recommended body template the AI should follow when creating/updating
   * entities of this type. Keeps shape consistent across instances so the
   * bundle and the canvas don't end up with one personaje having "Rol/Want/
   * Need" and the next one being a free paragraph. Optional — types without
   * a template (logline, sinopsis) stay free-form.
   */
  bodyTemplate?: string;
};

export const ENTITY_TYPES: EntityTypeDef[] = [
  {
    id: 'logline',
    label: 'Logline',
    pluralLabel: 'Logline',
    icon: '🪧',
    color: 'fuchsia',
    description: 'Una frase que resume la novela. Protagonista + conflicto + stakes.',
    prompts: ['¿Puedes resumir tu historia en una frase?'],
    bodyTemplate: `(Una sola frase ≤15 palabras que contenga estos 3 ingredientes en ORDEN:
  1. Protagonista (quién, en una palabra o sintagma corto)
  2. Acción o deseo (qué hace o persigue)
  3. Conflicto / stakes (qué se opone o qué se pierde si fracasa)

Ejemplos válidos:
- "Una cartógrafa exiliada debe trazar el mapa de una isla que cambia cada noche para poder volver a casa."
- "Tres amigas animales se pierden en el bosque y deben volver antes del anochecer."

NO añadas viñetas, secciones, encabezados ni explicación. El body es LITERALMENTE la frase.)`,
  },
  {
    id: 'personaje',
    label: 'Personaje',
    pluralLabel: 'Personajes',
    icon: '👤',
    color: 'indigo',
    description: 'Quien aparece en la historia. Protagonistas, antagonistas, secundarios.',
    prompts: [
      '¿Quién es el protagonista?',
      '¿Quién se le opone y por qué?',
      '¿Qué quiere y qué necesita?',
    ],
    bodyTemplate: `- **Rol:** (protagonist | antagonist | deuteragonist | mentor | supporting | rival)
- **Especie / aspecto:** (qué es y cómo se ve físicamente)
- **Edad / etapa:** (años o "joven/adulto/anciano" — concreta)
- **Want (deseo externo):** (qué persigue activamente)
- **Need (necesidad interna):** (verdad interior que necesita aprender)
- **Arco:** (positivo | negativo | plano | corrupción | redención)
- **Voz:** (cómo habla, registro, muletillas, qué evita decir)
- **Backstory:** (pasado relevante para la trama actual)
- **Secretos:** (lo que oculta, incluso a sí mismo)
- **Relaciones clave:** (con quién y qué vínculo emocional)

(Párrafo breve de carácter — 1-3 frases que capturen su esencia.)

**Pendiente:** (lo que aún no está decidido — déjalo vacío si está todo claro)`,
  },
  {
    id: 'lugar',
    label: 'Lugar',
    pluralLabel: 'Lugares',
    icon: '📍',
    color: 'emerald',
    description: 'Escenarios físicos de la historia.',
    prompts: ['¿Dónde transcurre la historia?', '¿Qué lugares clave hay?'],
    bodyTemplate: `- **Tipo:** (ciudad | edificio | paisaje | habitación | vehículo | etc.)
- **Descripción física:** (qué se ve, dimensiones, materiales)
- **Sensaciones:** (sonidos, olores, texturas, luz, temperatura)
- **Quién aparece aquí:** (personajes que frecuentan este lugar)
- **Eventos clave:** (qué ocurre aquí en la trama)

(Párrafo opcional con el "feel" del sitio.)

**Pendiente:** (lo que aún no está decidido)`,
  },
  {
    id: 'objeto',
    label: 'Objeto',
    pluralLabel: 'Objetos',
    icon: '🎒',
    color: 'amber',
    description: 'Cosas físicas con peso narrativo (un arma, una carta, una llave).',
    prompts: ['¿Hay algún objeto que tenga importancia simbólica o de trama?'],
    bodyTemplate: `- **Qué es:** (descripción física)
- **Quién lo posee / dónde está:** ...
- **Significado:** (qué representa, por qué importa)
- **Función en la trama:** (qué papel juega, plant/payoff)

**Pendiente:** (lo que aún no está decidido)`,
  },
  {
    id: 'faccion',
    label: 'Facción',
    pluralLabel: 'Facciones',
    icon: '🏛️',
    color: 'rose',
    description: 'Grupos, organizaciones, gremios, familias con presencia en la historia.',
    prompts: ['¿Hay facciones, grupos o instituciones en pugna?'],
    bodyTemplate: `- **Tipo:** (organización | familia | gremio | culto | gobierno | etc.)
- **Quiénes la integran:** (líderes y miembros notables)
- **Qué buscan:** (objetivo declarado y, si aplica, objetivo real oculto)
- **Métodos:** (cómo operan)
- **Aliados / enemigos:** ...
- **Rasgo identificable:** (insignia, jerga, gesto, vestuario)

**Pendiente:** (lo que aún no está decidido)`,
  },
  {
    id: 'relacion',
    label: 'Relación',
    pluralLabel: 'Relaciones',
    icon: '🔗',
    color: 'pink',
    description: 'Vínculo concreto entre dos personajes (o entre personaje y otra entidad).',
    prompts: ['¿Cómo se relacionan estos dos personajes?'],
    bodyTemplate: `- **Quiénes:** (los dos personajes/entidades vinculados)
- **Naturaleza:** (familiar | amistad | romance | rivalidad | mentor-alumno | etc.)
- **Historia:** (cómo empezó, qué ha pasado entre ellos)
- **Tensión actual:** (qué los une y qué los empuja a separarse)
- **Trayectoria prevista:** (cómo evoluciona a lo largo de la novela)

**Pendiente:** (lo que aún no está decidido)`,
  },
  {
    id: 'conflicto',
    label: 'Conflicto',
    pluralLabel: 'Conflictos',
    icon: '⚔️',
    color: 'red',
    description: 'Tensión central o subtramas. Puede ser interno, interpersonal o externo.',
    prompts: ['¿Cuál es el conflicto central?', '¿Qué tensiones hay alrededor?'],
    bodyTemplate: `- **Tipo:** (interno | interpersonal | externo | hombre-vs-naturaleza | hombre-vs-sociedad)
- **Quiénes se enfrentan:** ...
- **Qué está en juego (stakes):** (qué se pierde si pierde el protagonista)
- **Por qué AHORA:** (qué dispara este conflicto en este momento)
- **Cómo se manifiesta escena a escena:** ...
- **Resolución prevista:** ...

**Pendiente:** (lo que aún no está decidido)`,
  },
  {
    id: 'tema',
    label: 'Tema',
    pluralLabel: 'Temas',
    icon: '💭',
    color: 'violet',
    description: 'De qué habla la historia por debajo de la trama (lealtad, perdón, identidad).',
    prompts: ['¿De qué habla esta historia, más allá de la trama?'],
    bodyTemplate: `- **Pregunta temática:** (la pregunta que la novela explora — ej. "¿se puede perdonar lo imperdonable?")
- **Postura provisional:** (la respuesta que sugiere la historia)
- **Personajes que lo encarnan:** ...
- **Cómo se hace explícito sin ser didáctico:** (escenas, imágenes, símbolos)

**Pendiente:** (lo que aún no está decidido)`,
  },
  {
    id: 'motivo',
    label: 'Motivo / Imagen',
    pluralLabel: 'Motivos e imágenes',
    icon: '🎴',
    color: 'pink',
    description: 'Imagen, símbolo, objeto o gesto recurrente que carga significado emocional.',
    prompts: ['¿Hay alguna imagen o símbolo que se repita y signifique algo?'],
    bodyTemplate: `- **Forma física:** (qué se ve / oye / huele literalmente — la cosa concreta)
- **Significado:** (qué representa simbólicamente)
- **Primera aparición:** (en qué escena/momento aparece por primera vez)
- **Apariciones recurrentes:** (lista con escena/contexto y qué evoca cada vez)
- **Transformación:** (cómo cambia o se resignifica a lo largo de la novela)

**Pendiente:** (lo que aún no está decidido)`,
  },
  {
    id: 'pregunta',
    label: 'Pregunta dramática',
    pluralLabel: 'Preguntas dramáticas',
    icon: '❓',
    color: 'amber',
    description: 'Pregunta abierta que mantiene al lector pegado a la página (¿lo conseguirá? ¿sobrevivirá? ¿quién traiciona?).',
    prompts: ['¿Cuál es la pregunta que el lector se hace todo el rato?'],
    bodyTemplate: `- **Pregunta:** (formulada en pregunta directa, ≤12 palabras)
- **Cuándo aparece:** (escena que la planta en la mente del lector)
- **Cuándo se responde:** (escena que la cierra — debe haberla)
- **Por qué importa:** (qué stakes hace que el lector quiera saber)

**Pendiente:** (lo que aún no está decidido)`,
  },
  {
    id: 'tono',
    label: 'Tono y voz',
    pluralLabel: 'Tono y voz',
    icon: '🎨',
    color: 'cyan',
    description: 'Decisiones estilísticas: persona, tiempo verbal, registro, ritmo, POV.',
    prompts: [
      '¿En qué persona vas a contar? ¿En qué tiempo verbal?',
      '¿El tono es coloquial, literario, infantil, oscuro?',
    ],
    bodyTemplate: `- **Persona:** (1ª | 3ª limitada | 3ª omnisciente)
- **Tiempo verbal:** (pasado | presente)
- **Registro:** (coloquial | neutro | culto | literario | infantil)
- **Ritmo:** (rápido | medio | reflexivo)
- **POV:** (fijo en un personaje | rotativo entre varios)
- **Franja de edad / público:** (infantil 6-9 | juvenil 10-14 | YA 15-18 | adulto)

## Muestra
(Un párrafo de 3-6 frases que ejemplifique el tono exacto que quieres en Fase 2.)

## Notas
(Anotaciones libres: longitud capítulo target, qué evitar, recurrencias estilísticas.)`,
  },
  {
    id: 'mundo',
    label: 'Mundo',
    pluralLabel: 'Mundo',
    icon: '🌍',
    color: 'teal',
    description: 'Reglas, sistema (mágico/tecnológico/social), vocabulario, calendario.',
    prompts: ['¿Hay reglas del mundo que no se pueden romper?'],
    bodyTemplate: `## Lugares
(Descripción de los lugares clave del mundo — no entidades lugar/*, sino el contexto general.)

## Sistema
(Reglas del sistema mágico, tecnológico o social, si lo hay. Cómo funciona y qué cuesta.)

## Vocabulario
(Términos propios del mundo con definición breve.)

## Fauna y cultura
(Animales, criaturas, costumbres distintivas.)

## Costumbres
(Rituales, normas sociales, festividades.)

## Calendario
(Estructura del año, meses, días, estaciones si difiere del mundo real.)

## Reglas inviolables
(Verdades del mundo que NO pueden romperse — candidatas a entidad regla/* propia.)

**Pendiente:** (lo que aún no está decidido)`,
  },
  {
    id: 'regla',
    label: 'Regla',
    pluralLabel: 'Reglas',
    icon: '⚖️',
    color: 'yellow',
    description: 'Ley o restricción inviolable (la magia consume memoria, no se puede mentir bajo la luna llena).',
    prompts: ['¿Hay alguna regla que NUNCA se rompe en tu historia?'],
    bodyTemplate: `**Enunciado:** (la regla en una frase clara)

**Por qué existe:** (origen o lógica interna)

**Qué pasa si se rompe:** (consecuencias narrativas)

**Cómo se manifiesta en escena:** (cómo el lector la siente, no solo la lee)`,
  },
  {
    id: 'hilo',
    label: 'Hilo de trama',
    pluralLabel: 'Hilos de trama',
    icon: '🧶',
    color: 'orange',
    description: 'Subtramas o líneas paralelas que cruzan la historia (romance, traición, misterio).',
    prompts: ['¿Qué subtramas atraviesan la historia principal?'],
    bodyTemplate: `- **Tipo:** (romance | traición | misterio | mentor | rivalidad | etc.)
- **Personajes implicados:** ...
- **Inicio:** (qué dispara este hilo)
- **Desarrollo:** (3-5 hitos por orden)
- **Resolución:** (cómo termina)
- **Cómo cruza la trama principal:** ...

**Pendiente:** (lo que aún no está decidido)`,
  },
  {
    id: 'estructura',
    label: 'Estructura',
    pluralLabel: 'Estructura',
    icon: '🏗️',
    color: 'lime',
    description: 'Backbone de la novela: setup, disastros, midpoint, resolución.',
    prompts: ['¿Cómo se organiza la novela? Setup, giros, resolución.'],
    bodyTemplate: `## Setup
(El mundo normal del protagonista antes de que algo se rompa.)

## Disastro 1
(Final del acto 1 — el evento que rompe el statu quo.)

## Disastro 2
(Midpoint — el giro que cambia todo a mitad de novela.)

## Disastro 3
(Final del acto 2 — el peor momento, todo está perdido.)

## Resolución
(Cómo se resuelve el conflicto y qué cambió.)`,
  },
  {
    id: 'sinopsis',
    label: 'Sinopsis',
    pluralLabel: 'Sinopsis',
    icon: '📜',
    color: 'sky',
    description: 'Descripción extendida de la novela completa, párrafo a párrafo.',
    prompts: ['¿Quieres que expandamos la estructura en sinopsis?'],
    bodyTemplate: `## Acto 1 — Setup y catalizador
(1-3 párrafos: mundo normal del protagonista, qué le falta, el evento que rompe el statu quo y lo empuja a la acción.)

## Acto 2A — Diversión y juegos
(1-3 párrafos: el protagonista explora el nuevo mundo o conflicto, gana victorias parciales, hasta el midpoint.)

## Acto 2B — Los malos aprietan y noche oscura
(1-3 párrafos: las cosas se complican, el antagonismo aprieta, todo está perdido, el protagonista toca fondo.)

## Acto 3 — Resolución
(1-2 párrafos: el protagonista actúa con la verdad interna aprendida, enfrenta el clímax, y el desenlace muestra cómo cambió el mundo y/o el personaje.)

**Pendiente:** (qué partes están aún esbozadas)`,
  },
  {
    id: 'escena',
    label: 'Escena',
    pluralLabel: 'Escenas',
    icon: '🎬',
    color: 'slate',
    description: 'Una unidad concreta de la historia: POV, lugar, qué pasa, qué cambia.',
    prompts: ['¿Cuál es la escena de apertura?', '¿Qué escenas marcan los giros clave?'],
    bodyTemplate: `- **Beat:** (Apertura | Setup | Catalizador | Debate | Cruce al Acto 2 | Diversión y juegos | B-Story | Midpoint | Los malos aprietan | Todo está perdido | Noche oscura del alma | Cruce al Acto 3 | Final | Cierre)
- **Capítulo:** (número o nombre del capítulo al que pertenece)
- **POV:** (personaje narrador)
- **Personajes presentes:** (lista separada por comas)
- **Ubicación:** ...
- **Qué pasa:** (acción concreta de la escena)
- **Conflicto:** (qué tensión empuja la escena)
- **Resolución parcial:** (cómo termina, qué cambia)
- **Estado emocional inicio (POV):** ...
- **Estado emocional fin (POV):** (debe encadenar con la siguiente escena del mismo POV)
- **Info nueva al lector:** (qué aprende el lector que no sabía)
- **Planta:** (qué deja sembrado para pagar después; vacío si no aplica)
- **Paga:** (qué planta de una escena anterior se cobra aquí; vacío si no aplica)
- **Target palabras:** (número aproximado de palabras objetivo en Fase 2)

**Pendiente:** (lo que aún no está decidido)`,
  },
  {
    id: 'capitulo',
    label: 'Capítulo',
    pluralLabel: 'Capítulos',
    icon: '📖',
    color: 'pink',
    description: 'Agrupación de escenas con un arco propio.',
    prompts: ['¿En qué capítulos vas a dividir la novela?'],
    bodyTemplate: `- **Número:** ...
- **Título:** (opcional)
- **POV dominante:** ...
- **Escenas:** (lista de slugs de escena/* en orden)
- **Arco del capítulo:** (en qué estado emocional empieza el POV, en cuál termina)
- **Función:** (qué hace este capítulo en la novela — setup, escalada, payoff…)
- **Target palabras:** ...

**Pendiente:** (lo que aún no está decidido)`,
  },
];

export const ENTITY_TYPES_BY_ID: Record<string, EntityTypeDef> = Object.fromEntries(
  ENTITY_TYPES.map(t => [t.id, t]),
);

/**
 * Returns the type def for a given id; if the AI invented a new type id at
 * runtime, returns a generic stub so the canvas still renders it cleanly.
 */
export function getTypeDef(id: string): EntityTypeDef {
  return ENTITY_TYPES_BY_ID[id] ?? {
    id,
    label: id.charAt(0).toUpperCase() + id.slice(1),
    pluralLabel: id.charAt(0).toUpperCase() + id.slice(1),
    icon: '✨',
    color: 'slate',
    description: '',
    prompts: [],
  };
}

export function listKnownTypeIds(): string[] {
  return ENTITY_TYPES.map(t => t.id);
}
