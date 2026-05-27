// Curated set of Collects from the 1979 Book of Common Prayer.
//
// Shape mirrors BcpPrayer so the existing accordion + modal layout in
// bcp-collects.tsx can render this list with zero structural changes.
// Texts are direct quotations from the 1979 BCP (US Episcopal), which
// is public domain.
//
// What's included:
//   • The seven Morning Prayer collects (Sundays, Fridays, Saturdays,
//     Renewal of Life, Peace, Grace, Guidance).
//   • The seven Evening Prayer collects (Sundays, Fridays, Saturdays,
//     Peace, Aid against Perils, Protection, Presence of Christ).
//   • The four Daily Devotions collects (Early Morning, Noon, Early
//     Evening, Close of Day).
//   • A small "Other Loved Collects" group: the Collect for Purity,
//     the General Thanksgiving, and the Prayer of St. Chrysostom — the
//     collects people search for by name even outside the offices.
//
// What's intentionally NOT included:
//   The Collects of the Christian Year (Advent → Christ the King, ~150
//   entries) live next to the liturgical calendar in
//   lib/liturgical/*.ts because they're date-keyed. A static index
//   would duplicate them; users discover today's collect through the
//   day's office or the liturgical-date header. If we ever want a flat
//   "every Sunday's collect" browser, that's a separate data source.

export type BcpCollect = {
  category: string;
  title: string;
  text: string;
  // Spanish (Libro de Oración Común). Optional during incremental
  // translation; localizeBcpCollect() falls back to English when missing.
  titleEs?: string;
  textEs?: string;
};

// English category → Spanish category. The English string remains the
// grouping key in bcp-collects.tsx — only the display label flips.
export const BCP_COLLECT_CATEGORY_ES: Record<string, string> = {
  "Morning Prayer": "Oración Matutina",
  "Evening Prayer": "Oración Vespertina",
  "Daily Devotions": "Devociones Diarias",
  "Other Loved Collects": "Otras Colectas Queridas",
};

export const BCP_COLLECTS: BcpCollect[] = [
  // ── Morning Prayer ────────────────────────────────────────────────
  {
    category: "Morning Prayer",
    title: "A Collect for Sundays",
    text: "O God, you make us glad with the weekly remembrance of the glorious resurrection of your Son our Lord: Give us this day such blessing through our worship of you, that the week to come may be spent in your favor; through Jesus Christ our Lord. Amen.",
    titleEs: "Colecta para los Domingos",
    textEs: "Oh Dios, que nos alegras con el recuerdo semanal de la gloriosa resurrección de tu Hijo nuestro Señor: Danos en este día tal bendición por nuestra adoración a ti, que la semana venidera se transcurra en tu favor; por Jesucristo nuestro Señor. Amén.",
  },
  {
    category: "Morning Prayer",
    title: "A Collect for Fridays",
    text: "Almighty God, whose most dear Son went not up to joy but first he suffered pain, and entered not into glory before he was crucified: Mercifully grant that we, walking in the way of the cross, may find it none other than the way of life and peace; through Jesus Christ your Son our Lord. Amen.",
    titleEs: "Colecta para los Viernes",
    textEs: "Dios omnipotente, cuyo amadísimo Hijo no subió al gozo sin antes padecer el dolor, ni entró en la gloria sin antes ser crucificado: Concédenos misericordiosamente que, caminando por la vía de la cruz, hallemos en ella el camino de la vida y de la paz; por Jesucristo tu Hijo nuestro Señor. Amén.",
  },
  {
    category: "Morning Prayer",
    title: "A Collect for Saturdays",
    text: "Almighty God, who after the creation of the world rested from all your works and sanctified a day of rest for all your creatures: Grant that we, putting away all earthly anxieties, may be duly prepared for the service of your sanctuary, and that our rest here upon earth may be a preparation for the eternal rest promised to your people in heaven; through Jesus Christ our Lord. Amen.",
    titleEs: "Colecta para los Sábados",
    textEs: "Dios omnipotente, que después de la creación del mundo descansaste de todas tus obras y santificaste un día de reposo para todas tus criaturas: Concede que, apartando toda ansiedad terrenal, nos preparemos debidamente para el servicio de tu santuario, y que nuestro descanso aquí en la tierra sea preparación para el descanso eterno prometido a tu pueblo en el cielo; por Jesucristo nuestro Señor. Amén.",
  },
  {
    category: "Morning Prayer",
    title: "A Collect for the Renewal of Life",
    text: "O God, the King eternal, whose light divides the day from the night and turns the shadow of death into the morning: Drive far from us all wrong desires, incline our hearts to keep your law, and guide our feet into the way of peace; that, having done your will with cheerfulness during the day, we may, when night comes, rejoice to give you thanks; through Jesus Christ our Lord. Amen.",
    titleEs: "Colecta por la Renovación de la Vida",
    textEs: "Oh Dios, Rey eterno, cuya luz separa el día de la noche y vuelve en mañana la sombra de muerte: Aleja de nosotros todo mal deseo, inclina nuestros corazones a guardar tu ley, y guía nuestros pasos por el camino de la paz; para que, habiendo hecho tu voluntad con alegría durante el día, nos regocijemos al darte gracias cuando llegue la noche; por Jesucristo nuestro Señor. Amén.",
  },
  {
    category: "Morning Prayer",
    title: "A Collect for Peace",
    text: "O God, the author of peace and lover of concord, to know you is eternal life and to serve you is perfect freedom: Defend us, your humble servants, in all assaults of our enemies; that we, surely trusting in your defense, may not fear the power of any adversaries; through the might of Jesus Christ our Lord. Amen.",
    titleEs: "Colecta por la Paz",
    textEs: "Oh Dios, autor de la paz y amante de la concordia, conocerte es vida eterna y servirte es perfecta libertad: Defiéndenos, humildes siervos tuyos, en todo ataque de nuestros enemigos; para que, confiando firmemente en tu defensa, no temamos el poder de adversario alguno; por la fortaleza de Jesucristo nuestro Señor. Amén.",
  },
  {
    category: "Morning Prayer",
    title: "A Collect for Grace",
    text: "Lord God, almighty and everlasting Father, you have brought us in safety to this new day: Preserve us with your mighty power, that we may not fall into sin, nor be overcome by adversity; and in all we do, direct us to the fulfilling of your purpose; through Jesus Christ our Lord. Amen.",
    titleEs: "Colecta por la Gracia",
    textEs: "Señor Dios, Padre omnipotente y eterno, nos has traído a salvo a este nuevo día: Presérvanos con tu poder soberano, para que no caigamos en pecado, ni seamos vencidos por la adversidad; y en todo cuanto hagamos, dirígenos al cumplimiento de tu propósito; por Jesucristo nuestro Señor. Amén.",
  },
  {
    category: "Morning Prayer",
    title: "A Collect for Guidance",
    text: "Heavenly Father, in you we live and move and have our being: We humbly pray you so to guide and govern us by your Holy Spirit, that in all the cares and occupations of our life we may not forget you, but may remember that we are ever walking in your sight; through Jesus Christ our Lord. Amen.",
    titleEs: "Colecta por Guía",
    textEs: "Padre celestial, en ti vivimos, nos movemos y existimos: Humildemente te rogamos que nos guíes y gobiernes de tal manera por tu Espíritu Santo, que en todos los cuidados y ocupaciones de nuestra vida no te olvidemos, sino que recordemos siempre que caminamos a tu vista; por Jesucristo nuestro Señor. Amén.",
  },

  // ── Evening Prayer ────────────────────────────────────────────────
  {
    category: "Evening Prayer",
    title: "A Collect for Sundays",
    text: "Lord God, whose Son our Savior Jesus Christ triumphed over the powers of death and prepared for us our place in the new Jerusalem: Grant that we, who have this day given thanks for his resurrection, may praise you in that City of which he is the light, and where he lives and reigns for ever and ever. Amen.",
  },
  {
    category: "Evening Prayer",
    title: "A Collect for Fridays",
    text: "Lord Jesus Christ, by your death you took away the sting of death: Grant to us your servants so to follow in faith where you have led the way, that we may at length fall asleep peacefully in you and wake up in your likeness; for your tender mercies' sake. Amen.",
  },
  {
    category: "Evening Prayer",
    title: "A Collect for Saturdays",
    text: "O God, the source of eternal light: Shed forth your unending day upon us who watch for you, that our lips may praise you, our lives may bless you, and our worship on the morrow give you glory; through Jesus Christ our Lord. Amen.",
  },
  {
    category: "Evening Prayer",
    title: "A Collect for Peace",
    text: "O God, the source of all holy desires, all good counsels, and all just works: Give to your servants that peace which the world cannot give, that our hearts may be set to obey your commandments, and also that we, being defended from the fear of our enemies, may pass our time in rest and quietness; through the merits of Jesus Christ our Savior. Amen.",
  },
  {
    category: "Evening Prayer",
    title: "A Collect for Aid against Perils",
    text: "Lighten our darkness, we beseech you, O Lord; and by your great mercy defend us from all perils and dangers of this night; for the love of your only Son, our Savior Jesus Christ. Amen.",
  },
  {
    category: "Evening Prayer",
    title: "A Collect for Protection",
    text: "O God, the life of all who live, the light of the faithful, the strength of those who labor, and the repose of the dead: We thank you for the blessings of the day that is past, and humbly ask for your protection through the coming night. Bring us in safety to the morning hours; through him who died and rose again for us, your Son our Savior Jesus Christ. Amen.",
  },
  {
    category: "Evening Prayer",
    title: "A Collect for the Presence of Christ",
    text: "Lord Jesus, stay with us, for evening is at hand and the day is past; be our companion in the way, kindle our hearts, and awaken hope, that we may know you as you are revealed in Scripture and the breaking of bread. Grant this for the sake of your love. Amen.",
  },

  // ── Daily Devotions ───────────────────────────────────────────────
  {
    category: "Daily Devotions",
    title: "In the Early Morning",
    text: "O God, the King eternal, who divides the day from the night and turns the shadow of death into the morning: Drive far from us all wrong desires, incline our hearts to keep your law, and guide our feet into the way of peace; that, having done your will with cheerfulness while it was day, we may, when night comes, rejoice to give you thanks; through Jesus Christ our Lord. Amen.",
  },
  {
    category: "Daily Devotions",
    title: "At Noon",
    text: "Blessed Savior, at this hour you hung upon the cross, stretching out your loving arms: Grant that all the peoples of the earth may look to you and be saved; for your tender mercies' sake. Amen.",
  },
  {
    category: "Daily Devotions",
    title: "In the Early Evening",
    text: "Lord Jesus Christ, you stretched out your arms of love on the hard wood of the cross that everyone might come within the reach of your saving embrace: So clothe us in your Spirit that we, reaching forth our hands in love, may bring those who do not know you to the knowledge and love of you; for the honor of your Name. Amen.",
  },
  {
    category: "Daily Devotions",
    title: "At the Close of Day",
    text: "Visit this place, O Lord, and drive far from it all snares of the enemy; let your holy angels dwell with us to preserve us in peace; and let your blessing be upon us always; through Jesus Christ our Lord. Amen.",
  },

  // ── Other Loved Collects ──────────────────────────────────────────
  {
    category: "Other Loved Collects",
    title: "The Collect for Purity",
    text: "Almighty God, to you all hearts are open, all desires known, and from you no secrets are hid: Cleanse the thoughts of our hearts by the inspiration of your Holy Spirit, that we may perfectly love you, and worthily magnify your holy Name; through Christ our Lord. Amen.",
  },
  {
    category: "Other Loved Collects",
    title: "The General Thanksgiving",
    text: "Almighty God, Father of all mercies, we your unworthy servants give you humble thanks for all your goodness and loving-kindness to us and to all whom you have made. We bless you for our creation, preservation, and all the blessings of this life; but above all for your immeasurable love in the redemption of the world by our Lord Jesus Christ; for the means of grace, and for the hope of glory. And, we pray, give us such an awareness of your mercies, that with truly thankful hearts we may show forth your praise, not only with our lips, but in our lives, by giving up ourselves to your service, and by walking before you in holiness and righteousness all our days; through Jesus Christ our Lord, to whom, with you and the Holy Spirit, be honor and glory throughout all ages. Amen.",
  },
  {
    category: "Other Loved Collects",
    title: "A Prayer of St. Chrysostom",
    text: "Almighty God, you have given us grace at this time with one accord to make our common supplication to you; and you have promised through your well-beloved Son that when two or three are gathered together in his Name you will be in the midst of them: Fulfill now, O Lord, our desires and petitions as may be best for us; granting us in this world knowledge of your truth, and in the age to come life everlasting. Amen.",
  },
];

/** Resolve a collect's display fields for the active locale. Falls
 * back to English when the Spanish translation isn't filled in yet.
 */
export function localizeBcpCollect(
  c: BcpCollect,
  lang: string | undefined,
): { category: string; title: string; text: string } {
  if (lang?.startsWith("es")) {
    return {
      category: BCP_COLLECT_CATEGORY_ES[c.category] ?? c.category,
      title: c.titleEs || c.title,
      text: c.textEs || c.text,
    };
  }
  return { category: c.category, title: c.title, text: c.text };
}
