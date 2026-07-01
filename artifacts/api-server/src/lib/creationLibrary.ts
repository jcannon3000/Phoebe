/**
 * Creation library — collects, prayers, closing blessings, readings, and quotes
 * for the Season of Creation devotion and the "Prayers for the Climate" page.
 *
 * SOURCE: everything here is transcribed from *Season of Creation: A Celebration
 * Guide for Episcopal Parishes* (Perennial Edition, 2025), which is released
 * "to the larger Church as a gift." Each item keeps the guide's own attribution
 * (the collects/prayers/quotes gather text from across the Anglican Communion
 * and beyond — BCP, other provinces, saints, theologians, poets). Scripture and
 * 1979-BCP text are public domain. NOTHING from Enriching Our Worship or the
 * Laudato Si' Movement is used here.
 */

import type { CreationWeek, CreationSide } from "./seasonOfCreation";
import { creationCyclePosition, CREATION_ATTRIBUTION } from "./seasonOfCreation";

export interface CreationCollect { title: string; attribution?: string; text: string; }
export interface CreationPrayer { title: string; attribution?: string; note?: string; text: string; }
export interface CreationBlessing { text: string; attribution?: string; }
export interface CreationReading { ref: string; note: string; }
export interface CreationQuote { author: string; source?: string; text: string; }
export interface CreationCanticle { title: string; attribution?: string; text: string; }
export interface CreationAffirmation { title: string; attribution?: string; text: string; }
export interface CreationLitanyLine { v: string; r: string; }
export interface CreationLitany { title: string; intro?: string; lines: CreationLitanyLine[]; }

// ── Collects (Season of Creation guide, pp. 78–86) ───────────────────────────
export const CREATION_COLLECTS: CreationCollect[] = [
  {
    title: "For the Stewardship of Creation",
    text: "O merciful Creator, your hand is open wide to satisfy the needs of every living creature: Make us always thankful for your loving providence; and remembering the account that we must give one day, grant that we may be faithful stewards of your good gifts; through Jesus Christ our Savior, who with you and the Holy Spirit lives and reigns, one God, for ever and ever. Amen.",
  },
  {
    title: "For the Healing of Creation",
    text: "Gracious God, the air sings with songs of glory, water flashes silver with creation, and the forests bloom with leaves for healing nations. May your light and love fill our hearts and souls and minds, that we may share your abundant grace with the world. Amen.",
  },
  {
    title: "Called to be God's Partners in the Care of the Planet",
    text: "Bountiful God, you call us to labor with you in tending the earth: Where we lack love, open our hearts to the world; where we waste, give us discipline to conserve; where we neglect, awaken our minds and wills to insight and care. May we with all your creatures honor and serve you in all things, for you live and reign with Christ, Redeemer of all, and with your Holy Spirit, one God, now and for ever. Amen.",
  },
  {
    title: "For the Beauty of Creation",
    attribution: "Anglican Church of Kenya",
    text: "Loving God, Creator of all, we thank you for the beauty of Creation; show us, we pray, how to respect the fragile balance of life. Guide by your wisdom those who have power to care for or to destroy the environment, that by the decisions we make, life may be cherished and a good and fruitful earth be preserved for future generations; through Jesus Christ our Lord. Amen.",
  },
  {
    title: "For the Cosmos",
    attribution: "Koinonia (Lutheran)",
    text: "Creating God, your name is written on every leaf, every bird, every river, every stone, every living being. We praise and worship you for the magnificence of your creation. Make us attentive to the wounds of the earth and willing to work for the healing of the whole creation, through Jesus Christ, our Savior and Lord. Amen.",
  },
  {
    title: "A Collect of Gregory of Nazianzus",
    attribution: "St. Gregory of Nazianzus",
    text: "Holy God, you alone are unutterable, from the time you created all things that can be spoken of. You alone are unknowable, from the time you created all things that can be known. All things cry out about you: those that speak, and those that cannot speak. All things honor you: those that think, and those that cannot think. For there is one longing, one groaning, which all things have for you. All things that comprehend your plan pray to you and offer you a silent hymn. In you, the One, all things abide, and all things endlessly run to you who are the end of all. Amen.",
  },
  {
    title: "From an Ojibwe Evening Prayer",
    attribution: "Ojibwe",
    text: "Great Spirit God, we give you thanks for another day on this earth. We give you thanks for this day to enjoy the compassionate goodness of you, our Creator. We acknowledge with one mind our respect and gratefulness to all the sacred cycle of life. Bind us together in the circle of compassion to embrace all living creatures and one another. Amen.",
  },
  {
    title: "Honoring God in Creation, Form 1",
    attribution: "Honoring God in Creation",
    text: "Gracious God: Grant that your people may have in them the same mind that was in Christ Jesus, and guide us into harmony of relationship through loving-kindness and the wise use of all that you have given; for you are drawing all things into communion with you and with each other by the power of the Holy Spirit. Amen.",
  },
  {
    title: "Honoring God in Creation, Form 3",
    attribution: "Honoring God in Creation",
    text: "Blessed God, fountain of life: Grant that we may see all water as holy, and so protect and preserve the waters of the earth and the life they sustain. In the name of Christ, the living water, we pray. Amen.",
  },
  {
    title: "From A Litany for the Earth, Form A",
    text: "Creator God, you call us into being. Inspire us with your extravagant generosity, and sustain us with hope in resurrection life. All this we ask in the name of Jesus Christ, the Good Shepherd. Amen.",
  },
  {
    title: "For Harvest (Luke 12:16-30)",
    attribution: "Steven Shakespeare, Prayers for an Inclusive Church",
    text: "Demanding God, you call us to account for the use of your gifts: pull down the storehouses of accumulated greed which impoverish people and despoil the earth; put our hands to work sowing the seeds and reaping the growth of justice, thanksgiving and praise; through Jesus Christ, the Lord of the harvest. Amen.",
  },
  {
    title: "For Harvest (Luke 17:11-19)",
    attribution: "Steven Shakespeare, Prayers for an Inclusive Church",
    text: "Gracious One, reaching our need, overcoming our alienation: give us a spirit of gratitude for the abundance of the earth, the wildness of its creatures, the global threads that bind friend and foreigner; may our thanks be the soil in which a dream of justice grows; through Jesus Christ, the Lord of the harvest. Amen.",
  },
  {
    title: "For Harvest (Matthew 6:25-33)",
    attribution: "Steven Shakespeare, Prayers for an Inclusive Church",
    text: "God of evolving diversity, made known in seed and soil, and the wonder of animal worlds: free our hearts from the anxiety which knows only domination; open our being to learn from the life with which we share this earth; through Jesus Christ, the Lord of the harvest. Amen.",
  },
  {
    title: "For Harvest (John 6:25-35)",
    attribution: "Steven Shakespeare, Prayers for an Inclusive Church",
    text: "God, whose word is ingrained in all we eat and drink; free us from the consumption that destroys the roots of life; teach us to eat the living bread in whom all hungers are satisfied by the life that gives of itself and is never consumed; through Jesus Christ, the Lord of the harvest. Amen.",
  },
  {
    title: "God, the Source and Destiny of the Cosmos",
    attribution: "Honoring God in Creation",
    text: "Author of creation: In wisdom you brought forth all that is, to participate in your divine being, and to change, adapt, and grow in freedom. You make holy the matter and energy of the universe that it may delight you and give you praise. We thank you for gathering all creation into your heart by the energy of your Spirit and bringing it through death to resurrection glory; through the One in whom all things have their being, Jesus Christ, your Wisdom and your Word. Amen.",
  },
  {
    title: "God of Order and Dynamic Change",
    attribution: "Honoring God in Creation",
    text: "Mysterious God, whose imagination and desire embrace all: We seek to discern you in the interplay of forces, in the order and the chaos of the universe, and in the complexities of every living system. Give us grace to honor your goodness in what we know and in what we do not know, in the world's harmonies and turbulence, and in its promise and change. For you are in, through, and beyond all that is: one God, made known to us in Jesus Christ, through the Holy Spirit, our inspiration and guide. Amen.",
  },
  {
    title: "The Justice of God and the Dignity of All Creatures",
    attribution: "Honoring God in Creation",
    text: "Holy God, your mercy is over all your works, and in the web of life each creature has its role and place. We praise you for ocelot and owl, cactus and kelp, lichen and whale; we honor you for whirlwind and lava, tide and topsoil, cliff and marsh. Give us hearts and minds eager to care for your planet, humility to recognize all creatures as your beloved ones, justice to share the resources of the earth with all its inhabitants, and love not limited by our ignorance. This we pray in the name of Jesus, who unifies what is far off and what is near, and in whom, by grace and the working of your Holy Spirit, all things hold together. Amen.",
  },
  {
    title: "The Kinship and Unity of All Creation in Christ",
    attribution: "Honoring God in Creation",
    text: "God, maker of marvels, you weave the planet and all its creatures together in kinship; your unifying love is revealed in the interdependence of relationships in the complex world that you have made. Save us from the illusion that humankind is separate and alone, and join us in communion with all inhabitants of the universe; through Jesus Christ, our Redeemer, who topples the dividing walls by the power of your Holy Spirit, and who lives and reigns with you, for ever and ever. Amen.",
  },
  {
    title: "Reading God's Goodness in the Diversity of Life",
    attribution: "Honoring God in Creation",
    text: "Gracious God, you reveal your goodness in the beauty and diversity of creation; in the circle dance of earth and air and water; in a universe rich in processes that support growth and coherence, distinctiveness and community; and above all in the gift of Jesus Christ, who emptied himself to serve your world. And so we offer thanks and praise to you, one God in three persons: the Author and Source of all, Christ the Incarnate Word, and the Holy Spirit, one God, now and for ever. Amen.",
  },
];

// ── The collect lectionary — one collect per day of the fortnight, chosen to
//    sit with that day's psalms (praise days get praise collects; the Friday
//    penitential psalms get the collects of repentance & justice). Values index
//    into CREATION_COLLECTS. ─────────────────────────────────────────────────
export const CREATION_COLLECT_LECTIONARY: Record<CreationWeek, number[]> = {
  //        Sun Mon Tue Wed Thu Fri Sat
  A: [      18,  0,  4, 14,  3,  2,  6],
  B: [       5,  9, 17, 12,  8, 10,  7],
};

export function creationCollectFor(date: Date): CreationCollect {
  const { week, weekday } = creationCyclePosition(date);
  const idx = CREATION_COLLECT_LECTIONARY[week][weekday] ?? 0;
  return CREATION_COLLECTS[idx] ?? CREATION_COLLECTS[0];
}

// ── Closing Prayers & Blessings (guide, pp. 59–60) — rotated at the close. ───
export const CREATION_BLESSINGS: CreationBlessing[] = [
  { text: "May God who established the dance of creation, who marveled at the lilies of the field, who transforms chaos to order, lead us to transform our lives and the Church to listen to the voice of all creatures that reflect God's glory in creation." },
  { text: "Deep peace, pure white of the moon to you. Deep peace, pure green of the grass to you. Deep peace, pure brown of the earth to you. Deep peace, pure gray of the dew to you. Deep peace, pure blue of the sky to you. Deep peace of the Son of Peace to you.", attribution: "a Gaelic blessing" },
  { text: "May God light in us a holy fire: Light a fire that is worthy of our ancestors. Light a fire that is worthy of our children. Light a fire that is worthy of our fathers. Light a fire that is worthy of our mothers. Light a fire that is worthy of God. Now let us go in peace, lighting a holy fire wherever we go." },
  { text: "Let us join with the Earth and each other — to bring new life to the land, to restore the waters, to refresh the air, to protect the animals, to treasure the trees, to gaze at the stars, to cherish the human community, to heal the Earth, to remember the children. Let us go forth to put our words into action.", attribution: "U.N. Environmental Sabbath" },
  { text: "God of the galaxies, God of the starburst and sunlit morning, God of the forest and shining seas, God of the blooming desert and rolling grasslands — shine on us today and bless us with your presence." },
  { text: "Go forth now to care for God's world. Use resources wisely. Share your knowledge. Sacrifice where necessary. Live in harmony with all creation. Go out into all the world as prophets of a new way of living and preach the good news to all. And the blessing of the Creator God, the Risen Son, and the Promised Holy Spirit bless you that you might be a blessing to others today and always. Amen." },
];

// ── Prayers (guide, pp. 86–91) — for the Prayers for the Climate page. ───────
export const CREATION_PRAYERS: CreationPrayer[] = [
  { title: "A Prayer of Hildegard of Bingen", attribution: "Hildegard of Bingen (1098–1179)", text: "Praise be to the Holy Trinity! God is sound and life, Creator of the Universe, Source of all life, whom the angels sing; wondrous Light of all mysteries known or unknown to humankind, and life that lives in all. Amen." },
  { title: "Thanksgiving for the Beauty of the Earth", attribution: "BCP p. 840", text: "We give you thanks, most gracious God, for the beauty of earth and sky and sea; for the richness of mountains, plains, and rivers; for the songs of birds and the loveliness of flowers. We praise you for these good gifts, and pray that we may safeguard them for our posterity. Grant that we may continue to grow in our grateful enjoyment of your abundant creation, to the honor and glory of your Name, now and for ever. Amen." },
  { title: "For This World", text: "Enlarge within us the sense of fellowship with all living things, our brothers and sisters the animals to whom you gave this earth as their home in common with us. We remember with shame that in the past we have exercised the high dominion of humans with ruthless cruelty, so that the voice of the Earth, which should have gone up to you in song, has been a groan of travail. May we realize that they live, not for us alone, but for themselves and for you, and that they love the sweetness of life even as we, and serve you in their place better than we in ours. We pray through our Savior Jesus Christ, who lifts up and redeems us all. Amen." },
  { title: "A Prayer for Our Time and for the Earth", text: "Dear God, Creator of the earth, this sacred home we share: Give us new eyes to see the beauty all around and to protect the wonders of creation. Give us new arms to embrace the strangers among us and to know them as family. Give us new ears to hear and understand those who live off the land and sea, and to hear and understand those who extract its resources. Give us new hearts to recognize the brokenness in our communities and to heal the wounds we have inflicted. Give us new hands to serve the earth and its people and to shape beloved community. For you are the One who seeks the lost, binds our wounds and sets us free, and it is in the name of Jesus the Christ we pray. Amen." },
  { title: "Prayer for the Harvest", attribution: "Koinonia (Lutheran)", text: "Bountiful God, we thank you for sending the rain, for making the land fertile, for filling the streams with water, for providing the earth with crops, for nurturing the young plants, for tending the cattle and sheep. With your Spirit inspire us to share your harvest with all the hungry world, through Jesus Christ, our Savior and Lord. Amen." },
  { title: "Four Directions Prayer", attribution: "an Anglican priest of the Cree and Dene people, western Canada", note: "An indigenous prayer. The guide asks that its liturgical use be considered carefully and with respect, adapting the naming of geography for your area.", text: "Jesus Christ is the light of the world, a light no darkness can extinguish. We thank you Creator for the Medicine you send from the Four Sacred Directions, the Medicine you send in your son Jesus Christ. We thank you for the reminder that we are one with Mother Earth and with all of Creation. We ask you to remind us always to be humble, to walk gently on the back of Mother Earth. We pray today for the strengthening, the health and the wellbeing of the two-leggeds, the four-leggeds, those that creep, those that swim, those that fly, the male and female of all creation. All My Relations." },
  { title: "A Call to Prayer", attribution: "the Iona Abbey", text: "Eternal God, maker of the skies above, lowly Christ, Lover of the earth and its people, unfettered Spirit, Giver of gracious gifts, you are present among us. O hidden mystery, sun behind all suns, soul within all souls, in all we touch, in all we meet, you are present among us. As bearers of your image, we come to be reshaped; dependent on your mercy, we ask to be made new." },
];

// ── Scriptural Readings for Creation (guide, pp. 121, 144) — Scripture, public
//    domain. Rotated into the office in place of the Gospel/NT reading. ───────
export const CREATION_READINGS: CreationReading[] = [
  { ref: "Romans 8:19-23", note: "The whole creation groans in labor" },
  { ref: "Romans 12:9-21", note: "Be zealous for God's reign of peace and healing" },
  { ref: "Romans 13:8-14", note: "Love all Creation as ourselves, doing no wrong" },
  { ref: "Romans 14:1-12", note: "Affirm all in God's work, beginner to mature" },
  { ref: "Galatians 6:14-18", note: "Boast only of the cross; New Creation is all" },
  { ref: "Philippians 1:21-30", note: "Live worthy of the gospel of New Creation" },
  { ref: "Philippians 2:1-13", note: "Let us join and serve creation as Christ for us" },
  { ref: "Genesis 1:1-2:4a", note: "A Song of Creation — the seven days" },
  { ref: "Genesis 28:10-17", note: "Jacob: descendants & the presence of God" },
  { ref: "Proverbs 3:1-6", note: "Follow teachings for long life & abundant welfare" },
];

export function creationReadingFor(seq: number): CreationReading {
  return CREATION_READINGS[((seq % CREATION_READINGS.length) + CREATION_READINGS.length) % CREATION_READINGS.length];
}
export function creationBlessingFor(seq: number): CreationBlessing {
  return CREATION_BLESSINGS[((seq % CREATION_BLESSINGS.length) + CREATION_BLESSINGS.length) % CREATION_BLESSINGS.length];
}
export function creationQuoteFor(seq: number): CreationQuote {
  return CREATION_QUOTES[((seq % CREATION_QUOTES.length) + CREATION_QUOTES.length) % CREATION_QUOTES.length];
}

/** A deterministic office sequence number for a date + side — drives the
 *  reading / blessing / quote rotations (varies morning vs evening). */
export function creationOfficeSeq(date: Date, side: CreationSide): number {
  const { week, weekday } = creationCyclePosition(date);
  return (week === "A" ? 0 : 1) * 14 + weekday * 2 + (side === "evening" ? 1 : 0);
}

// ── Quotes on Creation (guide, pp. 150–161). Short readings on creation from
//    across the tradition. ─────────────────────────────────────────────────
export const CREATION_QUOTES: CreationQuote[] = [
  { author: "St. Irenaeus of Lyons", source: "Against Heresies", text: "The initial step for a soul to come to knowledge of God is contemplation of nature." },
  { author: "Tertullian", source: "De Testimonio Animae", text: "Nature is school-mistress, the soul the pupil; and whatever one has taught or the other has learned has come from God — the Teacher of the teacher." },
  { author: "St. Athanasius", source: "On the Incarnation", text: "For no part of creation is left void of God: God has filled all things everywhere." },
  { author: "St. Basil the Great", source: "Hexaemeron", text: "I want creation to penetrate you with so much admiration that wherever you go, the least plant may bring you the clear remembrance of the Creator. One blade of grass or one speck of dust is enough to occupy your entire mind in beholding the art with which it has been made." },
  { author: "St. Ambrose of Milan", source: "De Nabuthe", text: "The world has been created for everyone's use, but you few rich are trying to keep it for yourselves. The earth belongs to all, not just to the rich." },
  { author: "St. Augustine", source: "De Civitate Dei", text: "Some people, in order to discover God, read books. But there is a great book: the very appearance of created things. Look above you! Look below you! Read it. God, whom you want to discover, never wrote that book with ink. Instead He set before your eyes the things that He had made. Can you ask for a louder voice than that?" },
  { author: "Rabbi Abraham ibn Ezra", text: "Wherever I turn my eyes, around on Earth or to the heavens, I see You in the field of stars, I see You in the yield of the land, in every breath and sound, a blade of grass, a simple flower, an echo of Your holy Name." },
  { author: "Hildegard of Bingen", text: "Glance at the sun. See the moon and the stars. Gaze at the beauty of earth's greenings. Now, think. What delight God gives to humankind with all these things. All living creatures are sparks from the radiation of God's brilliance, emerging from God like the rays of the sun." },
  { author: "St. Francis of Assisi", text: "If you have men who will exclude any of God's creatures from the shelter of compassion and pity, you will have men who will deal likewise with their fellow men." },
  { author: "Julian of Norwich", source: "Revelations of Divine Love", text: "I saw three properties in the world: the first is that God made it. The second is that God loveth it. The third is, that God keepeth it. But what beheld I therein? Verily the Maker, the Keeper, the Lover." },
  { author: "Thomas à Kempis", source: "The Imitation of Christ", text: "If thy heart were right, then every creature would be a mirror of life and a book of holy doctrine. There is no creature so small and abject, but it reflects the goodness of God." },
  { author: "St. Teresa of Avila", text: "If we learn to love the earth, we will find labyrinths, gardens, fountains and precious jewels! A whole new world will open itself to us. We will discover what it means to be truly alive." },
  { author: "St. John of the Cross", text: "All the creatures — not the higher creatures alone, but also the lower — each one raises its voice in testimony to that which God is; each one after its manner exalts God, since it has God in itself." },
  { author: "Joseph Hall", source: "Anglican Bishop", text: "How endless is that volume that God hath written of the world! Every creature is a letter, every day a new page." },
  { author: "Jacob Boehme", source: "The Way to Christ", text: "Open your eyes, and behold, the whole world is full of God." },
  { author: "George Herbert", source: "Providence", text: "Thou art in small things great, not small in any: thy even praise can neither rise, nor fall. Thou art in all things one, in each thing many: for thou art infinite in one and all." },
  { author: "John Wesley", text: "I believe in my heart that faith in Jesus Christ can and will lead us beyond an exclusive concern for the well-being of other human beings to the broader concern for the well-being of the birds in our backyards, the fish in our rivers, and every living creature on the face of the earth." },
  { author: "Rabbi Nachman of Bratslav", text: "Master of the Universe, grant me the ability to be alone; may it be my custom to go outdoors each day among the trees and grass — among all growing things — and there may I be alone, and enter into prayer, to talk with the one to whom I belong." },
  { author: "Ralph Waldo Emerson", text: "All that I have ever seen teaches me to trust the Creator for all that I have not seen." },
  { author: "Simone Weil", source: "Waiting for God", text: "The beauty of the world is Christ's tender smile for us coming through matter." },
  { author: "Evelyn Underhill", source: "Anglican mystic", text: "In the created world around us we see the Eternal Artist, Eternal Love at work." },
  { author: "Albert Schweitzer", source: "Reverence for Life", text: "The harvested fields bathed in the autumn mists speak of God and his goodness far more vividly than any human lips." },
  { author: "Dorothy Sayers", source: "Why Work?", text: "A society in which consumption has to be artificially stimulated in order to keep production going is a society founded on trash and waste, and such a society is a house built upon sand." },
  { author: "Jürgen Moltmann", source: "God in Creation", text: "The whole creation is a fabric woven and shot through by the efficacies of the Spirit." },
  { author: "Thich Nhat Hanh", source: "Love Letter to the Earth", text: "At this very moment, the Earth is above you, below you, all around you, and even inside you. The water in our flesh, the rock in our bones, we all are part of the Earth, and we carry her within us." },
  { author: "Archbishop Desmond Tutu", source: "God Has A Dream", text: "The first law of our being is that we are set in a delicate network of interdependence with our fellow human beings and with the rest of God's creation." },
  { author: "Wendell Berry", source: "The Gift of Good Land", text: "To live, we must daily break the body and shed the blood of Creation. When we do this knowingly, lovingly, skillfully, reverently, it is a sacrament. When we do it ignorantly, greedily, clumsily, destructively, it is a desecration." },
  { author: "Henry David Thoreau", source: "Walden", text: "Heaven is under our feet as well as over our heads." },
  { author: "Helen Keller", source: "The Story of My Life", text: "Everything in nature has its wonders, even darkness and silence, and I learn, whatever state I may be in, therein to be content." },
  { author: "Robin Wall Kimmerer", source: "Braiding Sweetgrass", text: "Restoration is imperative for healing the earth, but reciprocity is imperative for long-lasting, successful restoration." },
];

// ── Canticles (guide, Songs of Praise & Canticles, pp. 107–109) — Morning
//    rotates through the creation canticles + BCP Canticle 12 (all public
//    domain: St. Francis 13th c., Hopkins 1877, BCP; the Greeting is a
//    gift-licensed guide composition). NO EOW canticles (© Church Publishing).
export const CREATION_CANTICLES: CreationCanticle[] = [
  {
    title: "A Song of Creation",
    attribution: "Canticle 12, BCP (Benedicite, omnia opera Domini)",
    text:
      "Glorify the Lord, all you works of the Lord, *\n   praise him and highly exalt him for ever.\n" +
      "In the firmament of his power, glorify the Lord, *\n   praise him and highly exalt him for ever.\n" +
      "Glorify the Lord, O sun and moon and stars of the sky, *\n   praise him and highly exalt him for ever.\n" +
      "Glorify the Lord, every shower of rain and fall of dew, *\n   all winds and fire and heat.\n" +
      "Glorify the Lord, O mountains and hills, and all that grows upon the earth, *\n   praise him and highly exalt him for ever.\n" +
      "Glorify the Lord, O springs of water, seas, and streams, *\n   O whales and all that move in the waters.\n" +
      "All birds of the air, glorify the Lord, *\n   praise him and highly exalt him for ever.\n" +
      "Glorify the Lord, O beasts of the wild, *\n   and all you flocks and herds.\n" +
      "O men and women everywhere, glorify the Lord, *\n   praise him and highly exalt him for ever.\n" +
      "Let us glorify the Lord: Father, Son, and Holy Spirit; *\n   praise him and highly exalt him for ever.",
  },
  {
    title: "The Canticle of Brother Sun and Sister Moon",
    attribution: "St. Francis of Assisi",
    text:
      "Most High, all-powerful, all-good Lord, all praise is Yours, all glory, all honor and all blessings.\n\n" +
      "Praised be You, my Lord, with all Your creatures, especially Sir Brother Sun, who is the day and through whom You give us light; and he is beautiful and radiant with great splendor: of You, Most High, he bears the likeness.\n\n" +
      "Praised be You, my Lord, through Sister Moon and the stars; in the heavens You have made them bright, precious and fair.\n\n" +
      "Praised be You, my Lord, through Brothers Wind and Air, and fair and stormy, all weather's moods, by which You cherish all that You have made.\n\n" +
      "Praised be You, my Lord, through Sister Water, so useful, humble, precious and pure.\n\n" +
      "Praised be You, my Lord, through Brother Fire, through whom You light the night, and he is beautiful and playful and robust and strong.\n\n" +
      "Praised be You, my Lord, through our Sister, Mother Earth, who sustains and governs us, producing varied fruits with colored flowers and herbs.\n\n" +
      "Praise and bless my Lord, and give Him thanks, and serve Him with great humility.",
  },
  {
    title: "God's Grandeur",
    attribution: "Gerard Manley Hopkins",
    text:
      "The world is charged with the grandeur of God.\n" +
      "   It will flame out, like shining from shook foil;\n" +
      "   It gathers to a greatness, like the ooze of oil\n" +
      "Crushed. Why do men then now not reck his rod?\n" +
      "Generations have trod, have trod, have trod;\n" +
      "   And all is seared with trade; bleared, smeared with toil;\n" +
      "   And wears man's smudge and shares man's smell: the soil\n" +
      "Is bare now, nor can foot feel, being shod.\n\n" +
      "And for all this, nature is never spent;\n" +
      "   There lives the dearest freshness deep down things;\n" +
      "And though the last lights off the black West went\n" +
      "   Oh, morning, at the brown brink eastward, springs —\n" +
      "Because the Holy Ghost over the bent\n" +
      "   World broods with warm breast and with ah! bright wings.",
  },
  {
    title: "A Greeting for Creation",
    attribution: CREATION_ATTRIBUTION,
    text:
      "Greetings in the name of our God who is good: *\n   whose love endures forever.\n" +
      "Greetings to you, sun and moon, you stars of the sky: *\n   give to our God your thanks and praise.\n" +
      "Sunrise and sunset, night and day: *\n   give to our God your thanks and praise.\n" +
      "Greetings to you, hills and valleys, rivers and ponds, sea and rain: *\n   give to our God your thanks and praise.\n" +
      "Greetings to you, oak and pine, hemlock and birch: *\n   give to our God your thanks and praise.\n" +
      "Greetings to you, hawks and sparrows, ravens and crows: *\n   give to our God your thanks and praise.\n" +
      "Greetings to you, bears and deer, chipmunks and squirrels: *\n   give to our God your thanks and praise.\n" +
      "Greetings to you, people of all genders, elders and children, the diverse cultures of this rainbow land, all who care and love and pray: *\n   give to our God your thanks and praise. Amen.",
  },
];

// ── Affirmations of Faith (guide, pp. 111–113) — Evening rotates through these
//    three + the Nicene Creed. Colossians is Scripture (PD); St. Patrick is
//    ancient (PD); the Nicene Creed is BCP (PD); the South Indian profession is
//    a gift-licensed guide composition.
export const CREATION_AFFIRMATIONS: CreationAffirmation[] = [
  {
    title: "A Profession of Faith",
    attribution: "South Indian",
    text:
      "We believe in God, who creates all things, who embraces all things, who celebrates all things, who is present in every part of the fabric of creation.\n\n" +
      "We believe in God as the source of all life, who baptizes this planet with living water.\n\n" +
      "We believe in Jesus Christ, the suffering one, the poor one, the malnourished one, the climate refugee, who loves and cares for this world and who suffers with it. And we believe in Jesus Christ, the seed of life, who came to reconcile and renew this world and everything in it.\n\n" +
      "We believe in the Holy Spirit, the breath of God, who moves with God and who moves among and with us today.\n\n" +
      "We believe in everlasting life in God. And we believe in the hope that one day God will put an end to death and all destructive forces.",
  },
  {
    title: "An Affirmation of Faith",
    attribution: "Colossians 1:15-20",
    text:
      "Jesus Christ is the image of the invisible God, the firstborn of all creation.\n" +
      "For in him all things in heaven and on earth were created: things visible and invisible, whether thrones or dominions or rulers or powers; all things have been created through him and for him.\n" +
      "He himself is before all things, and in him all things hold together.\n" +
      "And he is the head of the body, the church; he is the beginning, the firstborn from among the dead, so that he might come to have first place in everything.\n" +
      "For in him all the fullness of God was pleased to dwell, and through him God was pleased to reconcile to himself all things, whether on earth or in heaven, by making peace through the blood of his cross.",
  },
  {
    title: "A Confession of St. Patrick",
    attribution: "attributed to St. Patrick, 5th c.",
    text:
      "Our God, God of all people, God of heaven and earth, sea and rivers, God of sun and moon, of all stars, God of highest mountain, of deepest valleys, God over heaven and in heaven and under heaven.\n\n" +
      "He has his dwelling in heaven and earth and sea and all that is in them. He inspires all, he gives life to all, he surpasses all, he upholds all.\n\n" +
      "He ignites the light of the sun. He surrounds the stars and tells them to shine. He makes fountains in dry lands, and dry islands in the sea, and stars to serve the greater lights.\n\n" +
      "He has a Son, coeternal with him and like him. The Son is not younger than the Father, neither is the Father older than the Son. And the Holy Spirit breathes in them. Not separate are the Father and Son and Holy Spirit.",
  },
  {
    title: "The Nicene Creed",
    attribution: "BCP p. 358",
    text:
      "We believe in one God, the Father, the Almighty, maker of heaven and earth, of all that is, seen and unseen.\n\n" +
      "We believe in one Lord, Jesus Christ, the only Son of God, eternally begotten of the Father, God from God, Light from Light, true God from true God, begotten, not made, of one Being with the Father. Through him all things were made.\n\n" +
      "For us and for our salvation he came down from heaven: by the power of the Holy Spirit he became incarnate from the Virgin Mary, and was made man.\n\n" +
      "For our sake he was crucified under Pontius Pilate; he suffered death and was buried. On the third day he rose again in accordance with the Scriptures; he ascended into heaven and is seated at the right hand of the Father. He will come again in glory to judge the living and the dead, and his kingdom will have no end.\n\n" +
      "We believe in the Holy Spirit, the Lord, the giver of life, who proceeds from the Father and the Son. With the Father and the Son he is worshiped and glorified. He has spoken through the Prophets. We believe in one holy catholic and apostolic Church. We acknowledge one baptism for the forgiveness of sins. We look for the resurrection of the dead, and the life of the world to come. Amen.",
  },
];

// ── Litanies for Creation (guide, pp. 93–105). The guide's rubric: "One of the
//    following may be said according to the instructions for the Great Litany in
//    the BCP (pp. 148–155), and may be concluded with one of the Collects" —
//    which is why a rotating litany here flows straight into the closing collect.
export const CREATION_LITANIES: CreationLitany[] = [
  {
    title: "A Litany for Creation and All Creatures",
    intro: "For all creatures, named and unnamed, whose lives have blessed our own, we give you thanks. Silence is kept.",
    lines: [
      { v: "Holy God, Creator of heaven and earth,", r: "Have mercy on us." },
      { v: "Holy and Mighty, Redeemer of the world,", r: "Have mercy on us." },
      { v: "Holy Immortal One, Sanctifier of the faithful,", r: "Have mercy on us." },
      { v: "Grant that all your creatures may thank and serve you;", r: "Shower your blessing on earth, O God." },
      { v: "Grant favorable weather, temperate rain, and fruitful seasons, providing food and drink for all your creatures;", r: "Shower your blessing on earth, O God." },
      { v: "Open our eyes to the joy and beauty of creation, that we may see your presence in all your works;", r: "Shower your blessing on earth, O God." },
      { v: "Make us faithful stewards of creation, wisely caring for the earth, the air, the seas, and all the life they bear;", r: "Shower your blessing on earth, O God." },
      { v: "Forgive us our waste and pollution of creation, and strengthen us to heal the wounds we have inflicted;", r: "Shower your blessing on earth, O God." },
    ],
  },
  {
    title: "A Litany of Lament and Repentance",
    lines: [
      { v: "O God of the whole of creation, you have created land and trees, animals and all living creatures; yet we destroy the forests, and the voices of the birds and forest dwellers are silenced. We turn to you in sorrow and repentance.", r: "Lord in your mercy, hear our prayer." },
      { v: "You created the wonders of the ocean; yet the seas are warming and drown in plastic, and their voices are being stilled. Please help us to care for the oceans, the land, and the forest, and open our eyes to their blessing.", r: "Lord in your mercy, hear our prayer." },
      { v: "Mothering Earth, our Sister, you sustain and govern us; yet we have silenced the voices of your people, especially the protectors of the Earth. May we learn to treasure and protect the web of life.", r: "Lord in your mercy, hear our prayer." },
      { v: "Forgive us for the human activities which have overpowered the weather and caused destruction of our environment. We turn to you in sorrow and repentance.", r: "Lord in your mercy, hear our prayer." },
    ],
  },
  {
    title: "The Great Litany of Creation",
    intro: "We come before you in this time of deepening social and climate crisis to confess our complicity, to pray for those most affected, and to ask for courage to act.",
    lines: [
      { v: "God the Creator of all,", r: "Have mercy upon us." },
      { v: "God the Incarnate Word, present in Creation from the beginning,", r: "Have mercy upon us." },
      { v: "God the Spirit of truth and forgiveness,", r: "Have mercy upon us." },
      { v: "We confess that we have not valued your air, which sustains every breath, and have instead polluted it, causing catastrophic climate change;", r: "Have mercy on us, merciful God." },
      { v: "We confess that we have wasted and polluted water, the drink of life, choking the seas with plastic and poison;", r: "Have mercy on us, merciful God." },
      { v: "We confess that we have abused the soil, the Earth mother who provides food for all land creatures;", r: "Have mercy on us, merciful God." },
      { v: "We confess that we have caused the deaths of countless creatures and wiped out whole species, through loss of habitat, overfishing, and pollution;", r: "Have mercy on us, merciful God." },
      { v: "Free us from the gods of greed, and from the lie that what we own is ours to abuse;", r: "Gracious God, deliver us." },
      { v: "Free us from despair and paralyzing fear, and from caring only for our own well-being while others suffer;", r: "Gracious God, deliver us." },
      { v: "That we may have a renewed and restored relationship to all of Creation, we pray,", r: "Hear us, O God of life." },
      { v: "That we may be filled with the courage to change and the commitment to act, we pray,", r: "Hear us, O God of life." },
    ],
  },
];

const wrap = (n: number, len: number) => ((n % len) + len) % len;
export function creationCanticleFor(seq: number): CreationCanticle { return CREATION_CANTICLES[wrap(seq, CREATION_CANTICLES.length)]; }
export function creationAffirmationFor(seq: number): CreationAffirmation { return CREATION_AFFIRMATIONS[wrap(seq, CREATION_AFFIRMATIONS.length)]; }
export function creationLitanyFor(seq: number): CreationLitany { return CREATION_LITANIES[wrap(seq, CREATION_LITANIES.length)]; }
