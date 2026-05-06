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

  22: {
    title: "Deus, Deus meus",
    bcpRef: "BCP p. 610",
    content:
`1 My God, my God, why have you forsaken me? *
  and are so far from my cry
  and from the words of my distress?
2 O my God, I cry in the daytime, but you do not answer; *
  by night as well, but I find no rest.
3 Yet you are the Holy One, *
  enthroned upon the praises of Israel.
4 Our forefathers put their trust in you; *
  they trusted, and you delivered them.
5 They cried out to you and were delivered; *
  they trusted in you and were not put to shame.
6 But as for me, I am a worm and no man, *
  scorned by all and despised by the people.
7 All who see me laugh me to scorn; *
  they curl their lips and wag their heads, saying,
8 "He trusted in the Lord; let him deliver him; *
  let him rescue him, if he delights in him."
9 Yet you are he who took me out of the womb, *
  and kept me safe upon my mother's breast.
10 I have been entrusted to you ever since I was born; *
  you were my God when I was still in my mother's womb.
11 Be not far from me, for trouble is near, *
  and there is none to help.
12 Many young bulls encircle me; *
  strong bulls of Bashan surround me.
13 They open their mouths at me, *
  like a ravening and a roaring lion.
14 I am poured out like water;
  all my bones are out of joint; *
  my heart within my breast is melting wax.
15 My mouth is dried out like a pot-sherd;
  my tongue sticks to the roof of my mouth; *
  and you have laid me in the dust of the grave.
16 Packs of dogs close me in,
  and gangs of evildoers circle around me; *
  they pierce my hands and my feet;
  I can count all my bones.
17 They stare and gloat over me; *
  they divide my garments among them;
  they cast lots for my clothing.
18 Be not far away, O Lord; *
  you are my strength; hasten to help me.
19 Save me from the sword, *
  my life from the power of the dog.
20 Save me from the lion's mouth, *
  my wretched body from the horns of wild bulls.
21 I will declare your Name to my brethren; *
  in the midst of the congregation I will praise you.
22 Praise the Lord, you that fear him; *
  stand in awe of him, O offspring of Israel;
  all you of Jacob's line, give glory.
23 For he does not despise nor abhor the poor in their poverty;
  neither does he hide his face from them; *
  but when they cry to him he hears them.
24 My praise is of him in the great assembly; *
  I will perform my vows in the presence of those who worship him.
25 The poor shall eat and be satisfied,
  and those who seek the Lord shall praise him: *
  "May your heart live for ever!"
26 All the ends of the earth shall remember and turn to the Lord, *
  and all the families of the nations shall bow before him.
27 For kingship belongs to the Lord; *
  he rules over the nations.
28 To him alone all who sleep in the earth bow down in worship; *
  all who go down to the dust fall before him.
29 My soul shall live for him;
  my descendants shall serve him; *
  they shall be known as the Lord's for ever.
30 They shall come and make known to a people yet unborn *
  the saving deeds that he has done.`,
  },

  24: {
    title: "Domini est terra",
    bcpRef: "BCP p. 613",
    content:
`1 The earth is the Lord's and all that is in it, *
  the world and all who dwell therein.
2 For it is he who founded it upon the seas *
  and made it firm upon the rivers of the deep.
3 "Who can ascend the hill of the Lord? *
  and who can stand in his holy place?"
4 "Those who have clean hands and a pure heart, *
  who have not pledged themselves to falsehood,
  nor sworn by what is a fraud.
5 They shall receive a blessing from the Lord *
  and a just reward from the God of their salvation."
6 Such is the generation of those who seek him, *
  of those who seek your face, O God of Jacob.
7 Lift up your heads, O gates;
  lift them high, O everlasting doors; *
  and the King of glory shall come in.
8 "Who is this King of glory?" *
  "The Lord, strong and mighty,
  the Lord, mighty in battle."
9 Lift up your heads, O gates;
  lift them high, O everlasting doors; *
  and the King of glory shall come in.
10 "Who is he, this King of glory?" *
  "The Lord of hosts,
  he is the King of glory."`,
  },

  25: {
    title: "Ad te, Domine, levavi",
    bcpRef: "BCP p. 614",
    content:
`1 To you, O Lord, I lift up my soul;
  my God, I put my trust in you; *
  let me not be humiliated,
  nor let my enemies triumph over me.
2 Let none who look to you be put to shame; *
  let the treacherous be disappointed in their schemes.
3 Show me your ways, O Lord, *
  and teach me your paths.
4 Lead me in your truth and teach me, *
  for you are the God of my salvation;
  in you have I trusted all the day long.
5 Remember, O Lord, your compassion and love, *
  for they are from everlasting.
6 Remember not the sins of my youth and my transgressions; *
  remember me according to your love
  and for the sake of your goodness, O Lord.
7 Gracious and upright is the Lord; *
  therefore he teaches sinners in his way.
8 He guides the humble in doing right *
  and teaches his way to the lowly.
9 All the paths of the Lord are love and faithfulness *
  to those who keep his covenant and his testimonies.
10 For your Name's sake, O Lord, *
  forgive my sin, for it is great.
11 Who are they who fear the Lord? *
  he will teach them the way that they should choose.
12 They shall dwell in prosperity, *
  and their offspring shall inherit the land.
13 The Lord is a friend to those who fear him *
  and will show them his covenant.
14 My eyes are ever looking to the Lord, *
  for he shall pluck my feet out of the net.
15 Turn to me and have pity on me, *
  for I am left alone and in misery.
16 The sorrows of my heart have increased; *
  bring me out of my troubles.
17 Look upon my adversity and misery *
  and forgive me all my sin.
18 Look upon my enemies, for they are many, *
  and they bear a violent hatred against me.
19 Protect my life and deliver me; *
  let me not be put to shame, for I have trusted in you.
20 Let integrity and uprightness preserve me, *
  for my hope has been in you.
21 Deliver Israel, O God, *
  out of all his troubles.`,
  },

  30: {
    title: "Exaltabo te, Domine",
    bcpRef: "BCP p. 621",
    content:
`1 I will exalt you, O Lord,
  because you have lifted me up *
  and have not let my enemies triumph over me.
2 O Lord my God, I cried out to you, *
  and you restored me to health.
3 You brought me up, O Lord, from the dead; *
  you restored my life as I was going down to the grave.
4 Sing to the Lord, you servants of his; *
  give thanks for the remembrance of his holiness.
5 For his wrath endures but the twinkling of an eye, *
  his favor for a lifetime.
6 Weeping may spend the night, *
  but joy comes in the morning.
7 While I felt secure, I said,
  "I shall never be disturbed. *
  You, Lord, with your favor, made me as strong as the mountains."
8 Then you hid your face, *
  and I was filled with fear.
9 I cried to you, O Lord; *
  I pleaded with the Lord, saying,
10 "What profit is there in my blood, if I go down to the Pit? *
  will the dust praise you or declare your faithfulness?
11 Hear, O Lord, and have mercy upon me; *
  O Lord, be my helper."
12 You have turned my wailing into dancing; *
  you have put off my sack-cloth and clothed me with joy.
13 Therefore my heart sings to you without ceasing; *
  O Lord my God, I will give you thanks for ever.`,
  },

  34: {
    title: "Benedicam Dominum",
    bcpRef: "BCP p. 627",
    content:
`1 I will bless the Lord at all times; *
  his praise shall ever be in my mouth.
2 I will glory in the Lord; *
  let the humble hear and rejoice.
3 Proclaim with me the greatness of the Lord; *
  let us exalt his Name together.
4 I sought the Lord, and he answered me *
  and delivered me out of all my terror.
5 Look upon him and be radiant, *
  and let not your faces be ashamed.
6 I called in my affliction and the Lord heard me *
  and saved me from all my troubles.
7 The angel of the Lord encompasses those who fear him, *
  and he will deliver them.
8 Taste and see that the Lord is good; *
  happy are they who trust in him!
9 Fear the Lord, you that are his saints, *
  for those who fear him lack nothing.
10 The young lions lack and suffer hunger, *
  but those who seek the Lord lack nothing that is good.
11 Come, children, and listen to me; *
  I will teach you the fear of the Lord.
12 Who among you loves life *
  and desires long life to enjoy prosperity?
13 Keep your tongue from evil-speaking *
  and your lips from lying words.
14 Turn from evil and do good; *
  seek peace and pursue it.
15 The eyes of the Lord are upon the righteous, *
  and his ears are open to their cry.
16 The face of the Lord is against those who do evil, *
  to root out the remembrance of them from the earth.
17 The righteous cry, and the Lord hears them *
  and delivers them from all their troubles.
18 The Lord is near to the brokenhearted *
  and will save those whose spirits are crushed.
19 Many are the troubles of the righteous, *
  but the Lord will deliver him out of them all.
20 He will keep safe all his bones; *
  not one of them shall be broken.
21 Evil shall slay the wicked, *
  and those who hate the righteous will be punished.
22 The Lord ransoms the life of his servants, *
  and none will be punished who trust in him.`,
  },

  61: {
    title: "Exaudi, Deus",
    bcpRef: "BCP p. 668",
    content:
`1 Hear my cry, O God, *
  and listen to my prayer.
2 I call upon you from the ends of the earth with heaviness in my heart; *
  set me upon the rock that is higher than I.
3 For you have been my refuge, *
  a strong tower against the enemy.
4 I will dwell in your house for ever; *
  I will take refuge under the cover of your wings.
5 For you, O God, have heard my vows; *
  you have granted me the heritage of those who fear your Name.
6 Add length of days to the king's life; *
  let his years extend over many generations.
7 Let him sit enthroned before God for ever; *
  bid love and faithfulness watch over him.
8 So will I always sing the praise of your Name, *
  and day by day I will fulfill my vows.`,
  },

  62: {
    title: "Nonne Deo?",
    bcpRef: "BCP p. 669",
    content:
`1 For God alone my soul in silence waits; *
  from him comes my salvation.
2 He alone is my rock and my salvation, *
  my stronghold, so that I shall not be greatly shaken.
3 How long will you assail me to crush me, all of you together, *
  as if you were a leaning fence, a toppling wall?
4 They seek only to bring me down from my place of honor; *
  lies are their chief delight.
5 They bless with their lips, *
  but in their hearts they curse.
6 For God alone my soul in silence waits; *
  truly, my hope is in him.
7 He alone is my rock and my salvation, *
  my stronghold, so that I shall not be shaken.
8 In God is my safety and my honor; *
  God is my strong rock and my refuge.
9 Put your trust in him always, O people, *
  pour out your hearts before him, for God is our refuge.
10 Those of high degree are but a fleeting breath, *
  even those of low estate cannot be trusted.
11 On the scales they are lighter than a breath, *
  all of them together.
12 Put no trust in extortion;
  in robbery take no empty pride; *
  though wealth increase, set not your heart upon it.
13 God has spoken once, twice have I heard it, *
  that power belongs to God.
14 Steadfast love is yours, O Lord, *
  for you repay everyone according to his deeds.`,
  },

  70: {
    title: "Deus, in adjutorium",
    bcpRef: "BCP p. 682",
    content:
`1 Be pleased, O God, to deliver me; *
  O Lord, make haste to help me.
2 Let those who seek my life be ashamed
  and altogether dismayed; *
  let those who take pleasure in my misfortune
  draw back and be disgraced.
3 Let those who say to me "Aha!" and gloat over me turn back, *
  because they are ashamed.
4 Let all who seek you rejoice and be glad in you; *
  let those who love your salvation say for ever, "Great is the Lord!"
5 But as for me, I am poor and needy; *
  come to me speedily, O God.
6 You are my helper and my deliverer; *
  O Lord, do not tarry.`,
  },

  71: {
    title: "In te, Domine, speravi",
    bcpRef: "BCP p. 683",
    content:
`1 In you, O Lord, have I taken refuge; *
  let me never be ashamed.
2 In your righteousness, deliver me and set me free; *
  incline your ear to me and save me.
3 Be my strong rock, a castle to keep me safe; *
  you are my crag and my stronghold.
4 Deliver me, my God, from the hand of the wicked, *
  from the clutches of the evildoer and the oppressor.
5 For you are my hope, O Lord God, *
  my confidence since I was young.
6 I have been sustained by you ever since I was born;
  from my mother's womb you have been my strength; *
  my praise shall be always of you.
7 I have become a portent to many; *
  but you are my refuge and my strength.
8 Let my mouth be full of your praise *
  and your glory all the day long.
9 Do not cast me off in my old age; *
  forsake me not when my strength fails.
10 For my enemies are talking against me, *
  and those who lie in wait for my life take counsel together.
11 They say, "God has forsaken him;
  go after him and seize him; *
  because there is none who will save."
12 O God, be not far from me; *
  come quickly to help me, O my God.
13 Let those who set themselves against me be put to shame and be disgraced; *
  let those who seek to do me evil be covered with scorn and reproach.
14 But I shall always wait in patience, *
  and shall praise you more and more.
15 My mouth shall recount your mighty acts and saving deeds all day long; *
  though I cannot know the number of them.
16 I will begin with the mighty works of the Lord God; *
  I will recall your righteousness, yours alone.
17 O God, you have taught me since I was young, *
  and to this day I tell of your wonderful works.
18 And now that I am old and gray-headed, O God, do not forsake me, *
  till I make known your strength to this generation
  and your power to all who are to come.
19 Your righteousness, O God, reaches to the heavens; *
  you have done great things;
  who is like you, O God?
20 You have showed me great troubles and adversities, *
  but you will restore my life
  and bring me up again from the deep places of the earth.
21 You strengthen me more and more; *
  you enfold and comfort me,
22 Therefore I will praise you upon the lyre for your faithfulness, O my God; *
  I will sing to you with the harp, O Holy One of Israel.
23 My lips will sing with joy when I play to you, *
  and so will my soul, which you have redeemed.
24 My tongue will proclaim your righteousness all day long, *
  for they are ashamed and disgraced who sought to do me harm.`,
  },

  72: {
    title: "Deus, judicium",
    bcpRef: "BCP p. 685",
    content:
`1 Give the King your justice, O God, *
  and your righteousness to the King's Son;
2 That he may rule your people righteously *
  and the poor with justice;
3 That the mountains may bring prosperity to the people, *
  and the little hills bring righteousness.
4 He shall defend the needy among the people; *
  he shall rescue the poor and crush the oppressor.
5 He shall live as long as the sun and moon endure, *
  from one generation to another.
6 He shall come down like rain upon the mown field, *
  like showers that water the earth.
7 In his time shall the righteous flourish; *
  there shall be abundance of peace till the moon shall be no more.
8 He shall rule from sea to sea, *
  and from the River to the ends of the earth.
9 His foes shall bow down before him, *
  and his enemies lick the dust.
10 The kings of Tarshish and of the isles shall pay tribute, *
  and the kings of Arabia and Saba offer gifts.
11 All kings shall bow down before him, *
  and all the nations do him service.
12 For he shall deliver the poor who cries out in distress, *
  and the oppressed who has no helper.
13 He shall have pity on the lowly and poor; *
  he shall preserve the lives of the needy.
14 He shall redeem their lives from oppression and violence, *
  and dear shall their blood be in his sight.
15 Long may he live!
  and may there be given to him gold from Arabia; *
  may prayer be made for him always,
  and may they bless him all the day long.
16 May there be abundance of grain on the earth,
  growing thick even on the hilltops; *
  may its fruit flourish like Lebanon,
  and its grain like grass upon the earth.
17 May his Name remain for ever
  and be established as long as the sun endures; *
  may all the nations bless themselves in him
  and call him blessed.
18 Blessed be the Lord God, the God of Israel, *
  who alone does wondrous deeds!
19 And blessed be his glorious Name for ever! *
  and may all the earth be filled with his glory.
  Amen. Amen.`,
  },

  84: {
    title: "Quam dilecta!",
    bcpRef: "BCP p. 707",
    content:
`1 How dear to me is your dwelling, O Lord of hosts! *
  My soul has a desire and longing for the courts of the Lord;
  my heart and my flesh rejoice in the living God.
2 The sparrow has found her a house
  and the swallow a nest where she may lay her young; *
  by the side of your altars, O Lord of hosts,
  my King and my God.
3 Happy are they who dwell in your house! *
  they will always be praising you.
4 Happy are the people whose strength is in you! *
  whose hearts are set on the pilgrims' way.
5 Those who go through the desolate valley will find it a place of springs, *
  for the early rains have covered it with pools of water.
6 They will climb from height to height, *
  and the God of gods will reveal himself in Zion.
7 Lord God of hosts, hear my prayer; *
  hearken, O God of Jacob.
8 Behold our defender, O God; *
  and look upon the face of your Anointed.
9 For one day in your courts is better than a thousand in my own room, *
  and to stand at the threshold of the house of my God
  than to dwell in the tents of the wicked.
10 For the Lord God is both sun and shield; *
  he will give grace and glory;
11 No good thing will the Lord withhold *
  from those who walk with integrity.
12 O Lord of hosts, *
  happy are they who put their trust in you!`,
  },

  91: {
    title: "Qui habitat",
    bcpRef: "BCP p. 719",
    content:
`1 He who dwells in the shelter of the Most High, *
  abides under the shadow of the Almighty.
2 He shall say to the Lord,
  "You are my refuge and my stronghold, *
  my God in whom I put my trust."
3 He shall deliver you from the snare of the hunter *
  and from the deadly pestilence.
4 He shall cover you with his pinions,
  and you shall find refuge under his wings; *
  his faithfulness shall be a shield and buckler.
5 You shall not be afraid of any terror by night, *
  nor of the arrow that flies by day;
6 Of the plague that stalks in the darkness, *
  nor of the sickness that lays waste at mid-day.
7 A thousand shall fall at your side
  and ten thousand at your right hand, *
  but it shall not come near you.
8 Your eyes have only to behold *
  to see the reward of the wicked.
9 Because you have made the Lord your refuge, *
  and the Most High your habitation,
10 There shall no evil happen to you, *
  neither shall any plague come near your dwelling.
11 For he shall give his angels charge over you, *
  to keep you in all your ways.
12 They shall bear you in their hands, *
  lest you dash your foot against a stone.
13 You shall tread upon the lion and adder; *
  you shall trample the young lion and the serpent under your feet.
14 Because he is bound to me in love,
  therefore will I deliver him; *
  I will protect him, because he knows my Name.
15 He shall call upon me, and I will answer him; *
  I am with him in trouble;
  I will rescue him and bring him to honor.
16 With long life will I satisfy him, *
  and show him my salvation.`,
  },

  103: {
    title: "Benedic, anima mea",
    bcpRef: "BCP p. 733",
    content:
`1 Bless the Lord, O my soul, *
  and all that is within me, bless his holy Name.
2 Bless the Lord, O my soul, *
  and forget not all his benefits.
3 He forgives all your sins *
  and heals all your infirmities;
4 He redeems your life from the grave *
  and crowns you with mercy and loving-kindness;
5 He satisfies you with good things, *
  and your youth is renewed like an eagle's.
6 The Lord executes righteousness *
  and judgment for all who are oppressed.
7 He made his ways known to Moses *
  and his works to the children of Israel.
8 The Lord is full of compassion and mercy, *
  slow to anger and of great kindness.
9 He will not always accuse us, *
  nor will he keep his anger for ever.
10 He has not dealt with us according to our sins, *
  nor rewarded us according to our wickedness.
11 For as the heavens are high above the earth, *
  so is his mercy great upon those who fear him.
12 As far as the east is from the west, *
  so far has he removed our sins from us.
13 As a father cares for his children, *
  so does the Lord care for those who fear him.
14 For he himself knows whereof we are made; *
  he remembers that we are but dust.
15 Our days are like the grass; *
  we flourish like a flower of the field;
16 When the wind goes over it, it is gone, *
  and its place shall know it no more.
17 But the merciful goodness of the Lord endures for ever
  on those who fear him, *
  and his righteousness on children's children;
18 On those who keep his covenant *
  and remember his commandments and do them.
19 The Lord has set his throne in heaven, *
  and his kingship has dominion over all.
20 Bless the Lord, you angels of his,
  you mighty ones who do his bidding, *
  and hearken to the voice of his word.
21 Bless the Lord, all you his hosts, *
  you ministers of his who do his will.
22 Bless the Lord, all you works of his,
  in all places of his dominion; *
  bless the Lord, O my soul.`,
  },

  116: {
    title: "Dilexi, quoniam",
    bcpRef: "BCP p. 759",
    content:
`1 I love the Lord, because he has heard the voice of my supplication, *
  because he has inclined his ear to me whenever I called upon him.
2 The cords of death entangled me;
  the grip of the grave took hold of me; *
  I came to grief and sorrow.
3 Then I called upon the Name of the Lord: *
  "O Lord, I pray you, save my life."
4 Gracious is the Lord and righteous; *
  our God is full of compassion.
5 The Lord watches over the innocent; *
  I was brought very low, and he helped me.
6 Turn again to your rest, O my soul, *
  for the Lord has treated you well.
7 For you have rescued my life from death, *
  my eyes from tears, and my feet from stumbling.
8 I will walk in the presence of the Lord *
  in the land of the living.
9 I believed, even when I said, "I have been brought very low." *
  In my distress I said, "No one can be trusted."
10 How shall I repay the Lord *
  for all the good things he has done for me?
11 I will lift up the cup of salvation *
  and call upon the Name of the Lord.
12 I will fulfill my vows to the Lord *
  in the presence of all his people.
13 Precious in the sight of the Lord *
  is the death of his servants.
14 O Lord, I am your servant; *
  I am your servant and the child of your handmaid;
  you have freed me from my bonds.
15 I will offer you the sacrifice of thanksgiving *
  and call upon the Name of the Lord.
16 I will fulfill my vows to the Lord *
  in the presence of all his people,
17 In the courts of the Lord's house, *
  in the midst of you, O Jerusalem.
  Hallelujah!`,
  },

  122: {
    title: "Laetatus sum",
    bcpRef: "BCP p. 779",
    content:
`1 I was glad when they said to me, *
  "Let us go to the house of the Lord."
2 Now our feet are standing *
  within your gates, O Jerusalem.
3 Jerusalem is built as a city *
  that is at unity with itself;
4 To which the tribes go up,
  the tribes of the Lord, *
  the assembly of Israel,
  to praise the Name of the Lord.
5 For there are the thrones of judgment, *
  the thrones of the house of David.
6 Pray for the peace of Jerusalem: *
  "May they prosper who love you.
7 Peace be within your walls *
  and quietness within your towers.
8 For my brethren and companions' sake, *
  I pray for your prosperity.
9 Because of the house of the Lord our God, *
  I will seek to do you good."`,
  },

  138: {
    title: "Confitebor tibi",
    bcpRef: "BCP p. 793",
    content:
`1 I will give thanks to you, O Lord, with my whole heart; *
  before the gods I will sing your praise.
2 I will bow down toward your holy temple
  and praise your Name, *
  because of your love and faithfulness;
3 For you have glorified your Name *
  and your word above all things.
4 When I called, you answered me; *
  you increased my strength within me.
5 All the kings of the earth will praise you, O Lord, *
  when they have heard the words of your mouth.
6 They will sing of the ways of the Lord, *
  that great is the glory of the Lord.
7 Though the Lord be high, he cares for the lowly; *
  he perceives the haughty from afar.
8 Though I walk in the midst of trouble, you keep me safe; *
  you stretch forth your hand against the fury of my enemies;
  your right hand shall save me.
9 The Lord will make good his purpose for me; *
  O Lord, your love endures for ever;
  do not abandon the works of your hands.`,
  },

  139: {
    title: "Domine, probasti",
    bcpRef: "BCP p. 794",
    content:
`1 Lord, you have searched me out and known me; *
  you know my sitting down and my rising up;
  you discern my thoughts from afar.
2 You trace my journeys and my resting-places *
  and are acquainted with all my ways.
3 Indeed, there is not a word on my lips, *
  but you, O Lord, know it altogether.
4 You press upon me behind and before *
  and lay your hand upon me.
5 Such knowledge is too wonderful for me; *
  it is so high that I cannot attain to it.
6 Where can I go then from your Spirit? *
  where can I flee from your presence?
7 If I climb up to heaven, you are there; *
  if I make the grave my bed, you are there also.
8 If I take the wings of the morning *
  and dwell in the uttermost parts of the sea,
9 Even there your hand will lead me *
  and your right hand hold me fast.
10 If I say, "Surely the darkness will cover me, *
  and the light around me turn to night,"
11 Darkness is not dark to you;
  the night is as bright as the day; *
  darkness and light to you are both alike.
12 For you yourself created my inmost parts; *
  you knit me together in my mother's womb.
13 I will thank you because I am marvelously made; *
  your works are wonderful, and I know it well.
14 My body was not hidden from you, *
  while I was being made in secret
  and woven in the depths of the earth.
15 Your eyes beheld my limbs, yet unfinished in the womb;
  all of them were written in your book; *
  they were fashioned day by day,
  when as yet there was none of them.
16 How deep I find your thoughts, O God! *
  how great is the sum of them!
17 If I were to count them, they would be more in number than the sand; *
  to count them all, my life span would need to be like yours.
18 Oh, that you would slay the wicked, O God! *
  You that thirst for blood, depart from me.
19 They speak despitefully against you; *
  your enemies take your Name in vain.
20 Do I not hate those, O Lord, who hate you? *
  and do I not loathe those who rise up against you?
21 I hate them with a perfect hatred; *
  they have become my own enemies.
22 Search me out, O God, and know my heart; *
  try me and know my restless thoughts.
23 Look well whether there be any wickedness in me *
  and lead me in the way that is everlasting.`,
  },
};
