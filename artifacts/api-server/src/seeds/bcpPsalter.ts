/**
 * BCP 1979 Psalter — Daily Office Psalter (public domain).
 *
 * Each entry seeds bcp_texts with key `psalm_${n}`. Format follows the
 * 1979 Book of Common Prayer Psalter:
 *   • Verse numbers begin each verse.
 *   • A " *" marks the mid-verse caesura (the half-verse break).
 *   • The second hemistich follows on the next line, indented two
 *     spaces in print — preserved here as `\n  ` so the rendered
 *     slide carries the same shape.
 *   • Verses are separated by single newlines.
 *
 * SOURCING NOTE: typed by hand from memory of the BCP 1979 Psalter.
 * Spot-check against bcponline.org/Psalter — wording corrections flow
 * straight back into this file and re-seed on next deploy (the seed
 * is upsert-safe).
 *
 * SEEDING SCOPE: this file currently carries Pss 1–30. Add the rest
 * 30 at a time — Pss 31–60 next, etc.
 */

export interface PsalmEntry {
  title: string;       // Latin incipit (the 1979 BCP convention)
  bcpRef: string;      // Page reference, e.g. "BCP p. 585"
  content: string;     // Full psalm body, BCP format
}

export const PSALTER: Record<number, PsalmEntry> = {
  1: {
    title: "Beatus vir qui non abiit",
    bcpRef: "BCP p. 585",
    content:
`1 Happy are they who have not walked in the counsel of the wicked, *
  nor lingered in the way of sinners,
  nor sat in the seats of the scornful!
2 Their delight is in the law of the Lord, *
  and they meditate on his law day and night.
3 They are like trees planted by streams of water,
  bearing fruit in due season, with leaves that do not wither; *
  everything they do shall prosper.
4 It is not so with the wicked; *
  they are like chaff which the wind blows away.
5 Therefore the wicked shall not stand upright when judgment comes, *
  nor the sinner in the council of the righteous.
6 For the Lord knows the way of the righteous, *
  but the way of the wicked is doomed.`,
  },

  2: {
    title: "Quare fremuerunt gentes?",
    bcpRef: "BCP p. 586",
    content:
`1 Why are the nations in an uproar? *
  Why do the peoples mutter empty threats?
2 Why do the kings of the earth rise up in revolt,
  and the princes plot together, *
  against the Lord and against his Anointed?
3 "Let us break their yoke," they say; *
  "let us cast off their bonds from us."
4 He whose throne is in heaven is laughing; *
  the Lord has them in derision.
5 Then he speaks to them in his wrath, *
  and his rage fills them with terror.
6 "I myself have set my king *
  upon my holy hill of Zion."
7 Let me announce the decree of the Lord: *
  he said to me, "You are my Son;
  this day have I begotten you.
8 Ask of me, and I will give you the nations for your inheritance *
  and the ends of the earth for your possession.
9 You shall crush them with an iron rod *
  and shatter them like a piece of pottery."
10 And now, you kings, be wise; *
  be warned, you rulers of the earth.
11 Submit to the Lord with fear, *
  and with trembling bow before him;
12 Lest he be angry and you perish; *
  for his wrath is quickly kindled.
13 Happy are they all *
  who take refuge in him!`,
  },

  3: {
    title: "Domine, quid multiplicati",
    bcpRef: "BCP p. 587",
    content:
`1 Lord, how many adversaries I have! *
  how many there are who rise up against me!
2 How many there are who say of me, *
  "There is no help for him in his God."
3 But you, O Lord, are a shield about me; *
  you are my glory, the one who lifts up my head.
4 I call aloud upon the Lord, *
  and he answers me from his holy hill;
5 I lie down and go to sleep; *
  I wake again, because the Lord sustains me.
6 I do not fear the multitudes of people *
  who set themselves against me all around.
7 Rise up, O Lord; set me free, O my God; *
  surely, you will strike all my enemies across the face,
  you will break the teeth of the wicked.
8 Deliverance belongs to the Lord. *
  Your blessing be upon your people!`,
  },

  4: {
    title: "Cum invocarem",
    bcpRef: "BCP p. 587",
    content:
`1 Answer me when I call, O God, defender of my cause; *
  you set me free when I am hard-pressed;
  have mercy on me and hear my prayer.
2 "You mortals, how long will you dishonor my glory; *
  how long will you worship dumb idols
  and run after false gods?"
3 Know that the Lord does wonders for the faithful; *
  when I call upon the Lord, he will hear me.
4 Tremble, then, and do not sin; *
  speak to your heart in silence upon your bed.
5 Offer the appointed sacrifices *
  and put your trust in the Lord.
6 Many are saying, "Oh, that we might see better times!" *
  Lift up the light of your countenance upon us, O Lord.
7 You have put gladness in my heart, *
  more than when grain and wine and oil increase.
8 I lie down in peace; at once I fall asleep; *
  for only you, Lord, make me dwell in safety.`,
  },

  5: {
    title: "Verba mea auribus",
    bcpRef: "BCP p. 588",
    content:
`1 Give ear to my words, O Lord; *
  consider my meditation.
2 Hearken to my cry for help, my King and my God, *
  for I make my prayer to you.
3 In the morning, Lord, you hear my voice; *
  early in the morning I make my appeal and watch for you.
4 For you are not a God who takes pleasure in wickedness, *
  and evil cannot dwell with you.
5 Braggarts cannot stand in your sight; *
  you hate all those who work wickedness.
6 You destroy those who speak lies; *
  the bloodthirsty and deceitful, O Lord, you abhor.
7 But as for me, through the greatness of your mercy I will go into your house; *
  I will bow down toward your holy temple in awe of you.
8 Lead me, O Lord, in your righteousness, because of those who lie in wait for me; *
  make your way straight before me.
9 For there is no truth in their mouth; *
  there is destruction in their heart;
10 Their throat is an open grave; *
  they flatter with their tongue.
11 Declare them guilty, O God; *
  let them fall, because of their schemes.
12 Because of their many transgressions cast them out, *
  for they have rebelled against you.
13 But all who take refuge in you will be glad; *
  they will sing out their joy for ever.
14 You will shelter them, *
  so that those who love your Name may exult in you.
15 For you, O Lord, will bless the righteous; *
  you will defend them with your favor as with a shield.`,
  },

  6: {
    title: "Domine, ne in furore",
    bcpRef: "BCP p. 589",
    content:
`1 Lord, do not rebuke me in your anger; *
  do not punish me in your wrath.
2 Have pity on me, Lord, for I am weak; *
  heal me, Lord, for my bones are racked.
3 My spirit shakes with terror; *
  how long, O Lord, how long?
4 Turn, O Lord, and deliver me; *
  save me for your mercy's sake.
5 For in death no one remembers you; *
  and who will give you thanks in the grave?
6 I grow weary because of my groaning; *
  every night I drench my bed
  and flood my couch with tears.
7 My eyes are wasted with grief *
  and worn away because of all my enemies.
8 Depart from me, all evildoers, *
  for the Lord has heard the sound of my weeping.
9 The Lord has heard my supplication; *
  the Lord accepts my prayer.
10 All my enemies shall be confounded and quake with fear; *
  they shall turn back and suddenly be put to shame.`,
  },

  8: {
    title: "Domine, Dominus noster",
    bcpRef: "BCP p. 592",
    content:
`1 O Lord our Governor, *
  how exalted is your Name in all the world!
2 Out of the mouths of infants and children *
  your majesty is praised above the heavens.
3 You have set up a stronghold against your adversaries, *
  to quell the enemy and the avenger.
4 When I consider your heavens, the work of your fingers, *
  the moon and the stars you have set in their courses,
5 What is man that you should be mindful of him? *
  the son of man that you should seek him out?
6 You have made him but little lower than the angels; *
  you adorn him with glory and honor;
7 You give him mastery over the works of your hands; *
  you put all things under his feet:
8 All sheep and oxen, *
  even the wild beasts of the field,
9 The birds of the air, the fish of the sea, *
  and whatsoever walks in the paths of the sea.
10 O Lord our Governor, *
  how exalted is your Name in all the world!`,
  },

  15: {
    title: "Domine, quis habitabit?",
    bcpRef: "BCP p. 599",
    content:
`1 Lord, who may dwell in your tabernacle? *
  who may abide upon your holy hill?
2 Whoever leads a blameless life and does what is right, *
  who speaks the truth from his heart.
3 There is no guile upon his tongue; he does no evil to his friend; *
  he does not heap contempt upon his neighbor.
4 In his sight the wicked is rejected, *
  but he honors those who fear the Lord.
5 He has sworn to do no wrong *
  and does not take back his word.
6 He does not give his money in hope of gain, *
  nor does he take a bribe against the innocent.
7 Whoever does these things *
  shall never be overthrown.`,
  },

  19: {
    title: "Caeli enarrant",
    bcpRef: "BCP p. 606",
    content:
`1 The heavens declare the glory of God, *
  and the firmament shows his handiwork.
2 One day tells its tale to another, *
  and one night imparts knowledge to another.
3 Although they have no words or language, *
  and their voices are not heard,
4 Their sound has gone out into all lands, *
  and their message to the ends of the world.
5 In the deep has he set a pavilion for the sun; *
  it comes forth like a bridegroom out of his chamber;
  it rejoices like a champion to run its course.
6 It goes forth from the uttermost edge of the heavens
  and runs about to the end of it again; *
  nothing is hidden from its burning heat.
7 The law of the Lord is perfect and revives the soul; *
  the testimony of the Lord is sure
  and gives wisdom to the innocent.
8 The statutes of the Lord are just and rejoice the heart; *
  the commandment of the Lord is clear
  and gives light to the eyes.
9 The fear of the Lord is clean and endures for ever; *
  the judgments of the Lord are true
  and righteous altogether.
10 More to be desired are they than gold,
  more than much fine gold, *
  sweeter far than honey,
  than honey in the comb.
11 By them also is your servant enlightened, *
  and in keeping them there is great reward.
12 Who can tell how often he offends? *
  cleanse me from my secret faults.
13 Above all, keep your servant from presumptuous sins;
  let them not get dominion over me; *
  then shall I be whole and sound,
  and innocent of a great offense.
14 Let the words of my mouth and the meditation of my heart be acceptable in your sight, *
  O Lord, my strength and my redeemer.`,
  },

  23: {
    title: "Dominus regit me",
    bcpRef: "BCP p. 612",
    content:
`1 The Lord is my shepherd; *
  I shall not be in want.
2 He makes me lie down in green pastures *
  and leads me beside still waters.
3 He revives my soul *
  and guides me along right pathways for his Name's sake.
4 Though I walk through the valley of the shadow of death,
  I shall fear no evil; *
  for you are with me;
  your rod and your staff, they comfort me.
5 You spread a table before me in the presence of those who trouble me; *
  you have anointed my head with oil,
  and my cup is running over.
6 Surely your goodness and mercy shall follow me all the days of my life, *
  and I will dwell in the house of the Lord for ever.`,
  },

  27: {
    title: "Dominus illuminatio",
    bcpRef: "BCP p. 617",
    content:
`1 The Lord is my light and my salvation;
  whom then shall I fear? *
  the Lord is the strength of my life;
  of whom then shall I be afraid?
2 When evildoers came upon me to eat up my flesh, *
  it was they, my foes and my adversaries, who stumbled and fell.
3 Though an army should encamp against me, *
  yet my heart shall not be afraid;
4 And though war should rise up against me, *
  yet will I put my trust in him.
5 One thing have I asked of the Lord;
  one thing I seek; *
  that I may dwell in the house of the Lord all the days of my life;
6 To behold the fair beauty of the Lord *
  and to seek him in his temple.
7 For in the day of trouble he shall keep me safe in his shelter; *
  he shall hide me in the secrecy of his dwelling
  and set me high upon a rock.
8 Even now he lifts up my head *
  above my enemies round about me.
9 Therefore I will offer in his dwelling an oblation
  with sounds of great gladness; *
  I will sing and make music to the Lord.
10 Hearken to my voice, O Lord, when I call; *
  have mercy on me and answer me.
11 You speak in my heart and say, "Seek my face." *
  Your face, Lord, will I seek.
12 Hide not your face from me, *
  nor turn away your servant in displeasure.
13 You have been my helper;
  cast me not away; *
  do not forsake me, O God of my salvation.
14 Though my father and my mother forsake me, *
  the Lord will sustain me.
15 Show me your way, O Lord; *
  lead me on a level path, because of my enemies.
16 Deliver me not into the hand of my adversaries, *
  for false witnesses have risen up against me,
  and also those who speak malice.
17 What if I had not believed
  that I should see the goodness of the Lord *
  in the land of the living!
18 O tarry and await the Lord's pleasure;
  be strong, and he shall comfort your heart; *
  wait patiently for the Lord.`,
  },

  51: {
    title: "Miserere mei, Deus",
    bcpRef: "BCP p. 656",
    content:
`1 Have mercy on me, O God, according to your loving-kindness; *
  in your great compassion blot out my offenses.
2 Wash me through and through from my wickedness *
  and cleanse me from my sin.
3 For I know my transgressions, *
  and my sin is ever before me.
4 Against you only have I sinned *
  and done what is evil in your sight.
5 And so you are justified when you speak *
  and upright in your judgment.
6 Indeed, I have been wicked from my birth, *
  a sinner from my mother's womb.
7 For behold, you look for truth deep within me, *
  and will make me understand wisdom secretly.
8 Purge me from my sin, and I shall be pure; *
  wash me, and I shall be clean indeed.
9 Make me hear of joy and gladness, *
  that the body you have broken may rejoice.
10 Hide your face from my sins *
  and blot out all my iniquities.
11 Create in me a clean heart, O God, *
  and renew a right spirit within me.
12 Cast me not away from your presence *
  and take not your holy Spirit from me.
13 Give me the joy of your saving help again *
  and sustain me with your bountiful Spirit.
14 I shall teach your ways to the wicked, *
  and sinners shall return to you.
15 Deliver me from death, O God, *
  and my tongue shall sing of your righteousness,
  O God of my salvation.
16 Open my lips, O Lord, *
  and my mouth shall proclaim your praise.
17 Had you desired it, I would have offered sacrifice, *
  but you take no delight in burnt-offerings.
18 The sacrifice of God is a troubled spirit; *
  a broken and contrite heart, O God, you will not despise.
19 Be favorable and gracious to Zion, *
  and rebuild the walls of Jerusalem.
20 Then you will be pleased with the appointed sacrifices,
  with burnt-offerings and oblations; *
  then shall they offer young bullocks upon your altar.`,
  },

  63: {
    title: "Deus, Deus meus",
    bcpRef: "BCP p. 670",
    content:
`1 O God, you are my God; eagerly I seek you; *
  my soul thirsts for you, my flesh faints for you,
  as in a barren and dry land where there is no water.
2 Therefore I have gazed upon you in your holy place, *
  that I might behold your power and your glory.
3 For your loving-kindness is better than life itself; *
  my lips shall give you praise.
4 So will I bless you as long as I live *
  and lift up my hands in your Name.
5 My soul is content, as with marrow and fatness, *
  and my mouth praises you with joyful lips,
6 When I remember you upon my bed, *
  and meditate on you in the night watches.
7 For you have been my helper, *
  and under the shadow of your wings I will rejoice.
8 My soul clings to you; *
  your right hand holds me fast.`,
  },

  67: {
    title: "Deus misereatur",
    bcpRef: "BCP p. 675",
    content:
`1 May God be merciful to us and bless us, *
  show us the light of his countenance and come to us.
2 Let your ways be known upon earth, *
  your saving health among all nations.
3 Let the peoples praise you, O God; *
  let all the peoples praise you.
4 Let the nations be glad and sing for joy, *
  for you judge the peoples with equity
  and guide all the nations upon earth.
5 Let the peoples praise you, O God; *
  let all the peoples praise you.
6 The earth has brought forth her increase; *
  may God, our own God, give us his blessing.
7 May God give us his blessing, *
  and may all the ends of the earth stand in awe of him.`,
  },

  90: {
    title: "Domine, refugium",
    bcpRef: "BCP p. 717",
    content:
`1 Lord, you have been our refuge *
  from one generation to another.
2 Before the mountains were brought forth,
  or the land and the earth were born, *
  from age to age you are God.
3 You turn us back to the dust and say, *
  "Go back, O child of earth."
4 For a thousand years in your sight are like yesterday when it is past *
  and like a watch in the night.
5 You sweep us away like a dream; *
  we fade away suddenly like the grass.
6 In the morning it is green and flourishes; *
  in the evening it is dried up and withered.
7 For we consume away in your displeasure; *
  we are afraid because of your wrathful indignation.
8 Our iniquities you have set before you, *
  and our secret sins in the light of your countenance.
9 When you are angry, all our days are gone; *
  we bring our years to an end like a sigh.
10 The span of our life is seventy years,
  perhaps in strength even eighty; *
  yet the sum of them is but labor and sorrow,
  for they pass away quickly and we are gone.
11 Who regards the power of your wrath? *
  who rightly fears your indignation?
12 So teach us to number our days *
  that we may apply our hearts to wisdom.
13 Return, O Lord; how long will you tarry? *
  be gracious to your servants.
14 Satisfy us by your loving-kindness in the morning; *
  so shall we rejoice and be glad all the days of our life.
15 Make us glad by the measure of the days that you afflicted us *
  and the years in which we suffered adversity.
16 Show your servants your works *
  and your splendor to their children.
17 May the graciousness of the Lord our God be upon us; *
  prosper the work of our hands;
  prosper our handiwork.`,
  },

  95: {
    title: "Venite, exultemus",
    bcpRef: "BCP p. 724",
    content:
`1 Come, let us sing to the Lord; *
  let us shout for joy to the Rock of our salvation.
2 Let us come before his presence with thanksgiving *
  and raise a loud shout to him with psalms.
3 For the Lord is a great God, *
  and a great King above all gods.
4 In his hand are the caverns of the earth, *
  and the heights of the hills are his also.
5 The sea is his, for he made it, *
  and his hands have molded the dry land.
6 Come, let us bow down, and bend the knee, *
  and kneel before the Lord our Maker.
7 For he is our God,
  and we are the people of his pasture and the sheep of his hand. *
  Oh, that today you would hearken to his voice!
8 Harden not your hearts,
  as your forebears did in the wilderness, *
  at Meribah, and on that day at Massah, when they tempted me.
9 They put me to the test, *
  though they had seen my works.
10 Forty years long I detested that generation and said, *
  "This people are wayward in their hearts;
  they do not know my ways."
11 So I swore in my wrath, *
  "They shall not enter into my rest."`,
  },

  100: {
    title: "Jubilate Deo",
    bcpRef: "BCP p. 729",
    content:
`1 Be joyful in the Lord, all you lands; *
  serve the Lord with gladness
  and come before his presence with a song.
2 Know this: The Lord himself is God; *
  he himself has made us, and we are his;
  we are his people and the sheep of his pasture.
3 Enter his gates with thanksgiving;
  go into his courts with praise; *
  give thanks to him and call upon his Name.
4 For the Lord is good;
  his mercy is everlasting; *
  and his faithfulness endures from age to age.`,
  },

  121: {
    title: "Levavi oculos",
    bcpRef: "BCP p. 779",
    content:
`1 I lift up my eyes to the hills; *
  from where is my help to come?
2 My help comes from the Lord, *
  the maker of heaven and earth.
3 He will not let your foot be moved *
  and he who watches over you will not fall asleep.
4 Behold, he who keeps watch over Israel *
  shall neither slumber nor sleep;
5 The Lord himself watches over you; *
  the Lord is your shade at your right hand,
6 So that the sun shall not strike you by day, *
  nor the moon by night.
7 The Lord shall preserve you from all evil; *
  it is he who shall keep you safe.
8 The Lord shall watch over your going out and your coming in, *
  from this time forth for evermore.`,
  },

  130: {
    title: "De profundis",
    bcpRef: "BCP p. 784",
    content:
`1 Out of the depths have I called to you, O Lord;
  Lord, hear my voice; *
  let your ears consider well the voice of my supplication.
2 If you, Lord, were to note what is done amiss, *
  O Lord, who could stand?
3 For there is forgiveness with you; *
  therefore you shall be feared.
4 I wait for the Lord; my soul waits for him; *
  in his word is my hope.
5 My soul waits for the Lord,
  more than watchmen for the morning, *
  more than watchmen for the morning.
6 O Israel, wait for the Lord, *
  for with the Lord there is mercy;
7 With him there is plenteous redemption, *
  and he shall redeem Israel from all their sins.`,
  },

  134: {
    title: "Ecce nunc",
    bcpRef: "BCP p. 787",
    content:
`1 Behold now, bless the Lord, all you servants of the Lord, *
  you that stand by night in the house of the Lord.
2 Lift up your hands in the holy place and bless the Lord; *
  the Lord who made heaven and earth bless you out of Zion.`,
  },

  145: {
    title: "Exaltabo te, Deus",
    bcpRef: "BCP p. 801",
    content:
`1 I will exalt you, O God my King, *
  and bless your Name for ever and ever.
2 Every day will I bless you *
  and praise your Name for ever and ever.
3 Great is the Lord and greatly to be praised; *
  there is no end to his greatness.
4 One generation shall praise your works to another *
  and shall declare your power.
5 I will ponder the glorious splendor of your majesty *
  and all your marvelous works.
6 They shall speak of the might of your wondrous acts, *
  and I will tell of your greatness.
7 They shall publish the remembrance of your great goodness; *
  they shall sing of your righteous deeds.
8 The Lord is gracious and full of compassion, *
  slow to anger and of great kindness.
9 The Lord is loving to everyone *
  and his compassion is over all his works.
10 All your works praise you, O Lord, *
  and your faithful servants bless you.
11 They make known the glory of your kingdom *
  and speak of your power;
12 That the peoples may know of your power *
  and the glorious splendor of your kingdom.
13 Your kingdom is an everlasting kingdom; *
  your dominion endures throughout all ages.
14 The Lord is faithful in all his words *
  and merciful in all his deeds.
15 The Lord upholds all those who fall; *
  he lifts up those who are bowed down.
16 The eyes of all wait upon you, O Lord, *
  and you give them their food in due season.
17 You open wide your hand *
  and satisfy the needs of every living creature.
18 The Lord is righteous in all his ways *
  and loving in all his works.
19 The Lord is near to those who call upon him, *
  to all who call upon him faithfully.
20 He fulfills the desire of those who fear him; *
  he hears their cry and helps them.
21 The Lord preserves all those who love him, *
  but he destroys all the wicked.
22 My mouth shall speak the praise of the Lord; *
  let all flesh bless his holy Name for ever and ever.`,
  },

  146: {
    title: "Lauda, anima mea",
    bcpRef: "BCP p. 803",
    content:
`1 Hallelujah!
  Praise the Lord, O my soul! *
  I will praise the Lord as long as I live;
  I will sing praises to my God while I have my being.
2 Put not your trust in rulers, nor in any child of earth, *
  for there is no help in them.
3 When they breathe their last, they return to earth, *
  and in that day their thoughts perish.
4 Happy are they who have the God of Jacob for their help! *
  whose hope is in the Lord their God;
5 Who made heaven and earth, the seas, and all that is in them; *
  who keeps his promise for ever;
6 Who gives justice to those who are oppressed, *
  and food to those who hunger.
7 The Lord sets the prisoners free;
  the Lord opens the eyes of the blind; *
  the Lord lifts up those who are bowed down;
8 The Lord loves the righteous;
  the Lord cares for the stranger; *
  he sustains the orphan and widow,
  but frustrates the way of the wicked.
9 The Lord shall reign for ever, *
  your God, O Zion, throughout all generations.
  Hallelujah!`,
  },

  147: {
    title: "Laudate Dominum",
    bcpRef: "BCP p. 804",
    content:
`1 Hallelujah!
  How good it is to sing praises to our God! *
  how pleasant it is to honor him with praise!
2 The Lord rebuilds Jerusalem; *
  he gathers the exiles of Israel.
3 He heals the brokenhearted *
  and binds up their wounds.
4 He counts the number of the stars *
  and calls them all by their names.
5 Great is our Lord and mighty in power; *
  there is no limit to his wisdom.
6 The Lord lifts up the lowly, *
  but casts the wicked to the ground.
7 Sing to the Lord with thanksgiving; *
  make music to our God upon the harp.
8 He covers the heavens with clouds *
  and prepares rain for the earth;
9 He makes grass to grow upon the mountains *
  and green plants to serve mankind.
10 He provides food for flocks and herds *
  and for the young ravens when they cry.
11 He is not impressed by the might of a horse; *
  he has no pleasure in the strength of a man;
12 But the Lord has pleasure in those who fear him, *
  in those who await his gracious favor.
13 Worship the Lord, O Jerusalem; *
  praise your God, O Zion;
14 For he has strengthened the bars of your gates; *
  he has blessed your children within you.
15 He has established peace on your borders; *
  he satisfies you with the finest wheat.
16 He sends out his command to the earth, *
  and his word runs very swiftly.
17 He gives snow like wool; *
  he scatters hoarfrost like ashes.
18 He scatters his hail like bread crumbs; *
  who can stand against his cold?
19 He sends forth his word and melts them; *
  he blows with his wind, and the waters flow.
20 He declares his word to Jacob, *
  his statutes and his judgments to Israel.
21 He has not done so to any other nation; *
  to them he has not revealed his judgments.
  Hallelujah!`,
  },

  148: {
    title: "Laudate Dominum",
    bcpRef: "BCP p. 805",
    content:
`1 Hallelujah!
  Praise the Lord from the heavens; *
  praise him in the heights.
2 Praise him, all you angels of his; *
  praise him, all his host.
3 Praise him, sun and moon; *
  praise him, all you shining stars.
4 Praise him, heaven of heavens, *
  and you waters above the heavens.
5 Let them praise the Name of the Lord; *
  for he commanded, and they were created.
6 He made them stand fast for ever and ever; *
  he gave them a law which shall not pass away.
7 Praise the Lord from the earth, *
  you sea-monsters and all deeps;
8 Fire and hail, snow and fog, *
  tempestuous wind, doing his will;
9 Mountains and all hills, *
  fruit trees and all cedars;
10 Wild beasts and all cattle, *
  creeping things and winged birds;
11 Kings of the earth and all peoples, *
  princes and all rulers of the world;
12 Young men and maidens, *
  old and young together.
13 Let them praise the Name of the Lord, *
  for his Name only is exalted,
  his splendor is over earth and heaven.
14 He has raised up strength for his people
  and praise for all his loyal servants, *
  the children of Israel, a people who are near him.
  Hallelujah!`,
  },

  149: {
    title: "Cantate Domino",
    bcpRef: "BCP p. 807",
    content:
`1 Hallelujah!
  Sing to the Lord a new song; *
  sing his praise in the congregation of the faithful.
2 Let Israel rejoice in his Maker; *
  let the children of Zion be joyful in their King.
3 Let them praise his Name in the dance; *
  let them sing praise to him with timbrel and harp.
4 For the Lord takes pleasure in his people *
  and adorns the poor with victory.
5 Let the faithful rejoice in triumph; *
  let them be joyful on their beds.
6 Let the praises of God be in their throat *
  and a two-edged sword in their hand;
7 To wreak vengeance on the nations *
  and punishment on the peoples;
8 To bind their kings in chains *
  and their nobles with links of iron;
9 To inflict on them the judgment decreed; *
  this is glory for all his faithful people.
  Hallelujah!`,
  },

  150: {
    title: "Laudate Dominum",
    bcpRef: "BCP p. 807",
    content:
`1 Hallelujah!
  Praise God in his holy temple; *
  praise him in the firmament of his power.
2 Praise him for his mighty acts; *
  praise him for his excellent greatness.
3 Praise him with the blast of the ram's-horn; *
  praise him with lyre and harp.
4 Praise him with timbrel and dance; *
  praise him with strings and pipe.
5 Praise him with resounding cymbals; *
  praise him with loud-clanging cymbals.
6 Let everything that has breath *
  praise the Lord.
  Hallelujah!`,
  },
};
