/**
 * Rite I liturgical texts — the traditional-language Daily Office.
 *
 * Owner asked for a Rite I / Rite II option; this is the first content pass
 * behind the scaffolding in lib/officeRite.ts. Everything here was extracted
 * programmatically from the Episcopal Church's own published text of the 1979
 * Book of Common Prayer (bcponline.org/DailyOffice/mp1.html) rather than
 * transcribed by hand — liturgical wording is exactly where a well-meaning
 * paraphrase would slip through unnoticed, so no line of it was written from
 * memory. The 1979 BCP is not under copyright; the Rite II texts this app
 * already ships came from the same source.
 *
 * ── Two naming conventions in one file, on purpose ──
 *
 * `<key>_rite1` rows are VARIANTS of an existing Rite II text, and the
 * resolver in lib/officeRite.ts finds them by that suffix — seed
 * `confession_text_rite1` and the confession turns traditional while the rest
 * of the office stays contemporary.
 *
 * `canticle_1` … `canticle_7` are NOT variants. Rite I has its own numbered
 * canticles, and they had no rows at all before this (only 8–21 were seeded).
 * They carry no suffix because they are their own texts, not another wording
 * of a Rite II one.
 *
 * ── Still missing, deliberately ──
 *
 *   • The 95 Collects of the Day. They live on a different page and are the
 *     single biggest bucket; until they are seeded, a Rite I office falls back
 *     to the Rite II collect, which is what the resolver's fallback is for.
 *   • The Rite I canticle SELECTION table (which canticle is appointed on
 *     which day). BCP's table pairs the rites — "4 or 16", "1 or 12" — so the
 *     data exists, but wiring it needs its own careful pass. Until then these
 *     seven are reachable through the office's canticle picker.
 *
 * Safe to re-run: seedBcpTexts upserts on textKey.
 */

export const RITE1_TEXTS: Array<{
  textKey: string;
  category: string;
  title: string;
  bcpReference: string;
  content: string;
}> = [
  {
    textKey: "confession_text_rite1",
    category: "confession",
    title: "Confession of Sin",
    bcpReference: "BCP p. 41",
    content:
      "Almighty and most merciful Father,\nwe have erred and strayed from thy ways like lost sheep,\nwe have followed too much the devices and desires of our\n  own hearts,\nwe have offended against thy holy laws,\nwe have left undone those things which we ought to\n  have done,\nand we have done those things which we ought not to\n  have done.\nBut thou, O Lord, have mercy upon us,\nspare thou those who confess their faults,\nrestore thou those who are penitent,\naccording to thy promises declared unto mankind\nin Christ Jesus our Lord;\nand grant, O most merciful Father, for his sake,\nthat we may hereafter live a godly, righteous, and sober life,\nto the glory of thy holy Name. Amen.",
  },
  {
    textKey: "confession_absolution_rite1",
    category: "absolution",
    title: "The Absolution",
    bcpReference: "BCP p. 41",
    content:
      "The Almighty and merciful Lord grant you absolution and\nremission of all your sins, true repentance, amendment of\nlife, and the grace and consolation of his Holy Spirit. Amen.",
  },
  {
    textKey: "venite_rite1",
    category: "invitatory",
    title: "Venite · Psalm 95:1-7",
    bcpReference: "BCP p. 44",
    content:
      "O come, let us sing unto the Lord; *\n  let us heartily rejoice in the strength of our salvation.\nLet us come before his presence with thanksgiving *\n  and show ourselves glad in him with psalms.\nFor the Lord is a great God, *\n  and a great King above all gods.\nIn his hand are all the corners of the earth, *\n  and the strength of the hills is his also.\nThe sea is his, and he made it, *\n  and his hands prepared the dry land.\nO come, let us worship and fall down, *\n  and kneel before the Lord our Maker.\nFor he is the Lord our God, *\n  and we are the people of his pasture\n  and the sheep of his hand.\nO worship the Lord in the beauty of holiness; *\n  let the whole earth stand in awe of him.\nFor he cometh, for he cometh to judge the earth, *\n  and with righteousness to judge the world\n  and the peoples with his truth.",
  },
  {
    textKey: "jubilate_rite1",
    category: "invitatory",
    title: "Jubilate · Psalm 100",
    bcpReference: "BCP p. 45",
    content:
      "Be joyful in the Lord, all ye lands; *\n  serve the Lord with gladness\n  and come before his presence with a song.\nBe ye sure that the Lord he is God;\nit is he that hath made us and not we ourselves; *\n  we are his people and the sheep of his pasture.\nO go your way into his gates with thanksgiving\nand into his courts with praise; *\n  be thankful unto him and speak good of his Name.\nFor the Lord is gracious;\nhis mercy is everlasting; *\n  and his truth endureth from generation to generation.",
  },
  {
    textKey: "apostles_creed_rite1",
    category: "creed",
    title: "The Apostles' Creed",
    bcpReference: "BCP p. 53",
    content:
      "I believe in God, the Father almighty,\n  maker of heaven and earth;\nAnd in Jesus Christ his only Son our Lord;\n  who was conceived by the Holy Ghost,\n  born of the Virgin Mary,\n  suffered under Pontius Pilate,\n  was crucified, dead, and buried.\n  He descended into hell.\n  The third day he rose again from the dead.\n  He ascended into heaven,\n  and sitteth on the right hand of God the Father almighty.\n  From thence he shall come to judge the quick and the dead.\nI believe in the Holy Ghost,\n  the holy catholic Church,\n  the communion of saints,\n  the forgiveness of sins,\n  the resurrection of the body,\n  and the life everlasting. Amen.",
  },
  {
    textKey: "lords_prayer_contemporary_rite1",
    category: "lords_prayer",
    title: "The Lord's Prayer",
    bcpReference: "BCP p. 54",
    content:
      "Our Father, who art in heaven,\n  hallowed be thy Name,\n  thy kingdom come,\n  thy will be done,\n    on earth as it is in heaven.\nGive us this day our daily bread.\nAnd forgive us our trespasses,\n  as we forgive those who trespass against us.\nAnd lead us not into temptation,\n  but deliver us from evil.\nFor thine is the kingdom, and the power, and the glory,\n  for ever and ever. Amen.",
  },
  {
    textKey: "suffrages_a_rite1",
    category: "suffrages",
    title: "Suffrages A",
    bcpReference: "BCP p. 55",
    content:
      "V.  O Lord, show thy mercy upon us;\nR.  And grant us thy salvation.\nV.  Endue thy ministers with righteousness;\nR.  And make thy chosen people joyful.\nV.  Give peace, O Lord, in all the world;\nR.  For only in thee can we live in safety.\nV.  Lord, keep this nation under thy care;\nR.  And guide us in the way of justice and truth.\nV.  Let thy way be known upon earth;\nR.  Thy saving health among all nations.\nV.  Let not the needy, O Lord, be forgotten;\nR.  Nor the hope of the poor be taken away.\nV.  Create in us clean hearts, O God;\nR.  And sustain us with thy Holy Spirit.",
  },
  {
    textKey: "suffrages_b_rite1",
    category: "suffrages",
    title: "Suffrages B",
    bcpReference: "BCP p. 55",
    content:
      "V.  O Lord, save thy people and bless thine heritage;\nR.  Govern them and lift them up for ever.\nV.  Day by day we magnify thee;\nR.  And we worship thy Name ever, world without end.\nV.  Vouchsafe, O Lord, to keep us this day without sin;\nR.  O Lord, have mercy upon us, have mercy upon us.\nV.  O Lord, let thy mercy be upon us;\nR.  As our trust is in thee.\nV.  O Lord, in thee have I trusted;\nR.  Let me never be confounded.",
  },
  {
    textKey: "general_thanksgiving_rite1",
    category: "general_thanksgiving",
    title: "The General Thanksgiving",
    bcpReference: "BCP p. 58",
    content:
      "Almighty God, Father of all mercies,\nwe thine unworthy servants\ndo give thee most humble and hearty thanks\nfor all thy goodness and loving-kindness\nto us and to all men.\nWe bless thee for our creation, preservation,\nand all the blessings of this life;\nbut above all for thine inestimable love\nin the redemption of the world by our Lord Jesus Christ;\nfor the means of grace, and for the hope of glory.\nAnd, we beseech thee,\ngive us that due sense of all thy mercies,\nthat our hearts may be unfeignedly thankful;\nand that we show forth thy praise,\nnot only with our lips, but in our lives,\nby giving up our selves to thy service,\nand by walking before thee\nin holiness and righteousness all our days;\nthrough Jesus Christ our Lord,\nto whom, with thee and the Holy Ghost,\nbe all honor and glory, world without end. Amen.",
  },
  {
    textKey: "canticle_1",
    category: "canticle",
    title: "Canticle 1 — A Song of Creation (Benedicite, omnia opera Domini)",
    bcpReference: "BCP p. 47",
    content:
      "I  Invocation\nO all ye works of the Lord, bless ye the Lord; *\n  praise him and magnify him for ever.\nO ye angels of the Lord, bless ye the Lord; *\n  praise him and magnify him for ever.\nII  The Cosmic Order\nO ye heavens, bless ye the Lord; *\n  O ye waters that be above the firmament, bless ye the Lord;\nO all ye powers of the Lord, bless ye the Lord; *\n  praise him and magnify him for ever.\nO ye sun and moon, bless ye the Lord; *\n  O ye stars of heaven, bless ye the Lord;\nO ye showers and dew, bless ye the Lord; *\n  praise him and magnify him for ever.\nO ye winds of God, bless ye the Lord; *\n  O ye fire and heat, bless ye the Lord;\nO ye winter and summer, bless ye the Lord; *\n  praise him and magnify him for ever.\nO ye dews and frosts, bless ye the Lord; *\n  O ye frost and cold, bless ye the Lord;\nO ye ice and snow, bless ye the Lord; *\n  praise him and magnify him for ever.\nO ye nights and days, bless ye the Lord; *\n  O ye light and darkness, bless ye the Lord;\nO ye lightnings and clouds, bless ye the Lord; *\n  praise him and magnify him for ever.\nIII  The Earth and its Creatures\nO let the earth bless the Lord; *\n  O ye mountains and hills, bless ye the Lord;\nO all ye green things upon the earth, bless ye the Lord; *\n  praise him and magnify him for ever.\nO ye wells, bless ye the Lord; *\n  O ye seas and floods, bless ye the Lord;\nO ye whales and all that move in the waters, bless ye the Lord;\n  praise him and magnify him for ever.\nO all ye fowls of the air, bless ye the Lord; *\n  O all ye beasts and cattle, bless ye the Lord;\nO ye children of men, bless ye the Lord; *\n  praise him and magnify him for ever.\nIV  The People of God\nO ye people of God, bless ye the Lord; *\n  O ye priests of the Lord, bless ye the Lord;\nO ye servants of the Lord, bless ye the Lord; *\n  praise him and magnify him for ever.\nO ye spirits and souls of the righteous, bless ye the\nLord; *\n  O ye holy and humble men of heart, bless ye the Lord.\nLet us bless the Father, the Son, and the Holy Spirit; *\n  praise him and magnify him for ever.",
  },
  {
    textKey: "canticle_2",
    category: "canticle",
    title: "Canticle 2 — A Song of Praise (Benedictus es, Domine)",
    bcpReference: "BCP p. 49",
    content:
      "Blessed art thou, O Lord God of our fathers; *\n  praised and exalted above all for ever.\nBlessed art thou for the Name of thy Majesty; *\n  praised and exalted above all for ever.\nBlessed art thou in the temple of thy holiness; *\n  praised and exalted above all for ever.\nBlessed art thou that beholdest the depths,\nand dwellest between the Cherubim; *\n  praised and exalted above all for ever.\nBlessed art thou on the glorious throne of thy kingdom; *\n  praised and exalted above all for ever.\nBlessed art thou in the firmament of heaven; *\n  praised and exalted above all for ever.\nBlessed art thou, O Father, Son, and Holy Spirit; *\n  praised and exalted above all for ever.",
  },
  {
    textKey: "canticle_3",
    category: "canticle",
    title: "Canticle 3 — The Song of Mary (Magnificat)",
    bcpReference: "BCP p. 50",
    content:
      "My soul doth magnify the Lord, *\n  and my spirit hath rejoiced in God my Savior.\nFor he hath regarded *\n  the lowliness of his handmaiden.\nFor behold from henceforth *\n  all generations shall call me blessed.\nFor he that is mighty hath magnified me, *\n  and holy is his Name.\nAnd his mercy is on them that fear him *\n  throughout all generations.\nHe hath showed strength with his arm; *\n  he hath scattered the proud in the imagination of their hearts.\nHe hath put down the mighty from their seat, *\n  and hath exalted the humble and meek.\nHe hath filled the hungry with good things, *\n  and the rich he hath sent empty away.\nHe remembering his mercy hath holpen his servant Israel, *\n  as he promised to our forefathers,\n  Abraham and his seed for ever.\nGlory to the Father, and to the Son, and to the Holy Spirit: *\n  as it was in the beginning, is now, and will be for ever. Amen.",
  },
  {
    textKey: "canticle_4",
    category: "canticle",
    title: "Canticle 4 — The Song of Zechariah (Benedictus Dominus Deus)",
    bcpReference: "BCP p. 50",
    content:
      "Blessed be the Lord God of Israel, *\n  for he hath visited and redeemed his people;\nAnd hath raised up a mighty salvation for us *\n  in the house of his servant David,\nAs he spake by the mouth of his holy prophets, *\n  which have been since the world began:\nThat we should be saved from our enemies, *\n  and from the hand of all that hate us;\nTo perform the mercy promised to our forefathers, *\n  and to remember his holy covenant;\nTo perform the oath which he sware to our forefather Abraham, *\n  that he would give us,\nThat we being delivered out of the hand of our enemies *\n  might serve him without fear,\nIn holiness and righteousness before him, *\n  all the days of our life.\nAnd thou, child, shalt be called the prophet of the Highest, *\n  for thou shalt go before the face of the Lord\n                 to prepare his ways;\nTo give knowledge of salvation unto his people *\n  for the remission of their sins,\nThrough the tender mercy of our God, *\n  whereby the dayspring from on high hath visited us;\nTo give light to them that sit in darkness\nand in the shadow of death, *\n  and to guide our feet into the way of peace.\nGlory to the Father, and to the Son, and to the Holy Spirit: *\n  as it was in the beginning, is now, and will be for ever. Amen.",
  },
  {
    textKey: "canticle_5",
    category: "canticle",
    title: "Canticle 5 — The Song of Simeon (Nunc dimittis)",
    bcpReference: "BCP p. 51",
    content:
      "Lord, now lettest thou thy servant depart in peace, *\n  according to thy word;\nFor mine eyes have seen thy salvation, *\n  which thou hast prepared before the face of all people,\nTo be a light to lighten the Gentiles, *\n  and to be the glory of thy people Israel.\nGlory to the Father, and to the Son, and to the Holy Spirit: *\n  as it was in the beginning, is now, and will be for ever. Amen.",
  },
  {
    textKey: "canticle_6",
    category: "canticle",
    title: "Canticle 6 — Glory be to God (Gloria in excelsis)",
    bcpReference: "BCP p. 52",
    content:
      "Glory be to God on high,\n  and on earth peace, good will towards men.\nWe praise thee, we bless thee,\n  we worship thee,\n  we glorify thee,\n  we give thanks to thee for thy great glory,\nO Lord God, heavenly King, God the Father Almighty.\nO Lord, the only-begotten Son, Jesus Christ;\nO Lord God, Lamb of God, Son of the Father,\n  that takest away the sins of the world,\n  have mercy upon us.\nThou that takest away the sins of the world,\n  receive our prayer.\nThou that sittest at the right hand of God the Father,\n  have mercy upon us.\nFor thou only art holy,\nthou only art the Lord,\nthou only, O Christ,\n  with the Holy Ghost,\n  art most high in the glory of God the Father. Amen.",
  },
  {
    textKey: "canticle_7",
    category: "canticle",
    title: "Canticle 7 — We Praise Thee (Te Deum laudamus)",
    bcpReference: "BCP p. 52",
    content:
      "We praise thee, O God; we acknowledge thee to be the Lord.\nAll the earth doth worship thee, the Father everlasting.\nTo thee all Angels cry aloud,\nthe Heavens and all the Powers therein.\nTo thee Cherubim and Seraphim continually do cry:\n  Holy, holy, holy, Lord God of Sabaoth;\n  Heaven and earth are full of the majesty of thy glory.\nThe glorious company of the apostles praise thee.\nThe goodly fellowship of the prophets praise thee.\nThe noble army of martyrs praise thee.\nThe holy Church throughout all the world\n                doth acknowledge thee,\n  the Father, of an infinite majesty,\n  thine adorable, true, and only Son,\n  also the Holy Ghost the Comforter.\nThou art the King of glory, O Christ.\nThou art the everlasting Son of the Father.\nWhen thou tookest upon thee to deliver man,\nthou didst humble thyself to be born of a Virgin.\nWhen thou hadst overcome the sharpness of death,\nthou didst open the kingdom of heaven to all believers.\nThou sittest at the right hand of God, in the glory of the Father.\nWe believe that thou shalt come to be our judge.\n  We therefore pray thee, help thy servants,\n  whom thou hast redeemed with thy precious blood.\n  Make them to be numbered with thy saints,\n  in glory everlasting.",
  },
];
