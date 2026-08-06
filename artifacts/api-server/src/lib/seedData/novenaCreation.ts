// "Nine Days of Prayer with Creation" — a Phoebe-compiled novena, built
// entirely from public-domain material: the 1979 BCP Psalter (the actual
// verse text is spliced in server-side by psalmNumber at render time — see
// novenas.ts's GET /me/novena — never re-transcribed here) plus one verified
// public-domain quotation per day from a handful of long-out-of-copyright
// writers. This deliberately does NOT draw on any modern copyrighted
// Season-of-Creation guide's own compiled collects, intercessions, or
// contemporary-author quotations — those remain the property of their
// authors/publishers.
//
// Two days (4 and 9) carry no named quotation — a Joseph Hall passage was
// considered for the harvest/blessing themes, but no verbatim line could be
// confirmed accurate against a primary source, so those days are Phoebe's
// own reflection instead of risking a misattributed quote. A properly
// sourced Hall excerpt can be added later if one is verified.
//
// May be begun at any time — not gated to September/October, though the
// nine days naturally suit the Season of Creation (Sept 1 - Oct 4).

const DAYS: Array<{ dayNumber: number; title: string; psalmNumber: number; body: string }> = [
  {
    dayNumber: 1,
    title: "The Song of All Creation",
    psalmNumber: 148,
    body:
      "Today we join our voice to the whole chorus of creation — sun and moon, " +
      "stars and skies, mountains and trees, creatures wild and tame — all of it " +
      "already praising God, whether or not we notice.\n\n" +
      "“Praised be my Lord, with all his creatures, and specially our brother " +
      "the sun, who brings us the day, and who brings us the light; fair is he, " +
      "and shining with a very great splendour: O Lord, he signifies to us thee!”\n" +
      "— St. Francis of Assisi, Canticle of the Creatures, c. 1224. Public domain.\n\n" +
      "Lord of all that is made, let me hear today what creation is already singing, " +
      "and let my own voice join it. Amen.",
  },
  {
    dayNumber: 2,
    title: "Waters of Life",
    psalmNumber: 104,
    body:
      "God set the waters their bounds and made them a source of life for every " +
      "living thing. Today we give thanks for water — rivers and rain, the sea, " +
      "the water we drink — and pray for the wisdom to keep it clean and shared.\n\n" +
      "“All shall be well, and all shall be well, and all manner of thing shall be well.”\n" +
      "— Julian of Norwich, Revelations of Divine Love, c. 1395. Public domain.\n\n" +
      "Maker of the deep and the spring, teach me to receive water as a gift, not " +
      "a given. Amen.",
  },
  {
    dayNumber: 3,
    title: "Mountains and Wild Places",
    psalmNumber: 121,
    body:
      "The psalmist lifts his eyes to the hills and finds help there — not in the " +
      "hills themselves, but in the God who made them. Today we pray for wild " +
      "places left alone to simply be what God made them to be.\n\n" +
      "“In Wildness is the preservation of the World.”\n" +
      "— Henry David Thoreau, “Walking,” 1862. Public domain.\n\n" +
      "God of the wilderness, thank you for what is left untamed. Give me the " +
      "grace to leave some things alone. Amen.",
  },
  {
    dayNumber: 4,
    title: "The Turning Seasons",
    psalmNumber: 65,
    body:
      "Seedtime and harvest, planting and reaping — the psalm today gives thanks " +
      "for the year's turning and for a God who crowns it with goodness. Today we " +
      "give thanks for the patience built into every growing thing, and for " +
      "farmers, gardeners, and all who work the soil.\n\n" +
      "Lord of the seasons, you do not rush the harvest. Slow me down to your " +
      "pace today, and let me be grateful for what is ripening, even before it's " +
      "ready. Amen.",
  },
  {
    dayNumber: 5,
    title: "Every Living Creature",
    psalmNumber: 96,
    body:
      "Let the field be joyful, and all that is in it; then shall all the trees of " +
      "the wood rejoice. Today we pray for the animals — wild and domestic, seen " +
      "and unseen — who share this world with us and ask nothing of us but care.\n\n" +
      "“Praised be my Lord for our sister water, who is very serviceable unto us, " +
      "and humble, and precious, and clean. Praised be my Lord for our brother " +
      "fire, through whom thou givest us light in the darkness.”\n" +
      "— St. Francis of Assisi, Canticle of the Creatures, c. 1224. Public domain.\n\n" +
      "Creator of every living thing, forgive our carelessness with your creatures, " +
      "and give us Francis's eye for a brother in the wind and a sister in the " +
      "rain. Amen.",
  },
  {
    dayNumber: 6,
    title: "The Heavens Declare",
    psalmNumber: 19,
    body:
      "The heavens are telling the glory of God, and the sky above proclaims his " +
      "handiwork — day speaks to day, and night to night, without a word ever " +
      "spoken aloud. Today we look up and let the sky preach.\n\n" +
      "“…And I have felt / A presence that disturbs me with the joy / Of elevated " +
      "thoughts; a sense sublime / Of something far more deeply interfused, / " +
      "Whose dwelling is the light of setting suns…”\n" +
      "— William Wordsworth, “Lines Composed a Few Miles above Tintern Abbey,” 1798. Public domain.\n\n" +
      "God beyond the stars and within them, let today's sky be sermon enough. " +
      "Amen.",
  },
  {
    dayNumber: 7,
    title: "Our Calling to Tend the Earth",
    psalmNumber: 8,
    body:
      "You have made us little lower than the angels and given us dominion over " +
      "the works of your hands — a psalm about wonder before it is a psalm about " +
      "power. Today we pray about what dominion actually asks of us.\n\n" +
      "“Look at My works, how beautiful and praiseworthy they are! And all that I " +
      "have created, I made for your sake. Pay attention that you do not spoil " +
      "and destroy My world, for if you spoil it, there is no one to repair it " +
      "after you.”\n" +
      "— Midrash, Kohelet (Ecclesiastes) Rabbah 7:13. Ancient text, public domain.\n\n" +
      "God who entrusted us with this world, make me a keeper, not merely a user, " +
      "of what you have made. Amen.",
  },
  {
    dayNumber: 8,
    title: "Rest for the Land, Rest for Us",
    psalmNumber: 24,
    body:
      "The earth is the Lord's, and the fullness thereof — not ours to exhaust. " +
      "Today we pray about pace: our getting and spending, and what it costs the " +
      "world when we never stop to rest.\n\n" +
      "“The world is too much with us; late and soon, / Getting and spending, we " +
      "lay waste our powers; / Little we see in Nature that is ours…”\n" +
      "— William Wordsworth, “The World Is Too Much With Us,” 1807. Public domain.\n\n" +
      "Lord of the Sabbath, slow my getting and spending long enough to notice " +
      "what already belongs to you. Amen.",
  },
  {
    dayNumber: 9,
    title: "Blessing and Thanksgiving",
    psalmNumber: 67,
    body:
      "God be merciful unto us, and bless us, and show us the light of his " +
      "countenance, and be merciful unto us — that his way may be known upon " +
      "earth, and his saving health among all nations. On this last day, we ask " +
      "a blessing not only for ourselves but for the whole earth we have prayed " +
      "with these nine days.\n\n" +
      "Bless the earth, O God, and bless the hands — including mine — that tend " +
      "it. Let this novena's end be the start of a longer attention to the world " +
      "you made and called good. Amen.",
  },
];

export const NOVENA_CREATION = {
  code: "creation",
  title: "A Novena for Creation",
  saint: null as string | null,
  sourceNote:
    "A Phoebe compilation: 1979 BCP Psalter texts, paired with public-domain quotations " +
    "(St. Francis of Assisi, Julian of Norwich, Henry David Thoreau, William Wordsworth, " +
    "and the ancient Midrash Kohelet Rabbah) and original Phoebe-written reflections and " +
    "prayers. Not drawn from any modern copyrighted Season of Creation guide.",
  history:
    "This novena is a Phoebe compilation, not a historical devotion. It draws on the psalms of the " +
    "Daily Office and public-domain reflections on creation — from St. Francis of Assisi, Julian of " +
    "Norwich, Thoreau, Wordsworth, and an ancient Jewish text — gathered here for the first time as a " +
    "nine-day sequence. It was written for Phoebe in the spirit of the wider Christian “Season of " +
    "Creation” observance (September 1 - October 4), though it may be prayed at any time of year.",
  intention:
    "To open nine days of attention to the created world — water, mountains, seasons, animals, sky, " +
    "our calling to tend the earth, rest, and blessing — as a way of praying, not just thinking, about " +
    "creation care.",
  // Kept last in the library list — after even Mount Carmel (sortOrder 100).
  sortOrder: 200,
  dayCount: 9,
  days: DAYS,
};
