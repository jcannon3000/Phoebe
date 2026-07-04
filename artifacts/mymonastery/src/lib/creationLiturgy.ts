// ─── Season of Creation liturgy (client) ────────────────────────────────────
//
// Ported from the server's seasonOfCreation.ts / creationLibrary.ts so the
// client can show the Season of Creation OPENING SENTENCES on the syncing
// splash (in place of the general quotes) and the day's COLLECT on the
// Creation Prayer close. All scripture is public domain; the collects are
// gift-licensed liturgical texts gathered across the Anglican Communion.

// Opening Sentences — public-domain scripture on the theme of creation.
// Rotated on the syncing screen. A fuller set than the server's four so the
// rotation doesn't repeat quickly.
export const CREATION_OPENING_SENTENCES: Array<{ text: string; ref: string }> = [
  { text: "The heavens are telling the glory of God, and the firmament proclaims his handiwork.", ref: "Psalm 19:1" },
  { text: "The earth is the Lord's, and all that is in it, the world, and those who dwell therein.", ref: "Psalm 24:1" },
  { text: "O Lord, how manifold are your works! In wisdom you have made them all; the earth is full of your creatures.", ref: "Psalm 104:24" },
  { text: "The meadows clothe themselves with flocks; the valleys deck themselves with grain; they shout and sing together for joy.", ref: "Psalm 65:12-13" },
  { text: "Let the heavens be glad, and let the earth rejoice; let the sea roar, and all that fills it. Then shall all the trees of the forest sing for joy.", ref: "Psalm 96:11-12" },
  { text: "Ask the animals, and they will teach you; the birds of the air, and they will tell you — in his hand is the life of every living thing.", ref: "Job 12:7-10" },
  { text: "In him all things were created, in heaven and on earth; all things have been created through him and for him, and in him all things hold together.", ref: "Colossians 1:16-17" },
  { text: "The creation waits with eager longing for the revealing of the children of God.", ref: "Romans 8:19" },
  { text: "God saw everything that he had made, and indeed, it was very good.", ref: "Genesis 1:31" },
  { text: "Praise him, sun and moon; praise him, all you shining stars; praise him, you highest heavens.", ref: "Psalm 148:3-4" },
  { text: "Shower, O heavens, from above, and let the skies rain down righteousness; let the earth open, that salvation may spring up.", ref: "Isaiah 45:8" },
  { text: "You are worthy, our Lord and God, to receive glory and honor and power, for you created all things.", ref: "Revelation 4:11" },
];

// The day's opening sentence — rotates by local day-of-year, so everyone on the
// same day shares the same sentence and the whole set cycles across the weeks.
export function openingSentenceForToday(): { text: string; ref: string } {
  const d = new Date();
  const doy = Math.floor((d.getTime() - new Date(d.getFullYear(), 0, 0).getTime()) / 86400000);
  return CREATION_OPENING_SENTENCES[doy % CREATION_OPENING_SENTENCES.length]!;
}

export interface CreationCollect { title: string; attribution?: string; text: string; }

// Collects — one shown on the Creation Prayer close. Gathered from across the
// Anglican Communion (Season of Creation guide, pp. 78-86).
export const CREATION_COLLECTS: CreationCollect[] = [
  { title: "For the Stewardship of Creation", text: "O merciful Creator, your hand is open wide to satisfy the needs of every living creature: Make us always thankful for your loving providence; and remembering the account that we must give one day, grant that we may be faithful stewards of your good gifts; through Jesus Christ our Savior, who with you and the Holy Spirit lives and reigns, one God, for ever and ever. Amen." },
  { title: "For the Healing of Creation", text: "Gracious God, the air sings with songs of glory, water flashes silver with creation, and the forests bloom with leaves for healing nations. May your light and love fill our hearts and souls and minds, that we may share your abundant grace with the world. Amen." },
  { title: "Called to be God's Partners in the Care of the Planet", text: "Bountiful God, you call us to labor with you in tending the earth: Where we lack love, open our hearts to the world; where we waste, give us discipline to conserve; where we neglect, awaken our minds and wills to insight and care. May we with all your creatures honor and serve you in all things, for you live and reign with Christ, Redeemer of all, and with your Holy Spirit, one God, now and for ever. Amen." },
  { title: "For the Beauty of Creation", attribution: "Anglican Church of Kenya", text: "Loving God, Creator of all, we thank you for the beauty of Creation; show us, we pray, how to respect the fragile balance of life. Guide by your wisdom those who have power to care for or to destroy the environment, that by the decisions we make, life may be cherished and a good and fruitful earth be preserved for future generations; through Jesus Christ our Lord. Amen." },
  { title: "For the Cosmos", attribution: "Koinonia (Lutheran)", text: "Creating God, your name is written on every leaf, every bird, every river, every stone, every living being. We praise and worship you for the magnificence of your creation. Make us attentive to the wounds of the earth and willing to work for the healing of the whole creation, through Jesus Christ, our Savior and Lord. Amen." },
  { title: "A Collect of Gregory of Nazianzus", attribution: "St. Gregory of Nazianzus", text: "All things cry out about you: those that speak, and those that cannot speak. All things honor you: those that think, and those that cannot think. For there is one longing, one groaning, which all things have for you. In you, the One, all things abide, and all things endlessly run to you who are the end of all. Amen." },
  { title: "From an Ojibwe Evening Prayer", attribution: "Ojibwe", text: "Great Spirit God, we give you thanks for another day on this earth. We acknowledge with one mind our respect and gratefulness to all the sacred cycle of life. Bind us together in the circle of compassion to embrace all living creatures and one another. Amen." },
  { title: "Honoring God in Creation", attribution: "Honoring God in Creation", text: "Gracious God: Grant that your people may have in them the same mind that was in Christ Jesus, and guide us into harmony of relationship through loving-kindness and the wise use of all that you have given; for you are drawing all things into communion with you and with each other by the power of the Holy Spirit. Amen." },
  { title: "For the Waters of the Earth", attribution: "Honoring God in Creation", text: "Blessed God, fountain of life: Grant that we may see all water as holy, and so protect and preserve the waters of the earth and the life they sustain. In the name of Christ, the living water, we pray. Amen." },
  { title: "From A Litany for the Earth", text: "Creator God, you call us into being. Inspire us with your extravagant generosity, and sustain us with hope in resurrection life. All this we ask in the name of Jesus Christ, the Good Shepherd. Amen." },
  { title: "For the Kinship of All Creation", attribution: "Honoring God in Creation", text: "God, maker of marvels, you weave the planet and all its creatures together in kinship; your unifying love is revealed in the interdependence of relationships in the world that you have made. Save us from the illusion that humankind is separate and alone, and join us in communion with all inhabitants of the universe; through Jesus Christ, our Redeemer. Amen." },
  { title: "Reading God's Goodness in the Diversity of Life", attribution: "Honoring God in Creation", text: "Gracious God, you reveal your goodness in the beauty and diversity of creation; in the circle dance of earth and air and water; and above all in the gift of Jesus Christ, who emptied himself to serve your world. And so we offer thanks and praise to you, one God in three persons, now and for ever. Amen." },
];

// The day's collect — rotates by local day-of-year so it changes daily and
// cycles through the whole set.
export function collectForToday(): CreationCollect {
  const d = new Date();
  const doy = Math.floor((d.getTime() - new Date(d.getFullYear(), 0, 0).getTime()) / 86400000);
  return CREATION_COLLECTS[doy % CREATION_COLLECTS.length]!;
}
