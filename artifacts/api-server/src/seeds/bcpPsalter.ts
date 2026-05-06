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

  7: {
    title: "Domine, Deus meus",
    bcpRef: "BCP p. 590",
    content:
`1 O Lord my God, I take refuge in you; *
  save and deliver me from all who pursue me;
2 Lest like a lion they tear me in pieces *
  and snatch me away with none to deliver me.
3 O Lord my God, if I have done these things: *
  if there is any wickedness in my hands,
4 If I have repaid my friend with evil, *
  or plundered him who without cause is my enemy;
5 Then let my enemy pursue and overtake me, *
  trample my life into the ground,
  and lay my honor in the dust.
6 Stand up, O Lord, in your wrath; *
  rise up against the fury of my enemies.
7 Awake, O my God, decree justice; *
  let the assembly of the peoples gather round you.
8 Be seated on your lofty throne, O Most High; *
  O Lord, judge the nations.
9 Give judgment for me according to my righteousness, O Lord, *
  and according to my innocence, O Most High.
10 Let the malice of the wicked come to an end,
  but establish the righteous; *
  for you test the mind and heart, O righteous God.
11 God is my shield and defense; *
  he is the savior of the true in heart.
12 God is a righteous judge; *
  God sits in judgment every day.
13 If they will not repent, God will whet his sword; *
  he will bend his bow and make it ready.
14 He has prepared his weapons of death; *
  he makes his arrows shafts of fire.
15 Look at those who are in labor with wickedness, *
  who conceive evil, and give birth to a lie.
16 They dig a pit and make it deep *
  and fall into the hole that they have made.
17 Their malice turns back upon their own head; *
  their violence falls on their own scalp.
18 I will bear witness that the Lord is righteous; *
  I will praise the Name of the Lord Most High.`,
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

  9: {
    title: "Confitebor tibi",
    bcpRef: "BCP p. 593",
    content:
`1 I will give thanks to you, O Lord, with my whole heart; *
  I will tell of all your marvelous works.
2 I will be glad and rejoice in you; *
  I will sing to your Name, O Most High.
3 When my enemies are driven back, *
  they will stumble and perish at your presence.
4 For you have maintained my right and my cause; *
  you sit upon your throne judging right.
5 You have rebuked the ungodly and destroyed the wicked; *
  you have blotted out their name for ever and ever.
6 As for the enemy, they are finished, in perpetual ruin, *
  their cities plowed under, the memory of them perished;
7 But the Lord is enthroned for ever; *
  he has set up his throne for judgment.
8 It is he who rules the world with righteousness; *
  he judges the peoples with equity.
9 The Lord will be a refuge for the oppressed, *
  a refuge in time of trouble.
10 Those who know your Name will put their trust in you, *
  for you never forsake those who seek you, O Lord.
11 Sing praise to the Lord who dwells in Zion; *
  proclaim to the peoples the things he has done.
12 The Avenger of blood will remember them; *
  he will not forget the cry of the afflicted.
13 Have pity on me, O Lord; *
  see the misery I suffer from those who hate me,
  O you who lift me up from the gate of death;
14 So that I may tell of all your praises
  and rejoice in your salvation *
  in the gates of the city of Zion.
15 The ungodly have fallen into the pit they dug, *
  and in the snare they set is their own foot caught.
16 The Lord is known by his acts of justice; *
  the wicked are trapped in the works of their own hands.
17 The wicked shall be given over to the grave, *
  and also all the people that forget God.
18 For the needy shall not always be forgotten, *
  and the hope of the poor shall not perish for ever.
19 Rise up, O Lord, let not the ungodly have the upper hand; *
  let them be judged before you.
20 Put fear upon them, O Lord; *
  let the ungodly know they are but mortal.`,
  },

  10: {
    title: "Ut quid, Domine?",
    bcpRef: "BCP p. 594",
    content:
`1 Why do you stand so far off, O Lord, *
  and hide yourself in time of trouble?
2 The wicked arrogantly persecute the poor, *
  but they are trapped in the schemes they have devised.
3 The wicked boast of their heart's desire; *
  the covetous curse and revile the Lord.
4 The wicked are so proud that they care not for God; *
  their only thought is, "God does not matter."
5 Their ways are devious at all times;
  your judgments are far above out of their sight; *
  they defy all their enemies.
6 They say in their heart, "I shall not be shaken; *
  no harm shall happen to me ever."
7 Their mouth is full of cursing, deceit, and oppression; *
  under their tongue are mischief and wrong.
8 They lurk in ambush in public squares
  and in secret places they murder the innocent; *
  they spy out the helpless.
9 They lie in wait, like a lion in a covert;
  they lie in wait to seize upon the lowly; *
  they seize the lowly and drag them away in their net.
10 The innocent are broken and humbled before them; *
  the helpless fall before their power.
11 They say in their heart, "God has forgotten; *
  he hides his face; he will never notice."
12 Rise up, O Lord;
  lift up your hand, O God; *
  do not forget the afflicted.
13 Why should the wicked revile God? *
  why should they say in their heart, "You do not care"?
14 Surely, you behold trouble and misery; *
  you see it and take it into your own hand.
15 The helpless commit themselves to you, *
  for you are the helper of orphans.
16 Break the power of the wicked and evil; *
  search out their wickedness until you find none.
17 The Lord is King for ever and ever; *
  the ungodly shall perish from his land.
18 The Lord will hear the desire of the humble; *
  you will strengthen their heart and your ears shall hear;
19 To give justice to the orphan and oppressed, *
  so that mere mortals may strike terror no more.`,
  },

  11: {
    title: "In Domino confido",
    bcpRef: "BCP p. 596",
    content:
`1 In the Lord have I taken refuge; *
  how then can you say to me,
  "Fly away like a bird to the hilltop;
2 For see how the wicked bend the bow
  and fit their arrows to the string, *
  to shoot from ambush at the true of heart.
3 When the foundations are being destroyed, *
  what can the righteous do?"
4 The Lord is in his holy temple; *
  the Lord's throne is in heaven.
5 His eyes behold the inhabited world; *
  his piercing eye weighs our worth.
6 The Lord weighs the righteous as well as the wicked, *
  but those who delight in violence he abhors.
7 Upon the wicked he shall rain coals of fire and burning sulphur; *
  a scorching wind shall be their lot.
8 For the Lord is righteous;
  he delights in righteous deeds; *
  and the just shall see his face.`,
  },

  12: {
    title: "Salvum me fac",
    bcpRef: "BCP p. 597",
    content:
`1 Help me, Lord, for there is no godly one left; *
  the faithful have vanished from among us.
2 Everyone speaks falsely with his neighbor; *
  with a smooth tongue they speak from a double heart.
3 Oh, that the Lord would cut off all smooth tongues, *
  and close the lips that utter proud boasts!
4 Those who say, "With our tongue will we prevail; *
  our lips are our own; who is lord over us?"
5 "Because the needy are oppressed,
  and the poor cry out in misery, *
  I will rise up," says the Lord,
  "and give them the help they long for."
6 The words of the Lord are pure words, *
  like silver refined from ore
  and purified seven times in the fire.
7 O Lord, watch over us *
  and save us from this generation for ever.
8 The wicked prowl on every side, *
  and that which is worthless is highly prized by everyone.`,
  },

  13: {
    title: "Usquequo, Domine?",
    bcpRef: "BCP p. 597",
    content:
`1 How long, O Lord?
  will you forget me for ever? *
  how long will you hide your face from me?
2 How long shall I have perplexity in my mind,
  and grief in my heart, day after day? *
  how long shall my enemy triumph over me?
3 Look upon me and answer me, O Lord my God; *
  give light to my eyes, lest I sleep in death;
4 Lest my enemy say, "I have prevailed over him," *
  and my foes rejoice that I have fallen.
5 But I put my trust in your mercy; *
  my heart is joyful because of your saving help.
6 I will sing to the Lord, for he has dealt with me richly; *
  I will praise the Name of the Lord Most High.`,
  },

  14: {
    title: "Dixit insipiens",
    bcpRef: "BCP p. 597",
    content:
`1 The fool has said in his heart, "There is no God." *
  All are corrupt and commit abominable acts;
  there is none who does any good.
2 The Lord looks down from heaven upon us all, *
  to see if there is any who is wise,
  if there is one who seeks after God.
3 Every one has proved faithless;
  all alike have turned bad; *
  there is none who does good; no, not one.
4 Have they no knowledge, all those evildoers *
  who eat up my people like bread
  and do not call upon the Lord?
5 See how they tremble with fear, *
  because God is in the company of the righteous.
6 Their aim is to confound the plans of the afflicted, *
  but the Lord is their refuge.
7 Oh, that Israel's deliverance would come out of Zion! *
  when the Lord restores the fortunes of his people,
  Jacob will rejoice and Israel be glad.`,
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

  16: {
    title: "Conserva me, Domine",
    bcpRef: "BCP p. 599",
    content:
`1 Protect me, O God, for I take refuge in you; *
  I have said to the Lord, "You are my Lord,
  my good above all other."
2 All my delight is upon the godly that are in the land, *
  upon those who are noble among the people.
3 But those who run after other gods *
  shall have their troubles multiplied.
4 Their libations of blood I will not offer, *
  nor take the names of their gods upon my lips.
5 O Lord, you are my portion and my cup; *
  it is you who uphold my lot.
6 My boundaries enclose a pleasant land; *
  indeed, I have a goodly heritage.
7 I will bless the Lord who gives me counsel; *
  my heart teaches me, night after night.
8 I have set the Lord always before me; *
  because he is at my right hand I shall not fall.
9 My heart, therefore, is glad, and my spirit rejoices; *
  my body also shall rest in hope.
10 For you will not abandon me to the grave, *
  nor let your holy one see the Pit.
11 You will show me the path of life; *
  in your presence there is fullness of joy,
  and in your right hand are pleasures for evermore.`,
  },

  17: {
    title: "Exaudi, Domine",
    bcpRef: "BCP p. 600",
    content:
`1 Hear my plea of innocence, O Lord;
  give heed to my cry; *
  listen to my prayer, which does not come from lying lips.
2 Let my vindication come forth from your presence; *
  let your eyes be fixed on justice.
3 Weigh my heart, summon me by night, *
  melt me down; you will find no impurity in me.
4 I give no offense with my mouth as others do; *
  I have heeded the words of your lips.
5 My footsteps hold fast to the ways of your law; *
  in your paths my feet shall not stumble.
6 I call upon you, O God, for you will answer me; *
  incline your ear to me and hear my words.
7 Show me your marvelous loving-kindness, *
  O Savior of those who take refuge at your right hand
  from those who rise up against them.
8 Keep me as the apple of your eye; *
  hide me under the shadow of your wings,
9 From the wicked who assault me, *
  from my deadly enemies who surround me.
10 They have closed their heart to pity, *
  and their mouth speaks proud things.
11 They press me hard,
  now they surround me, *
  watching how they may cast me to the ground,
12 Like a lion, greedy for its prey, *
  and like a young lion lurking in secret places.
13 Arise, O Lord; confront them and bring them down; *
  deliver me from the wicked by your sword.
14 Deliver me, O Lord, by your hand *
  from those whose portion in life is this world;
15 Whose bellies you fill with your treasure, *
  who are well supplied with children
  and leave their wealth to their little ones.
16 But at my vindication I shall see your face; *
  when I awake, I shall be satisfied, beholding your likeness.`,
  },

  18: {
    title: "Diligam te, Domine",
    bcpRef: "BCP p. 602",
    content:
`1 I love you, O Lord my strength, *
  O Lord my stronghold, my crag, and my haven.
2 My God, my rock in whom I put my trust, *
  my shield, the horn of my salvation, and my refuge;
  you are worthy of praise.
3 I will call upon the Lord, *
  and so shall I be saved from my enemies.
4 The breakers of death rolled over me, *
  and the torrents of oblivion made me afraid.
5 The cords of hell entangled me, *
  and the snares of death were set for me.
6 I called upon the Lord in my distress *
  and cried out to my God for help.
7 He heard my voice from his heavenly dwelling; *
  my cry of anguish came to his ears.
8 The earth reeled and rocked; *
  the roots of the mountains shook;
  they reeled because of his anger.
9 Smoke rose from his nostrils
  and a consuming fire out of his mouth; *
  hot burning coals blazed forth from him.
10 He parted the heavens and came down *
  with a storm cloud under his feet.
11 He mounted on cherubim and flew; *
  he swooped on the wings of the wind.
12 He wrapped darkness about him; *
  he made dark waters and thick clouds his pavilion.
13 From the brightness of his presence, through the clouds, *
  burst hailstones and coals of fire.
14 The Lord thundered out of heaven; *
  the Most High uttered his voice.
15 He loosed his arrows and scattered them; *
  he hurled thunderbolts and routed them.
16 The beds of the seas were uncovered,
  and the foundations of the world laid bare, *
  at your battle cry, O Lord,
  at the blast of the breath of your nostrils.
17 He reached down from on high and grasped me; *
  he drew me out of great waters.
18 He delivered me from my strong enemies
  and from those who hated me; *
  for they were too mighty for me.
19 They confronted me in the day of my disaster; *
  but the Lord was my support.
20 He brought me out into an open place; *
  he rescued me because he delighted in me.
21 The Lord rewarded me because of my righteous dealing; *
  because my hands were clean he rewarded me;
22 For I have kept the ways of the Lord *
  and have not offended against my God;
23 For all his judgments are before my eyes, *
  and his decrees I have not put away from me;
24 For I have been blameless with him *
  and have kept myself from iniquity;
25 Therefore the Lord rewarded me according to my righteous dealing, *
  because of the cleanness of my hands in his sight.
26 With the faithful you show yourself faithful, O God; *
  with the forthright you show yourself forthright.
27 With the pure you show yourself pure, *
  but with the crooked you are wily.
28 You will save a lowly people, *
  but you will humble the haughty eyes.
29 You, O Lord, are my lamp; *
  my God, you make my darkness bright.
30 With you I will break down an enclosure; *
  with the help of my God I will scale any wall.
31 As for God, his ways are perfect;
  the words of the Lord are tried in the fire; *
  he is a shield to all who trust in him.
32 For who is God, but the Lord? *
  who is the Rock, except our God?
33 It is God who girds me about with strength *
  and makes my way secure.
34 He makes me sure-footed like a deer *
  and lets me stand firm on the heights.
35 He trains my hands for battle *
  and my arms for bending even a bow of bronze.
36 You have given me your shield of victory; *
  your right hand also sustains me;
  your loving care makes me great.
37 You lengthen my stride beneath me, *
  and my ankles do not give way.
38 I pursue my enemies and overtake them; *
  I will not turn back till I have destroyed them.
39 I strike them down, and they cannot rise; *
  they fall defeated at my feet.
40 You have girded me with strength for the battle; *
  you have cast down my adversaries beneath me;
  you have put my enemies to flight.
41 I destroy those who hate me;
  they cry out, but there is none to help them; *
  they cry to the Lord, but he does not answer.
42 I beat them small like dust before the wind; *
  I trample them like mud in the streets.
43 You deliver me from the strife of the peoples; *
  you put me at the head of the nations.
44 A people I have not known shall serve me;
  no sooner shall they hear than they shall obey me; *
  strangers will cringe before me.
45 The foreign peoples will lose heart; *
  they shall come trembling out of their strongholds.
46 The Lord lives! Blessed is my Rock! *
  Exalted is the God of my salvation!
47 He is the God who gave me victory *
  and cast down the peoples beneath me.
48 You rescued me from the fury of my enemies;
  you exalted me above those who rose against me; *
  you saved me from my deadly foe.
49 Therefore will I extol you among the nations, O Lord, *
  and sing praises to your Name.
50 He multiplies the victories of his king; *
  he shows loving-kindness to his anointed,
  to David and his descendants for ever.`,
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

  20: {
    title: "Exaudiat te Dominus",
    bcpRef: "BCP p. 607",
    content:
`1 May the Lord answer you in the day of trouble, *
  the Name of the God of Jacob defend you;
2 Send you help from his holy place *
  and strengthen you out of Zion;
3 Remember all your offerings *
  and accept your burnt sacrifice;
4 Grant you your heart's desire *
  and prosper all your plans.
5 We will shout for joy at your victory
  and triumph in the Name of our God; *
  may the Lord grant all your requests.
6 Now I know that the Lord gives victory to his anointed; *
  he will answer him out of his holy heaven,
  with the victorious strength of his right hand.
7 Some put their trust in chariots and some in horses, *
  but we will call upon the Name of the Lord our God.
8 They collapse and fall down, *
  but we will arise and stand upright.
9 O Lord, give victory to the king *
  and answer us when we call.`,
  },

  21: {
    title: "Domine, in virtute tua",
    bcpRef: "BCP p. 607",
    content:
`1 The king rejoices in your strength, O Lord; *
  how greatly he exults in your victory!
2 You have given him his heart's desire; *
  you have not denied him the request of his lips.
3 For you meet him with blessings of prosperity, *
  and set a crown of fine gold upon his head.
4 He asked you for life, and you gave it to him: *
  length of days, for ever and ever.
5 His honor is great, because of your victory; *
  splendor and majesty have you bestowed upon him.
6 For you will give him everlasting felicity *
  and will make him glad with the joy of your presence.
7 For the king puts his trust in the Lord; *
  because of the loving-kindness of the Most High, he will not fall.
8 Your hand will lay hold upon all your enemies; *
  your right hand will seize all those who hate you.
9 You will make them like a fiery furnace *
  at the time of your appearing, O Lord;
10 You will swallow them up in your wrath, *
  and fire shall consume them.
11 You will destroy their offspring from the land *
  and their descendants from among the peoples of the earth.
12 Though they intend evil against you
  and devise wicked schemes, *
  yet they shall not prevail.
13 For you will put them to flight *
  and aim your arrows at them.
14 Be exalted, O Lord, in your might; *
  we will sing and praise your power.`,
  },

  26: {
    title: "Judica me, Domine",
    bcpRef: "BCP p. 615",
    content:
`1 Give judgment for me, O Lord,
  for I have lived with integrity; *
  I have trusted in the Lord and have not faltered.
2 Test me, O Lord, and try me; *
  examine my heart and my mind.
3 For your love is before my eyes; *
  I have walked faithfully with you.
4 I have not sat with the worthless, *
  nor do I consort with the deceitful.
5 I have hated the company of evildoers; *
  I will not sit down with the wicked.
6 I will wash my hands in innocence, O Lord, *
  that I may go in procession round your altar,
7 Singing aloud a song of thanksgiving *
  and recounting all your wonderful deeds.
8 Lord, I love the house in which you dwell *
  and the place where your glory abides.
9 Do not sweep me away with sinners, *
  nor my life with those who thirst for blood,
10 Whose hands are full of evil plots, *
  and their right hand full of bribes.
11 As for me, I will live with integrity; *
  redeem me, O Lord, and have pity on me.
12 My foot stands on level ground; *
  in the full assembly I will bless the Lord.`,
  },

  28: {
    title: "Ad te, Domine",
    bcpRef: "BCP p. 618",
    content:
`1 O Lord, I call to you;
  my Rock, do not be deaf to my cry; *
  lest, if you do not hear me,
  I become like those who go down to the Pit.
2 Hear the voice of my prayer when I cry out to you, *
  when I lift up my hands to your holy of holies.
3 Do not snatch me away with the wicked or with the evildoers, *
  who speak peaceably with their neighbors,
  while strife is in their hearts.
4 Repay them according to their deeds, *
  and according to the wickedness of their actions.
5 According to the work of their hands repay them, *
  and give them their just deserts.
6 They have no understanding of the Lord's doings,
  nor of the works of his hands; *
  therefore he will break them down and not build them up.
7 Blessed is the Lord! *
  for he has heard the voice of my prayer.
8 The Lord is my strength and my shield; *
  my heart trusts in him, and I have been helped;
9 Therefore my heart dances for joy, *
  and in my song will I praise him.
10 The Lord is the strength of his people, *
  a safe refuge for his anointed.
11 Save your people and bless your inheritance; *
  shepherd them and carry them for ever.`,
  },

  29: {
    title: "Afferte Domino",
    bcpRef: "BCP p. 619",
    content:
`1 Ascribe to the Lord, you gods, *
  ascribe to the Lord glory and strength.
2 Ascribe to the Lord the glory due his Name; *
  worship the Lord in the beauty of holiness.
3 The voice of the Lord is upon the waters;
  the God of glory thunders; *
  the Lord is upon the mighty waters.
4 The voice of the Lord is a powerful voice; *
  the voice of the Lord is a voice of splendor.
5 The voice of the Lord breaks the cedar trees; *
  the Lord breaks the cedars of Lebanon;
6 He makes Lebanon skip like a calf, *
  and Mount Hermon like a young wild ox.
7 The voice of the Lord splits the flames of fire;
  the voice of the Lord shakes the wilderness; *
  the Lord shakes the wilderness of Kadesh.
8 The voice of the Lord makes the oak trees writhe *
  and strips the forests bare.
9 And in the temple of the Lord *
  all are crying, "Glory!"
10 The Lord sits enthroned above the flood; *
  the Lord sits enthroned as King for evermore.
11 The Lord shall give strength to his people; *
  the Lord shall give his people the blessing of peace.`,
  },

  31: {
    title: "In te, Domine, speravi",
    bcpRef: "BCP p. 621",
    content:
`1 In you, O Lord, have I taken refuge;
  let me never be put to shame; *
  deliver me in your righteousness.
2 Incline your ear to me; *
  make haste to deliver me.
3 Be my strong rock, a castle to keep me safe,
  for you are my crag and my stronghold; *
  for the sake of your Name, lead me and guide me.
4 Take me out of the net that they have secretly set for me, *
  for you are my tower of strength.
5 Into your hands I commend my spirit, *
  for you have redeemed me,
  O Lord, O God of truth.
6 I hate those who cling to worthless idols, *
  and I put my trust in the Lord.
7 I will rejoice and be glad because of your mercy; *
  for you have seen my affliction;
  you know my distress.
8 You have not shut me up in the power of the enemy; *
  you have set my feet in an open place.
9 Have mercy on me, O Lord, for I am in trouble; *
  my eye is consumed with sorrow,
  and also my throat and my belly.
10 For my life is wasted with grief,
  and my years with sighing; *
  my strength fails me because of affliction,
  and my bones are consumed.
11 I have become a reproach to all my enemies and even to my neighbors,
  a dismay to those of my acquaintance; *
  when they see me in the street they avoid me.
12 I am forgotten like a dead man, out of mind; *
  I am as useless as a broken pot.
13 For I have heard the whispering of the crowd;
  fear is all around; *
  they put their heads together against me;
  they plot to take my life.
14 But as for me, I have trusted in you, O Lord. *
  I have said, "You are my God.
15 My times are in your hand; *
  rescue me from the hand of my enemies,
  and from those who persecute me.
16 Make your face to shine upon your servant, *
  and in your loving-kindness save me."
17 Lord, let me not be ashamed for having called upon you; *
  rather, let the wicked be put to shame;
  let them be silent in the grave.
18 Let the lying lips be silenced which speak against the righteous, *
  haughtily, disdainfully, and with contempt.
19 How great is your goodness, O Lord!
  which you have laid up for those who fear you; *
  which you have done in the sight of all
  for those who put their trust in you.
20 You hide them in the covert of your presence from those who slander them; *
  you keep them in your shelter from the strife of tongues.
21 Blessed be the Lord! *
  for he has shown me the wonders of his love in a besieged city.
22 Yet I said in my alarm,
  "I have been cut off from the sight of your eyes." *
  Nevertheless, you heard the sound of my entreaty
  when I cried out to you.
23 Love the Lord, all you who worship him; *
  the Lord protects the faithful,
  but repays to the full those who act haughtily.
24 Be strong and let your heart take courage, *
  all you who wait for the Lord.`,
  },

  32: {
    title: "Beati quorum",
    bcpRef: "BCP p. 623",
    content:
`1 Happy are they whose transgressions are forgiven, *
  and whose sin is put away!
2 Happy are they to whom the Lord imputes no guilt, *
  and in whose spirit there is no guile!
3 While I held my tongue, my bones withered away, *
  because of my groaning all day long.
4 For your hand was heavy upon me day and night; *
  my moisture was dried up as in the heat of summer.
5 Then I acknowledged my sin to you, *
  and did not conceal my guilt.
6 I said, "I will confess my transgressions to the Lord." *
  Then you forgave me the guilt of my sin.
7 Therefore all the faithful will make their prayers to you in time of trouble; *
  when the great waters overflow, they shall not reach them.
8 You are my hiding-place;
  you preserve me from trouble; *
  you surround me with shouts of deliverance.
9 "I will instruct you and teach you in the way that you should go; *
  I will guide you with my eye.
10 Do not be like horse or mule, which have no understanding; *
  who must be fitted with bit and bridle,
  or else they will not stay near you."
11 Great are the tribulations of the wicked; *
  but mercy embraces those who trust in the Lord.
12 Be glad, you righteous, and rejoice in the Lord; *
  shout for joy, all who are true of heart.`,
  },

  33: {
    title: "Exultate, justi",
    bcpRef: "BCP p. 625",
    content:
`1 Rejoice in the Lord, you righteous; *
  it is good for the just to sing praises.
2 Praise the Lord with the harp; *
  play to him upon the psaltery and lyre.
3 Sing for him a new song; *
  sound a fanfare with all your skill upon the trumpet.
4 For the word of the Lord is right, *
  and all his works are sure.
5 He loves righteousness and justice; *
  the loving-kindness of the Lord fills the whole earth.
6 By the word of the Lord were the heavens made, *
  by the breath of his mouth all the heavenly hosts.
7 He gathers up the waters of the ocean as in a water-skin *
  and stores up the depths of the sea.
8 Let all the earth fear the Lord; *
  let all who dwell in the world stand in awe of him.
9 For he spoke, and it came to pass; *
  he commanded, and it stood fast.
10 The Lord brings the will of the nations to naught; *
  he thwarts the designs of the peoples.
11 But the Lord's will stands fast for ever, *
  and the designs of his heart from age to age.
12 Happy is the nation whose God is the Lord! *
  happy the people he has chosen to be his own!
13 The Lord looks down from heaven, *
  and beholds all the people in the world.
14 From where he sits enthroned he turns his gaze *
  on all who dwell on the earth.
15 He fashions all the hearts of them *
  and understands all their works.
16 There is no king that can be saved by a mighty army; *
  a strong man is not delivered by his great strength.
17 The horse is a vain hope for deliverance; *
  for all its strength it cannot save.
18 Behold, the eye of the Lord is upon those who fear him, *
  on those who wait upon his love,
19 To pluck their lives from death, *
  and to feed them in time of famine.
20 Our soul waits for the Lord; *
  he is our help and our shield.
21 Indeed, our heart rejoices in him, *
  for in his holy Name we put our trust.
22 Let your loving-kindness, O Lord, be upon us, *
  as we have put our trust in you.`,
  },

  35: {
    title: "Judica, Domine",
    bcpRef: "BCP p. 628",
    content:
`1 Fight those who fight me, O Lord; *
  attack those who are attacking me.
2 Take up shield and armor *
  and rise up to help me.
3 Draw the sword and bar the way against those who pursue me; *
  say to my soul, "I am your salvation."
4 Let those who seek after my life be shamed and humbled; *
  let those who plot my ruin fall back and be dismayed.
5 Let them be like chaff before the wind, *
  and let the angel of the Lord drive them away.
6 Let their way be dark and slippery, *
  and let the angel of the Lord pursue them.
7 For they have secretly spread a net for me without a cause; *
  without a cause they have dug a pit to take me alive.
8 Let ruin come upon them unawares; *
  let them be caught in the net they hid;
  let them fall into the pit they dug.
9 Then I will be joyful in the Lord; *
  I will glory in his victory.
10 My very bones will say, "Lord, who is like you? *
  You deliver the poor from those who are too strong for them,
  the poor and needy from those who rob them."
11 Malicious witnesses rise up against me; *
  they charge me with matters I know nothing about.
12 They pay me evil in exchange for good; *
  my soul is full of despair.
13 But when they were sick I dressed in sack-cloth *
  and humbled myself by fasting.
14 I prayed with my whole heart,
  as one would for a friend or a brother; *
  I behaved like one who mourns for his mother,
  bowed down and grieving.
15 But when I stumbled, they were glad and gathered together;
  they gathered against me; *
  strangers whom I did not know tore me to pieces and would not stop.
16 They put me to the test and mocked me; *
  they gnashed at me with their teeth.
17 O Lord, how long will you look on? *
  rescue me from the roaring beasts,
  and my life from the young lions.
18 I will give you thanks in the great congregation; *
  I will praise you in the mighty throng.
19 Do not let my treacherous foes rejoice over me, *
  nor let those who hate me without a cause wink at each other.
20 For they do not plan for peace, *
  but invent deceitful schemes against the quiet in the land.
21 They opened their mouths at me and said, *
  "Aha! we saw it with our own eyes."
22 You saw it, O Lord; do not be silent; *
  O Lord, be not far from me.
23 Awake, arise, to my cause! *
  to my defense, my God and my Lord!
24 Give me justice, O Lord my God,
  according to your righteousness; *
  do not let them triumph over me.
25 Do not let them say in their hearts,
  "Aha! just what we want!" *
  Do not let them say, "We have swallowed him up."
26 Let all who rejoice at my ruin be ashamed and disgraced; *
  let those who boast against me be clothed with dismay and shame.
27 Let those who favor my cause sing out with joy and be glad; *
  let them say always, "Great is the Lord,
  who desires the prosperity of his servant."
28 And my tongue shall be talking of your righteousness *
  and of your praise all the day long.`,
  },

  36: {
    title: "Dixit injustus",
    bcpRef: "BCP p. 631",
    content:
`1 There is a voice of rebellion deep in the heart of the wicked; *
  there is no fear of God before his eyes.
2 He flatters himself in his own eyes *
  that his hateful sin will not be found out.
3 The words of his mouth are wicked and deceitful; *
  he has left off acting wisely and doing good.
4 He thinks up wickedness upon his bed
  and has set himself in no good way; *
  he does not abhor that which is evil.
5 Your love, O Lord, reaches to the heavens, *
  and your faithfulness to the clouds.
6 Your righteousness is like the strong mountains,
  your justice like the great deep; *
  you save both man and beast, O Lord.
7 How priceless is your love, O God! *
  your people take refuge under the shadow of your wings.
8 They feast upon the abundance of your house; *
  you give them drink from the river of your delights.
9 For with you is the well of life, *
  and in your light we see light.
10 Continue your loving-kindness to those who know you, *
  and your favor to those who are true of heart.
11 Let not the foot of the proud come near me, *
  nor the hand of the wicked push me aside.
12 See how they are fallen, those who work wickedness! *
  they are cast down and shall not be able to rise.`,
  },

  37: {
    title: "Noli aemulari",
    bcpRef: "BCP p. 632",
    content:
`1 Do not fret yourself because of evildoers; *
  do not be jealous of those who do wrong.
2 For they shall soon wither like the grass, *
  and like the green grass fade away.
3 Put your trust in the Lord and do good; *
  dwell in the land and feed on its riches.
4 Take delight in the Lord, *
  and he shall give you your heart's desire.
5 Commit your way to the Lord and put your trust in him, *
  and he will bring it to pass.
6 He will make your righteousness as clear as the light *
  and your just dealing as the noonday.
7 Be still before the Lord *
  and wait patiently for him.
8 Do not fret yourself over the one who prospers, *
  the one who succeeds in evil schemes.
9 Refrain from anger, leave rage alone; *
  do not fret yourself; it leads only to evil.
10 For evildoers shall be cut off, *
  but those who wait upon the Lord shall possess the land.
11 In a little while the wicked shall be no more; *
  you shall search out their place, but they will not be there.
12 But the lowly shall possess the land; *
  they will delight in abundance of peace.
13 The wicked plot against the righteous *
  and gnash at them with their teeth.
14 The Lord laughs at the wicked, *
  because he sees that their day will come.
15 The wicked draw their sword and bend their bow
  to strike down the poor and needy, *
  to slaughter those who are upright in their ways.
16 Their sword shall go through their own heart, *
  and their bow shall be broken.
17 The little that the righteous has *
  is better than great riches of the wicked.
18 For the power of the wicked shall be broken, *
  but the Lord upholds the righteous.
19 The Lord cares for the lives of the godly, *
  and their inheritance shall last for ever.
20 They shall not be ashamed in bad times, *
  and in days of famine they shall have enough.
21 As for the wicked, they shall perish, *
  and the enemies of the Lord, like the glory of the meadows, shall vanish;
  they shall vanish like smoke.
22 The wicked borrow and do not repay, *
  but the righteous are generous in giving.
23 Those who are blessed by God shall possess the land, *
  but those who are cursed by him shall be destroyed.
24 Our steps are directed by the Lord; *
  he strengthens those in whose way he delights.
25 If they stumble, they shall not fall headlong, *
  for the Lord holds them by the hand.
26 I have been young and now I am old, *
  but never have I seen the righteous forsaken,
  or their children begging bread.
27 The righteous are always generous in their lending, *
  and their children shall be a blessing.
28 Turn from evil, and do good, *
  and dwell in the land for ever.
29 For the Lord loves justice; *
  he does not forsake his faithful ones.
30 They shall be kept safe for ever, *
  but the offspring of the wicked shall be destroyed.
31 The righteous shall possess the land *
  and dwell in it for ever.
32 The mouth of the righteous utters wisdom, *
  and their tongue speaks what is right.
33 The law of their God is in their heart, *
  and their footsteps shall not falter.
34 The wicked spy on the righteous *
  and seek occasion to kill them.
35 The Lord will not abandon them to their hand, *
  nor let them be found guilty when brought to trial.
36 Wait upon the Lord and keep his way; *
  he will raise you up to possess the land,
  and when the wicked are cut off, you will see it.
37 I have seen the wicked in their arrogance, *
  flourishing like a tree in full leaf.
38 I went by, and behold, they were not there; *
  I searched for them, but they could not be found.
39 Mark those who are honest;
  observe the upright; *
  for there is a future for the peaceable.
40 Transgressors shall be destroyed, one and all; *
  the future of the wicked is cut off.
41 But the deliverance of the righteous comes from the Lord; *
  he is their stronghold in time of trouble.
42 The Lord will help them and rescue them; *
  he will rescue them from the wicked and deliver them,
  because they seek refuge in him.`,
  },

  38: {
    title: "Domine, ne in furore",
    bcpRef: "BCP p. 635",
    content:
`1 O Lord, do not rebuke me in your anger; *
  do not punish me in your wrath.
2 For your arrows have already pierced me, *
  and your hand presses hard upon me.
3 There is no health in my flesh,
  because of your indignation; *
  there is no soundness in my body, because of my sin.
4 For my iniquities overwhelm me; *
  like a heavy burden they are too much for me to bear.
5 My wounds stink and fester *
  by reason of my foolishness.
6 I am utterly bowed down and prostrate; *
  I go about in mourning all the day long.
7 My loins are filled with searing pain; *
  there is no health in my body.
8 I am utterly numb and crushed; *
  I wail, because of the groaning of my heart.
9 O Lord, you know all my desires, *
  and my sighing is not hidden from you.
10 My heart is pounding, my strength has failed me, *
  and the brightness of my eyes is gone from me.
11 My friends and companions draw back from my affliction; *
  my neighbors stand afar off.
12 Those who seek after my life lay snares for me; *
  those who strive to hurt me speak of my ruin
  and plot treachery all the day long.
13 But I am like the deaf who do not hear, *
  like those who are mute and who do not open their mouth.
14 I have become like one who does not hear *
  and from whose mouth comes no defense.
15 For in you, O Lord, have I fixed my hope; *
  you will answer me, O Lord my God.
16 For I said, "Do not let them rejoice at my expense, *
  those who gloat over me when my foot slips."
17 Truly, I am on the verge of falling, *
  and my pain is always with me.
18 I will confess my iniquity *
  and be sorry for my sin.
19 Those who are my enemies without cause are mighty, *
  and many in number are those who wrongfully hate me.
20 Those who repay evil for good slander me, *
  because I follow the course that is right.
21 O Lord, do not forsake me; *
  be not far from me, O my God.
22 Make haste to help me, *
  O Lord of my salvation.`,
  },

  39: {
    title: "Dixi, Custodiam",
    bcpRef: "BCP p. 637",
    content:
`1 I said, "I will keep watch upon my ways, *
  so that I do not offend with my tongue.
2 I will put a muzzle on my mouth *
  while the wicked are in my presence."
3 So I held my tongue and said nothing; *
  I refrained from rash words;
  but my pain became unbearable.
4 My heart was hot within me;
  while I pondered, the fire burst into flame; *
  I spoke out with my tongue:
5 Lord, let me know my end and the number of my days, *
  so that I may know how short my life is.
6 You have given me a mere handful of days,
  and my lifetime is as nothing in your sight; *
  truly, even those who stand erect are but a puff of wind.
7 We walk about like a shadow,
  and in vain we are in turmoil; *
  we heap up riches and cannot tell who will gather them.
8 And now, what is my hope? *
  O Lord, my hope is in you.
9 Deliver me from all my transgressions *
  and do not make me the taunt of the fool.
10 I fell silent and did not open my mouth, *
  for surely it was you that did it.
11 Take your affliction from me; *
  I am worn down by the blows of your hand.
12 With rebukes for sin you punish us;
  like a moth you eat away all that is dear to us; *
  truly, everyone is but a puff of wind.
13 Hear my prayer, O Lord,
  and give ear to my cry; *
  hold not your peace at my tears.
14 For I am but a sojourner with you, *
  a wayfarer, as all my forebears were.
15 Turn your gaze from me, that I may be glad again, *
  before I go my way and am no more.`,
  },

  40: {
    title: "Expectans, expectavi",
    bcpRef: "BCP p. 639",
    content:
`1 I waited patiently upon the Lord; *
  he stooped to me and heard my cry.
2 He lifted me out of the desolate pit, out of the mire and clay; *
  he set my feet upon a high cliff and made my footing sure.
3 He put a new song in my mouth,
  a song of praise to our God; *
  many shall see, and stand in awe,
  and put their trust in the Lord.
4 Happy are they who trust in the Lord! *
  they do not resort to evil spirits or turn to false gods.
5 Great things are they that you have done, O Lord my God!
  how great your wonders and your plans for us! *
  there is none who can be compared with you.
6 Oh, that I could make them known and tell them! *
  but they are more than I can count.
7 In sacrifice and offering you take no pleasure *
  (you have given me ears to hear you);
8 Burnt-offering and sin-offering you have not required, *
  and so I said, "Behold, I come.
9 In the roll of the book it is written concerning me: *
  'I love to do your will, O my God;
  your law is deep in my heart.'"
10 I proclaimed righteousness in the great congregation; *
  behold, I did not restrain my lips;
  and that, O Lord, you know.
11 Your righteousness have I not hidden in my heart;
  I have spoken of your faithfulness and your deliverance; *
  I have not concealed your love and faithfulness from the great congregation.
12 You are the Lord;
  do not withhold your compassion from me; *
  let your love and your faithfulness keep me safe for ever,
13 For innumerable troubles have crowded upon me;
  my sins have overtaken me, and I cannot see; *
  they are more in number than the hairs of my head,
  and my heart fails me.
14 Be pleased, O Lord, to deliver me; *
  O Lord, make haste to help me.
15 Let them be ashamed and altogether dismayed
  who seek after my life to destroy it; *
  let them draw back and be disgraced
  who take pleasure in my misfortune.
16 Let those who say "Aha!" and gloat over me be confounded, *
  because they are ashamed.
17 Let all who seek you rejoice in you and be glad; *
  let those who love your salvation continually say,
  "Great is the Lord!"
18 Though I am poor and afflicted, *
  the Lord will have regard for me.
19 You are my helper and my deliverer; *
  do not tarry, O my God.`,
  },

  41: {
    title: "Beatus qui intelligit",
    bcpRef: "BCP p. 640",
    content:
`1 Happy are they who consider the poor and needy! *
  the Lord will deliver them in the time of trouble.
2 The Lord preserves them and keeps them alive,
  so that they may be happy in the land; *
  he does not hand them over to the will of their enemies.
3 The Lord sustains them on their sickbed *
  and ministers to them in their illness.
4 I said, "Lord, be merciful to me; *
  heal me, for I have sinned against you."
5 My enemies are saying wicked things about me: *
  "When will he die, and his name perish?"
6 Even if they come to see me, they speak empty words; *
  their heart collects false rumors;
  they go outside and spread them.
7 All my enemies whisper together about me *
  and devise evil against me.
8 "A deadly thing," they say, "has fastened on him; *
  he has taken to his bed and will never get up again."
9 Even my best friend, whom I trusted,
  who broke bread with me, *
  has lifted up his heel and turned against me.
10 But you, O Lord, be merciful to me and raise me up, *
  and I shall repay them.
11 By this I know you are pleased with me, *
  that my enemy does not triumph over me.
12 In my integrity you hold me fast, *
  and shall set me before your face for ever.
13 Blessed be the Lord God of Israel, *
  from age to age. Amen. Amen.`,
  },

  42: {
    title: "Quemadmodum",
    bcpRef: "BCP p. 642",
    content:
`1 As the deer longs for the water-brooks, *
  so longs my soul for you, O God.
2 My soul is athirst for God, athirst for the living God; *
  when shall I come to appear before the presence of God?
3 My tears have been my food day and night, *
  while all day long they say to me,
  "Where now is your God?"
4 I pour out my soul when I think on these things; *
  how I went with the multitude and led them into the house of God,
5 With the voice of praise and thanksgiving, *
  among those who keep holy-day.
6 Why are you so full of heaviness, O my soul? *
  and why are you so disquieted within me?
7 Put your trust in God; *
  for I will yet give thanks to him,
  who is the help of my countenance, and my God.
8 My soul is heavy within me; *
  therefore I will remember you from the land of Jordan,
  and from the peak of Mizar among the heights of Hermon.
9 One deep calls to another in the noise of your cataracts; *
  all your rapids and floods have gone over me.
10 The Lord grants his loving-kindness in the daytime; *
  in the night season his song is with me,
  a prayer to the God of my life.
11 I will say to the God of my strength,
  "Why have you forgotten me? *
  and why do I go so heavily while the enemy oppresses me?"
12 While my bones are being broken, *
  my enemies mock me to my face;
13 All day long they mock me *
  and say to me, "Where now is your God?"
14 Why are you so full of heaviness, O my soul? *
  and why are you so disquieted within me?
15 Put your trust in God; *
  for I will yet give thanks to him,
  who is the help of my countenance, and my God.`,
  },

  43: {
    title: "Judica me, Deus",
    bcpRef: "BCP p. 643",
    content:
`1 Give judgment for me, O God,
  and defend my cause against an ungodly people; *
  deliver me from the deceitful and the wicked.
2 For you are the God of my strength;
  why have you put me from you? *
  and why do I go so heavily while the enemy oppresses me?
3 Send out your light and your truth, that they may lead me, *
  and bring me to your holy hill
  and to your dwelling;
4 That I may go to the altar of God,
  to the God of my joy and gladness; *
  and on the harp I will give thanks to you, O God my God.
5 Why are you so full of heaviness, O my soul? *
  and why are you so disquieted within me?
6 Put your trust in God; *
  for I will yet give thanks to him,
  who is the help of my countenance, and my God.`,
  },

  44: {
    title: "Deus, auribus",
    bcpRef: "BCP p. 644",
    content:
`1 We have heard with our ears, O God,
  our forefathers have told us, *
  the deeds you did in their days,
  in the days of old.
2 How with your hand you drove the peoples out
  and planted our forefathers in the land; *
  how you destroyed nations and made your people flourish.
3 For they did not take the land by their sword,
  nor did their arm win the victory for them; *
  but your right hand, your arm, and the light of your countenance,
  because you favored them.
4 You are my King and my God; *
  you command victories for Jacob.
5 Through you we pushed back our adversaries; *
  through your Name we trampled on those who rose up against us.
6 For I do not rely on my bow, *
  and my sword does not give me the victory.
7 Surely, you gave us victory over our adversaries *
  and put those who hate us to shame.
8 Every day we gloried in God, *
  and we will praise your Name for ever.
9 Nevertheless, you have rejected and humbled us *
  and do not go forth with our armies.
10 You have made us fall back before our adversary, *
  and our enemies have plundered us.
11 You have made us like sheep to be eaten *
  and have scattered us among the nations.
12 You are selling your people for a trifle *
  and are making no profit on the sale of them.
13 You have made us the scorn of our neighbors, *
  a mockery and derision to those around us.
14 You have made us a byword among the nations, *
  a laughing-stock among the peoples.
15 My humiliation is daily before me, *
  and shame has covered my face;
16 Because of the taunts of the mockers and blasphemers, *
  because of the enemy and avenger.
17 All this has come upon us; *
  yet we have not forgotten you,
  nor have we betrayed your covenant.
18 Our heart never turned back, *
  nor did our footsteps stray from your path;
19 Though you thrust us down into a place of misery, *
  and covered us over with deep darkness.
20 If we have forgotten the Name of our God, *
  or stretched out our hands to some strange god,
21 Will not God find it out? *
  for he knows the secrets of the heart.
22 Indeed, for your sake we are killed all the day long; *
  we are accounted as sheep for the slaughter.
23 Awake, O Lord! why are you sleeping? *
  Arise! do not reject us for ever.
24 Why have you hidden your face *
  and forgotten our affliction and oppression?
25 We sink down into the dust; *
  our body cleaves to the ground.
26 Rise up, and help us, *
  and save us, for the sake of your steadfast love.`,
  },

  45: {
    title: "Eructavit cor meum",
    bcpRef: "BCP p. 646",
    content:
`1 My heart is stirring with a noble song;
  let me recite what I have fashioned for the king; *
  my tongue shall be the pen of a skilled writer.
2 You are the fairest of men; *
  grace flows from your lips,
  because God has blessed you for ever.
3 Strap your sword upon your thigh, O mighty warrior, *
  in your pride and in your majesty.
4 Ride out and conquer in the cause of truth *
  and for the sake of justice.
5 Your right hand will show you marvelous things; *
  your arrows are very sharp, O mighty warrior.
6 The peoples are falling at your feet, *
  and the king's enemies are losing heart.
7 Your throne, O God, endures for ever and ever, *
  a scepter of righteousness is the scepter of your kingdom;
  you love righteousness and hate iniquity.
8 Therefore God, your God, has anointed you *
  with the oil of gladness above your fellows.
9 All your garments are fragrant with myrrh, aloes, and cassia, *
  and the music of strings from ivory palaces makes you glad.
10 Kings' daughters stand among the ladies of the court; *
  on your right hand is the queen,
  adorned with the gold of Ophir.
11 "Hear, O daughter; consider and listen closely; *
  forget your people and your father's house.
12 The king will have pleasure in your beauty; *
  he is your master; therefore do him honor.
13 The people of Tyre are here with a gift; *
  the rich among the people seek your favor."
14 All glorious is the princess as she enters; *
  her gown is cloth-of-gold.
15 In embroidered apparel she is brought to the king; *
  after her the bridesmaids follow in procession.
16 With joy and gladness they are brought, *
  and enter into the palace of the king.
17 "In place of fathers, O king, you shall have sons; *
  you shall make them princes over all the earth.
18 I will make your name to be remembered
  from one generation to another; *
  therefore nations will praise you for ever and ever."`,
  },

  46: {
    title: "Deus noster refugium",
    bcpRef: "BCP p. 648",
    content:
`1 God is our refuge and strength, *
  a very present help in trouble.
2 Therefore we will not fear, though the earth be moved, *
  and though the mountains be toppled into the depths of the sea;
3 Though its waters rage and foam, *
  and though the mountains tremble at its tumult.
4 The Lord of hosts is with us; *
  the God of Jacob is our stronghold.
5 There is a river whose streams make glad the city of God, *
  the holy habitation of the Most High.
6 God is in the midst of her;
  she shall not be overthrown; *
  God shall help her at the break of day.
7 The nations make much ado, and the kingdoms are shaken; *
  God has spoken, and the earth shall melt away.
8 The Lord of hosts is with us; *
  the God of Jacob is our stronghold.
9 Come now and look upon the works of the Lord, *
  what awesome things he has done on earth.
10 It is he who makes war to cease in all the world; *
  he breaks the bow, and shatters the spear,
  and burns the shields with fire.
11 "Be still, then, and know that I am God; *
  I will be exalted among the nations;
  I will be exalted in the earth."
12 The Lord of hosts is with us; *
  the God of Jacob is our stronghold.`,
  },

  47: {
    title: "Omnes gentes, plaudite",
    bcpRef: "BCP p. 649",
    content:
`1 Clap your hands, all you peoples; *
  shout to God with a cry of joy.
2 For the Lord Most High is to be feared; *
  he is the great King over all the earth.
3 He subdues the peoples under us, *
  and the nations under our feet.
4 He chooses our inheritance for us, *
  the pride of Jacob whom he loves.
5 God has gone up with a shout, *
  the Lord with the sound of the ram's-horn.
6 Sing praises to God, sing praises; *
  sing praises to our King, sing praises.
7 For God is King of all the earth; *
  sing praises with all your skill.
8 God reigns over the nations; *
  God sits upon his holy throne.
9 The nobles of the peoples have gathered together *
  with the people of the God of Abraham.
10 The rulers of the earth belong to God, *
  and he is highly exalted.`,
  },

  48: {
    title: "Magnus Dominus",
    bcpRef: "BCP p. 650",
    content:
`1 Great is the Lord, and highly to be praised; *
  in the city of our God is his holy hill.
2 Beautiful and lofty, the joy of all the earth, is the hill of Zion, *
  the very center of the world and the city of the great King.
3 God is in her citadels; *
  he is known to be her sure refuge.
4 Behold, the kings of the earth assembled *
  and marched forward together.
5 They looked and were astounded; *
  they retreated and fled in terror.
6 Trembling seized them there; *
  they writhed like a woman in childbirth,
  like ships of the sea when the east wind shatters them.
7 As we have heard, so have we seen,
  in the city of the Lord of hosts, in the city of our God; *
  God has established her for ever.
8 We have waited in silence on your loving-kindness, O God, *
  in the midst of your temple.
9 Your praise, like your Name, O God, reaches to the world's end; *
  your right hand is full of justice.
10 Let Mount Zion be glad
  and the cities of Judah rejoice, *
  because of your judgments.
11 Make the circuit of Zion;
  walk round about her; *
  count the number of her towers.
12 Consider well her bulwarks;
  examine her strongholds; *
  that you may tell those who come after.
13 This God is our God for ever and ever; *
  he shall be our guide for evermore.`,
  },

  49: {
    title: "Audite haec, omnes",
    bcpRef: "BCP p. 651",
    content:
`1 Hear this, all you peoples;
  hearken, all you who dwell in the world, *
  you of high degree and low, rich and poor together.
2 My mouth shall speak of wisdom, *
  and my heart shall meditate on understanding.
3 I will incline my ear to a proverb *
  and set forth my riddle upon the harp.
4 Why should I be afraid in evil days, *
  when the wickedness of those at my heels surrounds me,
5 The wickedness of those who put their trust in their goods, *
  and boast of their great riches?
6 We can never ransom ourselves, *
  or deliver to God the price of our life;
7 For the ransom of our life is so great, *
  that we should never have enough to pay it,
8 In order to live for ever and ever, *
  and never see the grave.
9 For we see that the wise die also;
  like the dull and stupid they perish *
  and leave their wealth to those who come after them.
10 Their graves shall be their homes for ever,
  their dwelling places from generation to generation, *
  though they call the lands after their own names.
11 Even though honored, they cannot live for ever; *
  they are like the beasts that perish.
12 Such is the way of those who foolishly trust in themselves, *
  and the end of those who delight in their own words.
13 Like a flock of sheep they are destined to die;
  Death is their shepherd; *
  they go down straightway to the grave.
14 Their form shall waste away, *
  and the land of the dead shall be their home.
15 But God will ransom my life; *
  he will snatch me from the grasp of death.
16 Do not be envious when some become rich, *
  or when the grandeur of their house increases;
17 For they will carry nothing away at their death, *
  nor will their grandeur follow them.
18 Though they thought highly of themselves while they lived, *
  and were praised for their success,
19 They shall join the company of their forebears, *
  who will never see the light again.
20 Those who are honored, but have no understanding, *
  are like the beasts that perish.`,
  },

  50: {
    title: "Deus deorum",
    bcpRef: "BCP p. 654",
    content:
`1 The Lord, the God of gods, has spoken; *
  he has called the earth from the rising of the sun to its setting.
2 Out of Zion, perfect in its beauty, *
  God reveals himself in glory.
3 Our God will come and will not keep silence; *
  before him there is a consuming flame,
  and round about him a raging storm.
4 He calls the heavens and the earth from above *
  to witness the judgment of his people.
5 "Gather before me my loyal followers, *
  those who have made a covenant with me
  and sealed it with sacrifice."
6 Let the heavens declare the rightness of his cause; *
  for God himself is judge.
7 Hear, O my people, and I will speak:
  "O Israel, I will bear witness against you; *
  for I am God, your God.
8 I do not accuse you because of your sacrifices; *
  your offerings are always before me.
9 I will take no bull-calf from your stalls, *
  nor he-goats out of your pens;
10 For all the beasts of the forest are mine, *
  the herds in their thousands upon the hills.
11 I know every bird in the sky, *
  and the creatures of the fields are in my sight.
12 If I were hungry, I would not tell you, *
  for the whole world is mine and all that is in it.
13 Do you think I eat the flesh of bulls, *
  or drink the blood of goats?
14 Offer to God a sacrifice of thanksgiving *
  and make good your vows to the Most High.
15 Call upon me in the day of trouble; *
  I will deliver you, and you shall honor me."
16 But to the wicked God says: *
  "Why do you recite my statutes,
  and take my covenant upon your lips;
17 Since you refuse discipline, *
  and toss my words behind your back?
18 When you see a thief, you make him your friend, *
  and you cast in your lot with adulterers.
19 You have loosed your lips for evil, *
  and harnessed your tongue to a lie.
20 You are always speaking evil of your brother *
  and slandering your own mother's son.
21 These things you have done, and I kept still, *
  and you thought that I am like you."
22 "I have made my accusation; *
  I have put my case in order before your eyes.
23 Consider this well, you who forget God, *
  lest I rend you and there be none to deliver you.
24 Whoever offers me the sacrifice of thanksgiving honors me; *
  but to those who keep in my way will I show the salvation of God."`,
  },

  52: {
    title: "Quid gloriaris?",
    bcpRef: "BCP p. 656",
    content:
`1 You tyrant, why do you boast of wickedness *
  against the godly all day long?
2 You plot ruin;
  your tongue is like a sharpened razor, *
  O worker of deception.
3 You love evil more than good *
  and lying more than speaking the truth.
4 You love all words that hurt, *
  O you deceitful tongue.
5 Oh, that God would demolish you utterly, *
  topple you, and snatch you from your dwelling,
  and root you out of the land of the living!
6 The righteous shall see and tremble, *
  and they shall laugh at him, saying,
7 "This is the one who did not take God for a refuge, *
  but trusted in great wealth
  and relied upon wickedness."
8 But I am like a green olive tree in the house of God; *
  I trust in the mercy of God for ever and ever.
9 I will give you thanks for what you have done *
  and declare the goodness of your Name in the presence of the godly.`,
  },

  53: {
    title: "Dixit insipiens",
    bcpRef: "BCP p. 657",
    content:
`1 The fool has said in his heart, "There is no God." *
  All are corrupt and commit abominable acts;
  there is none who does any good.
2 God looks down from heaven upon us all, *
  to see if there is any who is wise,
  if there is one who seeks after God.
3 Every one has proved faithless;
  all alike have turned bad; *
  there is none who does good; no, not one.
4 Have they no knowledge, those evildoers *
  who eat up my people like bread
  and do not call upon God?
5 See how greatly they tremble,
  such trembling as never was; *
  for God has scattered the bones of the enemy;
  they are put to shame, because God has rejected them.
6 Oh, that Israel's deliverance would come out of Zion! *
  when God restores the fortunes of his people
  Jacob will rejoice and Israel be glad.`,
  },

  54: {
    title: "Deus, in nomine",
    bcpRef: "BCP p. 658",
    content:
`1 Save me, O God, by your Name; *
  in your might, defend my cause.
2 Hear my prayer, O God; *
  give ear to the words of my mouth.
3 For the arrogant have risen up against me,
  and the ruthless have sought my life, *
  those who have no regard for God.
4 Behold, God is my helper; *
  it is the Lord who sustains my life.
5 Render evil to those who spy on me; *
  in your faithfulness, destroy them.
6 I will offer you a freewill sacrifice *
  and praise your Name, O Lord, for it is good.
7 For you have rescued me from every trouble, *
  and my eye has seen the ruin of my foes.`,
  },

  55: {
    title: "Exaudi, Deus",
    bcpRef: "BCP p. 659",
    content:
`1 Hear my prayer, O God; *
  do not hide yourself from my petition.
2 Listen to me and answer me; *
  I have no peace, because of my cares.
3 I am shaken by the noise of the enemy *
  and by the pressure of the wicked;
4 For they have cast an evil spell upon me *
  and are set against me in fury.
5 My heart quakes within me, *
  and the terrors of death have fallen upon me.
6 Fear and trembling have come over me, *
  and horror overwhelms me.
7 And I said, "Oh, that I had wings like a dove! *
  I would fly away and be at rest.
8 I would flee to a far-off place *
  and make my lodging in the wilderness.
9 I would hasten to escape *
  from the stormy wind and tempest."
10 Swallow them up, O Lord;
  confound their speech; *
  for I have seen violence and strife in the city.
11 Day and night the watchmen make their rounds upon her walls, *
  but trouble and misery are in the midst of her.
12 There is corruption at her heart; *
  her streets are never free of oppression and deceit.
13 For had it been an adversary who taunted me,
  then I could have borne it; *
  or had it been an enemy who vaunted himself against me,
  then I could have hidden from him.
14 But it was you, a man after my own heart, *
  my companion, my own familiar friend.
15 We took sweet counsel together, *
  and walked with the throng in the house of God.
16 Let death come upon them suddenly;
  let them go down alive to the grave; *
  for wickedness is in their dwellings, in their very midst.
17 But I will call upon God, *
  and the Lord will deliver me.
18 In the evening, in the morning, and at noonday,
  I will complain and lament, *
  and he will hear my voice.
19 He will bring me safely back from the battle waged against me; *
  for there are many who fight me.
20 God, who is enthroned of old, will hear me and bring them down; *
  they never change; they do not fear God.
21 My companion stretched forth his hand against his comrade; *
  he has broken his covenant.
22 His speech is softer than butter, *
  but war is in his heart.
23 His words are smoother than oil, *
  but they are drawn swords.
24 Cast your burden upon the Lord,
  and he will sustain you; *
  he will never let the righteous stumble.
25 For you will bring the bloodthirsty and deceitful *
  down to the pit of destruction, O God.
26 They shall not live out half their days, *
  but I will put my trust in you.`,
  },

  56: {
    title: "Miserere mei, Deus",
    bcpRef: "BCP p. 661",
    content:
`1 Have mercy on me, O God,
  for my enemies are hounding me; *
  all day long they assault and oppress me.
2 They hound me all the day long; *
  truly there are many who fight against me, O Most High.
3 Whenever I am afraid, *
  I will put my trust in you.
4 In God, whose word I praise,
  in God I trust and will not be afraid, *
  for what can flesh do to me?
5 All day long they damage my cause; *
  their only thought is to do me evil.
6 They band together; they lie in wait; *
  they spy upon my footsteps;
  because they seek my life.
7 Shall they escape despite their wickedness? *
  O God, in your anger, cast down the peoples.
8 You have noted my lamentation;
  put my tears into your bottle; *
  are they not recorded in your book?
9 Whenever I call upon you, my enemies will be put to flight; *
  this I know, for God is on my side.
10 In God the Lord, whose word I praise,
  in God I trust and will not be afraid, *
  for what can mortals do to me?
11 I am bound by the vow I made to you, O God; *
  I will present to you thank-offerings;
12 For you have rescued my soul from death and my feet from stumbling, *
  that I may walk before God in the light of the living.`,
  },

  57: {
    title: "Miserere mei, Deus",
    bcpRef: "BCP p. 662",
    content:
`1 Be merciful to me, O God, be merciful,
  for I have taken refuge in you; *
  in the shadow of your wings will I take refuge
  until this time of trouble has gone by.
2 I will call upon the Most High God, *
  the God who maintains my cause.
3 He will send from heaven and save me;
  he will confound those who trample upon me; *
  God will send forth his love and his faithfulness.
4 I lie in the midst of lions that devour the people; *
  their teeth are spears and arrows,
  their tongue a sharp sword.
5 They have laid a net for my feet,
  and I am bowed low; *
  they have dug a pit before me,
  but have fallen into it themselves.
6 Exalt yourself above the heavens, O God, *
  and your glory over all the earth.
7 My heart is firmly fixed, O God, my heart is fixed; *
  I will sing and make melody.
8 Wake up, my spirit;
  awake, lute and harp; *
  I myself will waken the dawn.
9 I will confess you among the peoples, O Lord; *
  I will sing praise to you among the nations.
10 For your loving-kindness is greater than the heavens, *
  and your faithfulness reaches to the clouds.
11 Exalt yourself above the heavens, O God, *
  and your glory over all the earth.`,
  },

  58: {
    title: "Si vere utique",
    bcpRef: "BCP p. 663",
    content:
`1 Do you indeed decree righteousness, you rulers? *
  do you judge the peoples with equity?
2 No; you devise evil in your hearts, *
  and your hands deal out violence in the land.
3 The wicked are perverse from the womb; *
  liars go astray from their birth.
4 They are as venomous as a serpent, *
  they are like the deaf adder which stops its ears,
5 Which does not heed the voice of the charmer, *
  no matter how skillful his charming.
6 O God, break their teeth in their mouths; *
  pull the fangs of the young lions, O Lord.
7 Let them vanish like water that runs off; *
  let them wither like trodden grass.
8 Let them be like the snail that melts away, *
  like a stillborn child that never sees the sun.
9 Before they bear fruit, let them be cut down like a brier; *
  like thorns and thistles let them be swept away.
10 The righteous will be glad when they see the vengeance; *
  they will bathe their feet in the blood of the wicked.
11 And they will say,
  "Surely, there is a reward for the righteous; *
  surely, there is a God who rules in the earth."`,
  },

  59: {
    title: "Eripe me de inimicis",
    bcpRef: "BCP p. 664",
    content:
`1 Rescue me from my enemies, O God; *
  protect me from those who rise up against me.
2 Rescue me from evildoers *
  and save me from those who thirst for my blood.
3 See how they lie in wait for my life,
  how the mighty gather together against me; *
  not for any offense or fault of mine, O Lord.
4 Not because of any guilt of mine *
  they run and prepare themselves for battle.
5 Rouse yourself, come to my side, and see; *
  for you, Lord God of hosts, are Israel's God.
6 Awake, and punish all the ungodly; *
  show no mercy to those who are faithless and evil.
7 They go to and fro in the evening; *
  they snarl like dogs and run about the city.
8 Behold, they boast with their mouths,
  and taunts are on their lips; *
  "For who," they say, "will hear us?"
9 But you, O Lord, you laugh at them; *
  you laugh all the ungodly to scorn.
10 My eyes are fixed on you, O my Strength; *
  for you, O God, are my stronghold.
11 My merciful God comes to meet me; *
  God will let me look in triumph on my enemies.
12 Slay them, O God, lest my people forget; *
  send them reeling by your might
  and put them down, O Lord our shield.
13 For the sins of their mouths, for the words of their lips,
  for the cursing and lies that they utter, *
  let them be caught in their pride.
14 Make an end of them in your wrath; *
  make an end of them, and they shall be no more.
15 Let everyone know that God rules in Jacob, *
  and to the ends of the earth.
16 They go to and fro in the evening; *
  they snarl like dogs and run about the city.
17 They forage for food, *
  and if they are not filled, they howl.
18 For my part, I will sing of your strength; *
  I will celebrate your love in the morning;
19 For you have become my stronghold, *
  a refuge in the day of my trouble.
20 To you, O my Strength, will I sing; *
  for you, O God, are my stronghold and my merciful God.`,
  },

  60: {
    title: "Deus, repulisti nos",
    bcpRef: "BCP p. 666",
    content:
`1 O God, you have cast us off and broken us; *
  you have been angry;
  oh, take us back to you again.
2 You have shaken the earth and split it open; *
  repair the cracks in it, for it totters.
3 You have made your people know hardship; *
  you have given us wine that makes us stagger.
4 You have set up a banner for those who fear you, *
  to be a refuge from the power of the bow.
5 Save us by your right hand and answer us, *
  that those who are dear to you may be delivered.
6 God spoke from his holy place and said: *
  "I will exult and parcel out Shechem;
  I will divide the valley of Succoth.
7 Gilead is mine and Manasseh is mine; *
  Ephraim is my helmet and Judah my scepter.
8 Moab is my wash-basin,
  on Edom I throw down my sandal to claim it, *
  and over Philistia will I shout in triumph."
9 Who will lead me into the strong city? *
  who will bring me to Edom?
10 Have you not cast us off, O God? *
  you no longer go out, O God, with our armies.
11 Grant us your help against the enemy, *
  for vain is the help of man.
12 With God we will do valiant deeds, *
  and he shall tread our enemies under foot.`,
  },

  64: {
    title: "Exaudi, Deus",
    bcpRef: "BCP p. 670",
    content:
`1 Hear my voice, O God, when I complain; *
  protect my life from fear of the enemy.
2 Hide me from the conspiracy of the wicked, *
  from the mob of evildoers.
3 They sharpen their tongue like a sword, *
  and aim their bitter words like arrows,
4 That they may shoot down the blameless from ambush; *
  they shoot without warning and are not afraid.
5 They hold fast to their evil course; *
  they plan how they may hide their snares.
6 They say, "Who will see us?
  who will find out our crimes? *
  we have thought out a perfect plot."
7 The human mind and heart are a mystery; *
  but God will loose an arrow at them,
  and suddenly they will be wounded.
8 He will make them trip over their tongues, *
  and all who see them will shake their heads.
9 Everyone will stand in awe and declare God's deeds; *
  they will recognize his works.
10 The righteous will rejoice in the Lord and put their trust in him, *
  and all who are true of heart will glory.`,
  },

  65: {
    title: "Te decet hymnus",
    bcpRef: "BCP p. 671",
    content:
`1 You are to be praised, O God, in Zion; *
  to you shall vows be performed in Jerusalem.
2 To you that hear prayer shall all flesh come, *
  because of their transgressions.
3 Our sins are stronger than we are, *
  but you will blot them out.
4 Happy are they whom you choose
  and draw to your courts to dwell there! *
  they will be satisfied by the beauty of your house,
  by the holiness of your temple.
5 Awesome things will you show us in your righteousness,
  O God of our salvation, *
  O Hope of all the ends of the earth
  and of the seas that are far away.
6 You make fast the mountains by your power; *
  they are girded about with might.
7 You still the roaring of the seas, *
  the roaring of their waves,
  and the clamor of the peoples.
8 Those who dwell at the ends of the earth will tremble at your marvelous signs; *
  you make the dawn and the dusk to sing for joy.
9 You visit the earth and water it abundantly;
  you make it very plenteous; *
  the river of God is full of water.
10 You prepare the grain, *
  for so you provide for the earth.
11 You drench the furrows and smooth out the ridges; *
  with heavy rain you soften the ground and bless its increase.
12 You crown the year with your goodness, *
  and your paths overflow with plenty.
13 May the fields of the wilderness be rich for grazing, *
  and the hills be clothed with joy.
14 May the meadows cover themselves with flocks,
  and the valleys cloak themselves with grain; *
  let them shout for joy and sing.`,
  },

  66: {
    title: "Jubilate Deo",
    bcpRef: "BCP p. 673",
    content:
`1 Be joyful in God, all you lands; *
  sing the glory of his Name;
  sing the glory of his praise.
2 Say to God, "How awesome are your deeds! *
  because of your great strength your enemies cringe before you.
3 All the earth bows down before you, *
  sings to you, sings out your Name."
4 Come now and see the works of God, *
  how wonderful he is in his doing toward all people.
5 He turned the sea into dry land,
  so that they went through the water on foot, *
  and there we rejoiced in him.
6 In his might he rules for ever;
  his eyes keep watch over the nations; *
  let no rebel rise up against him.
7 Bless our God, you peoples; *
  make the voice of his praise to be heard;
8 Who holds our souls in life, *
  and will not allow our feet to slip.
9 For you, O God, have proved us; *
  you have tried us just as silver is tried.
10 You brought us into the snare; *
  you laid heavy burdens upon our backs.
11 You let enemies ride over our heads;
  we went through fire and water; *
  but you brought us out into a place of refreshment.
12 I will enter your house with burnt-offerings
  and will pay you my vows, *
  which I promised with my lips
  and spoke with my mouth when I was in trouble.
13 I will offer you sacrifices of fat beasts
  with the smoke of rams; *
  I will give you oxen and goats.
14 Come and listen, all you who fear God, *
  and I will tell you what he has done for me.
15 I called out to him with my mouth, *
  and his praise was on my tongue.
16 If I had found evil in my heart, *
  the Lord would not have heard me;
17 But in truth God has heard me; *
  he has attended to the voice of my prayer.
18 Blessed be God, who has not rejected my prayer, *
  nor withheld his love from me.`,
  },

  68: {
    title: "Exsurgat Deus",
    bcpRef: "BCP p. 675",
    content:
`1 Let God arise, and let his enemies be scattered; *
  let those who hate him flee before him.
2 Let them vanish like smoke when the wind drives it away; *
  as the wax melts at the fire, so let the wicked perish at the presence of God.
3 But let the righteous be glad and rejoice before God; *
  let them also be merry and joyful.
4 Sing to God, sing praises to his Name;
  exalt him who rides upon the heavens; *
  Yahweh is his Name, rejoice before him!
5 Father of orphans, defender of widows, *
  God in his holy habitation!
6 God gives the solitary a home and brings forth prisoners into freedom; *
  but the rebels shall live in dry places.
7 O God, when you went forth before your people, *
  when you marched through the wilderness,
8 The earth shook, and the skies poured down rain,
  at the presence of God, the God of Sinai, *
  at the presence of God, the God of Israel.
9 You sent a gracious rain, O God, upon your inheritance; *
  you refreshed the land when it was weary.
10 Your people found their home in it; *
  in your goodness, O God, you have made provision for the poor.
11 The Lord gave the word; *
  great was the company of women who bore the tidings:
12 "Kings with their armies are fleeing away; *
  the women at home are dividing the spoils."
13 Though you lingered among the sheepfolds, *
  you shall be like a dove whose wings are covered with silver,
  whose feathers are like green gold.
14 When the Almighty scattered kings, *
  it was like snow falling in Zalmon.
15 O mighty mountain, O hill of Bashan! *
  O rugged mountain, O hill of Bashan!
16 Why do you look with envy, O rugged mountain,
  at the hill which God chose for his resting place? *
  truly, the Lord will dwell there for ever.
17 The chariots of God are twenty thousand,
  even thousands of thousands; *
  the Lord comes in holiness from Sinai.
18 You have gone up on high and led captivity captive;
  you have received gifts even from your enemies, *
  that the Lord God might dwell among them.
19 Blessed be the Lord day by day, *
  the God of our salvation, who bears our burdens.
20 He is our God, the God of our salvation; *
  God is the Lord, by whom we escape death.
21 God shall crush the heads of his enemies, *
  and the hairy scalp of those who go on still in their wickedness.
22 The Lord has said, "I will bring them back from Bashan; *
  I will bring them back from the depths of the sea;
23 That your foot may be dipped in blood, *
  the tongues of your dogs in the blood of your enemies."
24 They see your procession, O God, *
  your procession into the sanctuary, my God and my King.
25 The singers go before, musicians follow after, *
  in the midst of maidens playing upon the hand-drums.
26 Bless God in the congregation; *
  bless the Lord, you that are of the fountain of Israel.
27 There is Benjamin, least of the tribes, at the head;
  the princes of Judah in a company; *
  and the princes of Zebulon and Naphtali.
28 Send forth your strength, O God; *
  establish, O God, what you have wrought for us.
29 Kings shall bring gifts to you, *
  for your temple's sake at Jerusalem.
30 Rebuke the wild beast of the reeds, *
  and the peoples, a herd of wild bulls with its calves.
31 Trample down those who lust after silver; *
  scatter the peoples that delight in war.
32 Let tribute be brought out of Egypt; *
  let Ethiopia stretch out her hands to God.
33 Sing to God, O kingdoms of the earth; *
  sing praises to the Lord.
34 He rides in the heavens, the ancient heavens; *
  he sends forth his voice, his mighty voice.
35 Ascribe power to God; *
  his majesty is over Israel;
  his strength is in the skies.
36 How wonderful is God in his holy places! *
  the God of Israel giving strength and power to his people!
  Blessed be God!`,
  },

  69: {
    title: "Salvum me fac",
    bcpRef: "BCP p. 678",
    content:
`1 Save me, O God, *
  for the waters have risen up to my neck.
2 I am sinking in deep mire, *
  and there is no firm ground for my feet.
3 I have come into deep waters, *
  and the torrent washes over me.
4 I have grown weary with my crying;
  my throat is inflamed; *
  my eyes have failed from looking for my God.
5 Those who hate me without a cause are more than the hairs of my head;
  my lying foes who would destroy me are mighty. *
  Must I then give back what I never stole?
6 O God, you know my foolishness, *
  and my faults are not hidden from you.
7 Let not those who hope in you be put to shame through me, Lord God of hosts; *
  let not those who seek you be disgraced because of me, O God of Israel.
8 Surely, for your sake have I suffered reproach, *
  and shame has covered my face.
9 I have become a stranger to my own kindred, *
  an alien to my mother's children.
10 Zeal for your house has eaten me up; *
  the scorn of those who scorn you has fallen upon me.
11 I humbled myself with fasting, *
  but that was turned to my reproach.
12 I put on sack-cloth also, *
  and became a byword among them.
13 Those who sit at the gate murmur against me, *
  and the drunkards make songs about me.
14 But as for me, this is my prayer to you, *
  at the time you have set, O Lord:
15 "In your great mercy, O God, *
  answer me with your unfailing help.
16 Save me from the mire; do not let me sink; *
  let me be rescued from those who hate me
  and out of the deep waters.
17 Let not the torrent of waters wash over me,
  neither let the deep swallow me up; *
  do not let the Pit shut its mouth upon me.
18 Answer me, O Lord, for your love is kind; *
  in your great compassion, turn to me."
19 "Hide not your face from your servant; *
  be swift and answer me, for I am in distress.
20 Draw near to me and redeem me; *
  because of my enemies deliver me.
21 You know my reproach, my shame, and my dishonor; *
  my adversaries are all in your sight."
22 Reproach has broken my heart, and it cannot be healed; *
  I looked for sympathy, but there was none,
  for comforters, but I could find no one.
23 They gave me gall to eat, *
  and when I was thirsty, they gave me vinegar to drink.
24 Let the table before them be a trap *
  and their sacred feasts a snare.
25 Let their eyes be darkened, that they may not see, *
  and give them continual trembling in their loins.
26 Pour out your indignation upon them, *
  and let the fierceness of your anger overtake them.
27 Let their camp be desolate, *
  and let there be none to dwell in their tents.
28 For they persecute him whom you have stricken *
  and add to the pain of those whom you have pierced.
29 Lay to their charge guilt upon guilt, *
  and let them not receive your vindication.
30 Let them be wiped out of the book of the living *
  and not be written among the righteous.
31 As for me, I am afflicted and in pain; *
  your help, O God, will lift me up on high.
32 I will praise the Name of God in song; *
  I will proclaim his greatness with thanksgiving.
33 This will please the Lord more than an offering of oxen, *
  more than bullocks with horns and hoofs.
34 The afflicted shall see and be glad; *
  you who seek God, your heart shall live.
35 For the Lord listens to the needy, *
  and his prisoners he does not despise.
36 Let the heavens and the earth praise him, *
  the seas and all that moves in them;
37 For God will save Zion and rebuild the cities of Judah; *
  they shall live there and have it in possession.
38 The children of his servants will inherit it, *
  and those who love his Name will dwell therein.`,
  },

  73: {
    title: "Quam bonus Israel!",
    bcpRef: "BCP p. 686",
    content:
`1 Truly, God is good to Israel, *
  to those who are pure in heart.
2 But as for me, my feet had nearly slipped; *
  I had almost tripped and fallen;
3 Because I envied the proud *
  and saw the prosperity of the wicked:
4 For they suffer no pain, *
  and their bodies are sleek and sound;
5 In the misfortunes of others they have no share; *
  they are not afflicted as others are;
6 Therefore they wear their pride like a necklace *
  and wrap their violence about them like a cloak.
7 Their iniquity comes from gross minds, *
  and their hearts overflow with wicked thoughts.
8 They scoff and speak maliciously; *
  out of their haughtiness they plan oppression.
9 They set their mouths against the heavens, *
  and their evil speech runs through the world.
10 And so the people turn to them *
  and find in them no fault.
11 They say, "How should God know? *
  is there knowledge in the Most High?"
12 So then, these are the wicked; *
  always at ease, they increase their wealth.
13 In vain have I kept my heart clean, *
  and washed my hands in innocence.
14 I have been afflicted all day long, *
  and punished every morning.
15 Had I gone on speaking this way, *
  I should have betrayed the generation of your children.
16 When I tried to understand these things, *
  it was too hard for me;
17 Until I entered the sanctuary of God *
  and discerned the end of the wicked.
18 Surely, you set them in slippery places; *
  you cast them down in ruin.
19 Oh, how suddenly do they come to destruction, *
  come to an end, and perish from terror!
20 Like a dream when one awakens, O Lord, *
  when you arise you will make their image vanish.
21 When my mind became embittered, *
  I was sorely wounded in my heart.
22 I was stupid and had no understanding; *
  I was like a brute beast in your presence.
23 Yet I am always with you; *
  you hold me by my right hand.
24 You will guide me by your counsel, *
  and afterwards receive me with glory.
25 Whom have I in heaven but you? *
  and having you I desire nothing upon earth.
26 Though my flesh and my heart should waste away, *
  God is the strength of my heart and my portion for ever.
27 Truly, those who forsake you will perish; *
  you destroy all who are unfaithful.
28 But it is good for me to be near God; *
  I have made the Lord God my refuge.
29 I will speak of all your works *
  in the gates of the city of Zion.`,
  },

  74: {
    title: "Ut quid, Deus?",
    bcpRef: "BCP p. 688",
    content:
`1 O God, why have you utterly cast us off? *
  why is your wrath so hot against the sheep of your pasture?
2 Remember your congregation that you purchased long ago, *
  the tribe you redeemed to be your inheritance,
  and Mount Zion where you dwell.
3 Turn your steps toward the endless ruins; *
  the enemy has laid waste everything in your sanctuary.
4 Your adversaries roared in your holy place; *
  they set up their banners as tokens of victory.
5 They were like men coming up with axes to a grove of trees; *
  they broke down all your carved work with hatchets and hammers.
6 They set fire to your holy place; *
  they defiled the dwelling-place of your Name
  and razed it to the ground.
7 They said to themselves, "Let us destroy them altogether." *
  They burned down all the meeting-places of God in the land.
8 There are no signs for us to see;
  there is no prophet left; *
  there is not one among us who knows how long.
9 How long, O God, will the adversary scoff? *
  will the enemy blaspheme your Name for ever?
10 Why do you draw back your hand? *
  why is your right hand hidden in your bosom?
11 Yet God is my King from ancient times, *
  victorious in the midst of the earth.
12 You divided the sea by your might *
  and shattered the heads of the dragons upon the waters;
13 You crushed the heads of Leviathan *
  and gave him to the people of the desert for food.
14 You split open spring and torrent; *
  you dried up ever-flowing rivers.
15 Yours is the day, yours also the night; *
  you established the moon and the sun.
16 You fixed all the boundaries of the earth; *
  you made both summer and winter.
17 Remember, O Lord, how the enemy scoffed, *
  how a foolish people despised your Name.
18 Do not hand over the life of your dove to wild beasts; *
  never forget the lives of your poor.
19 Look upon your covenant; *
  the dark places of the earth are haunts of violence.
20 Let not the oppressed turn away ashamed; *
  let the poor and needy praise your Name.
21 Arise, O God, maintain your cause; *
  remember how fools revile you all day long.
22 Forget not the clamor of your adversaries, *
  the unending tumult of those who rise up against you.`,
  },

  75: {
    title: "Confitebimur tibi",
    bcpRef: "BCP p. 689",
    content:
`1 We give you thanks, O God, we give you thanks, *
  calling upon your Name and declaring all your wonderful deeds.
2 "I will appoint a time," says God; *
  "I will judge with equity.
3 Though the earth and all its inhabitants are quaking, *
  I will make its pillars fast.
4 I will say to the boasters, 'Boast no more,' *
  and to the wicked, 'Do not toss your horns;
5 Do not toss your horns so high, *
  nor speak with a proud neck.'"
6 For judgment is neither from the east nor from the west, *
  nor yet from the wilderness or the mountains.
7 It is God who judges; *
  he puts down one and lifts up another.
8 For in the Lord's hand there is a cup,
  full of spiced and foaming wine, which he pours out, *
  and all the wicked of the earth shall drink and drain the dregs.
9 But I will rejoice for ever; *
  I will sing praises to the God of Jacob.
10 He shall break off all the horns of the wicked; *
  but the horns of the righteous shall be exalted.`,
  },

  76: {
    title: "Notus in Judaea",
    bcpRef: "BCP p. 690",
    content:
`1 In Judah is God known; *
  his Name is great in Israel.
2 At Salem is his tabernacle, *
  and his dwelling is in Zion.
3 There he broke the flashing arrows, *
  the shield, the sword, and the weapons of battle.
4 How glorious you are! *
  more splendid than the everlasting mountains!
5 The strong of heart have been despoiled;
  they sink into sleep; *
  none of the warriors can lift a hand.
6 At your rebuke, O God of Jacob, *
  both horse and rider lie stunned.
7 What terror you inspire! *
  who can stand before you when you are angry?
8 From heaven you pronounced judgment; *
  the earth was afraid and was still;
9 When God rose up to judgment *
  and to save all the oppressed of the earth.
10 Truly, wrathful Edom will give you thanks, *
  and the remnant of Hamath will keep your feasts.
11 Make a vow to the Lord your God and keep it; *
  let all around him bring gifts to him who is worthy to be feared.
12 He breaks the spirit of princes, *
  and strikes terror in the kings of the earth.`,
  },

  77: {
    title: "Voce mea ad Dominum",
    bcpRef: "BCP p. 691",
    content:
`1 I will cry aloud to God; *
  I will cry aloud, and he will hear me.
2 In the day of my trouble I sought the Lord; *
  my hands were stretched out by night and did not tire;
  I refused to be comforted.
3 I think of God, I am restless, *
  I ponder, and my spirit faints.
4 You will not let my eyelids close; *
  I am troubled and I cannot speak.
5 I consider the days of old; *
  I remember the years long past;
6 I commune with my heart in the night; *
  I ponder and search my mind.
7 Will the Lord cast me off for ever? *
  will he no more show his favor?
8 Has his loving-kindness come to an end for ever? *
  has his promise failed for evermore?
9 Has God forgotten to be gracious? *
  has he, in his anger, withheld his compassion?
10 And I said, "My grief is this: *
  the right hand of the Most High has lost its power."
11 I will remember the works of the Lord, *
  and call to mind your wonders of old time.
12 I will meditate on all your acts *
  and ponder your mighty deeds.
13 Your way, O God, is holy; *
  who is so great a god as our God?
14 You are the God who works wonders *
  and have declared your power among the peoples.
15 By your strength you have redeemed your people, *
  the children of Jacob and Joseph.
16 The waters saw you, O God;
  the waters saw you and trembled; *
  the very depths were shaken.
17 The clouds poured out water;
  the skies thundered; *
  your arrows flashed to and fro;
18 The sound of your thunder was in the whirlwind;
  your lightnings lit up the world; *
  the earth trembled and shook.
19 Your way was in the sea,
  and your paths in the great waters, *
  yet your footsteps were not seen.
20 You led your people like a flock *
  by the hand of Moses and Aaron.`,
  },

  78: {
    title: "Attendite, popule",
    bcpRef: "BCP p. 693",
    content:
`1 Hear my teaching, O my people; *
  incline your ears to the words of my mouth.
2 I will open my mouth in a parable; *
  I will declare the mysteries of ancient times.
3 That which we have heard and known,
  and what our forefathers have told us, *
  we will not hide from their children.
4 We will recount to generations to come
  the praiseworthy deeds and the power of the Lord, *
  and the wonderful works he has done.
5 He gave his decrees to Jacob
  and established a law for Israel, *
  which he commanded them to teach their children;
6 That the generations to come might know,
  and the children yet unborn; *
  that they in their turn might tell it to their children;
7 So that they might put their trust in God, *
  and not forget the deeds of God,
  but keep his commandments;
8 And not be like their forefathers,
  a stubborn and rebellious generation, *
  a generation whose heart was not steadfast,
  and whose spirit was not faithful to God.
9 The people of Ephraim, armed with the bow, *
  turned back in the day of battle;
10 They did not keep the covenant of God, *
  and refused to walk in his law;
11 They forgot what he had done, *
  and the wonders he had shown them.
12 He worked marvels in the sight of their forefathers, *
  in the land of Egypt, in the field of Zoan.
13 He split open the sea and let them pass through; *
  he made the waters stand up like walls.
14 He led them with a cloud by day, *
  and all the night through with a glow of fire.
15 He split the hard rocks in the wilderness *
  and gave them drink as from the great deep.
16 He brought streams out of the cliff, *
  and the waters gushed out like rivers.
17 But they went on sinning against him, *
  rebelling in the desert against the Most High.
18 They tested God in their hearts, *
  demanding food for their craving.
19 They railed against God and said, *
  "Can God set a table in the wilderness?
20 True, he struck the rock, the waters gushed out, and the gullies overflowed; *
  but is he able to give bread
  or to provide meat for his people?"
21 When the Lord heard this, he was full of wrath; *
  a fire was kindled against Jacob,
  and his anger mounted against Israel;
22 For they had no faith in God, *
  nor did they put their trust in his saving power.
23 So he commanded the clouds above *
  and opened the doors of heaven.
24 He rained down manna upon them to eat *
  and gave them grain from heaven.
25 So mortals ate the bread of angels; *
  he provided for them food enough.
26 He caused the east wind to blow in the heavens *
  and led out the south wind by his might.
27 He rained down flesh upon them like dust *
  and wingèd birds like the sand of the sea.
28 He let it fall in the midst of their camp *
  and round about their dwellings.
29 So they ate and were well filled, *
  for he gave them what they craved.
30 But they did not stop their craving, *
  though the food was still in their mouths.
31 So God's anger mounted against them; *
  he slew their strongest men
  and laid low the youth of Israel.
32 In spite of all this, they went on sinning *
  and had no faith in his wonderful works.
33 So he brought their days to an end like a breath *
  and their years in sudden terror.
34 Whenever he slew them, they would seek him, *
  and repent, and diligently search for God.
35 They would remember that God was their rock, *
  and the Most High God their redeemer.
36 But they flattered him with their mouths *
  and lied to him with their tongues.
37 Their heart was not steadfast toward him, *
  and they were not faithful to his covenant.
38 But he was so merciful that he forgave their sins
  and did not destroy them; *
  many times he held back his anger
  and did not permit his wrath to be roused.
39 For he remembered that they were but flesh, *
  a breath that goes forth and does not return.
40 How often the people disobeyed him in the wilderness *
  and offended him in the desert!
41 Again and again they tempted God *
  and provoked the Holy One of Israel.
42 They did not remember his power *
  in the day when he ransomed them from the enemy;
43 How he wrought his signs in Egypt *
  and his omens in the field of Zoan.
44 He turned their rivers into blood, *
  so that they could not drink of their streams.
45 He sent swarms of flies among them, which ate them up, *
  and frogs, which destroyed them.
46 He gave their crops to the caterpillar, *
  the fruit of their toil to the locust.
47 He killed their vines with hail *
  and their sycamores with frost.
48 He delivered their cattle to hailstones *
  and their livestock to hot thunderbolts.
49 He poured out upon them his blazing anger: *
  fury, indignation, and distress,
  a troop of destroying angels.
50 He gave full rein to his anger;
  he did not spare their souls from death; *
  but delivered their lives to the plague.
51 He struck down all the firstborn of Egypt, *
  the flower of manhood in the dwellings of Ham.
52 He led out his people like sheep *
  and guided them in the wilderness like a flock.
53 He led them to safety, and they were not afraid; *
  but the sea overwhelmed their enemies.
54 He brought them to his holy land, *
  the mountain his right hand had won.
55 He drove out the Canaanites before them
  and apportioned an inheritance to them by lot; *
  he made the tribes of Israel to dwell in their tents.
56 But they tested the Most High God, and defied him, *
  and did not keep his commandments.
57 They turned away and were disloyal like their fathers; *
  they were undependable like a warped bow.
58 They grieved him with their hill-altars *
  they provoked his displeasure with their idols.
59 When God heard this, he was angry *
  and utterly rejected Israel.
60 He forsook the shrine at Shiloh, *
  the tabernacle where he had lived among his people.
61 He delivered the ark into captivity, *
  his glory into the adversary's hand.
62 He gave his people to the sword *
  and was angered against his inheritance.
63 The fire consumed their young men; *
  there were no wedding songs for their maidens.
64 Their priests fell by the sword, *
  and their widows made no lamentation.
65 Then the Lord woke as though from sleep, *
  like a warrior refreshed with wine.
66 He struck his enemies on the backside *
  and put them to perpetual shame.
67 He rejected the tent of Joseph *
  and did not choose the tribe of Ephraim;
68 He chose instead the tribe of Judah *
  and Mount Zion, which he loved.
69 He built his sanctuary like the heights of heaven, *
  like the earth which he founded for ever.
70 He chose David his servant, *
  and took him away from the sheepfolds.
71 He brought him from following the ewes, *
  to be a shepherd over Jacob his people
  and over Israel his inheritance.
72 So he shepherded them with a faithful and true heart *
  and guided them with the skillfulness of his hands.`,
  },

  79: {
    title: "Deus, venerunt",
    bcpRef: "BCP p. 700",
    content:
`1 O God, the heathen have come into your inheritance;
  they have profaned your holy temple; *
  they have made Jerusalem a heap of rubble.
2 They have given the bodies of your servants as food for the birds of the air, *
  and the flesh of your faithful ones to the beasts of the field.
3 They have shed their blood like water on every side of Jerusalem, *
  and there was no one to bury them.
4 We have become a reproach to our neighbors, *
  an object of scorn and derision to those around us.
5 How long will you be angry, O Lord? *
  will your fury blaze like fire for ever?
6 Pour out your wrath upon the heathen who have not known you *
  and upon the kingdoms that have not called upon your Name.
7 For they have devoured Jacob *
  and made his dwelling a ruin.
8 Remember not our past sins;
  let your compassion be swift to meet us; *
  for we have been brought very low.
9 Help us, O God our Savior, for the glory of your Name; *
  deliver us and forgive us our sins, for your Name's sake.
10 Why should the heathen say, "Where is their God?" *
  Let it be known among the heathen and in our sight
  that you avenge the shedding of your servants' blood.
11 Let the sorrowful sighing of the prisoners come before you, *
  and by your great might spare those who are condemned to die.
12 May the revilings with which they reviled you, O Lord, *
  return seven-fold into their bosoms.
13 For we are your people and the sheep of your pasture; *
  we will give you thanks for ever
  and show forth your praise from age to age.`,
  },

  80: {
    title: "Qui regis Israel",
    bcpRef: "BCP p. 701",
    content:
`1 Hear, O Shepherd of Israel, leading Joseph like a flock; *
  shine forth, you that are enthroned upon the cherubim.
2 In the presence of Ephraim, Benjamin, and Manasseh, *
  stir up your strength and come to help us.
3 Restore us, O God of hosts; *
  show the light of your countenance, and we shall be saved.
4 O Lord God of hosts, *
  how long will you be angered
  despite the prayers of your people?
5 You have fed them with the bread of tears; *
  you have given them bowls of tears to drink.
6 You have made us the derision of our neighbors, *
  and our enemies laugh us to scorn.
7 Restore us, O God of hosts; *
  show the light of your countenance, and we shall be saved.
8 You have brought a vine out of Egypt; *
  you cast out the nations and planted it.
9 You prepared the ground for it; *
  it took root and filled the land.
10 The mountains were covered by its shadow *
  and the towering cedar trees by its boughs.
11 You stretched out its tendrils to the Sea *
  and its branches to the River.
12 Why have you broken down its wall, *
  so that all who pass by pluck off its grapes?
13 The wild boar of the forest has ravaged it, *
  and the beasts of the field have grazed upon it.
14 Turn now, O God of hosts, look down from heaven;
  behold and tend this vine; *
  preserve what your right hand has planted.
15 They burn it with fire like rubbish; *
  at the rebuke of your countenance let them perish.
16 Let your hand be upon the man of your right hand, *
  the son of man you have made so strong for yourself.
17 And so will we never turn away from you; *
  give us life, that we may call upon your Name.
18 Restore us, O Lord God of hosts; *
  show the light of your countenance, and we shall be saved.`,
  },

  81: {
    title: "Exultate Deo",
    bcpRef: "BCP p. 702",
    content:
`1 Sing with joy to God our strength *
  and raise a loud shout to the God of Jacob.
2 Raise a song and sound the timbrel, *
  the merry harp, and the lyre.
3 Blow the ram's-horn at the new moon, *
  and at the full moon, the day of our feast.
4 For this is a statute for Israel, *
  a law of the God of Jacob.
5 He laid it as a solemn charge upon Joseph, *
  when he came out of the land of Egypt.
6 I heard an unfamiliar voice saying, *
  "I eased his shoulder from the burden;
  his hands were set free from bearing the load."
7 You called on me in trouble, and I saved you; *
  I answered you from the secret place of thunder
  and tested you at the waters of Meribah.
8 Hear, O my people, and I will admonish you: *
  O Israel, if you would but listen to me!
9 There shall be no strange god among you; *
  you shall not worship a foreign god.
10 I am the Lord your God,
  who brought you out of the land of Egypt and said, *
  "Open your mouth wide, and I will fill it."
11 And yet my people did not hear my voice, *
  and Israel would not obey me.
12 So I gave them over to the stubbornness of their hearts, *
  to follow their own devices.
13 Oh, that my people would listen to me! *
  that Israel would walk in my ways!
14 I should soon subdue their enemies *
  and turn my hand against their foes.
15 Those who hate the Lord would cringe before him, *
  and their punishment would last for ever.
16 But Israel would I feed with the finest wheat *
  and satisfy him with honey from the rock.`,
  },

  82: {
    title: "Deus stetit",
    bcpRef: "BCP p. 704",
    content:
`1 God takes his stand in the council of heaven; *
  he gives judgment in the midst of the gods:
2 "How long will you judge unjustly, *
  and show favor to the wicked?
3 Save the weak and the orphan; *
  defend the humble and needy;
4 Rescue the weak and the poor; *
  deliver them from the power of the wicked.
5 They do not know, neither do they understand;
  they go about in darkness; *
  all the foundations of the earth are shaken.
6 Now I say to you, 'You are gods, *
  and all of you children of the Most High;
7 Nevertheless, you shall die like mortals, *
  and fall like any prince.'"
8 Arise, O God, and rule the earth, *
  for you shall take all nations for your own.`,
  },

  83: {
    title: "Deus, quis similis?",
    bcpRef: "BCP p. 705",
    content:
`1 O God, do not be silent; *
  do not keep still nor hold your peace, O God;
2 For your enemies are in tumult, *
  and those who hate you have lifted up their heads.
3 They take secret counsel against your people *
  and plot against those whom you protect.
4 They have said, "Come, let us wipe them out from among the nations; *
  let the name of Israel be remembered no more."
5 They have conspired together; *
  they have made an alliance against you:
6 The tents of Edom and the Ishmaelites; *
  the Moabites and the Hagarenes;
7 Gebal, and Ammon, and Amalek; *
  the Philistines and those who dwell in Tyre.
8 The Assyrians also have joined them, *
  and have come to help the people of Lot.
9 Do to them as you did to Midian, *
  to Sisera, and to Jabin at the river of Kishon:
10 They were destroyed at Endor; *
  they became like dung upon the ground.
11 Make their leaders like Oreb and Zeëb, *
  and all their commanders like Zebah and Zalmunna,
12 Who said, "Let us take for ourselves *
  the fields of God as our possession."
13 O my God, make them like whirling dust *
  and like chaff before the wind;
14 Like fire that burns down a forest, *
  like the flame that sets mountains ablaze.
15 Drive them with your tempest *
  and terrify them with your storm;
16 Cover their faces with shame, O Lord, *
  that they may seek your Name.
17 Let them be disgraced and terrified for ever; *
  let them be put to confusion and perish.
18 Let them know that you, whose Name is Yahweh, *
  you alone are the Most High over all the earth.`,
  },

  85: {
    title: "Benedixisti, Domine",
    bcpRef: "BCP p. 707",
    content:
`1 You have been gracious to your land, O Lord, *
  you have restored the good fortune of Jacob.
2 You have forgiven the iniquity of your people *
  and blotted out all their sins.
3 You have withdrawn all your fury *
  and turned yourself from your wrathful indignation.
4 Restore us then, O God our Savior; *
  let your anger depart from us.
5 Will you be displeased with us for ever? *
  will you prolong your anger from age to age?
6 Will you not give us life again, *
  that your people may rejoice in you?
7 Show us your mercy, O Lord, *
  and grant us your salvation.
8 I will listen to what the Lord God is saying, *
  for he is speaking peace to his faithful people
  and to those who turn their hearts to him.
9 Truly, his salvation is very near to those who fear him, *
  that his glory may dwell in our land.
10 Mercy and truth have met together; *
  righteousness and peace have kissed each other.
11 Truth shall spring up from the earth, *
  and righteousness shall look down from heaven.
12 The Lord will indeed grant prosperity, *
  and our land will yield its increase.
13 Righteousness shall go before him, *
  and peace shall be a pathway for his feet.`,
  },

  86: {
    title: "Inclina, Domine",
    bcpRef: "BCP p. 708",
    content:
`1 Bow down your ear, O Lord, and answer me, *
  for I am poor and in misery.
2 Keep watch over my life, for I am faithful; *
  save your servant who puts his trust in you.
3 Be merciful to me, O Lord, for you are my God; *
  I call upon you all the day long.
4 Gladden the soul of your servant, *
  for to you, O Lord, I lift up my soul.
5 For you, O Lord, are good and forgiving, *
  and great is your love toward all who call upon you.
6 Give ear, O Lord, to my prayer, *
  and attend to the voice of my supplications.
7 In the time of my trouble I will call upon you, *
  for you will answer me.
8 Among the gods there is none like you, O Lord, *
  nor anything like your works.
9 All the nations you have made will come and worship you, O Lord, *
  and glorify your Name.
10 For you are great;
  you do wondrous things; *
  and you alone are God.
11 Teach me your way, O Lord,
  and I will walk in your truth; *
  knit my heart to you that I may fear your Name.
12 I will thank you, O Lord my God, with all my heart, *
  and glorify your Name for evermore.
13 For great is your love toward me; *
  you have delivered me from the nethermost Pit.
14 The arrogant rise up against me, O God,
  and a band of violent men seeks my life; *
  they have not set you before their eyes.
15 But you, O Lord, are gracious and full of compassion, *
  slow to anger, and full of kindness and truth.
16 Turn to me and have mercy upon me; *
  give your strength to your servant;
  and save the child of your handmaid.
17 Show me a sign of your favor,
  so that those who hate me may see it and be ashamed; *
  because you, O Lord, have helped me and comforted me.`,
  },

  87: {
    title: "Fundamenta ejus",
    bcpRef: "BCP p. 710",
    content:
`1 On the holy mountain stands the city he has founded; *
  the Lord loves the gates of Zion
  more than all the dwellings of Jacob.
2 Glorious things are spoken of you, *
  O city of our God.
3 I count Egypt and Babylon among those who know me; *
  behold Philistia, Tyre, and Ethiopia:
  in Zion were they born.
4 Of Zion it shall be said, "Everyone was born in her, *
  and the Most High himself shall sustain her."
5 The Lord will record as he enrolls the peoples, *
  "These also were born there."
6 The singers and the dancers will say, *
  "All my fresh springs are in you."`,
  },

  88: {
    title: "Domine, Deus",
    bcpRef: "BCP p. 711",
    content:
`1 O Lord, my God, my Savior, *
  by day and night I cry to you.
2 Let my prayer enter into your presence; *
  incline your ear to my lamentation.
3 For I am full of trouble; *
  my life is at the brink of the grave.
4 I am counted among those who go down to the Pit; *
  I have become like one who has no strength;
5 Lost among the dead, *
  like the slain who lie in the grave,
6 Whom you remember no more, *
  for they are cut off from your hand.
7 You have laid me in the depths of the Pit, *
  in dark places, and in the abyss.
8 Your anger weighs upon me heavily, *
  and all your great waves overwhelm me.
9 You have put my friends far from me;
  you have made me to be abhorred by them; *
  I am in prison and cannot get free.
10 My sight has failed me because of trouble; *
  Lord, I have called upon you daily;
  I have stretched out my hands to you.
11 Do you work wonders for the dead? *
  will those who have died stand up and give you thanks?
12 Will your loving-kindness be declared in the grave? *
  your faithfulness in the land of destruction?
13 Will your wonders be known in the dark? *
  or your righteousness in the country where all is forgotten?
14 But as for me, O Lord, I cry to you for help; *
  in the morning my prayer comes before you.
15 Lord, why have you rejected me? *
  why have you hidden your face from me?
16 Ever since my youth, I have been wretched and at the point of death; *
  I have borne your terrors with a troubled mind.
17 Your blazing anger has swept over me; *
  your terrors have destroyed me;
18 They surround me all day long like a flood; *
  they encompass me on every side.
19 My friend and my neighbor you have put away from me, *
  and darkness is my only companion.`,
  },

  89: {
    title: "Misericordias Domini",
    bcpRef: "BCP p. 713",
    content:
`1 Your love, O Lord, for ever will I sing; *
  from age to age my mouth will proclaim your faithfulness.
2 For I am persuaded that your love is established for ever; *
  you have set your faithfulness firmly in the heavens.
3 "I have made a covenant with my chosen one; *
  I have sworn an oath to David my servant:
4 'I will establish your line for ever, *
  and preserve your throne for all generations.'"
5 The heavens bear witness to your wonders, O Lord, *
  and to your faithfulness in the assembly of the holy ones;
6 For who in the skies can be compared to the Lord? *
  who is like the Lord among the gods?
7 God is much to be feared in the council of the holy ones, *
  great and terrible to all those round about him.
8 Who is like you, Lord God of hosts? *
  O mighty Lord, your faithfulness is all around you.
9 You rule the raging of the sea *
  and still the surging of its waves.
10 You have crushed Rahab of the deep with a deadly wound; *
  you have scattered your enemies with your mighty arm.
11 Yours are the heavens; the earth also is yours; *
  you laid the foundations of the world and all that is in it.
12 You have made the north and the south; *
  Tabor and Hermon rejoice in your Name.
13 You have a mighty arm; *
  strong is your hand and high is your right hand.
14 Righteousness and justice are the foundations of your throne; *
  love and truth go before your face.
15 Happy are the people who know the festal shout! *
  they walk, O Lord, in the light of your presence.
16 They rejoice daily in your Name; *
  they are jubilant in your righteousness.
17 For you are the glory of their strength, *
  and by your favor our might is exalted.
18 Truly, the Lord is our ruler; *
  The Holy One of Israel is our King.
19 You spoke once in a vision and said to your faithful people: *
  "I have set the crown upon a warrior
  and have exalted one chosen out of the people.
20 I have found David my servant; *
  with my holy oil have I anointed him.
21 My hand will hold him fast *
  and my arm will make him strong.
22 No enemy shall deceive him, *
  nor any wicked man bring him down.
23 I will crush his foes before him *
  and strike down those who hate him.
24 My faithfulness and love shall be with him, *
  and he shall be victorious through my Name.
25 I shall make his dominion extend *
  from the Great Sea to the River.
26 He will say to me, 'You are my Father, *
  my God, and the rock of my salvation.'
27 I will make him my firstborn *
  and higher than the kings of the earth.
28 I will keep my love for him for ever, *
  and my covenant will stand firm for him.
29 I will establish his line for ever *
  and his throne as the days of heaven."
30 "If his children forsake my law *
  and do not walk according to my judgments;
31 If they break my statutes *
  and do not keep my commandments;
32 I will punish their transgressions with a rod *
  and their iniquities with the lash;
33 But I will not take my love from him, *
  nor let my faithfulness prove false.
34 I will not break my covenant, *
  nor change what has gone out of my lips.
35 Once for all I have sworn by my holiness: *
  'I will not lie to David.
36 His line shall endure for ever *
  and his throne as the sun before me;
37 It shall stand fast for evermore like the moon, *
  the abiding witness in the sky.'"
38 But you have cast off and rejected your anointed; *
  you have become enraged at him.
39 You have broken your covenant with your servant, *
  defiled his crown, and hurled it to the ground.
40 You have breached all his walls *
  and laid his strongholds in ruins.
41 All who pass by despoil him; *
  he has become the scorn of his neighbors.
42 You have exalted the right hand of his foes *
  and made all his enemies rejoice.
43 You have turned back the edge of his sword *
  and have not sustained him in battle.
44 You have put an end to his splendor *
  and cast his throne to the ground.
45 You have cut short the days of his youth *
  and have covered him with shame.
46 How long will you hide yourself, O Lord?
  will you hide yourself for ever? *
  how long will your anger burn like fire?
47 Remember, Lord, how short life is, *
  how frail you have made all flesh.
48 Who can live and not see death? *
  who can save himself from the power of the grave?
49 Where, Lord, are your loving-kindnesses of old, *
  which you promised David in your faithfulness?
50 Remember, Lord, how your servant is mocked, *
  how I carry in my bosom the taunts of many peoples,
51 The taunts your enemies have hurled, O Lord, *
  which they hurled at the heels of your anointed.
52 Blessed be the Lord for evermore! *
  Amen, I say, Amen.`,
  },

  93: {
    title: "Dominus regnavit",
    bcpRef: "BCP p. 721",
    content:
`1 The Lord is King;
  he has put on splendid apparel; *
  the Lord has put on his apparel
  and girded himself with strength.
2 He has made the whole world so sure *
  that it cannot be moved;
3 Ever since the world began, your throne has been established; *
  you are from everlasting.
4 The waters have lifted up, O Lord,
  the waters have lifted up their voice; *
  the waters have lifted up their pounding waves.
5 Mightier than the sound of many waters,
  mightier than the breakers of the sea, *
  mightier is the Lord who dwells on high.
6 Your testimonies are very sure, *
  and holiness adorns your house, O Lord,
  for ever and for evermore.`,
  },

  94: {
    title: "Deus ultionum",
    bcpRef: "BCP p. 721",
    content:
`1 O Lord God of vengeance, *
  O God of vengeance, show yourself.
2 Rise up, O Judge of the world; *
  give the arrogant their just deserts.
3 How long shall the wicked, O Lord, *
  how long shall the wicked triumph?
4 They bluster in their insolence; *
  all evildoers are full of boasting.
5 They crush your people, O Lord, *
  and afflict your chosen nation.
6 They murder the widow and the stranger *
  and put the orphans to death.
7 Yet they say, "The Lord does not see, *
  the God of Jacob takes no notice."
8 Consider well, you dullards among the people; *
  when will you fools understand?
9 He that planted the ear, does he not hear? *
  he that formed the eye, does he not see?
10 He who admonishes the nations, will he not punish? *
  he who teaches all the world, has he no knowledge?
11 The Lord knows our human thoughts; *
  how like a puff of wind they are.
12 Happy are they whom you instruct, O Lord! *
  whom you teach out of your law;
13 To give them rest in evil days, *
  until a pit is dug for the wicked.
14 For the Lord will not abandon his people, *
  nor will he forsake his own.
15 For judgment will again be just, *
  and all the true of heart will follow it.
16 Who rose up for me against the wicked? *
  who took my part against the evildoers?
17 If the Lord had not come to my help, *
  I should soon have dwelt in the land of silence.
18 As often as I said, "My foot has slipped," *
  your love, O Lord, upheld me.
19 When many cares fill my mind, *
  your consolations cheer my soul.
20 Can a corrupt tribunal have any part with you, *
  one which frames evil into law?
21 They conspire against the life of the just *
  and condemn the innocent to death.
22 But the Lord has become my stronghold, *
  and my God the rock of my trust.
23 He will turn their wickedness back upon them
  and destroy them in their own malice; *
  the Lord our God will destroy them.`,
  },

  96: {
    title: "Cantate Domino",
    bcpRef: "BCP p. 725",
    content:
`1 Sing to the Lord a new song; *
  sing to the Lord, all the whole earth.
2 Sing to the Lord and bless his Name; *
  proclaim the good news of his salvation from day to day.
3 Declare his glory among the nations *
  and his wonders among all peoples.
4 For great is the Lord and greatly to be praised; *
  he is more to be feared than all gods.
5 As for all the gods of the nations, they are but idols; *
  but it is the Lord who made the heavens.
6 Oh, the majesty and magnificence of his presence! *
  Oh, the power and the splendor of his sanctuary!
7 Ascribe to the Lord, you families of the peoples; *
  ascribe to the Lord honor and power.
8 Ascribe to the Lord the honor due his Name; *
  bring offerings and come into his courts.
9 Worship the Lord in the beauty of holiness; *
  let the whole earth tremble before him.
10 Tell it out among the nations: "The Lord is King! *
  he has made the world so firm that it cannot be moved;
  he will judge the peoples with equity."
11 Let the heavens rejoice, and let the earth be glad;
  let the sea thunder and all that is in it; *
  let the field be joyful and all that is therein.
12 Then shall all the trees of the wood shout for joy
  before the Lord when he comes, *
  when he comes to judge the earth.
13 He will judge the world with righteousness *
  and the peoples with his truth.`,
  },

  97: {
    title: "Dominus regnavit",
    bcpRef: "BCP p. 726",
    content:
`1 The Lord is King;
  let the earth rejoice; *
  let the multitude of the isles be glad.
2 Clouds and darkness are round about him, *
  righteousness and justice are the foundations of his throne.
3 A fire goes before him *
  and burns up his enemies on every side.
4 His lightnings light up the world; *
  the earth sees it and is afraid.
5 The mountains melt like wax at the presence of the Lord, *
  at the presence of the Lord of the whole earth.
6 The heavens declare his righteousness, *
  and all the peoples see his glory.
7 Confounded be all who worship carved images
  and delight in false gods! *
  Bow down before him, all you gods.
8 Zion hears and is glad, and the cities of Judah rejoice, *
  because of your judgments, O Lord.
9 For you are the Lord,
  most high over all the earth; *
  you are exalted far above all gods.
10 The Lord loves those who hate evil; *
  he preserves the lives of his saints
  and delivers them from the hand of the wicked.
11 Light has sprung up for the righteous, *
  and joyful gladness for those who are truehearted.
12 Rejoice in the Lord, you righteous, *
  and give thanks to his holy Name.`,
  },

  92: {
    title: "Bonum est confiteri",
    bcpRef: "BCP p. 719",
    content:
`1 It is a good thing to give thanks to the Lord, *
  and to sing praises to your Name, O Most High;
2 To tell of your loving-kindness early in the morning *
  and of your faithfulness in the night season;
3 On the psaltery, and on the lyre, *
  and to the melody of the harp.
4 For you have made me glad by your acts, O Lord; *
  and I shout for joy because of the works of your hands.
5 Lord, how great are your works! *
  your thoughts are very deep.
6 The dullard does not know,
  nor does the fool understand, *
  that though the wicked grow like weeds,
  and all the workers of iniquity flourish,
7 They flourish only to be destroyed for ever; *
  but you, O Lord, are exalted for evermore.
8 For lo, your enemies, O Lord,
  lo, your enemies shall perish, *
  and all the workers of iniquity shall be scattered.
9 But my horn you have exalted like the horns of wild bulls; *
  I am anointed with fresh oil.
10 My eyes also gloat over my enemies, *
  and my ears rejoice to hear the doom of the wicked who rise up against me.
11 The righteous shall flourish like a palm tree, *
  and shall spread abroad like a cedar of Lebanon.
12 Those who are planted in the house of the Lord *
  shall flourish in the courts of our God;
13 They shall still bear fruit in old age; *
  they shall be green and succulent;
14 That they may show how upright the Lord is, *
  my Rock, in whom there is no fault.`,
  },

  98: {
    title: "Cantate Domino",
    bcpRef: "BCP p. 727",
    content:
`1 Sing to the Lord a new song, *
  for he has done marvelous things.
2 With his right hand and his holy arm *
  has he won for himself the victory.
3 The Lord has made known his victory; *
  his righteousness has he openly shown in the sight of the nations.
4 He remembers his mercy and faithfulness to the house of Israel, *
  and all the ends of the earth have seen the victory of our God.
5 Shout with joy to the Lord, all you lands; *
  lift up your voice, rejoice, and sing.
6 Sing to the Lord with the harp, *
  with the harp and the voice of song.
7 With trumpets and the sound of the horn *
  shout with joy before the King, the Lord.
8 Let the sea make a noise and all that is in it, *
  the lands and those who dwell therein.
9 Let the rivers clap their hands, *
  and let the hills ring out with joy before the Lord,
  when he comes to judge the earth.
10 In righteousness shall he judge the world *
  and the peoples with equity.`,
  },

  99: {
    title: "Dominus regnavit",
    bcpRef: "BCP p. 728",
    content:
`1 The Lord is King;
  let the people tremble; *
  he is enthroned upon the cherubim;
  let the earth shake.
2 The Lord is great in Zion; *
  he is high above all peoples.
3 Let them confess his Name, which is great and awesome; *
  he is the Holy One.
4 "O mighty King, lover of justice,
  you have established equity; *
  you have executed justice and righteousness in Jacob."
5 Proclaim the greatness of the Lord our God
  and fall down before his footstool; *
  he is the Holy One.
6 Moses and Aaron among his priests,
  and Samuel among those who call upon his Name, *
  they called upon the Lord, and he answered them.
7 He spoke to them out of the pillar of cloud; *
  they kept his testimonies and the decree that he gave them.
8 "O Lord our God, you answered them indeed; *
  you were a God who forgave them,
  yet punished them for their evil deeds."
9 Proclaim the greatness of the Lord our God
  and worship him upon his holy hill; *
  for the Lord our God is the Holy One.`,
  },

  101: {
    title: "Misericordiam et judicium",
    bcpRef: "BCP p. 729",
    content:
`1 I will sing of mercy and justice; *
  to you, O Lord, will I sing praises.
2 I will strive to follow a blameless course;
  oh, when will you come to me? *
  I will walk with sincerity of heart within my house.
3 I will set no worthless thing before my eyes; *
  I hate the doers of evil deeds;
  they shall not remain with me.
4 A crooked heart shall be far from me; *
  I will not know evil.
5 Those who in secret slander their neighbors I will destroy; *
  those who have a haughty look and a proud heart I cannot abide.
6 My eyes are upon the faithful in the land, that they may dwell with me, *
  and only those who lead a blameless life shall be my servants.
7 Those who act deceitfully shall not dwell in my house, *
  and those who tell lies shall not continue in my sight.
8 I will soon destroy all the wicked in the land, *
  that I may root out all evildoers from the city of the Lord.`,
  },

  102: {
    title: "Domine, exaudi",
    bcpRef: "BCP p. 730",
    content:
`1 Lord, hear my prayer, and let my cry come before you; *
  hide not your face from me in the day of my trouble.
2 Incline your ear to me; *
  when I call, make haste to answer me,
3 For my days drift away like smoke, *
  and my bones are hot as burning coals.
4 My heart is smitten like grass and withered, *
  so that I forget to eat my bread.
5 Because of the voice of my groaning *
  I am but skin and bones.
6 I have become like a vulture in the wilderness, *
  like an owl among the ruins.
7 I lie awake and groan; *
  I am like a sparrow, lonely on a house-top.
8 My enemies revile me all day long, *
  and those who scoff at me have taken an oath against me.
9 For I have eaten ashes for bread *
  and mingled my drink with weeping.
10 Because of your indignation and wrath *
  you have lifted me up and thrown me away.
11 My days pass away like a shadow, *
  and I wither like the grass.
12 But you, O Lord, endure for ever, *
  and your Name from age to age.
13 You will arise and have compassion on Zion,
  for it is time to have mercy upon her; *
  indeed, the appointed time has come.
14 For your servants love her very rubble, *
  and are moved to pity even for her dust.
15 The nations shall fear your Name, O Lord, *
  and all the kings of the earth your glory.
16 For the Lord will build up Zion, *
  and his glory will appear.
17 He will look with favor on the prayer of the homeless; *
  he will not despise their plea.
18 Let this be written for a future generation, *
  so that a people yet unborn may praise the Lord.
19 For the Lord looked down from his holy place on high; *
  from the heavens he beheld the earth;
20 That he might hear the groan of the captive *
  and set free those condemned to die;
21 That they may declare in Zion the Name of the Lord, *
  and his praise in Jerusalem;
22 When the peoples are gathered together, *
  and the kingdoms also, to serve the Lord.
23 He has brought down my strength before my time; *
  he has shortened the number of my days;
24 And I said, "O my God,
  do not take me away in the midst of my days; *
  your years endure throughout all generations.
25 In the beginning, O Lord, you laid the foundations of the earth, *
  and the heavens are the work of your hands;
26 They shall perish, but you will endure;
  they all shall wear out like a garment; *
  as clothing you will change them,
  and they shall be changed;
27 But you are always the same, *
  and your years will never end.
28 The children of your servants shall continue, *
  and their offspring shall stand fast in your sight."`,
  },

  104: {
    title: "Benedic, anima mea",
    bcpRef: "BCP p. 734",
    content:
`1 Bless the Lord, O my soul; *
  O Lord my God, how excellent is your greatness!
  you are clothed with majesty and splendor.
2 You wrap yourself with light as with a cloak *
  and spread out the heavens like a curtain.
3 You lay the beams of your chambers in the waters above; *
  you make the clouds your chariot;
  you ride on the wings of the wind.
4 You make the winds your messengers *
  and flames of fire your servants.
5 You have set the earth upon its foundations, *
  so that it never shall move at any time.
6 You covered it with the Deep as with a mantle; *
  the waters stood higher than the mountains.
7 At your rebuke they fled; *
  at the voice of your thunder they hastened away.
8 They went up into the hills and down to the valleys beneath, *
  to the places you had appointed for them.
9 You set the limits that they should not pass; *
  they shall not again cover the earth.
10 You send the springs into the valleys; *
  they flow between the mountains.
11 All the beasts of the field drink their fill from them, *
  and the wild asses quench their thirst.
12 Beside them the birds of the air make their nests *
  and sing among the branches.
13 You water the mountains from your dwelling on high; *
  the earth is fully satisfied by the fruit of your works.
14 You make grass grow for flocks and herds *
  and plants to serve mankind;
15 That they may bring forth food from the earth, *
  and wine to gladden our hearts,
16 Oil to make a cheerful countenance, *
  and bread to strengthen the heart.
17 The trees of the Lord are full of sap, *
  the cedars of Lebanon which he planted,
18 In which the birds build their nests, *
  and in whose tops the stork makes his dwelling.
19 The high hills are a refuge for the mountain goats, *
  and the stony cliffs for the rock badgers.
20 You appointed the moon to mark the seasons, *
  and the sun knows the time of its setting.
21 You make darkness that it may be night, *
  in which all the beasts of the forest prowl.
22 The lions roar after their prey *
  and seek their food from God.
23 The sun rises, and they slip away *
  and lay themselves down in their dens.
24 Man goes forth to his work *
  and to his labor until the evening.
25 O Lord, how manifold are your works! *
  in wisdom you have made them all;
  the earth is full of your creatures.
26 Yonder is the great and wide sea
  with its living things too many to number, *
  creatures both small and great.
27 There move the ships,
  and there is that Leviathan, *
  which you have made for the sport of it.
28 All of them look to you *
  to give them their food in due season.
29 You give it to them; they gather it; *
  you open your hand, and they are filled with good things.
30 You hide your face, and they are terrified; *
  you take away their breath,
  and they die and return to their dust.
31 You send forth your Spirit, and they are created; *
  and so you renew the face of the earth.
32 May the glory of the Lord endure for ever; *
  may the Lord rejoice in all his works.
33 He looks at the earth and it trembles; *
  he touches the mountains and they smoke.
34 I will sing to the Lord as long as I live; *
  I will praise my God while I have my being.
35 May these words of mine please him; *
  I will rejoice in the Lord.
36 Let sinners be consumed out of the earth, *
  and the wicked be no more.
37 Bless the Lord, O my soul. *
  Hallelujah!`,
  },

  105: {
    title: "Confitemini Domino",
    bcpRef: "BCP p. 738",
    content:
`1 Give thanks to the Lord and call upon his Name; *
  make known his deeds among the peoples.
2 Sing to him, sing praises to him, *
  and speak of all his marvelous works.
3 Glory in his holy Name; *
  let the hearts of those who seek the Lord rejoice.
4 Search for the Lord and his strength; *
  continually seek his face.
5 Remember the marvels he has done, *
  his wonders and the judgments of his mouth,
6 O offspring of Abraham his servant, *
  O children of Jacob his chosen.
7 He is the Lord our God; *
  his judgments prevail in all the world.
8 He has always been mindful of his covenant, *
  the promise he made for a thousand generations:
9 The covenant he made with Abraham, *
  the oath that he swore to Isaac,
10 Which he established as a statute for Jacob, *
  an everlasting covenant for Israel,
11 Saying, "To you will I give the land of Canaan *
  to be your allotted inheritance."
12 When they were few in number, *
  of little account, and sojourners in the land,
13 Wandering from nation to nation *
  and from one kingdom to another,
14 He let no one oppress them *
  and rebuked kings for their sake,
15 Saying, "Do not touch my anointed *
  and do my prophets no harm."
16 Then he called for a famine in the land *
  and destroyed the supply of bread.
17 He sent a man before them, *
  Joseph, who was sold as a slave.
18 They bruised his feet in fetters; *
  his neck they put in an iron collar.
19 Until his prediction came to pass, *
  the word of the Lord tested him.
20 The king sent and released him; *
  the ruler of the peoples set him free.
21 He set him as a master over his household, *
  as a ruler over all his possessions,
22 To instruct his princes according to his will *
  and to teach his elders wisdom.
23 Israel came into Egypt, *
  and Jacob became a sojourner in the land of Ham.
24 The Lord made his people exceedingly fruitful; *
  he made them stronger than their enemies;
25 Whose heart he turned, so that they hated his people, *
  and dealt unjustly with his servants.
26 He sent Moses his servant, *
  and Aaron whom he had chosen.
27 They worked his signs among them, *
  and portents in the land of Ham.
28 He sent darkness, and it grew dark; *
  but the Egyptians rebelled against his words.
29 He turned their waters into blood *
  and caused their fish to die.
30 Their land was overrun by frogs, *
  in the very chambers of their kings.
31 He spoke, and there came swarms of insects *
  and gnats within all their borders.
32 He gave them hailstones instead of rain, *
  and flames of fire throughout their land.
33 He blasted their vines and their fig trees *
  and shattered every tree in their country.
34 He spoke, and the locust came, *
  and young locusts without number,
35 Which ate up all the green plants in their land *
  and devoured the fruit of their soil.
36 He struck down the firstborn of their land, *
  the firstfruits of all their strength.
37 He led out his people with silver and gold; *
  in all their tribes there was not one that stumbled.
38 Egypt was glad of their going, *
  because they were afraid of them.
39 He spread out a cloud for a covering *
  and a fire to give light in the night season.
40 They asked, and quails appeared, *
  and he satisfied them with bread from heaven.
41 He opened the rock, and water flowed, *
  so the river ran in the dry places.
42 For God remembered his holy word *
  and Abraham his servant.
43 So he led forth his people with gladness, *
  his chosen with shouts of joy.
44 He gave his people the lands of the nations, *
  and they took the fruit of others' toil,
45 That they might keep his statutes *
  and observe his laws.
  Hallelujah!`,
  },

  106: {
    title: "Confitemini Domino",
    bcpRef: "BCP p. 741",
    content:
`1 Hallelujah!
  Give thanks to the Lord, for he is good, *
  for his mercy endures for ever.
2 Who can declare the mighty acts of the Lord *
  or show forth all his praise?
3 Happy are those who act with justice *
  and always do what is right!
4 Remember me, O Lord, with the favor you have for your people, *
  and visit me with your saving help;
5 That I may see the prosperity of your elect
  and be glad with the gladness of your people, *
  that I may glory with your inheritance.
6 We have sinned as our forebears did; *
  we have done wrong and dealt wickedly.
7 In Egypt they did not consider your marvelous works,
  nor remember the abundance of your love; *
  they defied the Most High at the Red Sea.
8 But he saved them for his Name's sake, *
  to make his power known.
9 He rebuked the Red Sea, and it dried up, *
  and he led them through the deep as through a desert.
10 He saved them from the hand of those who hated them *
  and redeemed them from the hand of the enemy.
11 The waters covered their oppressors; *
  not one of them was left.
12 Then they believed his words *
  and sang him songs of praise.
13 But they soon forgot his deeds *
  and did not wait for his counsel.
14 A craving seized them in the wilderness, *
  and they put God to the test in the desert.
15 He gave them what they asked, *
  but sent leanness into their soul.
16 They envied Moses in the camp, *
  and Aaron, the holy one of the Lord.
17 The earth opened and swallowed Dathan *
  and covered the company of Abiram.
18 Fire blazed up against their company, *
  and flames devoured the wicked.
19 Israel made a bull-calf at Horeb *
  and worshiped a molten image;
20 And so they exchanged their Glory *
  for the image of an ox that feeds on grass.
21 They forgot God their Savior, *
  who had done great things in Egypt,
22 Wonderful deeds in the land of Ham, *
  and fearful things at the Red Sea.
23 So he would have destroyed them,
  had not Moses his chosen stood before him in the breach, *
  to turn away his wrath from consuming them.
24 They refused the pleasant land *
  and would not believe his promise.
25 They grumbled in their tents *
  and would not listen to the voice of the Lord.
26 So he lifted his hand against them, *
  to overthrow them in the wilderness,
27 To cast out their seed among the nations, *
  and to scatter them throughout the lands.
28 They joined themselves to Baal-Peor *
  and ate sacrifices offered to the dead.
29 They provoked him to anger with their actions, *
  and a plague broke out among them.
30 Then Phinehas stood up and interceded, *
  and the plague came to an end.
31 This was reckoned to him as righteousness *
  throughout all generations for ever.
32 Again they provoked his anger at the waters of Meribah, *
  so that he punished Moses because of them;
33 For they so embittered his spirit *
  that he spoke rash words with his lips.
34 They did not destroy the peoples *
  as the Lord had commanded them.
35 They intermingled with the heathen *
  and learned their pagan ways,
36 So that they worshiped their idols, *
  which became a snare to them.
37 They sacrificed their sons *
  and their daughters to evil spirits.
38 They shed innocent blood,
  the blood of their sons and daughters, *
  which they offered to the idols of Canaan,
  and the land was defiled with blood.
39 Thus they were polluted by their actions *
  and went whoring in their evil deeds.
40 Therefore the wrath of the Lord was kindled against his people *
  and he abhorred his inheritance.
41 He gave them over to the hand of the heathen, *
  and those who hated them ruled over them.
42 Their enemies oppressed them, *
  and they were humbled under their hand.
43 Many a time did he deliver them,
  but they rebelled through their own devices, *
  and were brought down in their iniquity.
44 Nevertheless, he saw their distress, *
  when he heard their lamentation.
45 He remembered his covenant with them *
  and relented in accordance with his great mercy.
46 He caused them to be pitied *
  by those who held them captive.
47 Save us, O Lord our God,
  and gather us from among the nations, *
  that we may give thanks to your holy Name
  and glory in your praise.
48 Blessed be the Lord, the God of Israel,
  from everlasting to everlasting; *
  and let all the people say, "Amen!"
  Hallelujah!`,
  },
};
