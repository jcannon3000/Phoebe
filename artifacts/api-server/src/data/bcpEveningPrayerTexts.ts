/**
 * Evening Prayer BCP Texts — hardcoded from BCP 1979 Rite II
 *
 * These are embedded directly so EP never depends on DB seeding.
 * All texts are from the Book of Common Prayer, public domain.
 */

export interface BcpText {
  content: string;
  title: string;
  bcpReference: string;
}

// Re-export the full lookup
export const EP_BCP_TEXTS: Record<string, BcpText> = {};

// Helper to register
function t(key: string, title: string, ref: string, content: string) {
  EP_BCP_TEXTS[key] = { title, bcpReference: ref, content };
}

// ── Opening Sentences ─────────────────────────────────────────────────────

t("opening_sentence_advent_1", "Opening Sentence", "BCP p. 115",
  "Watch, for you do not know when the master of the house will come, in the evening, or at midnight, or at cockcrow, or in the morning; lest he come suddenly and find you asleep. \u2014 Mark 13:35,36");

t("opening_sentence_advent_2", "Opening Sentence", "BCP p. 115",
  "In the wilderness prepare the way of the Lord, make straight in the desert a highway for our God. \u2014 Isaiah 40:3");

t("opening_sentence_advent_3", "Opening Sentence", "BCP p. 115",
  "The glory of the Lord shall be revealed, and all flesh shall see it together. \u2014 Isaiah 40:5");

t("opening_sentence_christmas_1", "Opening Sentence", "BCP p. 115",
  "Behold, I bring you good news of a great joy which will come to all the people; for to you is born this day in the city of David, a Savior, who is Christ the Lord. \u2014 Luke 2:10,11");

t("opening_sentence_christmas_2", "Opening Sentence", "BCP p. 115",
  "Behold, the dwelling of God is with mankind. He will dwell with them, and they shall be his people, and God himself will be with them, and be their God. \u2014 Revelation 21:3");

t("opening_sentence_epiphany_1", "Opening Sentence", "BCP p. 115",
  "Nations shall come to your light, and kings to the brightness of your rising. \u2014 Isaiah 60:3");

t("opening_sentence_epiphany_2", "Opening Sentence", "BCP p. 115",
  "I will give you as a light to the nations, that my salvation may reach to the end of the earth. \u2014 Isaiah 49:6b");

t("opening_sentence_epiphany_3", "Opening Sentence", "BCP p. 115",
  "Arise, shine; for your light has come, and the glory of the Lord has risen upon you. \u2014 Isaiah 60:1");

t("opening_sentence_lent_1", "Opening Sentence", "BCP p. 115",
  "If we say we have no sin, we deceive ourselves, and the truth is not in us; but if we confess our sins, God, who is faithful and just, will forgive our sins and cleanse us from all unrighteousness. \u2014 1 John 1:8,9");

t("opening_sentence_lent_2", "Opening Sentence", "BCP p. 115",
  "Rend your hearts and not your garments. Return to the Lord your God, for he is gracious and merciful, slow to anger and abounding in steadfast love, and repents of evil. \u2014 Joel 2:13");

t("opening_sentence_lent_3", "Opening Sentence", "BCP p. 115",
  "I will arise and go to my father, and I will say to him, Father, I have sinned against heaven and before you; I am no more worthy to be called your son. \u2014 Luke 15:18,19");

t("opening_sentence_lent_4", "Opening Sentence", "BCP p. 115",
  "To the Lord our God belong mercy and forgiveness, because we have rebelled against him and have not obeyed the voice of the Lord our God. \u2014 Daniel 9:9,10");

t("opening_sentence_lent_5", "Opening Sentence", "BCP p. 115",
  "The Lord is merciful and gracious, slow to anger and abounding in steadfast love. As a father pities his children, so the Lord pities those who fear him. \u2014 Psalm 103:8,13");

t("opening_sentence_holyweek_1", "Opening Sentence", "BCP p. 115",
  "Is it nothing to you, all you who pass by? Look and see if there is any sorrow like my sorrow which was brought upon me, which the Lord inflicted on the day of his fierce anger. \u2014 Lamentations 1:12");

t("opening_sentence_holyweek_2", "Opening Sentence", "BCP p. 115",
  "All we like sheep have gone astray; we have turned every one to his own way; and the Lord has laid on him the iniquity of us all. \u2014 Isaiah 53:6");

t("opening_sentence_easter_1", "Opening Sentence", "BCP p. 115",
  "Alleluia! The Lord is risen indeed: Come let us adore him. Alleluia!");

t("opening_sentence_easter_2", "Opening Sentence", "BCP p. 115",
  "On this day the Lord has acted; we will rejoice and be glad in it. \u2014 Psalm 118:24");

t("opening_sentence_easter_3", "Opening Sentence", "BCP p. 115",
  "If then you have been raised with Christ, seek the things that are above, where Christ is, seated at the right hand of God. \u2014 Colossians 3:1");

t("opening_sentence_easter_4", "Opening Sentence", "BCP p. 115",
  "Christ is risen from the dead, trampling down death by death, and giving life to those in the tomb.");

t("opening_sentence_easter_5", "Opening Sentence", "BCP p. 115",
  "Thanks be to God, who gives us the victory through our Lord Jesus Christ. \u2014 1 Corinthians 15:57");

t("opening_sentence_anytime_1", "Opening Sentence", "BCP p. 115",
  "Grace to you and peace from God our Father and the Lord Jesus Christ. \u2014 Philippians 1:2");

t("opening_sentence_anytime_2", "Opening Sentence", "BCP p. 115",
  "I was glad when they said to me, \"Let us go to the house of the Lord.\" \u2014 Psalm 122:1");

t("opening_sentence_anytime_3", "Opening Sentence", "BCP p. 115",
  "Let the words of my mouth and the meditation of my heart be acceptable in your sight, O Lord, my strength and my redeemer. \u2014 Psalm 19:14");

t("opening_sentence_anytime_4", "Opening Sentence", "BCP p. 115",
  "Send out your light and your truth, that they may lead me, and bring me to your holy hill and to your dwelling. \u2014 Psalm 43:3");

t("opening_sentence_anytime_5", "Opening Sentence", "BCP p. 115",
  "The Lord is in his holy temple; let all the earth keep silence before him. \u2014 Habakkuk 2:20");

t("opening_sentence_anytime_6", "Opening Sentence", "BCP p. 115",
  "O worship the Lord in the beauty of holiness; let the whole earth stand in awe of him. \u2014 Psalm 96:9");

t("opening_sentence_anytime_7", "Opening Sentence", "BCP p. 115",
  "Seek him who made the Pleiades and Orion, and turns deep darkness into the morning, and darkens the day into night; who calls for the waters of the sea and pours them out upon the surface of the earth: The Lord is his name. \u2014 Amos 5:8");

// ── Confession & Absolution ───────────────────────────────────────────────

t("confession_text", "Confession of Sin", "BCP p. 116",
  "Most merciful God,\nwe confess that we have sinned against you\nin thought, word, and deed,\nby what we have done,\nand by what we have left undone.\nWe have not loved you with our whole heart;\nwe have not loved our neighbors as ourselves.\nWe are truly sorry and we humbly repent.\nFor the sake of your Son Jesus Christ,\nhave mercy on us and forgive us;\nthat we may delight in your will,\nand walk in your ways,\nto the glory of your Name. Amen.");

t("confession_absolution", "Absolution", "BCP p. 117",
  "Almighty God have mercy on you, forgive you all your sins through our Lord Jesus Christ, strengthen you in all goodness, and by the power of the Holy Spirit keep you in eternal life. Amen.");

// ── Phos hilaron ──────────────────────────────────────────────────────────

t("phos_hilaron", "O Gracious Light", "BCP p. 118",
  "O gracious light,\npure brightness of the everliving Father in heaven,\nO Jesus Christ, holy and blessed!\n\nNow as we come to the setting of the sun,\nand our eyes behold the vesper light,\nwe sing your praises, O God: Father, Son, and Holy Spirit.\n\nYou are worthy at all times to be praised by happy voices,\nO Son of God, O Giver of Life,\nand to be glorified through all the worlds.");

// ── Canticles ─────────────────────────────────────────────────────────────

t("canticle_8", "The Song of Moses", "BCP p. 85",
  "I will sing to the Lord, for he is lofty and uplifted; *\n  the horse and its rider has he hurled into the sea.\nThe Lord is my strength and my refuge; *\n  the Lord has become my Savior.\nThis is my God and I will praise him, *\n  the God of my people and I will exalt him.\nThe Lord is a mighty warrior; *\n  Yahweh is his Name.\nThe chariots of Pharaoh and his army has he hurled into the sea; *\n  the finest of those who bear armor have been drowned in the Red Sea.\nThe fathomless deep has overwhelmed them; *\n  they sank into the depths like a stone.\nYour right hand, O Lord, is glorious in might; *\n  your right hand, O Lord, has overthrown the enemy.\nWho can be compared with you, O Lord, among the gods? *\n  who is like you, glorious in holiness,\n  awesome in renown, and worker of wonders?\nYou stretched forth your right hand; *\n  the earth swallowed them up.\nWith your constant love you led the people you redeemed; *\n  with your might you brought them in safety to your holy dwelling.\nYou will bring them in and plant them *\n  on the mount of your possession,\nThe resting-place you have made for yourself, O Lord, *\n  the sanctuary, O Lord, that your hand has established.\nThe Lord shall reign *\n  for ever and for ever.");

t("canticle_9", "The First Song of Isaiah", "BCP p. 86",
  "Surely, it is God who saves me; *\n  I will trust in him and not be afraid.\nFor the Lord is my stronghold and my sure defense, *\n  and he will be my Savior.\nTherefore you shall draw water with rejoicing *\n  from the springs of salvation.\nAnd on that day you shall say, *\n  Give thanks to the Lord and call upon his Name;\nMake his deeds known among the peoples; *\n  see that they remember that his Name is exalted.\nSing the praises of the Lord, for he has done great things, *\n  and this is known in all the world.\nCry aloud, inhabitants of Zion, ring out your joy, *\n  for the great one in the midst of you is the Holy One of Israel.");

t("canticle_10", "The Second Song of Isaiah", "BCP p. 86",
  "Seek the Lord while he wills to be found; *\n  call upon him when he draws near.\nLet the wicked forsake their ways *\n  and the evil ones their thoughts;\nAnd let them turn to the Lord, and he will have compassion, *\n  and to our God, for he will richly pardon.\nFor my thoughts are not your thoughts, *\n  nor your ways my ways, says the Lord.\nFor as the heavens are higher than the earth, *\n  so are my ways higher than your ways,\n  and my thoughts than your thoughts.\nFor as rain and snow fall from the heavens *\n  and return not again, but water the earth,\nBringing forth life and giving growth, *\n  seed for sowing and bread for eating,\nSo is my word that goes forth from my mouth; *\n  it will not return to me empty;\nBut it will accomplish that which I have purposed, *\n  and prosper in that for which I sent it.");

t("canticle_11", "The Third Song of Isaiah", "BCP p. 87",
  "Arise, shine, for your light has come, *\n  and the glory of the Lord has dawned upon you.\nFor behold, darkness covers the land; *\n  deep gloom enshrouds the peoples.\nBut over you the Lord will rise, *\n  and his glory will appear upon you.\nNations will stream to your light, *\n  and kings to the brightness of your dawning.\nYour gates will always be open; *\n  by day or night they will never be shut.\nThey will call you, The City of the Lord, *\n  The Zion of the Holy One of Israel.\nViolence will no more be heard in your land, *\n  ruin or destruction within your borders.\nYou will call your walls, Salvation, *\n  and all your portals, Praise.\nThe sun will no more be your light by day; *\n  by night you will not need the brightness of the moon.\nThe Lord will be your everlasting light, *\n  and your God will be your glory.");

t("canticle_13", "A Song of Praise", "BCP p. 90",
  "Glory to you, Lord God of our fathers; *\n  you are worthy of praise; glory to you.\nGlory to you for the radiance of your holy Name; *\n  we will praise you and highly exalt you for ever.\n\nGlory to you in the splendor of your temple; *\n  on the throne of your majesty, glory to you.\nGlory to you, seated between the Cherubim; *\n  we will praise you and highly exalt you for ever.\n\nGlory to you, beholding the depths; *\n  in the high vault of heaven, glory to you.\nGlory to you, Father, Son, and Holy Spirit; *\n  we will praise you and highly exalt you for ever.");

t("canticle_14", "A Song of Penitence", "BCP p. 90",
  "O Lord and Ruler of the hosts of heaven, *\n  God of Abraham, Isaac, and Jacob,\n  and of all their righteous offspring:\nYou made the heavens and the earth, *\n  with all their vast array.\nAll things quake with fear at your presence; *\n  they tremble because of your power.\nBut your merciful promise is beyond all measure; *\n  it surpasses all that our minds can fathom.\nO Lord, you are full of compassion, *\n  long-suffering, and abounding in mercy.\nYou hold back your hand; *\n  you do not punish as we deserve.\nIn your great goodness, Lord, *\n  you have promised forgiveness to sinners,\n  that they may repent of their sin and be saved.");

t("canticle_15", "The Song of Mary", "BCP p. 119",
  "My soul proclaims the greatness of the Lord,\nmy spirit rejoices in God my Savior; *\n  for he has looked with favor on his lowly servant.\nFrom this day all generations will call me blessed: *\n  the Almighty has done great things for me,\n  and holy is his Name.\nHe has mercy on those who fear him *\n  in every generation.\nHe has shown the strength of his arm, *\n  he has scattered the proud in their conceit.\nHe has cast down the mighty from their thrones, *\n  and has lifted up the lowly.\nHe has filled the hungry with good things, *\n  and the rich he has sent away empty.\nHe has come to the help of his servant Israel, *\n  for he has remembered his promise of mercy,\nThe promise he made to our fathers, *\n  to Abraham and his children for ever.\n\nGlory to the Father, and to the Son, and to the Holy Spirit: *\n  as it was in the beginning, is now, and will be for ever. Amen.");

t("canticle_17", "The Song of Simeon", "BCP p. 120",
  "Lord, you now have set your servant free *\n  to go in peace as you have promised;\nFor these eyes of mine have seen the Savior, *\n  whom you have prepared for all the world to see:\nA Light to enlighten the nations, *\n  and the glory of your people Israel.\n\nGlory to the Father, and to the Son, and to the Holy Spirit: *\n  as it was in the beginning, is now, and will be for ever. Amen.");

t("canticle_19", "The Song of the Redeemed", "BCP p. 94",
  "O ruler of the universe, Lord God,\n  great deeds are they that you have done, *\n  surpassing human understanding.\nYour ways are ways of righteousness and truth, *\n  O King of all the ages.\nWho can fail to do you homage, Lord,\n  and sing the praises of your Name? *\n  for you only are the Holy One.\nAll nations will draw near and fall down before you, *\n  because your just and holy works have been revealed.");

// ── Creed ─────────────────────────────────────────────────────────────────

t("apostles_creed", "The Apostles\u2019 Creed", "BCP p. 120",
  "I believe in God, the Father almighty,\n  creator of heaven and earth.\nI believe in Jesus Christ, his only Son, our Lord.\n  He was conceived by the power of the Holy Spirit\n    and born of the Virgin Mary.\n  He suffered under Pontius Pilate,\n    was crucified, died, and was buried.\n  He descended to the dead.\n  On the third day he rose again.\n  He ascended into heaven,\n    and is seated at the right hand of the Father.\n  He will come again to judge the living and the dead.\nI believe in the Holy Spirit,\n  the holy catholic Church,\n  the communion of saints,\n  the forgiveness of sins,\n  the resurrection of the body,\n  and the life everlasting. Amen.");

// ── Lord's Prayer ─────────────────────────────────────────────────────────

t("lords_prayer_contemporary", "The Lord\u2019s Prayer", "BCP p. 121",
  "Our Father in heaven,\n  hallowed be your Name,\n  your kingdom come,\n  your will be done,\n    on earth as in heaven.\nGive us today our daily bread.\nForgive us our sins\n  as we forgive those\n    who sin against us.\nSave us from the time of trial,\n  and deliver us from evil.\nFor the kingdom, the power,\n  and the glory are yours,\n  now and for ever. Amen.");

// ── Suffrages ─────────────────────────────────────────────────────────────

t("suffrages_a", "Suffrages A", "BCP p. 121",
  "V. Show us your mercy, O Lord;\nR. And grant us your salvation.\nV. Clothe your ministers with righteousness;\nR. Let your people sing with joy.\nV. Give peace, O Lord, in all the world;\nR. For only in you can we live in safety.\nV. Lord, keep this nation under your care;\nR. And guide us in the way of justice and truth.\nV. Let your way be known upon earth;\nR. Your saving health among all nations.\nV. Let not the needy, O Lord, be forgotten;\nR. Nor the hope of the poor be taken away.\nV. Create in us clean hearts, O God;\nR. And sustain us with your Holy Spirit.");

t("suffrages_b", "Suffrages B", "BCP p. 122",
  "V. Save your people, Lord, and bless your inheritance;\nR. Govern and uphold them, now and always.\nV. Day by day we bless you;\nR. We praise your name for ever.\nV. Lord, keep us from all sin today;\nR. Have mercy on us, Lord, have mercy.\nV. Lord, show us your love and mercy;\nR. For we put our trust in you.\nV. In you, Lord, is our hope;\nR. And we shall never hope in vain.");

// ── EP Collects ───────────────────────────────────────────────────────────

t("collect_for_peace_ep", "A Collect for Peace", "BCP p. 123",
  "Most holy God, the source of all good desires, all right judgements, and all just works: Give to us, your servants, that peace which the world cannot give, so that our minds may be fixed on the doing of your will, and that we, being delivered from the fear of all enemies, may live in peace and quietness; through the mercies of Christ Jesus our Savior. Amen.");

t("collect_for_aid_ep", "A Collect for Aid against Perils", "BCP p. 123",
  "Be our light in the darkness, O Lord, and in your great mercy defend us from all perils and dangers of this night; for the love of your only Son, our Savior Jesus Christ. Amen.");

// ── Prayers for Mission ───────────────────────────────────────────────────

t("prayer_mission_1", "A Prayer for Mission", "BCP p. 124",
  "Almighty and everlasting God, by whose Spirit the whole body of your faithful people is governed and sanctified: Receive our supplications and prayers which we offer before you for all members of your holy Church, that in their vocation and ministry they may truly and devoutly serve you; through our Lord and Savior Jesus Christ. Amen.");

t("prayer_mission_2", "A Prayer for Mission", "BCP p. 124",
  "O God, you have made of one blood all the peoples of the earth, and sent your blessed Son to preach peace to those who are far off and to those who are near: Grant that people everywhere may seek after you and find you; bring the nations into your fold; pour out your Spirit upon all flesh; and hasten the coming of your kingdom; through Jesus Christ our Lord. Amen.");

t("prayer_mission_3", "A Prayer for Mission", "BCP p. 124",
  "Lord Jesus Christ, you stretched out your arms of love on the hard wood of the cross that everyone might come within the reach of your saving embrace: So clothe us in your Spirit that we, reaching forth our hands in love, may bring those who do not know you to the knowledge and love of you; for the honor of your Name. Amen.");

// ── General Thanksgiving ──────────────────────────────────────────────────

t("general_thanksgiving", "The General Thanksgiving", "BCP p. 125",
  "Almighty God, Father of all mercies,\nwe your unworthy servants give you humble thanks\nfor all your goodness and loving-kindness\nto us and to all whom you have made.\nWe bless you for our creation, preservation,\nand all the blessings of this life;\nbut above all for your immeasurable love\nin the redemption of the world by our Lord Jesus Christ;\nfor the means of grace, and for the hope of glory.\nAnd, we pray, give us such an awareness of your mercies,\nthat with truly thankful hearts we may show forth your praise,\nnot only with our lips, but in our lives,\nby giving up our selves to your service,\nand by walking before you\nin holiness and righteousness all our days;\nthrough Jesus Christ our Lord,\nto whom, with you and the Holy Spirit,\nbe honor and glory throughout all ages. Amen.");

// ── Seasonal Collects (most common) ───────────────────────────────────────

t("collect_advent_1", "First Sunday of Advent", "BCP p. 211",
  "Almighty God, give us grace to cast away the works of darkness, and put on the armor of light, now in the time of this mortal life in which your Son Jesus Christ came to visit us in great humility; that in the last day, when he shall come again in his glorious majesty to judge both the living and the dead, we may rise to the life immortal; through him who lives and reigns with you and the Holy Spirit, one God, now and for ever. Amen.");

t("collect_easter_day", "Easter Day", "BCP p. 222",
  "Almighty God, who through your only-begotten Son Jesus Christ overcame death and opened to us the gate of everlasting life: Grant that we, who celebrate with joy the day of the Lord\u2019s resurrection, may be raised from the death of sin by your life-giving Spirit; through Jesus Christ our Lord, who lives and reigns with you and the Holy Spirit, one God, now and for ever. Amen.");

t("collect_pentecost", "Day of Pentecost", "BCP p. 227",
  "Almighty God, on this day you opened the way of eternal life to every race and nation by the promised gift of your Holy Spirit: Shed abroad this gift throughout the world by the preaching of the Gospel, that it may reach to the ends of the earth; through Jesus Christ our Lord, who lives and reigns with you, in the unity of the Holy Spirit, one God, for ever and ever. Amen.");

t("collect_trinity", "Trinity Sunday", "BCP p. 228",
  "Almighty and everlasting God, you have given to us your servants grace, by the confession of a true faith, to acknowledge the glory of the eternal Trinity, and in the power of your divine Majesty to worship the Unity: Keep us steadfast in this faith and worship, and bring us at last to see you in your one and eternal glory, O Father; who with the Son and the Holy Spirit live and reign, one God, for ever and ever. Amen.");

// Fallback collect for when we don't have the specific week's collect
t("collect_fallback", "A Collect for the Renewal of Life", "BCP p. 133",
  "O God, the King eternal, whose light divides the day from the night and turns the shadow of death into the morning: Drive far from us all wrong desires, incline our hearts to keep your law, and guide our feet into the way of peace; that, having done your will with cheerfulness during the day, we may, when night comes, rejoice to give you thanks; through Jesus Christ our Lord. Amen.");
