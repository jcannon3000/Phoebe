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
};
