/**
 * Office text — bilingual constants for the inline (non-bcp_texts)
 * strings the office assemblers embed directly: versicles,
 * suffrages, Confession + Absolution, Lord's Prayer, General
 * Thanksgiving, Prayer for Mission, Phos Hilaron, every Compline
 * text, all slide eyebrows.
 *
 * Spanish sourcing: El Libro de Oración Común (LOC), the official
 * Episcopal Church Spanish translation of the 1979 BCP. Texts
 * follow the LOC's contemporary-language rendering — tú-form
 * throughout (Episcopal liturgical convention; matches the
 * mymonastery i18n tone notes in i18n/es.ts).
 *
 * NOT covered here (still English on locale=es until a follow-up
 * Spanish seed pass lands):
 *   • Psalter (150 psalms — psalm_N rows in bcp_texts)
 *   • Canticles (8+ rows in bcp_texts)
 *   • Collects of the Day (~500 collect_* rows in bcp_texts)
 *   • Opening sentences (~30 seasonal rows in bcp_texts)
 *
 * Those bodies stay in English when locale=es; the assemblers fall
 * back to the English bcp_texts content. A future migration will
 * add Spanish rows (either via a locale column on bcp_texts or
 * sibling _es text_keys).
 */

export type Locale = "en" | "es";

interface Bilingual {
  en: string;
  es: string;
}

// ── Office labels / eyebrows ────────────────────────────────────────

export const TITLES = {
  morning_prayer: { en: "Morning Prayer", es: "Oración Matutina" },
  evening_prayer: { en: "Evening Prayer", es: "Oración Vespertina" },
  compline: { en: "Compline", es: "Completas" },
  morning_devotion: { en: "Morning Devotion", es: "Devoción Matutina" },
  early_evening_devotion: { en: "Early Evening Devotion", es: "Devoción Vespertina" },
  before_you_begin: { en: "Before you begin", es: "Antes de comenzar" },
  song_of_simeon: { en: "The Song of Simeon", es: "El Cántico de Simeón" },
  song_of_zechariah: { en: "The Song of Zechariah (Benedictus)", es: "El Cántico de Zacarías (Benedictus)" },
  song_of_mary: { en: "The Song of Mary (Magnificat)", es: "El Cántico de María (Magníficat)" },
} as const satisfies Record<string, Bilingual>;

export const EYEBROWS = {
  opening: { en: "OPENING", es: "APERTURA" },
  opening_sentence: { en: "OPENING SENTENCE", es: "SENTENCIA DE APERTURA" },
  invitatory: { en: "INVITATORY", es: "INVITATORIO" },
  versicle: { en: "VERSICLE", es: "VERSÍCULO" },
  confession_of_sin: { en: "CONFESSION OF SIN", es: "CONFESIÓN DE PECADOS" },
  absolution: { en: "ABSOLUTION", es: "ABSOLUCIÓN" },
  the_lesson: { en: "THE LESSON", es: "LA LECTURA" },
  the_first_lesson: { en: "THE FIRST LESSON", es: "LA PRIMERA LECTURA" },
  the_second_lesson: { en: "THE SECOND LESSON", es: "LA SEGUNDA LECTURA" },
  the_gospel: { en: "THE GOSPEL", es: "EL EVANGELIO" },
  the_lords_prayer: { en: "THE LORD'S PRAYER", es: "EL PADRENUESTRO" },
  the_collect: { en: "THE COLLECT", es: "LA COLECTA" },
  the_collect_of_the_day: { en: "THE COLLECT OF THE DAY", es: "LA COLECTA DEL DÍA" },
  suffrages: { en: "SUFFRAGES", es: "SÚPLICAS" },
  prayer_for_mission: { en: "PRAYER FOR MISSION", es: "ORACIÓN POR LA MISIÓN" },
  general_thanksgiving: { en: "THE GENERAL THANKSGIVING", es: "ACCIÓN DE GRACIAS GENERAL" },
  intercessions: { en: "INTERCESSIONS", es: "INTERCESIONES" },
  antiphon: { en: "ANTIPHON", es: "ANTÍFONA" },
  closing: { en: "CLOSING", es: "CONCLUSIÓN" },
  blessing: { en: "BLESSING", es: "BENDICIÓN" },
  creed: { en: "THE APOSTLES' CREED", es: "EL CREDO DE LOS APÓSTOLES" },
  apostles_creed: { en: "THE APOSTLES' CREED", es: "EL CREDO DE LOS APÓSTOLES" },
  phos_hilaron: { en: "O GRACIOUS LIGHT", es: "LUZ APACIBLE" },
  venite_psalm_95: { en: "VENITE · PSALM 95", es: "VENITE · SALMO 95" },
} as const satisfies Record<string, Bilingual>;

// ── Inline prayer texts ─────────────────────────────────────────────

export const PRAYERS = {
  // Versicle pair that opens MP / EP / Devotion / Compline.
  versicle_o_god: {
    en: "O God, make speed to save us.",
    es: "Oh Dios, ven en nuestro auxilio.",
  },
  versicle_o_lord: {
    en: "O Lord, make haste to help us.",
    es: "Señor, apresúrate a socorrernos.",
  },
  gloria_patri: {
    en: "Glory to the Father, and to the Son, and to the Holy Spirit: as it was in the beginning, is now, and will be for ever. Amen.",
    es: "Gloria al Padre, y al Hijo, y al Espíritu Santo: como era en el principio, ahora y siempre, por los siglos de los siglos. Amén.",
  },
  alleluia: { en: "Alleluia.", es: "Aleluya." },

  // The most-prayed contemporary Lord's Prayer rendering (Rite II /
  // contemporary LOC). The traditional ("debts / debtors") version
  // isn't surfaced here; assemblers that want it can add it later.
  lords_prayer_contemporary: {
    en: "Our Father in heaven,\nhallowed be your Name,\nyour kingdom come,\nyour will be done,\non earth as in heaven.\nGive us today our daily bread.\nForgive us our sins,\nas we forgive those who sin against us.\nSave us from the time of trial,\nand deliver us from evil.\nFor the kingdom, the power, and the glory are yours,\nnow and for ever. Amen.",
    es: "Padre nuestro que estás en el cielo,\nsantificado sea tu Nombre,\nvenga tu reino,\nhágase tu voluntad,\nen la tierra como en el cielo.\nDanos hoy nuestro pan de cada día.\nPerdona nuestras ofensas,\ncomo también nosotros perdonamos\na los que nos ofenden.\nNo nos dejes caer en tentación\ny líbranos del mal.\nPorque tuyo es el reino,\ntuyo el poder, y tuya la gloria,\nahora y por siempre. Amén.",
  },

  // The Confession used at MP and EP (BCP p. 79 / LOC).
  confession_mp_ep: {
    en: "Most merciful God,\nwe confess that we have sinned against you\nin thought, word, and deed,\nby what we have done,\nand by what we have left undone.\nWe have not loved you with our whole heart;\nwe have not loved our neighbors as ourselves.\nWe are truly sorry and we humbly repent.\nFor the sake of your Son Jesus Christ,\nhave mercy on us and forgive us;\nthat we may delight in your will,\nand walk in your ways,\nto the glory of your Name. Amen.",
    es: "Dios de misericordia,\nconfesamos que hemos pecado contra ti\nde pensamiento, palabra y obra,\npor lo que hemos hecho\ny por lo que hemos dejado de hacer.\nNo te hemos amado con todo el corazón;\nno hemos amado a nuestro prójimo como a nosotros mismos.\nLo lamentamos sinceramente, y humildemente nos arrepentimos.\nPor amor a tu Hijo Jesucristo,\nten piedad de nosotros y perdónanos;\npara que nos deleitemos en tu voluntad\ny caminemos en tus sendas,\npara gloria de tu Nombre. Amén.",
  },

  // The shorter Compline confession (BCP p. 128 / LOC).
  confession_compline: {
    en: "Almighty God, our heavenly Father:\nWe have sinned against you,\nthrough our own fault,\nin thought, and word, and deed,\nand in what we have left undone.\nFor the sake of your Son our Lord Jesus Christ,\nforgive us all our offenses;\nand grant that we may serve you in newness of life,\nto the glory of your Name. Amen.",
    es: "Dios todopoderoso, Padre celestial,\nhemos pecado contra ti,\npor nuestra propia culpa,\nen pensamiento, palabra y obra,\ny en lo que hemos dejado de hacer.\nPor amor a tu Hijo, nuestro Señor Jesucristo,\nperdónanos todas nuestras ofensas;\ny concédenos que te sirvamos en novedad de vida,\npara gloria de tu Nombre. Amén.",
  },

  // Lay form of the absolution — the BCP p. 80 / p. 128 rubric
  // permits a lay person to render the priestly declaration as a
  // prayer FOR forgiveness rather than a declaration of it.
  absolution_lay: {
    en: "Almighty God have mercy on us, forgive us all our sins through our Lord Jesus Christ, strengthen us in all goodness, and by the power of the Holy Spirit keep us in eternal life. Amen.",
    es: "Que Dios todopoderoso tenga piedad de nosotros, nos perdone todos nuestros pecados por medio de nuestro Señor Jesucristo, nos fortalezca en toda bondad, y por el poder del Espíritu Santo nos guarde en vida eterna. Amén.",
  },
  absolution_compline_lay: {
    en: "May the Almighty God grant us forgiveness of all our sins, and the grace and comfort of the Holy Spirit. Amen.",
    es: "Que el Dios todopoderoso nos conceda el perdón de todos nuestros pecados, y la gracia y consuelo del Espíritu Santo. Amén.",
  },

  // The General Thanksgiving — BCP p. 101 / p. 125 / LOC.
  general_thanksgiving: {
    en: "Almighty God, Father of all mercies,\nwe your unworthy servants give you humble thanks\nfor all your goodness and loving-kindness\nto us and to all whom you have made.\nWe bless you for our creation, preservation,\nand all the blessings of this life;\nbut above all for your immeasurable love\nin the redemption of the world by our Lord Jesus Christ;\nfor the means of grace, and for the hope of glory.\nAnd, we pray, give us such an awareness of your mercies,\nthat with truly thankful hearts we may show forth your praise,\nnot only with our lips, but in our lives,\nby giving up our selves to your service,\nand by walking before you\nin holiness and righteousness all our days;\nthrough Jesus Christ our Lord,\nto whom, with you and the Holy Spirit,\nbe honor and glory throughout all ages. Amen.",
    es: "Dios todopoderoso, Padre de toda misericordia,\nnosotros, tus indignos siervos, te damos humildes gracias\npor toda tu bondad y constante amor\npara con nosotros y para con todos los hombres.\nTe bendecimos por nuestra creación, preservación\ny todas las bendiciones de esta vida;\npero sobre todo por tu amor inestimable\nen la redención del mundo por nuestro Señor Jesucristo;\npor los medios de gracia y por la esperanza de gloria.\nY te suplicamos que nos des tal conciencia de tus mercedes,\nque, con corazón verdaderamente agradecido,\nproclamemos tu alabanza, no sólo con los labios, sino con la vida,\nentregándonos a tu servicio,\ny caminando delante de ti\nen santidad y justicia todos nuestros días;\npor Jesucristo nuestro Señor,\na quien, contigo y el Espíritu Santo,\nsea honor y gloria por todos los siglos. Amén.",
  },

  // Phos Hilaron — the Hymn of Light at Evening Prayer (BCP p. 118 / LOC).
  phos_hilaron: {
    en: "O gracious light,\npure brightness of the everliving Father in heaven,\nO Jesus Christ, holy and blessed!\n\nNow as we come to the setting of the sun,\nand our eyes behold the vesper light,\nwe sing your praises, O God: Father, Son, and Holy Spirit.\n\nYou are worthy at all times to be praised by happy voices,\nO Son of God, O Giver of Life,\nand to be glorified through all the worlds.",
    es: "Luz apacible,\nresplandor puro del Padre eterno en el cielo,\n¡oh Jesucristo, santo y bendito!\n\nAhora que llegamos a la puesta del sol,\ny nuestros ojos contemplan la luz vespertina,\ncantamos tus alabanzas, oh Dios: Padre, Hijo, y Espíritu Santo.\n\nDigno eres en todo tiempo de ser alabado con voces alegres,\noh Hijo de Dios, dador de la vida,\ny de ser glorificado por todos los mundos.",
  },

  // Compline-specific blocks ──────────────────────────────────────────

  compline_opening_1_off: {
    en: "The Lord Almighty grant us a peaceful night and a perfect end.",
    es: "El Señor todopoderoso nos conceda una noche tranquila y un fin perfecto.",
  },
  compline_opening_1_peo: { en: "Amen.", es: "Amén." },
  compline_opening_2_off: {
    en: "Our help is in the Name of the Lord;",
    es: "Nuestro auxilio está en el Nombre del Señor;",
  },
  compline_opening_2_peo: {
    en: "The maker of heaven and earth.",
    es: "Que hizo el cielo y la tierra.",
  },

  compline_into_your_hands_1_off: {
    en: "Into your hands, O Lord, I commend my spirit;",
    es: "En tus manos, oh Señor, encomiendo mi espíritu;",
  },
  compline_into_your_hands_1_peo: {
    en: "For you have redeemed me, O Lord, O God of truth.",
    es: "Porque tú me has redimido, Señor, Dios de la verdad.",
  },
  compline_into_your_hands_2_off: {
    en: "Keep us, O Lord, as the apple of your eye;",
    es: "Guárdanos, oh Señor, como a la niña de tus ojos;",
  },
  compline_into_your_hands_2_peo: {
    en: "Hide us under the shadow of your wings.",
    es: "Escóndenos bajo la sombra de tus alas.",
  },

  compline_collect_visit: {
    en: "Visit this place, O Lord, and drive far from it all snares of the enemy; let your holy angels dwell with us to preserve us in peace; and let your blessing be upon us always; through Jesus Christ our Lord. Amen.",
    es: "Visita, oh Señor, esta morada y aleja de ella todas las asechanzas del enemigo; que tus santos ángeles habiten en ella para guardarnos en paz; y bendícenos siempre con tu bendición; por Jesucristo nuestro Señor. Amén.",
  },

  compline_antiphon_standard: {
    en: "Guide us waking, O Lord, and guard us sleeping; that awake we may watch with Christ, and asleep we may rest in peace.",
    es: "Sostennos, oh Señor, mientras velamos, y guárdanos mientras dormimos; para que despiertos podamos velar con Cristo, y dormidos podamos descansar en paz.",
  },
  compline_antiphon_easter: {
    en: "Alleluia. Alleluia. Alleluia.",
    es: "Aleluya. Aleluya. Aleluya.",
  },

  // Nunc Dimittis (Canticle 17 / Luke 2:29-32) — Compline's only
  // canticle. Contemporary form, BCP p. 135 / LOC.
  nunc_dimittis: {
    en: "Lord, you now have set your servant free *\n  to go in peace as you have promised;\nFor these eyes of mine have seen the Savior, *\n  whom you have prepared for all the world to see:\nA Light to enlighten the nations, *\n  and the glory of your people Israel.\n\nGlory to the Father, and to the Son, and to the Holy Spirit: *\n  as it was in the beginning, is now, and will be for ever. Amen.",
    es: "Ahora, Señor, según tu palabra, *\n  despides en paz a tu siervo;\nporque mis ojos han visto a tu Salvador, *\n  a quien has preparado a la vista de todos los pueblos:\nluz que ilumina a las naciones, *\n  y gloria de tu pueblo Israel.\n\nGloria al Padre, y al Hijo, y al Espíritu Santo: *\n  como era en el principio, ahora y siempre, por los siglos de los siglos. Amén.",
  },

  compline_let_us_bless_off: {
    en: "Let us bless the Lord.",
    es: "Bendigamos al Señor.",
  },
  compline_let_us_bless_peo: {
    en: "Thanks be to God.",
    es: "Demos gracias a Dios.",
  },
  compline_final_blessing: {
    en: "The almighty and merciful Lord,\nFather, Son, and Holy Spirit,\nbless us and keep us. Amen.",
    es: "El Señor todopoderoso y misericordioso,\nPadre, Hijo, y Espíritu Santo,\nnos bendiga y nos guarde. Amén.",
  },

  // The Compline short lessons (BCP p. 132 / LOC). NRSV in English,
  // RVR-95 / NVI-style rendering in Spanish.
  lesson_jeremiah_14_9: {
    en: "Yet you, O Lord, are in the midst of us, and we are called by your Name; do not forsake us, O Lord our God.",
    es: "Sin embargo, tú, oh Señor, estás en medio de nosotros, y somos llamados por tu Nombre; no nos abandones, oh Señor Dios nuestro.",
  },
  lesson_matthew_11_28_30: {
    en: "Come to me, all you that are weary and are carrying heavy burdens, and I will give you rest. Take my yoke upon you, and learn from me; for I am gentle and humble in heart, and you will find rest for your souls. For my yoke is easy, and my burden is light.",
    es: "Vengan a mí todos los que están cansados y agobiados, y yo les daré descanso. Tomen mi yugo sobre ustedes y aprendan de mí, porque soy manso y humilde de corazón, y encontrarán descanso para sus almas. Porque mi yugo es suave y mi carga es ligera.",
  },
  lesson_hebrews_13_20_21: {
    en: "May the God of peace, who brought again from the dead our Lord Jesus, the great shepherd of the sheep, by the blood of the eternal covenant, make you perfect in every good work to do his will, working in you that which is well-pleasing in his sight; through Jesus Christ, to whom be glory for ever and ever. Amen.",
    es: "Que el Dios de paz, que resucitó de entre los muertos a nuestro Señor Jesús, el gran Pastor de las ovejas, por la sangre del pacto eterno, los haga perfectos en toda obra buena para hacer su voluntad, obrando en ustedes lo que es agradable a sus ojos; por Jesucristo, a quien sea la gloria por los siglos de los siglos. Amén.",
  },
  lesson_1_peter_5_8_9: {
    en: "Be sober, be watchful. Your adversary the devil prowls around, looking for someone to devour. Resist him, steadfast in your faith.",
    es: "Sean sobrios y vigilantes. Su adversario el diablo, como león rugiente, ronda buscando a quién devorar. Resístanlo, firmes en la fe.",
  },

  // Light and peace — Daily Devotion early-evening opening (BCP p. 139).
  devotion_light_and_peace_off: {
    en: "Light and peace, in Jesus Christ our Lord.",
    es: "Luz y paz, en Jesucristo nuestro Señor.",
  },
  devotion_light_and_peace_peo: {
    en: "Thanks be to God.",
    es: "Demos gracias a Dios.",
  },

  // Devotion-appointed collects (BCP pp. 137 / 140) — fallbacks when
  // the lectionary's Collect of the Day isn't available.
  devotion_collect_morning: {
    en: "Lord God, almighty and everlasting Father, you have brought us in safety to this new day: Preserve us with your mighty power, that we may not fall into sin, nor be overcome by adversity; and in all we do, direct us to the fulfilling of your purpose; through Jesus Christ our Lord. Amen.",
    es: "Señor Dios, Padre todopoderoso y eterno, que nos has traído en seguridad a este nuevo día: Guárdanos con tu gran poder, para que no caigamos en pecado, ni seamos vencidos en la adversidad; y en todo lo que hagamos, dirígenos al cumplimiento de tu propósito; por Jesucristo nuestro Señor. Amén.",
  },
  devotion_collect_early_evening: {
    en: "Lord Jesus, stay with us, for evening is at hand and the day is past; be our companion in the way, kindle our hearts, and awaken hope, that we may know you as you are revealed in Scripture and the breaking of bread. Grant this for the sake of your love. Amen.",
    es: "Señor Jesús, quédate con nosotros, porque ya es tarde y el día ha pasado; sé nuestro compañero en el camino, enciende nuestros corazones y despierta la esperanza, para que te conozcamos como te revelas en las Escrituras y en el partir del pan. Concede esto por amor tuyo. Amén.",
  },

  // Brief scroll prompt (ungated — same on every slide).
  scroll_hint_continue: {
    en: "↓ continue · tap when ready",
    es: "↓ continúa · toca cuando estés listo",
  },
} as const satisfies Record<string, Bilingual>;

// ── Helpers ─────────────────────────────────────────────────────────

/** Pick the locale-appropriate string. Defaults to English if the
 *  caller passes a locale we don't yet have a translation for. */
export function pick(locale: Locale | string | null | undefined, bi: Bilingual): string {
  return locale === "es" ? bi.es : bi.en;
}

/** Resolve a raw locale string (anything from /api/auth/me, query
 *  params, etc.) to our supported set. Anything not "es" collapses
 *  to "en" so a typo or future-locale value falls back safely. */
export function resolveLocale(raw: unknown): Locale {
  return raw === "es" ? "es" : "en";
}
