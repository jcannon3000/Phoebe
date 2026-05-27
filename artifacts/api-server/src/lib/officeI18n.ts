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

  // Morning Prayer invitatory opening (BCP p. 80 / LOC).
  versicle_open_lips_off: {
    en: "Lord, open our lips.",
    es: "Señor, abre nuestros labios.",
  },
  versicle_open_lips_peo: {
    en: "And our mouth shall proclaim your praise.",
    es: "Y nuestra boca proclamará tu alabanza.",
  },

  // Evening Prayer opening dialogue (BCP p. 117 / LOC).
  versicle_evening_off: {
    en: "O God, make speed to save us.",
    es: "Oh Dios, ven en nuestro auxilio.",
  },
  versicle_evening_peo: {
    en: "O Lord, make haste to help us.",
    es: "Señor, apresúrate a socorrernos.",
  },

  // The dismissal that closes MP/EP after the General Thanksgiving.
  dismissal_off: {
    en: "Let us bless the Lord.",
    es: "Bendigamos al Señor.",
  },
  dismissal_peo: {
    en: "Thanks be to God.",
    es: "Demos gracias a Dios.",
  },
  dismissal_off_easter: {
    en: "Let us bless the Lord. Alleluia, alleluia.",
    es: "Bendigamos al Señor. Aleluya, aleluya.",
  },
  dismissal_peo_easter: {
    en: "Thanks be to God. Alleluia, alleluia.",
    es: "Demos gracias a Dios. Aleluya, aleluya.",
  },

  // Closing grace (2 Cor 13:14) — appointed at the end of MP/EP.
  closing_grace: {
    en: "The grace of our Lord Jesus Christ, and the love of God, and the fellowship of the Holy Spirit, be with us all evermore. Amen.",
    es: "La gracia de nuestro Señor Jesucristo, el amor de Dios, y la comunión del Espíritu Santo sean con todos nosotros para siempre. Amén.",
  },

  // The Apostles' Creed (contemporary form) — BCP p. 96 / LOC.
  apostles_creed: {
    en: "I believe in God, the Father almighty,\ncreator of heaven and earth.\n\nI believe in Jesus Christ, his only Son, our Lord.\nHe was conceived by the power of the Holy Spirit\n  and born of the Virgin Mary.\nHe suffered under Pontius Pilate,\n  was crucified, died, and was buried.\nHe descended to the dead.\nOn the third day he rose again.\nHe ascended into heaven,\n  and is seated at the right hand of the Father.\nHe will come again to judge the living and the dead.\n\nI believe in the Holy Spirit,\nthe holy catholic Church,\nthe communion of saints,\nthe forgiveness of sins,\nthe resurrection of the body,\nand the life everlasting. Amen.",
    es: "Creo en Dios, Padre todopoderoso,\ncreador del cielo y de la tierra.\n\nCreo en Jesucristo, su único Hijo, nuestro Señor.\nFue concebido por obra del Espíritu Santo\n  y nació de la Virgen María.\nPadeció bajo el poder de Poncio Pilato,\n  fue crucificado, muerto y sepultado.\nDescendió a los muertos.\nAl tercer día resucitó.\nSubió a los cielos,\n  y está sentado a la derecha del Padre.\nVolverá para juzgar a los vivos y a los muertos.\n\nCreo en el Espíritu Santo,\nla santa Iglesia católica,\nla comunión de los santos,\nel perdón de los pecados,\nla resurrección del cuerpo,\ny la vida eterna. Amén.",
  },

  // Suffrages A — the more-prayed of the two MP/EP suffrage sets
  // (BCP p. 97 / LOC). Officiant + people lines fold into a single
  // body string because the slide renders them as call-and-response
  // already; embedded \n separates lines.
  suffrages_a: {
    en: "V. Show us your mercy, O Lord;\nR. And grant us your salvation.\n\nV. Clothe your ministers with righteousness;\nR. Let your people sing with joy.\n\nV. Give peace, O Lord, in all the world;\nR. For only in you can we live in safety.\n\nV. Lord, keep this nation under your care;\nR. And guide us in the way of justice and truth.\n\nV. Let your way be known upon earth;\nR. Your saving health among all nations.\n\nV. Let not the needy, O Lord, be forgotten;\nR. Nor the hope of the poor be taken away.\n\nV. Create in us clean hearts, O God;\nR. And sustain us with your Holy Spirit.",
    es: "V. Muéstranos tu misericordia, Señor;\nR. Y concédenos tu salvación.\n\nV. Reviste a tus ministros de justicia;\nR. Que tu pueblo cante con alegría.\n\nV. Concede la paz, Señor, en todo el mundo;\nR. Pues sólo en ti podemos vivir seguros.\n\nV. Señor, guarda a esta nación bajo tu cuidado;\nR. Y guíanos por el camino de la justicia y la verdad.\n\nV. Que tu camino sea conocido en la tierra;\nR. Tu salvación entre todas las naciones.\n\nV. Que los necesitados, Señor, no sean olvidados;\nR. Ni la esperanza de los pobres sea quitada.\n\nV. Crea en nosotros corazones limpios, oh Dios;\nR. Y sostennos con tu Santo Espíritu.",
  },

  // Suffrages B — the alternate MP/EP set (BCP p. 98 / LOC).
  suffrages_b: {
    en: "V. Save your people, Lord, and bless your inheritance;\nR. Govern and uphold them, now and always.\n\nV. Day by day we bless you;\nR. We praise your Name for ever.\n\nV. Lord, keep us from all sin today;\nR. Have mercy upon us, Lord, have mercy.\n\nV. Lord, show us your love and mercy;\nR. For we put our trust in you.\n\nV. In you, Lord, is our hope;\nR. And we shall never hope in vain.",
    es: "V. Salva a tu pueblo, Señor, y bendice a tu heredad;\nR. Gobiérnalos y sosténlos, ahora y siempre.\n\nV. Día tras día te bendecimos;\nR. Alabamos tu Nombre por siempre.\n\nV. Señor, guárdanos hoy de todo pecado;\nR. Ten misericordia de nosotros, Señor, ten misericordia.\n\nV. Señor, muéstranos tu amor y misericordia;\nR. Pues en ti hemos puesto nuestra confianza.\n\nV. En ti, Señor, está nuestra esperanza;\nR. Y nunca esperaremos en vano.",
  },

  // Prayer for Mission — three options rotate (BCP p. 100 / LOC).
  prayer_for_mission_1: {
    en: "Almighty and everlasting God,\nby whose Spirit the whole body of your faithful people is governed and sanctified:\nReceive our supplications and prayers,\nwhich we offer before you for all members of your holy Church,\nthat in their vocation and ministry they may truly and devoutly serve you;\nthrough our Lord and Savior Jesus Christ. Amen.",
    es: "Dios todopoderoso y eterno,\npor cuyo Espíritu todo el cuerpo de tu pueblo fiel es gobernado y santificado:\nRecibe las súplicas y oraciones que te ofrecemos por todos los miembros de tu santa Iglesia,\npara que en su vocación y ministerio te sirvan verdadera y devotamente;\npor nuestro Señor y Salvador Jesucristo. Amén.",
  },
  prayer_for_mission_2: {
    en: "O God, you have made of one blood all the peoples of the earth,\nand sent your blessed Son to preach peace to those who are far off and to those who are near:\nGrant that people everywhere may seek after you and find you;\nbring the nations into your fold;\npour out your Spirit upon all flesh;\nand hasten the coming of your kingdom;\nthrough Jesus Christ our Lord. Amen.",
    es: "Oh Dios, que de una sola sangre has hecho a todos los pueblos de la tierra,\ny enviaste a tu bendito Hijo a anunciar la paz a los que están lejos y a los que están cerca:\nConcede que en todas partes te busquen y te encuentren;\ntrae a las naciones a tu redil;\nderrama tu Espíritu sobre toda carne;\ny apresura la venida de tu reino;\npor Jesucristo nuestro Señor. Amén.",
  },
  prayer_for_mission_3: {
    en: "Lord Jesus Christ, you stretched out your arms of love on the hard wood of the cross\nthat everyone might come within the reach of your saving embrace:\nSo clothe us in your Spirit\nthat we, reaching forth our hands in love,\nmay bring those who do not know you to the knowledge and love of you;\nfor the honor of your Name. Amen.",
    es: "Señor Jesucristo, que extendiste tus brazos de amor sobre el duro madero de la cruz\npara que todos pudieran alcanzar el abrazo de tu salvación:\nRevístenos así de tu Espíritu\nque, extendiendo nuestras manos en amor,\ntraigamos a los que no te conocen al conocimiento y amor tuyos;\npor el honor de tu Nombre. Amén.",
  },

  // ── Canticles ─────────────────────────────────────────────────────
  // Bilingual versions of the most-prayed BCP canticles. Spanish from
  // El Libro de Oración Común. The bcp_texts row's English content
  // stays unchanged; SPANISH_OVERRIDES in each assembler swaps in the
  // Spanish text below when locale=es.

  // Canticle 15 — Magnificat (Song of Mary). BCP p. 91 / LOC.
  // Appointed after the NT reading at Evening Prayer almost every
  // day, so this is the single most-prayed canticle in EP.
  canticle_15: {
    en: "My soul proclaims the greatness of the Lord, *\n  my spirit rejoices in God my Savior;\nfor he has looked with favor on his lowly servant. *\n  From this day all generations will call me blessed:\nthe Almighty has done great things for me, *\n  and holy is his Name.\nHe has mercy on those who fear him *\n  in every generation.\nHe has shown the strength of his arm, *\n  he has scattered the proud in their conceit.\nHe has cast down the mighty from their thrones, *\n  and has lifted up the lowly.\nHe has filled the hungry with good things, *\n  and the rich he has sent away empty.\nHe has come to the help of his servant Israel, *\n  for he has remembered his promise of mercy,\nThe promise he made to our fathers, *\n  to Abraham and his children for ever.\n\nGlory to the Father, and to the Son, and to the Holy Spirit: *\n  as it was in the beginning, is now, and will be for ever. Amen.",
    es: "Mi alma proclama la grandeza del Señor, *\n  mi espíritu se regocija en Dios mi Salvador;\nporque ha mirado con bondad la condición humilde de su sierva. *\n  Desde ahora me llamarán dichosa todas las generaciones,\nporque el Poderoso ha hecho grandes cosas por mí, *\n  y santo es su Nombre.\nSu misericordia llega a sus fieles *\n  de generación en generación.\nÉl hace proezas con su brazo; *\n  dispersa a los soberbios de corazón.\nDerriba a los poderosos de sus tronos, *\n  y enaltece a los humildes;\na los hambrientos los colma de bienes, *\n  y a los ricos los despide vacíos.\nAcoge a Israel, su siervo, *\n  acordándose de la misericordia\n—como lo había prometido a nuestros padres— *\n  en favor de Abrahán y su descendencia para siempre.\n\nGloria al Padre, y al Hijo, y al Espíritu Santo: *\n  como era en el principio, ahora y siempre, por los siglos de los siglos. Amén.",
  },

  // Canticle 16 — Benedictus (Song of Zechariah). BCP p. 92 / LOC.
  // Appointed after the NT reading at Morning Prayer almost every
  // day, so this is the single most-prayed canticle in MP.
  canticle_16: {
    en: "Blessed be the Lord, the God of Israel; *\n  he has come to his people and set them free.\nHe has raised up for us a mighty savior, *\n  born of the house of his servant David.\nThrough his holy prophets he promised of old,\n  that he would save us from our enemies, *\n  from the hands of all who hate us.\nHe promised to show mercy to our fathers *\n  and to remember his holy covenant.\nThis was the oath he swore to our father Abraham, *\n  to set us free from the hands of our enemies,\nFree to worship him without fear, *\n  holy and righteous in his sight\n  all the days of our life.\nYou, my child, shall be called the prophet of the Most High, *\n  for you will go before the Lord to prepare his way,\nTo give his people knowledge of salvation *\n  by the forgiveness of their sins.\nIn the tender compassion of our God *\n  the dawn from on high shall break upon us,\nTo shine on those who dwell in darkness and the shadow of death, *\n  and to guide our feet into the way of peace.",
    es: "Bendito sea el Señor, Dios de Israel; *\n  porque ha visitado a su pueblo y le ha redimido.\nNos ha suscitado una fuerza de salvación *\n  en la casa de su siervo David,\ncomo lo había prometido desde antiguo *\n  por boca de sus santos profetas,\npara librarnos de nuestros enemigos *\n  y de la mano de todos los que nos aborrecen;\npara hacer misericordia a nuestros padres, *\n  y acordarse de su santa alianza,\ndel juramento que juró a nuestro padre Abrahán *\n  de concedernos que, libres de temor,\n  arrancados de la mano de los enemigos,\nle sirvamos con santidad y justicia, *\n  en su presencia, todos nuestros días.\nY a ti, niño, te llamarán profeta del Altísimo, *\n  porque irás delante del Señor a preparar sus caminos,\nanunciando a su pueblo la salvación, *\n  el perdón de sus pecados.\nPor la entrañable misericordia de nuestro Dios, *\n  nos visitará el sol que nace de lo alto,\npara iluminar a los que viven en tinieblas y sombra de muerte, *\n  para guiar nuestros pasos por el camino de la paz.",
  },

  // Canticle 18 — A Song to the Lamb (Dignus es). BCP p. 93 / LOC.
  canticle_18: {
    en: "Splendor and honor and kingly power *\n  are yours by right, O Lord our God,\nFor you created everything that is, *\n  and by your will they were created and have their being;\nAnd yours by right, O Lamb that was slain, *\n  for with your blood you have redeemed for God,\nFrom every family, language, people, and nation, *\n  a kingdom of priests to serve our God.\nAnd so, to him who sits upon the throne, *\n  and to Christ the Lamb,\nBe worship and praise, dominion and splendor, *\n  for ever and for ever more.",
    es: "Esplendor y honra y reino *\n  por derecho son tuyos, Señor Dios nuestro,\nporque tú creaste todas las cosas, *\n  y por tu voluntad fueron creadas y existen.\nY digno por derecho eres tú, Cordero que fuiste inmolado, *\n  porque con tu sangre redimiste para Dios,\nde toda familia, lengua, pueblo y nación, *\n  un reino de sacerdotes para servir a nuestro Dios.\nY así, al que está sentado en el trono, *\n  y a Cristo el Cordero,\nsea la alabanza y la honra, el dominio y el esplendor, *\n  por los siglos de los siglos.",
  },

  // Canticle 19 — The Song of the Redeemed (Magna et mirabilia).
  // BCP p. 94 / LOC.
  canticle_19: {
    en: "O ruler of the universe, Lord God,\n  great deeds are they that you have done, *\n  surpassing human understanding.\nYour ways are ways of righteousness and truth, *\n  O King of all the ages.\nWho can fail to do you homage, Lord,\n  and sing the praises of your Name? *\n  for you only are the Holy One.\nAll nations will draw near and fall down before you, *\n  because your just and holy works have been revealed.",
    es: "Oh Soberano del universo, Señor Dios,\n  grandes son las obras que has hecho, *\n  sobrepasando todo entendimiento humano.\nTus caminos son caminos de justicia y verdad, *\n  oh Rey de todos los siglos.\n¿Quién no te rendirá homenaje, Señor,\n  y cantará las alabanzas de tu Nombre? *\n  pues sólo tú eres el Santo.\nTodas las naciones vendrán y se postrarán delante de ti, *\n  porque tus obras justas y santas han sido reveladas.",
  },

  // Canticle 20 — Glory to God (Gloria in Excelsis). BCP p. 94 / LOC.
  canticle_20: {
    en: "Glory to God in the highest,\n  and peace to his people on earth.\n\nLord God, heavenly King,\nalmighty God and Father,\n  we worship you, we give you thanks,\n  we praise you for your glory.\n\nLord Jesus Christ, only Son of the Father,\nLord God, Lamb of God,\nyou take away the sin of the world:\n  have mercy on us;\nyou are seated at the right hand of the Father:\n  receive our prayer.\n\nFor you alone are the Holy One,\nyou alone are the Lord,\nyou alone are the Most High,\n  Jesus Christ,\n  with the Holy Spirit,\n  in the glory of God the Father. Amen.",
    es: "Gloria a Dios en lo más alto,\n  y en la tierra paz a su pueblo.\n\nSeñor Dios, Rey celestial,\nDios Padre todopoderoso,\n  te adoramos, te damos gracias,\n  te alabamos por tu gloria.\n\nSeñor Jesucristo, Hijo único del Padre,\nSeñor Dios, Cordero de Dios,\ntú que quitas el pecado del mundo:\n  ten piedad de nosotros;\ntú que estás sentado a la derecha del Padre:\n  recibe nuestra súplica.\n\nPorque sólo tú eres el Santo,\nsólo tú eres el Señor,\nsólo tú el Altísimo,\n  Jesucristo,\n  con el Espíritu Santo,\n  en la gloria de Dios Padre. Amén.",
  },

  // Canticle 21 — You Are God (Te Deum Laudamus). BCP p. 95 / LOC.
  canticle_21: {
    en: "You are God: we praise you;\nYou are the Lord: we acclaim you;\nYou are the eternal Father:\n  All creation worships you.\nTo you all angels, all the powers of heaven,\n  Cherubim and Seraphim, sing in endless praise:\n  Holy, holy, holy Lord, God of power and might,\n  heaven and earth are full of your glory.\nThe glorious company of apostles praise you.\nThe noble fellowship of prophets praise you.\nThe white-robed army of martyrs praise you.\nThroughout the world the holy Church acclaims you;\n  Father, of majesty unbounded,\n  your true and only Son, worthy of all worship,\n  and the Holy Spirit, advocate and guide.\nYou, Christ, are the king of glory,\n  the eternal Son of the Father.\nWhen you became man to set us free\n  you did not shun the Virgin's womb.\nYou overcame the sting of death\n  and opened the kingdom of heaven to all believers.\nYou are seated at God's right hand in glory.\nWe believe that you will come and be our judge.\nCome then, Lord, and help your people,\n  bought with the price of your own blood,\n  and bring us with your saints\n  to glory everlasting.",
    es: "A ti, oh Dios, te alabamos:\nA ti, Señor, te aclamamos:\nA ti, Padre eterno:\n  toda la creación te adora.\nA ti los ángeles, todas las potestades del cielo,\n  los querubines y serafines, te cantan sin cesar:\n  Santo, santo, santo, Señor Dios de los ejércitos,\n  los cielos y la tierra están llenos de tu gloria.\nTe alaba el glorioso coro de los apóstoles.\nTe alaba la noble compañía de los profetas.\nTe alaba la blanca legión de los mártires.\nA ti te aclama la santa Iglesia extendida por toda la tierra;\n  Padre, de inmensa majestad;\n  tu Hijo único y verdadero, digno de toda adoración,\n  y el Espíritu Santo, defensor y guía.\nTú, oh Cristo, eres Rey de la gloria,\n  Hijo eterno del Padre.\nAl hacerte hombre para librarnos,\n  no rehusaste el seno de la Virgen.\nVencido el aguijón de la muerte,\n  abriste el reino de los cielos a todos los creyentes.\nEstás sentado a la diestra de Dios\n  en la gloria del Padre.\nCreemos que has de venir como juez.\nTe suplicamos, pues, que vengas en ayuda de tu pueblo,\n  a quien redimiste con tu preciosa sangre,\n  y que nos lleves con tus santos\n  a la gloria eterna.",
  },

  // ── Common Opening Sentences (most-cited per season) ──────────────
  // BCP pp. 75-78 / LOC. Tag each season's most-quoted sentence so
  // MP/EP have a sane Spanish opener for every liturgical season
  // without seeding the full ~30-row Spanish opening-sentence set.

  // Advent — "Behold, your king is coming" (Zech 9:9) is the most-
  // cited Advent sentence in MP.
  opening_sentence_advent_1: {
    en: "Watch, for you do not know when the master of the house will come, in the evening, or at midnight, or at cockcrow, or in the morning; lest he come suddenly and find you asleep. — Mark 13:35,36",
    es: "Velen, pues, porque no saben cuándo viene el dueño de la casa: al anochecer, a medianoche, al canto del gallo o al amanecer; no sea que llegue de repente y los encuentre dormidos. — Marcos 13:35-36",
  },
  opening_sentence_advent_3: {
    en: "In the wilderness prepare the way of the Lord, make straight in the desert a highway for our God. — Isaiah 40:3",
    es: "En el desierto preparen el camino del Señor; allanen una calzada en la estepa para nuestro Dios. — Isaías 40:3",
  },
  // Christmas
  opening_sentence_christmas_1: {
    en: "Behold, I bring you good tidings of great joy, which shall be to all people; for unto you is born this day in the city of David, a Savior, which is Christ the Lord. — Luke 2:10,11",
    es: "He aquí, les traigo buenas nuevas de gran gozo, que será para todo el pueblo: que les ha nacido hoy, en la ciudad de David, un Salvador, que es Cristo el Señor. — Lucas 2:10-11",
  },
  // Epiphany
  opening_sentence_epiphany_1: {
    en: "From the rising of the sun to its setting my name is great among the nations, and in every place incense is offered to my name, and a pure offering. — Malachi 1:11",
    es: "Desde donde sale el sol hasta donde se pone, grande es mi Nombre entre las naciones; y en todo lugar se ofrece a mi Nombre incienso y oblación pura. — Malaquías 1:11",
  },
  // Lent
  opening_sentence_lent_1: {
    en: "If we say that we have no sin, we deceive ourselves, and the truth is not in us. If we confess our sins, he is faithful and just to forgive us our sins, and to cleanse us from all unrighteousness. — 1 John 1:8,9",
    es: "Si decimos que no tenemos pecado, nos engañamos a nosotros mismos, y la verdad no está en nosotros. Si confesamos nuestros pecados, él es fiel y justo para perdonarnos los pecados y limpiarnos de toda maldad. — 1 Juan 1:8-9",
  },
  // Easter
  opening_sentence_easter_1: {
    en: "Alleluia! Christ our Passover has been sacrificed for us; therefore let us keep the feast. Alleluia! — 1 Corinthians 5:7,8",
    es: "¡Aleluya! Cristo, nuestra Pascua, ya ha sido sacrificado por nosotros; celebremos, pues, la fiesta. ¡Aleluya! — 1 Corintios 5:7-8",
  },
  // Trinity / Pentecost
  opening_sentence_trinity_1: {
    en: "Holy, holy, holy is the Lord of hosts; the whole earth is full of his glory. — Isaiah 6:3",
    es: "Santo, santo, santo es el Señor de los ejércitos; toda la tierra está llena de su gloria. — Isaías 6:3",
  },
  // Anytime — Hab 2:20, used widely.
  opening_sentence_anytime_4: {
    en: "The Lord is in his holy temple; let all the earth keep silence before him. — Habakkuk 2:20",
    es: "El Señor está en su santo templo; calle ante él toda la tierra. — Habacuc 2:20",
  },
  // Evening Prayer — Psalm 141:2 (the classic EP opening).
  opening_sentence_evening_1: {
    en: "Let my prayer be set forth in your sight as incense, and let the lifting up of my hands be an evening sacrifice. — Psalm 141:2",
    es: "Que mi oración suba a tu presencia como incienso, y el levantamiento de mis manos como ofrenda de la tarde. — Salmo 141:2",
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
