/**
 * BCP Texts Seed Script
 *
 * Fetches liturgical texts from bcponline.org and upserts them into
 * the bcp_texts table. Run once to populate; safe to re-run (upserts).
 *
 * Usage:
 *   pnpm tsx src/seeds/bcpTexts.ts
 *
 * No external dependencies beyond @workspace/db and Node fetch.
 * 500ms delay between requests to be polite to bcponline.org.
 */

import { db, bcpTextsTable } from "@workspace/db";
import { sql } from "drizzle-orm";

const DELAY_MS = 500;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Strip HTML tags and normalize whitespace from a chunk of HTML.
 */
function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<p[^>]*>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#8217;/g, "'")
    .replace(/&#8216;/g, "'")
    .replace(/&#8220;/g, "\u201c")
    .replace(/&#8221;/g, "\u201d")
    .replace(/&#8212;/g, "—")
    .replace(/&#8211;/g, "–")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .join("\n")
    .trim();
}

/**
 * Fetch a URL and return the raw HTML text.
 */
async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": "Eleanor/1.0 BCP Seed Script" },
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
  return res.text();
}

/**
 * Upsert a single bcp_texts row.
 */
async function upsert(row: {
  textKey: string;
  category: string;
  title: string;
  bcpReference?: string;
  content: string;
  seasonRestriction?: string;
  metadata?: Record<string, unknown>;
}) {
  await db
    .insert(bcpTextsTable)
    .values({
      textKey: row.textKey,
      category: row.category,
      title: row.title,
      bcpReference: row.bcpReference ?? null,
      content: row.content,
      seasonRestriction: row.seasonRestriction ?? null,
      metadata: row.metadata ?? null,
    })
    .onConflictDoUpdate({
      target: bcpTextsTable.textKey,
      set: {
        content: sql`excluded.content`,
        title: sql`excluded.title`,
        bcpReference: sql`excluded.bcp_reference`,
        seasonRestriction: sql`excluded.season_restriction`,
        metadata: sql`excluded.metadata`,
      },
    });
}

/* ------------------------------------------------------------------ */
/*  Static BCP texts (these don't change — defined inline)             */
/* ------------------------------------------------------------------ */

/**
 * Core liturgical texts that are short enough to define inline and
 * aren't scraped. These come directly from BCP Rite II Morning Prayer.
 */
async function seedStaticTexts() {
  console.log("Seeding static liturgical texts...");

  const texts: Array<Parameters<typeof upsert>[0]> = [
    // ── Opening sentences ───────────────────────────────────────────
    {
      textKey: "opening_sentence_advent_1",
      category: "opening_sentence",
      title: "Opening Sentence — Advent",
      bcpReference: "BCP p. 75",
      seasonRestriction: "advent",
      content:
        "Watch, for you do not know when the master of the house will come, in the evening, or at midnight, or at cockcrow, or in the morning; lest he come suddenly and find you asleep. — Mark 13:35,36",
    },
    {
      textKey: "opening_sentence_advent_2",
      category: "opening_sentence",
      title: "Opening Sentence — Advent",
      bcpReference: "BCP p. 75",
      seasonRestriction: "advent",
      content:
        "In the wilderness prepare the way of the Lord, make straight in the desert a highway for our God. — Isaiah 40:3",
    },
    {
      textKey: "opening_sentence_advent_3",
      category: "opening_sentence",
      title: "Opening Sentence — Advent",
      bcpReference: "BCP p. 75",
      seasonRestriction: "advent",
      content:
        "The glory of the Lord shall be revealed, and all flesh shall see it together. — Isaiah 40:5",
    },
    {
      textKey: "opening_sentence_christmas_1",
      category: "opening_sentence",
      title: "Opening Sentence — Christmas",
      bcpReference: "BCP p. 75",
      seasonRestriction: "christmas",
      content:
        "Behold, I bring you good news of a great joy which will come to all the people; for to you is born this day in the city of David, a Savior, who is Christ the Lord. — Luke 2:10,11",
    },
    {
      textKey: "opening_sentence_christmas_2",
      category: "opening_sentence",
      title: "Opening Sentence — Christmas",
      bcpReference: "BCP p. 75",
      seasonRestriction: "christmas",
      content:
        "Behold, the dwelling of God is with men. He will dwell with them, and they shall be his people, and God himself will be with them, and be their God. — Revelation 21:3",
    },
    {
      textKey: "opening_sentence_epiphany_1",
      category: "opening_sentence",
      title: "Opening Sentence — Epiphany",
      bcpReference: "BCP p. 76",
      seasonRestriction: "epiphany",
      content:
        "Nations shall come to your light, and kings to the brightness of your rising. — Isaiah 60:3",
    },
    {
      textKey: "opening_sentence_epiphany_2",
      category: "opening_sentence",
      title: "Opening Sentence — Epiphany",
      bcpReference: "BCP p. 76",
      seasonRestriction: "epiphany",
      content:
        "I will give you as a light to the nations, that my salvation may reach to the end of the earth. — Isaiah 49:6b",
    },
    {
      textKey: "opening_sentence_epiphany_3",
      category: "opening_sentence",
      title: "Opening Sentence — Epiphany",
      bcpReference: "BCP p. 76",
      seasonRestriction: "epiphany",
      content:
        "Arise, shine; for your light has come, and the glory of the Lord has risen upon you. — Isaiah 60:1",
    },
    {
      textKey: "opening_sentence_lent_1",
      category: "opening_sentence",
      title: "Opening Sentence — Lent",
      bcpReference: "BCP p. 76",
      seasonRestriction: "lent",
      content:
        "If we say we have no sin, we deceive ourselves, and the truth is not in us; but if we confess our sins, God, who is faithful and just, will forgive our sins and cleanse us from all unrighteousness. — 1 John 1:8,9",
    },
    {
      textKey: "opening_sentence_lent_2",
      category: "opening_sentence",
      title: "Opening Sentence — Lent",
      bcpReference: "BCP p. 76",
      seasonRestriction: "lent",
      content:
        "Rend your hearts and not your garments. Return to the Lord your God, for he is gracious and merciful, slow to anger and abounding in steadfast love, and repents of evil. — Joel 2:13",
    },
    {
      textKey: "opening_sentence_lent_3",
      category: "opening_sentence",
      title: "Opening Sentence — Lent",
      bcpReference: "BCP p. 76",
      seasonRestriction: "lent",
      content:
        "I will arise and go to my father, and I will say to him, Father, I have sinned against heaven and before you; I am no more worthy to be called your son. — Luke 15:18,19",
    },
    {
      textKey: "opening_sentence_lent_4",
      category: "opening_sentence",
      title: "Opening Sentence — Lent",
      bcpReference: "BCP p. 76",
      seasonRestriction: "lent",
      content:
        "To the Lord our God belong mercy and forgiveness, because we have rebelled against him and have not obeyed the voice of the Lord our God. — Daniel 9:9,10",
    },
    {
      textKey: "opening_sentence_lent_5",
      category: "opening_sentence",
      title: "Opening Sentence — Lent",
      bcpReference: "BCP p. 76",
      seasonRestriction: "lent",
      content:
        "The Lord is merciful and gracious, slow to anger and abounding in steadfast love. As a father pities his children, so the Lord pities those who fear him. — Psalm 103:8,13",
    },
    {
      textKey: "opening_sentence_holyweek_1",
      category: "opening_sentence",
      title: "Opening Sentence — Holy Week",
      bcpReference: "BCP p. 76",
      seasonRestriction: "holy_week",
      content:
        "Is it nothing to you, all you who pass by? Look and see if there is any sorrow like my sorrow which was brought upon me, which the Lord inflicted on the day of his fierce anger. — Lamentations 1:12",
    },
    {
      textKey: "opening_sentence_holyweek_2",
      category: "opening_sentence",
      title: "Opening Sentence — Holy Week",
      bcpReference: "BCP p. 76",
      seasonRestriction: "holy_week",
      content:
        "All we like sheep have gone astray; we have turned every one to his own way; and the Lord has laid on him the iniquity of us all. — Isaiah 53:6",
    },
    {
      textKey: "opening_sentence_easter_1",
      category: "opening_sentence",
      title: "Opening Sentence — Easter",
      bcpReference: "BCP p. 76",
      seasonRestriction: "easter",
      content:
        "Alleluia! The Lord is risen indeed: Come let us adore him. Alleluia!",
    },
    {
      textKey: "opening_sentence_easter_2",
      category: "opening_sentence",
      title: "Opening Sentence — Easter",
      bcpReference: "BCP p. 76",
      seasonRestriction: "easter",
      content:
        "On this day the Lord has acted; we will rejoice and be glad in it. — Psalm 118:24",
    },
    {
      textKey: "opening_sentence_easter_3",
      category: "opening_sentence",
      title: "Opening Sentence — Easter",
      bcpReference: "BCP p. 76",
      seasonRestriction: "easter",
      content:
        "If then you have been raised with Christ, seek the things that are above, where Christ is, seated at the right hand of God. — Colossians 3:1",
    },
    {
      textKey: "opening_sentence_easter_4",
      category: "opening_sentence",
      title: "Opening Sentence — Easter",
      bcpReference: "BCP p. 76",
      seasonRestriction: "easter",
      content:
        "Christ is risen from the dead, trampling down death by death, and giving life to those in the tomb.",
    },
    {
      textKey: "opening_sentence_easter_5",
      category: "opening_sentence",
      title: "Opening Sentence — Easter",
      bcpReference: "BCP p. 76",
      seasonRestriction: "easter",
      content:
        "Thanks be to God, who gives us the victory through our Lord Jesus Christ. — 1 Corinthians 15:57",
    },
    {
      textKey: "opening_sentence_anytime_1",
      category: "opening_sentence",
      title: "Opening Sentence",
      bcpReference: "BCP p. 76",
      content:
        "Grace to you and peace from God our Father and the Lord Jesus Christ. — Philippians 1:2",
    },
    {
      textKey: "opening_sentence_anytime_2",
      category: "opening_sentence",
      title: "Opening Sentence",
      bcpReference: "BCP p. 76",
      content:
        "I was glad when they said to me, \"Let us go to the house of the Lord.\" — Psalm 122:1",
    },
    {
      textKey: "opening_sentence_anytime_3",
      category: "opening_sentence",
      title: "Opening Sentence",
      bcpReference: "BCP p. 76",
      content:
        "Let the words of my mouth and the meditation of my heart be acceptable in your sight, O Lord, my strength and my redeemer. — Psalm 19:14",
    },
    {
      textKey: "opening_sentence_anytime_4",
      category: "opening_sentence",
      title: "Opening Sentence",
      bcpReference: "BCP p. 76",
      content:
        "Send out your light and your truth, that they may lead me, and bring me to your holy hill and to your dwelling. — Psalm 43:3",
    },
    {
      textKey: "opening_sentence_anytime_5",
      category: "opening_sentence",
      title: "Opening Sentence",
      bcpReference: "BCP p. 76",
      content:
        "The Lord is in his holy temple; let all the earth keep silence before him. — Habakkuk 2:20",
    },
    {
      textKey: "opening_sentence_anytime_6",
      category: "opening_sentence",
      title: "Opening Sentence",
      bcpReference: "BCP p. 76",
      content:
        "O worship the Lord in the beauty of holiness; let the whole earth stand in awe of him. — Psalm 96:9",
    },
    {
      textKey: "opening_sentence_anytime_7",
      category: "opening_sentence",
      title: "Opening Sentence",
      bcpReference: "BCP p. 76",
      content:
        "Seek him who made the Pleiades and Orion, and turns deep darkness into the morning, and darkens the day into night; who calls for the waters of the sea and pours them out upon the surface of the earth: The Lord is his name. — Amos 5:8",
    },

    // ── Confession & Absolution ──────────────────────────────────────
    {
      textKey: "confession_text",
      category: "confession",
      title: "Confession of Sin",
      bcpReference: "BCP p. 79",
      content:
        "Most merciful God,\nwe confess that we have sinned against you\nin thought, word, and deed,\nby what we have done,\nand by what we have left undone.\nWe have not loved you with our whole heart;\nwe have not loved our neighbors as ourselves.\nWe are truly sorry and we humbly repent.\nFor the sake of your Son Jesus Christ,\nhave mercy on us and forgive us;\nthat we may delight in your will,\nand walk in your ways,\nto the glory of your Name. Amen.",
    },
    {
      textKey: "confession_absolution",
      category: "absolution",
      title: "Absolution",
      bcpReference: "BCP p. 80",
      // Lay form per the BCP rubric on p. 80: "A deacon or lay person
      // using the preceding form remains kneeling, and substitutes
      // 'us' for 'you' and 'our' for 'your.'" Phoebe is an individual
      // / lay prayer surface — there's no priest at the device — so
      // the absolution is rendered as a prayer FOR forgiveness rather
      // than the priestly declaration of it.
      content:
        "Almighty God have mercy on us, forgive us all our sins through our Lord Jesus Christ, strengthen us in all goodness, and by the power of the Holy Spirit keep us in eternal life. Amen.",
    },

    // ── Enriching Our Worship 1 — Confession + Absolution ───────────
    // EOW1 Daily Office, "Confession of Sin" + "Absolution" (pp. 19).
    // The assemblers prefer these when the user's liturgyDialect is
    // "eow1" (the default for new accounts), falling back to the BCP
    // pair above when the user has toggled to "bcp" in Settings.
    {
      textKey: "confession_text_eow1",
      category: "confession",
      title: "Confession of Sin",
      bcpReference: "EOW1 p. 19",
      content:
        "God of all mercy,\nwe confess that we have sinned against you,\nopposing your will in our lives.\nWe have denied your goodness in each other,\nin ourselves, and in the world you have created.\nWe repent of the evil that enslaves us,\nthe evil we have done,\nand the evil done on our behalf.\nForgive, restore, and strengthen us\nthrough our Savior Jesus Christ,\nthat we may abide in your love\nand serve only your will. Amen.",
    },
    {
      textKey: "confession_absolution_eow1",
      category: "absolution",
      title: "Absolution",
      bcpReference: "EOW1 p. 19",
      content:
        "Almighty God have mercy on you, forgive you all your sins through the grace of Jesus Christ, strengthen you in all goodness, and by the power of the Holy Spirit keep you in eternal life. Amen.",
    },

    // ── EOW1 Opening Sentences ──────────────────────────────────────
    // Same season-keyed scheme as the BCP openers above (advent_*,
    // lent_*, easter_*, anytime_*) — the dialect-aware picker in
    // pickOpeningSentenceKey adds the _eow1 suffix on lookup.
    {
      textKey: "opening_sentence_advent_1_eow1",
      category: "opening_sentence",
      title: "Opening Sentence — Advent",
      bcpReference: "EOW1 p. 17",
      seasonRestriction: "advent",
      content:
        "Arise, O Jerusalem, stand upon the height and look toward the east, and see your children gathered from west and east at the word of the Holy One. — Baruch 5:5",
    },
    {
      textKey: "opening_sentence_advent_2_eow1",
      category: "opening_sentence",
      title: "Opening Sentence — Advent",
      bcpReference: "EOW1 p. 17",
      seasonRestriction: "advent",
      content:
        "Shower, O heavens, from above, and let the skies rain down righteousness; let the earth open, that salvation may spring up, and let it cause righteousness to sprout up also. — Isaiah 45:8",
    },
    {
      textKey: "opening_sentence_christmas_1_eow1",
      category: "opening_sentence",
      title: "Opening Sentence — Christmas",
      bcpReference: "EOW1 p. 17",
      seasonRestriction: "christmas",
      content:
        "The Word became flesh and dwelt among us, full of grace and truth. — John 1:14",
    },
    {
      textKey: "opening_sentence_lent_1_eow1",
      category: "opening_sentence",
      title: "Opening Sentence — Lent",
      bcpReference: "EOW1 p. 17",
      seasonRestriction: "lent",
      content:
        "Jesus said: “If any of you would come after me, deny yourself and take up your cross and follow me.” — Mark 8:34",
    },
    {
      textKey: "opening_sentence_holyweek_1_eow1",
      category: "opening_sentence",
      title: "Opening Sentence — Holy Week",
      bcpReference: "EOW1 p. 17",
      seasonRestriction: "holy_week",
      content:
        "Christ Jesus, being found in human form, humbled himself and became obedient unto death, even death on a cross. — Philippians 2:8",
    },
    {
      textKey: "opening_sentence_easter_1_eow1",
      category: "opening_sentence",
      title: "Opening Sentence — Easter",
      bcpReference: "EOW1 p. 17",
      seasonRestriction: "easter",
      content:
        "If anyone is in Christ, there is a new creation: everything old has passed away; see, everything has become new! — 2 Corinthians 5:17",
    },
    {
      textKey: "opening_sentence_anytime_1_eow1",
      category: "opening_sentence",
      title: "Opening Sentence",
      bcpReference: "EOW1 p. 18",
      content:
        "God is Spirit, and those who worship must worship in spirit and in truth. — John 4:24",
    },
    {
      textKey: "opening_sentence_anytime_2_eow1",
      category: "opening_sentence",
      title: "Opening Sentence — Thanksgiving",
      bcpReference: "EOW1 p. 18",
      content:
        "We give you thanks, O God, we give you thanks, calling upon your Name and declaring all your wonderful deeds. — Psalm 75:1",
    },
    {
      textKey: "opening_sentence_anytime_3_eow1",
      category: "opening_sentence",
      title: "Opening Sentence — All Saints / Major Saints",
      bcpReference: "EOW1 p. 18",
      content:
        "You are no longer strangers and sojourners, but citizens together with the saints and members of the household of God. — Ephesians 2:19",
    },

    // ── EOW1 Opening Versicles ──────────────────────────────────────
    // EOW1 p. 19 supplies a different opening preces pair for MP / EP
    // ("O God, let our mouth proclaim your praise" / "And your glory
    // all the day long" — replaces the BCP "Lord, open our lips" call
    // and response). Stored as a single block so the assembler can
    // emit it as one C&R slide; line 1 = officiant, line 2 = people.
    {
      textKey: "opening_versicle_morning_eow1",
      category: "opening",
      title: "Opening Versicle — Morning",
      bcpReference: "EOW1 p. 19",
      content:
        "O God, let our mouth proclaim your praise.\nAnd your glory all the day long.",
    },
    {
      textKey: "opening_versicle_evening_eow1",
      category: "opening",
      title: "Opening Versicle — Evening",
      bcpReference: "EOW1 p. 19",
      content:
        "O God, be not far from us.\nCome quickly to help us, O God.",
    },

    // ── EOW1 Doxology (replaces Gloria Patri) ──────────────────────
    // EOW1 swaps the BCP Gloria Patri ("Glory to the Father, and to
    // the Son…") for a Trinitarian acclamation that doesn't lean on
    // gendered pronouns. The "Alleluia" appendage rule (omit in Lent)
    // matches the BCP's. Used at the close of the invitatory and of
    // every appointed psalm.
    {
      textKey: "doxology_eow1",
      category: "doxology",
      title: "Doxology",
      bcpReference: "EOW1 p. 19",
      content:
        "Praise to the holy and undivided Trinity, one God: as it was in the beginning, is now, and will be for ever. Amen.",
    },

    // ── EOW1 Venite (Psalm 95:1-7, expansive language) ─────────────
    // EOW1 p. 21. Same psalm as the BCP venite but recast in second
    // person ("you are a great God") and inclusive of the optional
    // verses 8–11 ("Let us listen today to God's voice…") which the
    // BCP includes as an addendum on Ash Wednesday + Fridays in Lent.
    // We seed verses 1–7 here; the assembler appends the warning
    // verses for the appointed days from a separate text key.
    {
      textKey: "venite_eow1",
      category: "invitatory",
      title: "Venite · Psalm 95:1-7",
      bcpReference: "EOW1 p. 21",
      content:
        "Come, let us sing to the Lord; *\n  let us shout for joy to the Rock of our salvation.\nLet us come before God's presence with thanksgiving *\n  and raise to the Lord a shout with psalms.\n\nFor you are a great God; *\n  you are great above all gods.\nIn your hand are the caverns of the earth, *\n  and the heights of the hills are yours also.\nThe sea is yours, for you made it, *\n  and your hands have molded the dry land.\n\nCome, let us bow down and bend the knee, *\n  and kneel before the Lord our Maker.\nFor you are our God,\nand we are the people of your pasture and the sheep of your hand. *\n  Oh, that today we would hearken to your voice!",
    },
    {
      textKey: "venite_warning_verses_eow1",
      category: "invitatory",
      title: "Venite — Warning Verses (Psalm 95:8-11)",
      bcpReference: "EOW1 p. 21",
      content:
        "Let us listen today to God's voice:\nHarden not your hearts,\nas your forebears did in the wilderness, *\n  at Meribah, and on that day at Massah,\n  when they tempted me.\nThey put me to the test, *\n  though they had seen my works.\nForty years long I detested that generation and said, *\n  \"This people are wayward in their hearts;\n  they do not know my ways.\"\nSo I swore in my wrath, *\n  \"They shall not enter into my rest.\"",
    },

    // ── EOW1 Morning Psalms (alternatives to invitatory) ───────────
    // EOW1 p. 21–22. Either may be used in place of an invitatory
    // psalm. We seed them as "invitatory" category so the morning
    // assembler can rotate them in alongside venite / jubilate /
    // pascha nostrum on the existing invitatory-pick path.
    {
      textKey: "morning_psalm_63_eow1",
      category: "invitatory",
      title: "Psalm 63:1-8 · Deus, Deus meus",
      bcpReference: "EOW1 p. 21",
      content:
        "O God, you are my God; eagerly I seek you; *\n  my soul thirsts for you, my flesh faints for you,\n  as in a barren and dry land where there is no water.\nTherefore I have gazed upon you in your holy place, *\n  that I might behold your power and your glory.\nFor your loving-kindness is better than life itself; *\n  my lips shall give you praise.\nSo will I bless you as long as I live *\n  and lift up my hands in your Name.\nMy soul is content, as with marrow and fatness, *\n  and my mouth praises you with joyful lips,\nWhen I remember you upon my bed, *\n  and meditate on you in the night watches.\nFor you have been my helper, *\n  and under the shadow of your wings I will rejoice.\nMy soul clings to you; *\n  your right hand holds me fast.",
    },
    {
      textKey: "morning_psalm_67_eow1",
      category: "invitatory",
      title: "Psalm 67:1-5 · Deus misereatur",
      bcpReference: "EOW1 p. 22",
      content:
        "O God, be merciful to us and bless us, *\n  show us the light of your countenance and come to us.\nLet your ways be known upon earth, *\n  your saving health among all nations.\nLet the peoples praise you, O God; *\n  let all the peoples praise you.\nLet the nations be glad and sing for joy, *\n  for you judge the peoples with equity\n  and guide all the nations upon earth.\nLet the peoples praise you, O God; *\n  let all the peoples praise you.",
    },

    // ── EOW1 Phos Hilaron (metric paraphrase) ──────────────────────
    // EOW1 p. 22. Hymn-text paraphrase ("Light of the world, in grace
    // and beauty…") — a metrical alternative to the prose Phos
    // hilaron the BCP uses at evening. The evening assembler picks
    // this when liturgyDialect is eow1.
    {
      textKey: "phos_hilaron_eow1",
      category: "invitatory",
      title: "Light of the World (Phos hilaron)",
      bcpReference: "EOW1 p. 22",
      content:
        "Light of the world, in grace and beauty,\nMirror of God's eternal face,\nTransparent flame of love's free duty,\nYou bring salvation to our race.\n\nNow, as we see the lights of evening,\nWe raise our voice in hymns of praise;\nWorthy are you of endless blessing,\nSun of our night, lamp of our days.",
    },

    // ── EOW1 Evening Psalms (alternatives to Phos hilaron) ─────────
    {
      textKey: "evening_psalm_134_eow1",
      category: "invitatory",
      title: "Psalm 134 · Ecce nunc",
      bcpReference: "EOW1 p. 23",
      content:
        "Behold now, bless the LORD, all you servants of the LORD, *\n  you that stand by night in the house of the LORD.\nLift up your hands in the holy place and bless the LORD; *\n  the LORD who made heaven and earth bless you out of Zion.",
    },
    {
      textKey: "evening_psalm_141_eow1",
      category: "invitatory",
      title: "Psalm 141:1-3,8ab · Domine, clamavi",
      bcpReference: "EOW1 p. 23",
      content:
        "O LORD, I call to you; come to me quickly; *\n  hear my voice when I cry to you.\nLet my prayer be set forth in your sight as incense, *\n  the lifting up of my hands as the evening sacrifice.\nSet a watch before my mouth, O LORD,\nand guard the door of my lips; *\n  let not my heart incline to any evil thing.\nMy eyes are turned to you, Lord GOD; *\n  in you I take refuge.",
    },

    // ── EOW1 Antiphons on Venite / Jubilate (by season) ────────────
    // EOW1 pp. 19–20. Bookend the invitatory psalm in MP — said
    // before and after — exactly like the BCP antiphon scheme. The
    // assembler picks the season-appropriate antiphon and wraps it
    // around the invitatory psalm body when liturgyDialect is eow1.
    {
      textKey: "invitatory_antiphon_advent_eow1",
      category: "antiphon",
      title: "Invitatory Antiphon — Advent",
      bcpReference: "EOW1 p. 19",
      seasonRestriction: "advent",
      content: "Our God and Savior now draws near: O come let us worship.",
    },
    {
      textKey: "invitatory_antiphon_christmas_eow1",
      category: "antiphon",
      title: "Invitatory Antiphon — Christmas / Epiphany",
      bcpReference: "EOW1 p. 19",
      seasonRestriction: "christmas",
      content: "Christ has shown forth his glory: O come let us worship.",
    },
    {
      textKey: "invitatory_antiphon_epiphany_eow1",
      category: "antiphon",
      title: "Invitatory Antiphon — Epiphany",
      bcpReference: "EOW1 p. 19",
      seasonRestriction: "epiphany",
      content: "Christ has shown forth his glory: O come let us worship.",
    },
    {
      textKey: "invitatory_antiphon_lent_eow1",
      category: "antiphon",
      title: "Invitatory Antiphon — Lent",
      bcpReference: "EOW1 p. 19",
      seasonRestriction: "lent",
      content: "Our God is full of compassion and mercy: O come let us worship.",
    },
    {
      textKey: "invitatory_antiphon_easter_eow1",
      category: "antiphon",
      title: "Invitatory Antiphon — Easter",
      bcpReference: "EOW1 p. 20",
      seasonRestriction: "easter",
      content: "Alleluia. Christ is risen. O come let us worship. Alleluia.",
    },
    {
      textKey: "invitatory_antiphon_trinity_eow1",
      category: "antiphon",
      title: "Invitatory Antiphon — Trinity Sunday",
      bcpReference: "EOW1 p. 20",
      content: "The holy and undivided Trinity, one God: O come let us worship.",
    },
    {
      textKey: "invitatory_antiphon_sunday_eow1",
      category: "antiphon",
      title: "Invitatory Antiphon — Sundays",
      bcpReference: "EOW1 p. 20",
      content: "Christ has triumphed over death: O come let us worship.",
    },
    {
      textKey: "invitatory_antiphon_weekday_eow1",
      category: "antiphon",
      title: "Invitatory Antiphon — Weekdays",
      bcpReference: "EOW1 p. 20",
      content: "God is the Rock of our salvation: O come let us worship.",
    },
    {
      textKey: "invitatory_antiphon_allsaints_eow1",
      category: "antiphon",
      title: "Invitatory Antiphon — All Saints / Major Saints",
      bcpReference: "EOW1 p. 20",
      content: "Our God is glorious in all the saints: O come let us worship.",
    },

    // ── EOW1 Antiphons on Morning / Evening Psalms ─────────────────
    // EOW1 p. 23–24. These pair with the morning/evening psalm
    // alternatives above — said before and after the chosen psalm.
    {
      textKey: "morning_psalm_63_antiphon_eow1",
      category: "antiphon",
      title: "Antiphon — Psalm 63",
      bcpReference: "EOW1 p. 23",
      content: "O God, you are my God; from break of day I seek you.",
    },
    {
      textKey: "morning_psalm_67_antiphon_eow1",
      category: "antiphon",
      title: "Antiphon — Psalm 67",
      bcpReference: "EOW1 p. 23",
      content: "Let the peoples praise you, O God; let all the peoples praise you.",
    },
    {
      textKey: "evening_psalm_134_antiphon_eow1",
      category: "antiphon",
      title: "Antiphon — Psalm 134",
      bcpReference: "EOW1 p. 24",
      content: "Yours is the day, O God, yours also the night; you established the moon and the sun.",
    },
    {
      textKey: "evening_psalm_141_antiphon_eow1",
      category: "antiphon",
      title: "Antiphon — Psalm 141",
      bcpReference: "EOW1 p. 24",
      content: "Let my prayer be set forth in your sight as incense, the lifting up of my hands as the evening sacrifice.",
    },

    // ── Invitatory psalms ────────────────────────────────────────────
    {
      textKey: "venite",
      category: "invitatory",
      title: "Venite · Psalm 95",
      bcpReference: "BCP p. 82",
      content:
        "Come, let us sing to the Lord; *\n  let us shout for joy to the Rock of our salvation.\nLet us come before his presence with thanksgiving *\n  and raise a loud shout to him with psalms.\n\nFor the Lord is a great God, *\n  and a great King above all gods.\nIn his hand are the caverns of the earth, *\n  and the heights of the hills are his also.\nThe sea is his, for he made it, *\n  and his hands have molded the dry land.\n\nCome, let us bow down, and bend the knee, *\n  and kneel before the Lord our Maker.\nFor he is our God,\nand we are the people of his pasture and the sheep of his hand. *\n  Oh, that today you would hearken to his voice!",
    },
    {
      textKey: "jubilate",
      category: "invitatory",
      title: "Jubilate · Psalm 100",
      bcpReference: "BCP p. 82",
      content:
        "Be joyful in the Lord, all you lands; *\n  serve the Lord with gladness\n  and come before his presence with a song.\n\nKnow this: The Lord himself is God; *\n  he himself has made us, and we are his;\n  we are his people and the sheep of his pasture.\n\nEnter his gates with thanksgiving;\n  go into his courts with praise; *\n  give thanks to him and call upon his Name.\n\nFor the Lord is good;\n  his mercy is everlasting; *\n  and his faithfulness endures from age to age.",
    },
    {
      textKey: "pascha_nostrum",
      category: "invitatory",
      title: "Pascha Nostrum",
      bcpReference: "BCP p. 83",
      seasonRestriction: "easter",
      content:
        "Christ our Passover is sacrificed for us; *\n  therefore let us keep the feast,\n\nNot with the old leaven, the leaven of malice and evil, *\n  but with the unleavened bread of sincerity and truth. Alleluia.\n\nChrist being raised from the dead will never die again; *\n  death no longer has dominion over him.\n\nThe death that he died, he died to sin, once for all; *\n  but the life he lives, he lives to God.\n\nSo also consider yourselves dead to sin, *\n  and alive to God in Jesus Christ our Lord. Alleluia.\n\nChrist has been raised from the dead, *\n  the first fruits of those who have fallen asleep.\n\nFor since by a man came death, *\n  by a man has come also the resurrection of the dead.\n\nFor as in Adam all die, *\n  so also in Christ shall all be made alive. Alleluia.",
    },

    // ── Antiphons ────────────────────────────────────────────────────
    {
      textKey: "antiphon_advent",
      category: "antiphon",
      title: "Antiphon — Advent",
      bcpReference: "BCP p. 80",
      seasonRestriction: "advent",
      content: "Our King and Savior now draws near: Come let us adore him.",
    },
    {
      textKey: "antiphon_christmas",
      category: "antiphon",
      title: "Antiphon — Christmas",
      bcpReference: "BCP p. 80",
      seasonRestriction: "christmas",
      content: "Alleluia. To us a child is born: Come let us adore him. Alleluia.",
    },
    {
      textKey: "antiphon_epiphany",
      category: "antiphon",
      title: "Antiphon — Epiphany",
      bcpReference: "BCP p. 80",
      seasonRestriction: "epiphany",
      content: "The Lord has manifested his glory: Come let us adore him.",
    },
    {
      textKey: "antiphon_lent",
      category: "antiphon",
      title: "Antiphon — Lent",
      bcpReference: "BCP p. 80",
      seasonRestriction: "lent",
      content: "The Lord is full of compassion and mercy: Come let us adore him.",
    },
    {
      textKey: "antiphon_holyweek",
      category: "antiphon",
      title: "Antiphon — Holy Week",
      bcpReference: "BCP p. 80",
      seasonRestriction: "holy_week",
      content: "Christ humbled himself and became obedient to death: Come let us adore him.",
    },
    {
      textKey: "antiphon_easter",
      category: "antiphon",
      title: "Antiphon — Easter",
      bcpReference: "BCP p. 80",
      seasonRestriction: "easter",
      content: "Alleluia. The Lord is risen indeed: Come let us adore him. Alleluia.",
    },
    {
      textKey: "antiphon_none",
      category: "antiphon",
      title: "Antiphon (none)",
      content: "",
    },

    // ── Canticles after OT ───────────────────────────────────────────
    {
      textKey: "canticle_8",
      category: "canticle",
      title: "Canticle 8 — The Song of Moses",
      bcpReference: "BCP p. 85",
      content:
        "I will sing to the Lord, for he is lofty and uplifted; *\n  the horse and its rider has he hurled into the sea.\nThe Lord is my strength and my refuge; *\n  the Lord has become my Savior.\nThis is my God and I will praise him, *\n  the God of my people and I will exalt him.\nThe Lord is a mighty warrior; *\n  Yahweh is his Name.\nThe chariots of Pharaoh and his army has he hurled into the sea; *\n  the finest of those who bear armor have been drowned in the Red Sea.\nThe fathomless deep has overwhelmed them; *\n  they sank into the depths like a stone.\nYour right hand, O Lord, is glorious in might; *\n  your right hand, O Lord, has overthrown the enemy.\nWho can be compared with you, O Lord, among the gods? *\n  who is like you, glorious in holiness,\n  awesome in renown, and worker of wonders?\nYou stretched forth your right hand; *\n  the earth swallowed them up.\nWith your constant love you led the people you redeemed; *\n  with your might you brought them in safety to your holy dwelling.\nYou will bring them in and plant them *\n  on the mount of your possession,\nThe resting-place you have made for yourself, O Lord, *\n  the sanctuary, O Lord, that your hand has established.\nThe Lord shall reign *\n  for ever and for ever.",
    },
    {
      textKey: "canticle_9",
      category: "canticle",
      title: "Canticle 9 — The First Song of Isaiah",
      bcpReference: "BCP p. 86",
      content:
        "Surely, it is God who saves me; *\n  I will trust in him and not be afraid.\nFor the Lord is my stronghold and my sure defense, *\n  and he will be my Savior.\nTherefore you shall draw water with rejoicing *\n  from the springs of salvation.\nAnd on that day you shall say, *\n  Give thanks to the Lord and call upon his Name;\nMake his deeds known among the peoples; *\n  see that they remember that his Name is exalted.\nSing the praises of the Lord, for he has done great things, *\n  and this is known in all the world.\nCry aloud, inhabitants of Zion, ring out your joy, *\n  for the great one in the midst of you is the Holy One of Israel.",
    },
    {
      textKey: "canticle_10",
      category: "canticle",
      title: "Canticle 10 — The Second Song of Isaiah",
      bcpReference: "BCP p. 86",
      content:
        "Seek the Lord while he wills to be found; *\n  call upon him when he draws near.\nLet the wicked forsake their ways *\n  and the evil ones their thoughts;\nAnd let them turn to the Lord, and he will have compassion, *\n  and to our God, for he will richly pardon.\nFor my thoughts are not your thoughts, *\n  nor your ways my ways, says the Lord.\nFor as the heavens are higher than the earth, *\n  so are my ways higher than your ways,\n  and my thoughts than your thoughts.\nFor as rain and snow fall from the heavens *\n  and return not again, but water the earth,\nBringing forth life and giving growth, *\n  seed for sowing and bread for eating,\nSo is my word that goes forth from my mouth; *\n  it will not return to me empty;\nBut it will accomplish that which I have purposed, *\n  and prosper in that for which I sent it.",
    },
    {
      textKey: "canticle_11",
      category: "canticle",
      title: "Canticle 11 — The Third Song of Isaiah",
      bcpReference: "BCP p. 87",
      content:
        "Arise, shine, for your light has come, *\n  and the glory of the Lord has dawned upon you.\nFor behold, darkness covers the land; *\n  deep gloom enshrouds the peoples.\nBut over you the Lord will rise, *\n  and his glory will appear upon you.\nNations will stream to your light, *\n  and kings to the brightness of your dawning.\nYour gates will always be open; *\n  by day or night they will never be shut.\nThey will call you, The City of the Lord, *\n  The Zion of the Holy One of Israel.\nViolence will no more be heard in your land, *\n  ruin or destruction within your borders.\nYou will call your walls, Salvation, *\n  and all your portals, Praise.\nThe sun will no more be your light by day; *\n  by night you will not need the brightness of the moon.\nThe Lord will be your everlasting light, *\n  and your God will be your glory.",
    },
    {
      textKey: "canticle_12",
      category: "canticle",
      title: "Canticle 12 — A Song of Creation",
      bcpReference: "BCP p. 88",
      content:
        "Glorify the Lord, all you works of the Lord, *\n  praise him and highly exalt him for ever.\nIn the firmament of his power, glorify the Lord, *\n  praise him and highly exalt him for ever.\n\nGlorify the Lord, you angels and all powers of the Lord, *\n  O heavens and all waters above the heavens.\nSun and moon and stars of the sky, glorify the Lord, *\n  praise him and highly exalt him for ever.\n\nGlorify the Lord, every shower of rain and fall of dew, *\n  all winds and fire and heat.\nWinter and Summer, glorify the Lord, *\n  praise him and highly exalt him for ever.\n\nGlorify the Lord, O chill and cold, *\n  drops of dew and flakes of snow.\nFrost and cold, ice and sleet, glorify the Lord, *\n  praise him and highly exalt him for ever.\n\nGlorify the Lord, O nights and days, *\n  O shining light and enfolding dark.\nStorm clouds and thunderbolts, glorify the Lord, *\n  praise him and highly exalt him for ever.\n\nLet the earth glorify the Lord, *\n  praise him and highly exalt him for ever.\nGlorify the Lord, O mountains and hills,\n  and all that grows upon the earth, *\n  praise him and highly exalt him for ever.\n\nGlorify the Lord, O springs of water, seas, and streams, *\n  O whales and all that move in the waters.\nAll birds of the air, glorify the Lord, *\n  praise him and highly exalt him for ever.\n\nGlorify the Lord, O beasts of the wild, *\n  and all you flocks and herds.\nO men and women everywhere, glorify the Lord, *\n  praise him and highly exalt him for ever.\n\nLet the people of God glorify the Lord, *\n  praise him and highly exalt him for ever.\nGlorify the Lord, O priests and servants of the Lord, *\n  praise him and highly exalt him for ever.\n\nGlorify the Lord, O spirits and souls of the righteous, *\n  praise him and highly exalt him for ever.\nYou that are holy and humble of heart, glorify the Lord, *\n  praise him and highly exalt him for ever.\n\nLet us glorify the Lord: Father, Son, and Holy Spirit; *\n  praise him and highly exalt him for ever.\nIn the firmament of his power, glorify the Lord, *\n  praise him and highly exalt him for ever.",
    },
    {
      textKey: "canticle_13",
      category: "canticle",
      title: "Canticle 13 — A Song of Praise",
      bcpReference: "BCP p. 90",
      content:
        "Glory to you, Lord God of our fathers; *\n  you are worthy of praise; glory to you.\nGlory to you for the radiance of your holy Name; *\n  we will praise you and highly exalt you for ever.\n\nGlory to you in the splendor of your temple; *\n  on the throne of your majesty, glory to you.\nGlory to you, seated between the Cherubim; *\n  we will praise you and highly exalt you for ever.\n\nGlory to you, beholding the depths; *\n  in the high vault of heaven, glory to you.\nGlory to you, Father, Son, and Holy Spirit; *\n  we will praise you and highly exalt you for ever.",
    },
    {
      textKey: "canticle_14",
      category: "canticle",
      title: "Canticle 14 — A Song of Penitence",
      bcpReference: "BCP p. 90",
      seasonRestriction: "lent",
      content:
        "O Lord and Ruler of the hosts of heaven, *\n  God of Abraham, Isaac, and Jacob,\n  and of all their righteous offspring:\nYou made the heavens and the earth, *\n  with all their vast array.\nAll things quake with fear at your presence; *\n  they tremble because of your power.\nBut your merciful promise is beyond all measure; *\n  it surpasses all that our minds can fathom.\nO Lord, you are full of compassion, *\n  long-suffering, and abounding in mercy.\nYou hold back your hand; *\n  you do not punish as we deserve.\nIn your great goodness, Lord, *\n  you have promised forgiveness to sinners,\n  that they may repent of their sin and be saved.\nAnd now, O Lord, I bend the knee of my heart, *\n  and make my appeal, sure of your gracious goodness.\nI have sinned, O Lord, I have sinned, *\n  and I know my wickedness only too well.\nTherefore I make this prayer to you: *\n  Forgive me, Lord, forgive me.\nDo not let me perish in my sin, *\n  nor condemn me to the depths of the earth.\nFor you, O Lord, are the God of those who repent, *\n  and in me you will show forth your goodness.\nUnworthy as I am, you will save me,\n  in accordance with your great mercy, *\n  and I will praise you without ceasing all the days of my life.\nFor all the powers of heaven sing your praises, *\n  and yours is the glory to ages of ages. Amen.",
    },

    // ── Canticles after NT ───────────────────────────────────────────
    {
      textKey: "canticle_16",
      category: "canticle",
      title: "Canticle 16 — The Song of Zechariah (Benedictus)",
      bcpReference: "BCP p. 92",
      content:
        "Blessed be the Lord, the God of Israel; *\n  he has come to his people and set them free.\nHe has raised up for us a mighty savior, *\n  born of the house of his servant David.\nThrough his holy prophets he promised of old,\n  that he would save us from our enemies, *\n  from the hands of all who hate us.\nHe promised to show mercy to our fathers *\n  and to remember his holy covenant.\nThis was the oath he swore to our father Abraham, *\n  to set us free from the hands of our enemies,\nFree to worship him without fear, *\n  holy and righteous in his sight\n  all the days of our life.\nYou, my child, shall be called the prophet of the Most High, *\n  for you will go before the Lord to prepare his way,\nTo give his people knowledge of salvation *\n  by the forgiveness of their sins.\nIn the tender compassion of our God *\n  the dawn from on high shall break upon us,\nTo shine on those who dwell in darkness and the shadow of death, *\n  and to guide our feet into the way of peace.",
    },
    {
      textKey: "canticle_18",
      category: "canticle",
      title: "Canticle 18 — A Song to the Lamb",
      bcpReference: "BCP p. 93",
      content:
        "Splendor and honor and kingly power *\n  are yours by right, O Lord our God,\nFor you created everything that is, *\n  and by your will they were created and have their being;\nAnd yours by right, O Lamb that was slain, *\n  for with your blood you have redeemed for God,\nFrom every family, language, people, and nation, *\n  a kingdom of priests to serve our God.\nAnd so, to him who sits upon the throne, *\n  and to Christ the Lamb,\nBe worship and praise, dominion and splendor, *\n  for ever and for ever more.",
    },
    {
      textKey: "canticle_19",
      category: "canticle",
      title: "Canticle 19 — The Song of the Redeemed",
      bcpReference: "BCP p. 94",
      content:
        "O ruler of the universe, Lord God,\n  great deeds are they that you have done, *\n  surpassing human understanding.\nYour ways are ways of righteousness and truth, *\n  O King of all the ages.\nWho can fail to do you homage, Lord,\n  and sing the praises of your Name? *\n  for you only are the Holy One.\nAll nations will draw near and fall down before you, *\n  because your just and holy works have been revealed.",
    },
    {
      textKey: "canticle_20",
      category: "canticle",
      title: "Canticle 20 — Glory to God (Gloria in Excelsis)",
      bcpReference: "BCP p. 94",
      content:
        "Glory to God in the highest,\n  and peace to his people on earth.\n\nLord God, heavenly King,\nalmighty God and Father,\n  we worship you, we give you thanks,\n  we praise you for your glory.\n\nLord Jesus Christ, only Son of the Father,\nLord God, Lamb of God,\nyou take away the sin of the world:\n  have mercy on us;\nyou are seated at the right hand of the Father:\n  receive our prayer.\n\nFor you alone are the Holy One,\nyou alone are the Lord,\nyou alone are the Most High,\n  Jesus Christ,\n  with the Holy Spirit,\n  in the glory of God the Father. Amen.",
    },
    {
      textKey: "canticle_21",
      category: "canticle",
      title: "Canticle 21 — You Are God (Te Deum Laudamus)",
      bcpReference: "BCP p. 95",
      content:
        "You are God: we praise you;\nYou are the Lord: we acclaim you;\nYou are the eternal Father:\n  All creation worships you.\nTo you all angels, all the powers of heaven,\n  Cherubim and Seraphim, sing in endless praise:\n  Holy, holy, holy Lord, God of power and might,\n  heaven and earth are full of your glory.\nThe glorious company of apostles praise you.\nThe noble fellowship of prophets praise you.\nThe white-robed army of martyrs praise you.\nThroughout the world the holy Church acclaims you;\n  Father, of majesty unbounded,\n  your true and only Son, worthy of all worship,\n  and the Holy Spirit, advocate and guide.\nYou, Christ, are the king of glory,\n  the eternal Son of the Father.\nWhen you became man to set us free\n  you did not shun the Virgin's womb.\nYou overcame the sting of death\n  and opened the kingdom of heaven to all believers.\nYou are seated at God's right hand in glory.\nWe believe that you will come and be our judge.\nCome then, Lord, and help your people,\n  bought with the price of your own blood,\n  and bring us with your saints\n  to glory everlasting.",
    },

    // ── EOW1 — Expansive-language recasts of BCP canticles ─────────
    // EOW1 pp. 24–29 supplies alternative phrasings of several
    // numbered BCP canticles (12, 15, 16, 18, 21). The assemblers
    // append `_eow1` when liturgyDialect is "eow1" and fall back to
    // the plain key when it isn't, so callers don't need to branch.
    {
      textKey: "canticle_12_eow1",
      category: "canticle",
      title: "Canticle 12 — A Song of Creation (Benedicite, omnia opera Domini)",
      bcpReference: "EOW1 p. 24",
      content:
        "Glorify the Lord, all you works of the Lord, *\n  sing praise and give honor for ever.\nIn the high vault of heaven, glorify the Lord, *\n  sing praise and give honor for ever.\n\nI. The Cosmic Order\nGlorify the Lord, you angels and all powers of the Lord, *\n  O heavens and all waters above the heavens.\nSun and moon and stars of the sky, glorify the Lord, *\n  sing praise and give honor for ever.\n\nGlorify the Lord, every shower of rain and fall of dew, *\n  all winds and fire and heat.\nWinter and summer, glorify the Lord, *\n  sing praise and give honor for ever.\n\nGlorify the Lord, O chill and cold, *\n  drops of dew and flakes of snow.\nFrost and cold, ice and sleet, glorify the Lord, *\n  sing praise and give honor for ever.\n\nGlorify the Lord, O nights and days, *\n  O shining light and enfolding dark.\nStorm clouds and thunderbolts, glorify the Lord, *\n  sing praise and give honor for ever.\n\nII. The Earth and Its Creatures\nLet the earth glorify the Lord, *\n  sing praise and give honor for ever.\nGlorify the Lord, O mountains\n  and hills, and all that grows upon the earth, *\n  sing praise and give honor for ever.\n\nGlorify the Lord, O springs of water, seas, and streams, *\n  O whales and all that move in the waters.\nAll birds of the air, glorify the Lord, *\n  sing praise and give honor for ever.\n\nGlorify the Lord, O beasts of the wild, *\n  and all you flocks and herds.\nO men and women everywhere, glorify the Lord, *\n  sing praise and give honor for ever.\n\nIII. The People of God\nLet the people of God glorify the Lord, *\n  sing praise and give honor for ever.\nGlorify the Lord, O priests and servants of the Lord, *\n  sing praise and give honor for ever.\n\nGlorify the Lord, O spirits and souls of the righteous, *\n  sing praise and give honor for ever.\nYou that are holy and humble of heart, glorify the Lord, *\n  sing praise and give honor for ever.\n\nDoxology\nLet us glorify the Lord: Father, Son and Holy Spirit; *\n  sing praise and give honor for ever.\nIn the high vault of heaven, glorify the Lord, *\n  sing praise and give honor for ever.",
    },
    {
      textKey: "canticle_15_eow1",
      category: "canticle",
      title: "Canticle 15 — The Song of Mary (Magnificat)",
      bcpReference: "EOW1 p. 26",
      content:
        "My soul proclaims the greatness of the Lord,\nmy spirit rejoices in you, O God my Savior, *\n  for you have looked with favor on your lowly servant.\nFrom this day all generations will call me blessed: *\n  you, the Almighty, have done great things for me,\n  and holy is your name.\nYou have mercy on those who fear you *\n  from generation to generation.\nYou have shown strength with your arm *\n  and scattered the proud in their conceit,\nCasting down the mighty from their thrones *\n  and lifting up the lowly.\nYou have filled the hungry with good things *\n  and sent the rich away empty.\nYou have come to the help of your servant Israel, *\n  for you have remembered your promise of mercy,\nThe promise made to our forebears, *\n  to Abraham and his children for ever.",
    },
    {
      textKey: "canticle_16_eow1",
      category: "canticle",
      title: "Canticle 16 — The Song of Zechariah (Benedictus Dominus Deus)",
      bcpReference: "EOW1 p. 26",
      content:
        "Blessed are you, Lord, the God of Israel, *\n  you have come to your people and set them free.\nYou have raised up for us a mighty Savior, *\n  born of the house of your servant David.\nThrough your holy prophets you promised of old\n  to save us from our enemies, *\n  from the hands of all who hate us,\nTo show mercy to our forebears, *\n  and to remember your holy covenant.\nThis was the oath you swore to our father Abraham, *\n  to set us free from the hands of our enemies,\nFree to worship you without fear, *\n  holy and righteous before you,\n  all the days of our life.\nAnd you, child, shall be called the prophet\n  of the Most High, *\n  for you will go before the Lord to prepare the way,\nTo give God's people knowledge of salvation *\n  by the forgiveness of their sins.\nIn the tender compassion of our God *\n  the dawn from on high shall break upon us,\nTo shine on those who dwell in darkness\n  and the shadow of death, *\n  and to guide our feet into the way of peace.",
    },
    {
      textKey: "canticle_18_eow1",
      category: "canticle",
      title: "Canticle 18 — A Song to the Lamb (Dignus es)",
      bcpReference: "EOW1 p. 27",
      content:
        "Splendor and honor and royal power *\n  are yours by right, O God Most High,\nFor you created everything that is, *\n  and by your will they were created and have their being;\nAnd yours by right, O Lamb that was slain, *\n  for with your blood you have redeemed for God,\nFrom every family, language, people, and nation, *\n  a royal priesthood to serve our God.\nAnd so, to the One who sits upon the throne, *\n  and to Christ the Lamb,\nBe worship and praise, dominion and splendor, *\n  for ever and for evermore.",
    },
    {
      textKey: "canticle_21_eow1",
      category: "canticle",
      title: "Canticle 21 — We Praise You, O God (Te Deum laudamus)",
      bcpReference: "EOW1 p. 28",
      content:
        "We praise you, O God,\nwe acclaim you as Lord;\nall creation worships you,\nthe Father everlasting.\n\nTo you all angels, all the powers of heaven,\nthe cherubim and seraphim, sing in endless praise:\nHoly, holy, holy Lord, God of power and might,\nheaven and earth are full of your glory.\n\nThe glorious company of apostles praise you.\nThe noble fellowship of prophets praise you.\nThe white-robed army of martyrs praise you.\nThroughout the world the holy Church acclaims you:\nFather, of majesty unbounded,\nyour true and only Son, worthy of all worship,\nand the Holy Spirit, advocate and guide.\n\nYou, Christ, are the king of glory,\nthe eternal Son of the Father.\nWhen you took our flesh to set us free\nyou humbly chose the Virgin's womb.\nYou overcame the sting of death\nand opened the kingdom of heaven to all believers.\nYou are seated at God's right hand in glory.\nWe believe that you will come to be our judge.\n\nCome then, Lord, and help your people,\nbought with the price of your own blood,\nand bring us with your saints\nto glory everlasting.",
    },

    // ── EOW1 — New Canticles A through S ───────────────────────────
    // EOW1 pp. 30–43 introduces a parallel set of letter-named
    // canticles (A–S) drawn from Wisdom literature, prophets, NT,
    // and the mystics. EOW's daily-office canticle table mixes
    // these with the BCP numbered set across the week. We store
    // each with a stable `canticle_<letter>_eow1` key.
    {
      textKey: "canticle_a_eow1",
      category: "canticle",
      title: "Canticle A — A Song of Wisdom (Sapientia liberavit)",
      bcpReference: "EOW1 p. 29 · Wisdom 10:15-19,20b-21",
      content:
        "Wisdom freed from a nation of oppressors *\n  a holy people and a blameless race.\nShe entered the soul of a servant of the Lord, *\n  withstood dread rulers with wonders and signs.\nTo the saints she gave the reward of their labors, *\n  and led them by a marvelous way;\nShe was their shelter by day *\n  and a blaze of stars by night.\nShe brought them across the Red Sea, *\n  she led them through mighty waters;\nBut their enemies she swallowed in the waves *\n  and spewed them out from the depths of the abyss.\nAnd then, Lord, the righteous sang hymns to your Name, *\n  and praised with one voice your protecting hand;\nFor Wisdom opened the mouths of the mute, *\n  and gave speech to the tongues of a new-born people.",
    },
    {
      textKey: "canticle_b_eow1",
      category: "canticle",
      title: "Canticle B — A Song of Pilgrimage (Priusquam errarem)",
      bcpReference: "EOW1 p. 29 · Ecclesiasticus 51:13-16,20b-22",
      content:
        "Before I ventured forth,\n  even while I was very young, *\n  I sought wisdom openly in my prayer.\nIn the forecourts of the temple I asked for her, *\n  and I will seek her to the end.\nFrom first blossom to early fruit, *\n  she has been the delight of my heart.\nMy foot has kept firmly to the true path, *\n  diligently from my youth have I pursued her.\nI inclined my ear a little and received her; *\n  I found for myself much wisdom and became adept in her.\nTo the one who gives me wisdom will I give glory, *\n  for I have resolved to live according to her way.\nFrom the beginning I gained courage from her, *\n  therefore I will not be forsaken.\nIn my inmost being I have been stirred to seek her, *\n  therefore have I gained a good possession.\nAs my reward the Almighty has given me the gift of language, *\n  and with it will I offer praise to God.",
    },
    {
      textKey: "canticle_c_eow1",
      category: "canticle",
      title: "Canticle C — The Song of Hannah",
      bcpReference: "EOW1 p. 30 · 1 Samuel 2:1-8",
      content:
        "My heart exults in you, O God; *\n  my triumph song is lifted in you.\nMy mouth derides my enemies, *\n  for I rejoice in your salvation.\nThere is none holy like you, *\n  nor any rock to be compared to you, our God.\nDo not heap up prideful words or speak in arrogance; *\n  Only God is knowing and weighs all actions.\nThe bows of the mighty are broken, *\n  but the weak are clothed in strength.\nThose once full now labor for bread, *\n  those who hungered now are well fed.\nThe childless woman has borne sevenfold, *\n  while the mother of many is forlorn.\nGod destroys and brings to life, casts down and raises up; *\n  gives wealth or takes it away, humbles and dignifies.\nGod raises the poor from the dust; *\n  and lifts the needy from the ash heap\nTo make them sit with the rulers *\n  and inherit a place of honor.\nFor the pillars of the earth are God's *\n  on which the whole earth is founded.",
    },
    {
      textKey: "canticle_d_eow1",
      category: "canticle",
      title: "Canticle D — A Song of the Wilderness",
      bcpReference: "EOW1 p. 31 · Isaiah 35:1-7,10",
      content:
        "The wilderness and the dry land shall be glad, *\n  the desert shall rejoice and blossom;\nIt shall blossom abundantly, *\n  and rejoice with joy and singing.\nThey shall see the glory of the Lord, *\n  the majesty of our God.\nStrengthen the weary hands, *\n  and make firm the feeble knees.\nSay to the anxious, \"Be strong, do not fear! *\n  Here is your God, coming with judgment to save you.\"\nThen shall the eyes of the blind be opened, *\n  and the ears of the deaf be unstopped.\nThen shall the lame leap like a deer, *\n  and the tongue of the speechless sing for joy.\nFor waters shall break forth in the wilderness *\n  and streams in the desert;\nThe burning sand shall become a pool *\n  and the thirsty ground, springs of water.\nThe ransomed of God shall return with singing, *\n  with everlasting joy upon their heads.\nJoy and gladness shall be theirs, *\n  and sorrow and sighing shall flee away.",
    },
    {
      textKey: "canticle_e_eow1",
      category: "canticle",
      title: "Canticle E — A Song of Jerusalem Our Mother",
      bcpReference: "EOW1 p. 31 · Isaiah 66:10-14",
      content:
        "Rejoice with Jerusalem and be glad for her *\n  all you who love her,\nRejoice, rejoice with her, *\n  all you who mourn over her,\nThat you may drink deeply with delight *\n  from her comforting breast.\nFor thus says our God, *\n  \"I will extend peace to her like a river,\n  the wealth of nations like an overflowing stream.\n\"You shall nurse and be carried on her arm,\n  and you shall nestle in her lap.\n\"As a mother comforts her child, so will I comfort you; *\n  you shall be comforted in Jerusalem.\n\"You shall see, and your heart shall rejoice, *\n  you shall flourish like the grass of the fields.\"",
    },
    {
      textKey: "canticle_f_eow1",
      category: "canticle",
      title: "Canticle F — A Song of Lamentation",
      bcpReference: "EOW1 p. 32 · Lamentations 1:12,16; 3:19,22-24,26",
      content:
        "Is it nothing to you, all you who pass by? *\n  Look and see if there is any sorrow like my sorrow,\nWhich was brought upon me, *\n  inflicted by God's fierce anger.\nFor these things I weep; my eyes flow with tears, *\n  for a comforter is far from me, one to revive my courage.\nRemember my affliction and my bitterness, *\n  wormwood and gall!\nThe steadfast love of God never ceases, *\n  God's mercies never end.\nThey are new every morning; *\n  great is your faithfulness.\n\"God is my portion,\" says my soul, *\n  \"therefore will I hope in God.\"\nIt is good that we should wait quietly *\n  for the coming of God's salvation.",
    },
    {
      textKey: "canticle_g_eow1",
      category: "canticle",
      title: "Canticle G — A Song of Ezekiel",
      bcpReference: "EOW1 p. 33 · Ezekiel 36:24-28",
      content:
        "I will take you from among all nations; *\n  and gather you from all lands to bring you home.\nI will sprinkle clean water upon you; *\n  and purify you from false gods and uncleanness.\nA new heart I will give you *\n  and a new spirit put within you.\nI will take the stone heart from your chest *\n  and give you a heart of flesh.\nI will help you walk in my laws *\n  and cherish my commandments and do them.\nYou shall be my people, *\n  and I will be your God.",
    },
    {
      textKey: "canticle_h_eow1",
      category: "canticle",
      title: "Canticle H — A Song of Hosea",
      bcpReference: "EOW1 p. 33 · Hosea 6:1-3",
      content:
        "Come, let us return to our God, *\n  who has torn us and will heal us.\nGod has struck us and will bind up our wounds, *\n  after two days revive us,\nOn the third day restore us, *\n  that in God's presence we may live.\nLet us humble ourselves, let us strive to know the Lord, *\n  whose justice dawns like morning light,\n  its dawning as sure as the sunrise.\nGod's justice will come to us like a shower, *\n  like spring rains that water the earth.",
    },
    {
      textKey: "canticle_i_eow1",
      category: "canticle",
      title: "Canticle I — A Song of Jonah",
      bcpReference: "EOW1 p. 34 · Jonah 2:2-7,9",
      content:
        "I called to you, O God, out of my distress, and you answered me; *\n  out of the belly of Sheol I cried, and you heard my voice.\nYou cast me into the deep, into the heart of the seas, *\n  and the flood surrounded me;\n  all your waves and billows passed over me.\nThen I said, \"I am driven away from your sight; *\n  how shall I ever look again upon your holy temple?\"\nThe waters closed in over me, the deep was round about me; *\n  weeds were wrapped around my head at the roots of the mountains.\nI went down to the land beneath the earth, *\n  yet you brought up my life from the depths, O God.\nAs my life was ebbing away, I remembered you, O God, *\n  and my prayer came to you, into your holy temple.\nWith the voice of thanksgiving, I will sacrifice to you; *\n  what I have vowed I will pay, for deliverance belongs to the Lord!",
    },
    {
      textKey: "canticle_j_eow1",
      category: "canticle",
      title: "Canticle J — A Song of Judith",
      bcpReference: "EOW1 p. 34 · Judith 16:13-16",
      content:
        "I will sing a new song to my God, *\n  for you are great and glorious, wonderful in strength, invincible.\nLet the whole creation serve you, *\n  for you spoke and all things came into being.\nYou sent your breath and it formed them, *\n  no one is able to resist your voice.\nMountains and seas are stirred to their depths, *\n  rocks melt like wax at your presence.\nBut to those who fear you, *\n  you continue to show mercy.\nNo sacrifice, however fragrant, can please you, *\n  but whoever fears the Lord shall stand in your sight for ever.",
    },
    {
      textKey: "canticle_k_eow1",
      category: "canticle",
      title: "Canticle K — A Song of Our Adoption",
      bcpReference: "EOW1 p. 35 · Ephesians 1:3-10",
      content:
        "Blessed are you, the God and Father of our Lord Jesus Christ, *\n  for you have blessed us in Christ\n  with every spiritual blessing in the heavenly places.\nBefore the world was made, you chose us to be yours in Christ, *\n  that we should be holy and blameless before you.\nYou destined us for adoption as your children through Jesus Christ, *\n  according to the good pleasure of your will,\nTo the praise of your glorious grace, *\n  that you have freely given us in the Beloved.\nIn you, we have redemption through the blood of Christ,\n  the forgiveness of our sins,\nAccording to the riches of your grace *\n  which you have lavished upon us.\nYou have made known to us, in all wisdom and insight, *\n  the mystery of your will,\nAccording to your good pleasure which you set forth in Christ, *\n  as a plan for the fullness of time,\nTo gather together all things in Christ, *\n  things in heaven and things on earth.",
    },
    {
      textKey: "canticle_l_eow1",
      category: "canticle",
      title: "Canticle L — A Song of Christ's Humility",
      bcpReference: "EOW1 p. 35 · Philippians 2:6-11",
      content:
        "Though in the form of God, *\n  Christ Jesus did not cling to equality with God,\nBut emptied himself, taking the form of a servant, *\n  and was born in human likeness.\nBeing found in human form, he humbled himself *\n  and became obedient to death, even death on a cross.\nTherefore, God has highly exalted him *\n  and given him the name above every name,\nThat at the name of Jesus, every knee shall bow, *\n  in heaven and on earth and under the earth,\nAnd every tongue confess that Jesus Christ is Lord, *\n  to the glory of God the Father.",
    },
    {
      textKey: "canticle_m_eow1",
      category: "canticle",
      title: "Canticle M — A Song of Faith",
      bcpReference: "EOW1 p. 36 · 1 Peter 1:3-4,18-21",
      content:
        "Blessed be the God and Father of our Lord Jesus Christ, *\n  by divine mercy we have a new birth into a living hope;\nThrough the resurrection of Jesus Christ from the dead, *\n  we have an inheritance that is imperishable in heaven.\nThe ransom that was paid to free us *\n  was not paid in silver or gold,\nBut in the precious blood of Christ, *\n  the Lamb without spot or stain.\nGod raised Jesus from the dead and gave him glory *\n  so that we might have faith and hope in God.",
    },
    {
      textKey: "canticle_n_eow1",
      category: "canticle",
      title: "Canticle N — A Song of God's Love",
      bcpReference: "EOW1 p. 36 · 1 John 4:7-11",
      content:
        "Beloved, let us love one another, *\n  for love is of God.\nWhoever does not love does not know God, *\n  for God is Love.\nIn this the love of God was revealed among us, *\n  that God sent his only Son into the world,\n  so that we might live through Jesus Christ.\nIn this is love, not that we loved God but that God loved us *\n  and sent his Son that sins might be forgiven.\nBeloved, since God loved us so much, *\n  we ought also to love one another.\nFor if we love one another, God abides in us, *\n  and God's love will be perfected in us.",
    },
    {
      textKey: "canticle_o_eow1",
      category: "canticle",
      title: "Canticle O — A Song of the Heavenly City",
      bcpReference: "EOW1 p. 37 · Revelation 21:22-26, 22:1-4",
      content:
        "I saw no temple in the city, *\n  for its temple is the God of surpassing strength and the Lamb.\nAnd the city has no need of sun or moon to light it, *\n  for the glory of God shines on it, and its lamp is the Lamb.\nBy its light the nations shall walk, *\n  and the rulers of the world lay their honor and glory there.\nIts gates shall never be shut by day, nor shall there be any night; *\n  into it they will bring the honor and glory of nations.\nI saw the clean river of the water of life, bright as crystal, *\n  flowing from the throne of God and of the Lamb.\nThe tree of life spanned the river, giving fruit every month, *\n  and the leaves of the tree were for the healing of nations.\nAll curses cease where the throne of God and the Lamb stands,\n  and all servants give worship there; *\n  there they will see God's face, whose Name shall be on their foreheads.",
    },
    {
      textKey: "canticle_p_eow1",
      category: "canticle",
      title: "Canticle P — A Song of the Spirit",
      bcpReference: "EOW1 p. 37 · Revelation 22:12-17",
      content:
        "\"Behold, I am coming soon,\" says the Lord,\n  \"and bringing my reward with me, *\n  to give to everyone according to their deeds.\n\"I am the Alpha and the Omega, the first and the last, *\n  the beginning and the end.\"\nBlessed are those who do God's commandments,\n  that they may have the right to the tree of life, *\n  and may enter the city through the gates.\n\"I, Jesus, have sent my angel to you, *\n  with this testimony for all the churches.\n\"I am the root and the offspring of David, *\n  I am the bright morning star.\"\n\"Come!\" say the Spirit and the Bride; *\n  \"Come!\" let each hearer reply!\nCome forward, you who are thirsty, *\n  let those who desire take the water of life as a gift.",
    },
    {
      textKey: "canticle_q_eow1",
      category: "canticle",
      title: "Canticle Q — A Song of Christ's Goodness",
      bcpReference: "EOW1 p. 38 · Anselm of Canterbury",
      content:
        "Jesus, as a mother you gather your people to you; *\n  you are gentle with us as a mother with her children.\nOften you weep over our sins and our pride, *\n  tenderly you draw us from hatred and judgment.\nYou comfort us in sorrow and bind up our wounds, *\n  in sickness you nurse us and with pure milk you feed us.\nJesus, by your dying, we are born to new life; *\n  by your anguish and labor we come forth in joy.\nDespair turns to hope through your sweet goodness; *\n  through your gentleness, we find comfort in fear.\nYour warmth gives life to the dead, *\n  your touch makes sinners righteous.\nLord Jesus, in your mercy, heal us; *\n  in your love and tenderness, remake us.\nIn your compassion, bring grace and forgiveness, *\n  for the beauty of heaven, may your love prepare us.",
    },
    {
      textKey: "canticle_r_eow1",
      category: "canticle",
      title: "Canticle R — A Song of True Motherhood",
      bcpReference: "EOW1 p. 39 · Julian of Norwich",
      content:
        "God chose to be our mother in all things *\n  and so made the foundation of his work,\n  most humbly and most pure, in the Virgin's womb.\nGod, the perfect wisdom of all, *\n  arrayed himself in this humble place.\nChrist came in our poor flesh *\n  to share a mother's care.\nOur mothers bear us for pain and for death; *\n  our true mother, Jesus, bears us for joy and endless life.\nChrist carried us within him in love and travail, *\n  until the full time of his passion.\nAnd when all was completed and he had carried us so for joy, *\n  still all this could not satisfy the power of his wonderful love.\nAll that we owe is redeemed in truly loving God, *\n  for the love of Christ works in us;\n  Christ is the one whom we love.",
    },
    {
      textKey: "canticle_s_eow1",
      category: "canticle",
      title: "Canticle S — A Song of Our True Nature",
      bcpReference: "EOW1 p. 39 · Julian of Norwich",
      content:
        "Christ revealed our frailty and our falling, *\n  our trespasses and our humiliations.\nChrist also revealed his blessed power, *\n  his blessed wisdom and love.\nHe protects us as tenderly and as sweetly when we are in greatest need; *\n  he raises us in spirit\n  and turns everything to glory and joy without ending.\nGod is the ground and the substance, the very essence of nature; *\n  God is the true father and mother of natures.\nWe are all bound to God by nature, *\n  and we are all bound to God by grace.\nAnd this grace is for all the world, *\n  because it is our precious mother, Christ.\nFor this fair nature was prepared by Christ\n  for the honor and nobility of all, *\n  and for the joy and bliss of salvation.",
    },

    // ── Creed ────────────────────────────────────────────────────────
    {
      textKey: "apostles_creed",
      category: "creed",
      title: "The Apostles' Creed",
      bcpReference: "BCP p. 96",
      content:
        "I believe in God, the Father almighty,\n  creator of heaven and earth.\nI believe in Jesus Christ, his only Son, our Lord.\n  He was conceived by the power of the Holy Spirit\n    and born of the Virgin Mary.\n  He suffered under Pontius Pilate,\n    was crucified, died, and was buried.\n  He descended to the dead.\n  On the third day he rose again.\n  He ascended into heaven,\n    and is seated at the right hand of the Father.\n  He will come again to judge the living and the dead.\nI believe in the Holy Spirit,\n  the holy catholic Church,\n  the communion of saints,\n  the forgiveness of sins,\n  the resurrection of the body,\n  and the life everlasting. Amen.",
    },
    {
      textKey: "apostles_creed_eow1",
      category: "creed",
      title: "The Apostles' Creed",
      bcpReference: "EOW1",
      content:
        "I believe in God, the Father almighty,\n  creator of heaven and earth.\nI believe in Jesus Christ, God's only Son, our Lord,\n  who was conceived by the Holy Spirit,\n  born of the Virgin Mary,\n  suffered under Pontius Pilate,\n  was crucified, died, and was buried;\n  he descended to the dead.\n  On the third day he rose again;\n  he ascended into heaven,\n  he is seated at the right hand of the Father,\n  and he will come again to judge the living and the dead.\nI believe in the Holy Spirit,\n  the holy catholic Church,\n  the communion of saints,\n  the forgiveness of sins,\n  the resurrection of the body,\n  and the life everlasting. Amen.",
    },

    // ── Lord's Prayer ────────────────────────────────────────────────
    {
      textKey: "lords_prayer_contemporary",
      category: "lords_prayer",
      title: "The Lord's Prayer",
      bcpReference: "BCP p. 97",
      content:
        "Our Father in heaven,\n  hallowed be your Name,\n  your kingdom come,\n  your will be done,\n    on earth as in heaven.\nGive us today our daily bread.\nForgive us our sins\n  as we forgive those\n    who sin against us.\nSave us from the time of trial,\n  and deliver us from evil.\nFor the kingdom, the power,\n  and the glory are yours,\n  now and for ever. Amen.",
    },

    // ── Suffrages ────────────────────────────────────────────────────
    {
      textKey: "suffrages_a",
      category: "suffrages",
      title: "Suffrages A",
      bcpReference: "BCP p. 97",
      content:
        "V. Show us your mercy, O Lord;\nR. And grant us your salvation.\nV. Clothe your ministers with righteousness;\nR. Let your people sing with joy.\nV. Give peace, O Lord, in all the world;\nR. For only in you can we live in safety.\nV. Lord, keep this nation under your care;\nR. And guide us in the way of justice and truth.\nV. Let your way be known upon earth;\nR. Your saving health among all nations.\nV. Let not the needy, O Lord, be forgotten;\nR. Nor the hope of the poor be taken away.\nV. Create in us clean hearts, O God;\nR. And sustain us with your Holy Spirit.",
    },
    {
      textKey: "suffrages_b",
      category: "suffrages",
      title: "Suffrages B",
      bcpReference: "BCP p. 98",
      content:
        "V. Save your people, Lord, and bless your inheritance;\nR. Govern and uphold them, now and always.\nV. Day by day we bless you;\nR. We praise your name for ever.\nV. Lord, keep us from all sin today;\nR. Have mercy on us, Lord, have mercy.\nV. Lord, show us your love and mercy;\nR. For we put our trust in you.\nV. In you, Lord, is our hope;\nR. And we shall never hope in vain.",
    },

    // ── EOW1 Suffrages + Salutations ────────────────────────────────
    // EOW1 p. 41–42. Two alternative officiant salutations and a
    // morning suffrage set with a stronger justice / poverty
    // emphasis than BCP A or B.
    {
      textKey: "salutation_a_eow1",
      category: "salutation",
      title: "Salutation — A",
      bcpReference: "EOW1 p. 41",
      content:
        "Hear our cry, O God.\nAnd listen to our prayer.\nLet us pray.",
    },
    {
      textKey: "salutation_b_eow1",
      category: "salutation",
      title: "Salutation — B",
      bcpReference: "EOW1 p. 41",
      content:
        "God be with you.\nAnd also with you.\nLet us pray.",
    },
    {
      textKey: "suffrages_a_eow1",
      category: "suffrages",
      title: "Suffrages A — Morning Prayer",
      bcpReference: "EOW1 p. 41",
      content:
        "V. Help us, O God our Savior;\nR. Deliver us and forgive us our sins.\nV. Look upon your congregation;\nR. Give to your people the blessing of peace.\nV. Declare your glory among the nations;\nR. And your wonders among all peoples.\nV. Do not let the oppressed be shamed and turned away;\nR. Never forget the lives of your poor.\nV. Continue your loving-kindness to those who know you;\nR. And your favor to those who are true of heart.\nV. Satisfy us by your loving-kindness in the morning;\nR. So shall we rejoice and be glad all the days of our life.",
    },
    {
      textKey: "concluding_sentence_eow1",
      category: "closing",
      title: "Concluding Sentence (Ephesians 3:20,21)",
      bcpReference: "EOW1 p. 41",
      content:
        "Glory to God whose power, working in us, can do infinitely more than we can ask or imagine: Glory to God from generation to generation in the Church, and in Christ Jesus for ever and ever. Amen.",
    },

    // ── EOW1 Order of Worship for the Evening — Opening Acclamations
    // EOW1 p. 42. Three forms: standard, Easter, Lent. Each is a
    // single C&R pair the evening assembler uses in place of (or
    // alongside) the BCP "Light and peace, in Jesus Christ our
    // Lord. / Thanks be to God." opener.
    {
      textKey: "evening_opening_acclamation_default_eow1",
      category: "opening",
      title: "Evening Opening Acclamation",
      bcpReference: "EOW1 p. 42",
      content:
        "Stay with us, Christ, for it is evening.\nMake your Church bright with your radiance.",
    },
    {
      textKey: "evening_opening_acclamation_easter_eow1",
      category: "opening",
      title: "Evening Opening Acclamation — Easter",
      bcpReference: "EOW1 p. 42",
      seasonRestriction: "easter",
      content:
        "Christ is risen. Alleluia.\nAnd has appeared to the disciples. Alleluia.",
    },
    {
      textKey: "evening_opening_acclamation_lent_eow1",
      category: "opening",
      title: "Evening Opening Acclamation — Lent",
      bcpReference: "EOW1 p. 42",
      seasonRestriction: "lent",
      content:
        "Blessed be the God of our salvation:\nWho bears our burdens and forgives our sins.",
    },

    // ── Collects ─────────────────────────────────────────────────────
    {
      textKey: "collect_for_grace",
      category: "collect",
      title: "A Collect for Grace",
      bcpReference: "BCP p. 100",
      content:
        "Lord God, almighty and everlasting Father, you have brought us in safety to this new day: Preserve us with your mighty power, that we may not fall into sin, nor be overcome by adversity; and in all we do, direct us to the fulfilling of your purpose; through Jesus Christ our Lord. Amen.",
    },

    // ── Prayers for Mission ──────────────────────────────────────────
    {
      textKey: "prayer_mission_1",
      category: "prayer_for_mission",
      title: "A Prayer for Mission",
      bcpReference: "BCP p. 100",
      content:
        "Almighty and everlasting God, by whose Spirit the whole body of your faithful people is governed and sanctified: Receive our supplications and prayers which we offer before you for all members of your holy Church, that in their vocation and ministry they may truly and devoutly serve you; through our Lord and Savior Jesus Christ. Amen.",
    },
    {
      textKey: "prayer_mission_2",
      category: "prayer_for_mission",
      title: "A Prayer for Mission",
      bcpReference: "BCP p. 101",
      content:
        "O God, you have made of one blood all the peoples of the earth, and sent your blessed Son to preach peace to those who are far off and to those who are near: Grant that people everywhere may seek after you and find you; bring the nations into your fold; pour out your Spirit upon all flesh; and hasten the coming of your kingdom; through Jesus Christ our Lord. Amen.",
    },
    {
      textKey: "prayer_mission_3",
      category: "prayer_for_mission",
      title: "A Prayer for Mission",
      bcpReference: "BCP p. 101",
      content:
        "Lord Jesus Christ, you stretched out your arms of love on the hard wood of the cross that everyone might come within the reach of your saving embrace: So clothe us in your Spirit that we, reaching forth our hands in love, may bring those who do not know you to the knowledge and love of you; for the honor of your Name. Amen.",
    },

    // ── General Thanksgiving ─────────────────────────────────────────
    {
      textKey: "general_thanksgiving",
      category: "general_thanksgiving",
      title: "The General Thanksgiving",
      bcpReference: "BCP p. 101",
      content:
        "Almighty God, Father of all mercies,\nwe your unworthy servants give you humble thanks\nfor all your goodness and loving-kindness\nto us and to all whom you have made.\nWe bless you for our creation, preservation,\nand all the blessings of this life;\nbut above all for your immeasurable love\nin the redemption of the world by our Lord Jesus Christ;\nfor the means of grace, and for the hope of glory.\nAnd, we pray, give us such an awareness of your mercies,\nthat with truly thankful hearts we may show forth your praise,\nnot only with our lips, but in our lives,\nby giving up our selves to your service,\nand by walking before you\nin holiness and righteousness all our days;\nthrough Jesus Christ our Lord,\nto whom, with you and the Holy Spirit,\nbe honor and glory throughout all ages. Amen.",
    },
  ];

  let count = 0;
  for (const row of texts) {
    await upsert(row);
    count++;
  }
  console.log(`  ✓ ${count} static texts seeded`);
}

/* ------------------------------------------------------------------ */
/*  Collects of the Day — full 1979 BCP set, scraped from bcponline.org */
/* ------------------------------------------------------------------ */
//
// The collect text + page references live in seeds/bcpCollects.ts —
// auto-generated from /tmp/collect-scrape/. We upsert them here so the
// office assembler always finds a real collect for the day's
// `collectKey` and never falls back to the "[collect_x — see BCP]"
// placeholder. (The 8 hand-typed stubs that lived here got replaced
// when the full scrape landed; if a future re-scrape adds rows, this
// loop just picks them up.)

async function seedCollectsFromScrape() {
  console.log("Seeding Collects of the Day from bcpCollects.ts...");
  const { BCP_COLLECTS } = await import("./bcpCollects");

  let count = 0;
  for (const c of BCP_COLLECTS) {
    await upsert({
      textKey: c.collectKey,
      category: "collect",
      title: c.title,
      bcpReference: c.bcpReference,
      content: c.content,
    });
    count++;
  }
  console.log(`  ✓ ${count} collects seeded`);
}

/* ------------------------------------------------------------------ */
/*  Psalter                                                            */
/* ------------------------------------------------------------------ */

// Seed the BCP 1979 Psalter. Each entry in PSALTER (bcpPsalter.ts)
// becomes a bcp_texts row with key `psalm_${n}`. Idempotent — the
// upsert helper updates content/title/ref on every run, so adding
// or fixing a psalm in bcpPsalter.ts and redeploying re-seeds.
async function seedPsalter() {
  const { PSALTER } = await import("./bcpPsalter");
  const psalmNumbers = Object.keys(PSALTER).map(Number).sort((a, b) => a - b);
  console.log(`Seeding ${psalmNumbers.length} psalms…`);
  for (const n of psalmNumbers) {
    const p = PSALTER[n];
    if (!p) continue;
    await upsert({
      textKey: `psalm_${n}`,
      category: "psalm",
      title: p.title,
      bcpReference: p.bcpRef,
      content: p.content,
    });
  }
  console.log(`  ✓ ${psalmNumbers.length} psalms seeded`);
}

/* ------------------------------------------------------------------ */
/*  Main                                                               */
/* ------------------------------------------------------------------ */

export async function seedBcpTexts(): Promise<{ inserted: number; skipped: number }> {
  console.log("=== BCP Texts Seed Script ===\n");
  await seedStaticTexts();
  await sleep(DELAY_MS);
  await seedCollectsFromScrape();
  await sleep(DELAY_MS);
  await seedPsalter();
  console.log("\n✓ BCP texts seed complete.");
  return { inserted: 0, skipped: 0 };
}

// Allow direct execution: pnpm tsx src/seeds/bcpTexts.ts
if (process.argv[1] && process.argv[1].endsWith("bcpTexts.ts")) {
  seedBcpTexts()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Seed failed:", err);
      process.exit(1);
    });
}
