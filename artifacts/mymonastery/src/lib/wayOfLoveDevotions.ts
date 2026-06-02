/**
 * Daily Devotions for the Way of Love — the Episcopal Diocese of Washington's
 * 8-week devotional journey (edow.org/.../way-of-love), transcribed into Phoebe.
 *
 * Week 1 is an on-ramp ("A Rule of Life"); weeks 2–8 walk one practice each —
 * Turn, Learn, Pray, Worship, Bless, Go, Rest. Five days per week (40 days).
 * Every day has the same quiet shape: a shared centering invitation, a Scripture
 * passage, one reflection question, and a one-line "Prayer for Today."
 *
 * Static content (no server) — the journey player reads straight from here; the
 * reflection question seeds the journal; finishing a practice-week invites that
 * practice into the Rule of Life. `sectionKey` deep-links to the practice page
 * (/home-beta/<key>, which carries Bishop Budde's audio) and the rule maker.
 */

export type WolDevotionDay = {
  day: number; // 1–5
  scriptureRef: string;
  scriptureText: string;
  question: string;
  prayer: string;
};

export type WolDevotionWeek = {
  week: number; // 1–8
  title: string;
  practice: string; // display word ("Turn", "A Rule of Life", …)
  emoji: string;
  // The Rule-of-Life section this week graduates into; null for the intro week.
  sectionKey: "turn" | "learn_pray" | "worship" | "bless" | "go" | "rest" | null;
  days: WolDevotionDay[];
};

// Shared each day, before the passage.
export const WOL_INVITATION =
  "Take ten minutes and sit in a comfortable chair. Breathe in and exhale deeply, paying attention to the motion of your breath. Allow yourself to imagine God's presence surrounding you as you pray. Read slowly the passage below, several times. As you rise from your time of prayer, know that Jesus remains with you always.";

export const WOL_TOTAL_DAYS = 40;

export const WOL_DEVOTIONS: WolDevotionWeek[] = [
  {
    week: 1, title: "A Rule of Life", practice: "A Rule of Life", emoji: "🌱", sectionKey: null,
    days: [
      { day: 1, scriptureRef: "John 15:5, 11", scriptureText: "Those who abide in me and I in them bear much fruit, because apart from me you can do nothing … I have said these things to you so that my joy may be in you, and that your joy may be complete.", question: "Where do you experience joy in your life?", prayer: "God, help me to recognize and experience You as the giver of the joys of my life." },
      { day: 2, scriptureRef: "Romans 12:2", scriptureText: "Do not be conformed to this world, but be transformed by the renewing of your minds, so that you may discern what is the will of God—what is good and acceptable and perfect.", question: "In what ways do you feel pressure to “conform” to the world around you?", prayer: "Loving God, take my heart and transform it with your love." },
      { day: 3, scriptureRef: "Isaiah 55:6", scriptureText: "Seek the Lord while he may be found, call upon him while he is near.", question: "Where or how do you ‘seek the Lord’?", prayer: "Merciful God, give me the eyes to see and the ears to hear your presence in my life." },
      { day: 4, scriptureRef: "Psalm 19:7-8", scriptureText: "The law of the Lord is perfect, reviving the soul; the decrees of the Lord are sure, making wise the simple; the precepts of the Lord are right, rejoicing the heart.", question: "What Biblical verses or stories ‘revive your soul’?", prayer: "Creator God, help me to read your Word so that it might rejoice my heart." },
      { day: 5, scriptureRef: "Isaiah 55:3", scriptureText: "Incline your ear, and come to me; listen, so that you may live.", question: "Where or when do you hear God speaking to you?", prayer: "Gracious God, help me to set aside time in my day to be still and listen for your voice." },
    ],
  },
  {
    week: 2, title: "Turn", practice: "Turn", emoji: "🔄", sectionKey: "turn",
    days: [
      { day: 1, scriptureRef: "Exodus 3:1-4", scriptureText: "There the angel of the Lord appeared to Moses in a flame of fire out of a bush; he looked, and the bush was blazing, yet it was not consumed. Then Moses said, ‘I must turn aside and look at this great sight, and see why the bush is not burned up.’ When the Lord saw that he had turned aside to see, God called to him out of the bush, ‘Moses, Moses!’", question: "Can you think of a time when God called you to turn away from a daily thought, routine or relationship?", prayer: "Loving God, help me to have eyes to see your presence and your purposes in my daily life." },
      { day: 2, scriptureRef: "Psalm 119:175-176", scriptureText: "Let me live that I may praise you, and let your ordinances help me. I have gone astray like a lost sheep; seek out your servant, for I do not forget your commandments.", question: "Where are the places or relationships in your daily life where you feel lost?", prayer: "Gracious God, thank you that you seek me out in my daily life. Help me to remember your love and your commandments." },
      { day: 3, scriptureRef: "2 Corinthians 4:6", scriptureText: "For it is the God who said, “Let light shine out of darkness,” who has shone in our hearts to give the light of the knowledge of the glory of God in the face of Jesus Christ.", question: "Where are areas in your life or in the lives of those around you where you see God shining light in darkness?", prayer: "Loving God, thank you that you bring the light of your peace and love into all life. Help me to seek your light in the silence of my days, in the scriptures and in the sacraments of my faith." },
      { day: 4, scriptureRef: "2 Corinthians 4:7", scriptureText: "But we have this treasure in clay jars, so that it may be made clear that this extraordinary power belongs to God and does not come from us.", question: "Where have you seen the power of God — in your life or in others — working in ways humans do not or cannot?", prayer: "Creator God, thank you for the treasure of your love and your power. Help me to trust you to transform my life in ways I cannot on my own." },
      { day: 5, scriptureRef: "Luke 5:4-6", scriptureText: "When Jesus had finished speaking, he said to Simon, “Put out into the deep water and let down your nets for a catch.” Simon answered, “Master, we have worked all night long but have caught nothing. Yet if you say so, I will let down the nets.” When they had done this, they caught so many fish that their nets were beginning to break.", question: "In what areas of your life or relationships do you feel like you are working “all night long but have caught nothing”?", prayer: "Merciful God, help me to listen to your Word in scriptures and in sacraments and to follow your call to try and to dare new directions for my choices and my habits." },
    ],
  },
  {
    week: 3, title: "Learn", practice: "Learn", emoji: "📖", sectionKey: "learn_pray",
    days: [
      { day: 1, scriptureRef: "Micah 4:2", scriptureText: "‘Come, let us go up to the mountain of the Lord, to the house of the God of Jacob; that he may teach us his ways and that we may walk in his paths.’", question: "Where do you go to find and experience the presence of God in your day or week?", prayer: "Creator God, thank you that you promise to be with me always. Help me to see and choose your path of love." },
      { day: 2, scriptureRef: "Psalm 90:12", scriptureText: "Teach us to number our days, that we might apply our hearts to wisdom.", question: "Do you feel rushed through your day? Do your days feel too crowded or too busy for spending time in nature, in fellowship, in prayer or in reading scripture?", prayer: "Loving God, help me to slow down. Help me to appreciate the gift of my life and help me to notice your presence in my day." },
      { day: 3, scriptureRef: "Hebrews 4:16", scriptureText: "Let us therefore approach the throne of grace with boldness, so that we may receive mercy and find grace to help in time of need.", question: "Do you feel like a child of God, created in God's image? Have you embraced your identity as a person who shares the life, death and resurrection of Christ?", prayer: "Creator God, help me to believe that I am yours and that you are my shepherd who knows my voice." },
      { day: 4, scriptureRef: "Matthew 13:44", scriptureText: "The kingdom of heaven is like treasure hidden in a field, which someone found and hid; then in his joy he goes and sells all that he has and buys that field.", question: "What treasures from God have you discovered or received in your life, work or relationships?", prayer: "God of grace, thank you that every good and perfect gift comes from you. Help me to see the gifts in my life and to feel your love in them." },
      { day: 5, scriptureRef: "Matthew 13:45", scriptureText: "Again, the kingdom of heaven is like a merchant in search of fine pearls; on finding one pearl of great value, he went and sold all that he had and bought it.", question: "What are you seeking? For what do you long? What do your longings teach you about your life and about your Creator God?", prayer: "Loving God, thank you for your love. Help me to trust in your presence and your power in my life. And help me to learn how to live with an awareness of your love." },
    ],
  },
  {
    week: 4, title: "Pray", practice: "Pray", emoji: "🙏", sectionKey: "learn_pray",
    days: [
      { day: 1, scriptureRef: "1 Samuel 3:10", scriptureText: "So (the child) Samuel went and lay down in his place. Now the Lord came and stood there, calling as before, ‘Samuel! Samuel!’ And Samuel said, ‘Speak, for your servant is listening.’", question: "Are there times and places in your week when you ‘lay down in your place’ and listen for the voice of God in scripture, in worship or in the words of others in your life who are followers of Jesus?", prayer: "Loving God, help me to set aside time each week when I can pause, breathe and listen to your loving, liberating and life-giving words found in the Bible, hymns, worship or in fellow disciples." },
      { day: 2, scriptureRef: "Psalm 25:4-5", scriptureText: "Make me to know your ways, O Lord; teach me your paths. Lead me in your truth, and teach me, for you are the God of my salvation; for you I wait all day long.", question: "In what ways do you – or could you – talk to God about who God is and what purposes and dreams God has for your life?", prayer: "Holy God, you have made us to know you and to be your heart, hands and healing in the world. Help me to find or to make time to talk to you and listen for You in prayer." },
      { day: 3, scriptureRef: "2 Corinthians 12:9-10", scriptureText: "… but the Lord said to me, ‘My grace is sufficient for you, for my power is made perfect in weakness.’ … Therefore I am content with weaknesses, insults, hardships, persecutions, and calamities for the sake of Christ; for whenever I am weak, then I am strong.", question: "Where or when in your life do you feel weakness, insecurity or incapacity?", prayer: "Creator God, you have made me in Your image. Help me to remember in my prayers that Your power and love can fill my emptiness, heal my insecurities and abide with me in suffering." },
      { day: 4, scriptureRef: "Luke 11:1-4", scriptureText: "Jesus said to them, “When you pray, say: Father, hallowed be your name. Your kingdom come. Give us each day our daily bread. And forgive us our sins, for we ourselves forgive everyone indebted to us. And do not bring us to the time of trial.”", question: "When you read these sentences of the Lord's Prayer, which are the hardest for you to believe or to practice?", prayer: "Merciful God, help me to see and to help build Your kingdom of hope, love and justice in this world. Help me to share the bread you give me and share the forgiveness You show me with others." },
      { day: 5, scriptureRef: "Luke 11:13", scriptureText: "If you then … know how to give good gifts to your children, how much more will the heavenly Father give the Holy Spirit to those who ask him!", question: "Can you think of a time when you received a gift of grace from God, whether you asked for this gift or not?", prayer: "Holy God, help me to see the gifts You have given and are giving to me. And help me to make time to find ways to respond in love." },
    ],
  },
  {
    week: 5, title: "Worship", practice: "Worship", emoji: "⛪", sectionKey: "worship",
    days: [
      { day: 1, scriptureRef: "Psalm 96:1-2", scriptureText: "O sing to the Lord a new song; sing to the Lord, all the earth. Sing to the Lord, bless his name; tell of his salvation from day to day.", question: "Are there times and places in your week when you can hear other people ‘tell of God's salvation from day to day’? Can you seek out someone this week whose faith reminds you of the love of God and talk with him or her to encourage your own faith?", prayer: "Loving God, help me to seek out other people that know you and follow you so that I can experience your presence with others and grow deeper into the life of the Body of Christ." },
      { day: 2, scriptureRef: "Psalm 96:8-9", scriptureText: "Ascribe to the Lord the glory due his name; bring an offering, and come into his courts. Worship the Lord in holy splendor; tremble before him, all the earth.", question: "What are the gifts from God in your life that could bring greater faith, hope and love to others if you shared them? In what ways could you make an offering to God today?", prayer: "Holy God, you are the giver of every good and perfect gift. Help me today to find ways to thank and to worship you by offering to others some of the blessings you have freely given to me." },
      { day: 3, scriptureRef: "1 Corinthians 11:23-25", scriptureText: "… the Lord Jesus on the night when he was betrayed took a loaf of bread, and when he had given thanks, he broke it and said, ‘This is my body that is for you. Do this in remembrance of me.’", question: "When you remember the life and resurrection of the Lord Jesus, what words, images and feelings come to mind?", prayer: "Lord Jesus, for love your body broke to heal our broken world. In all that I say and do today, help me to remember your love." },
      { day: 4, scriptureRef: "Luke 24:30-31", scriptureText: "When Jesus was at the table with them, he took bread, blessed and broke it, and gave it to them. Then their eyes were opened, and they recognized him; and he vanished from their sight.", question: "When you participate in the Eucharist, what images or words come to your mind and heart as you receive the bread and wine? What truths do you recognize in that moment?", prayer: "Gracious God, you have given us your life in the Body of Christ and poured your love and grace into the bread and the wine on our altars. Help me to find time or to make time to receive the Eucharist this week." },
      { day: 5, scriptureRef: "Luke 24:32", scriptureText: "They said to each other, ‘Were not our hearts burning within us while he was talking to us on the road, while he was opening the scriptures to us?’", question: "Can you think of a time when you felt Christ speaking to you alone in prayer or in worship with others? What did you hear and what was your reaction or response?", prayer: "Creator God, help me this week to listen for your loving, liberating and life-giving voice in the hymns, in the silences, in the symbols and in the prayers of the Eucharist." },
    ],
  },
  {
    week: 6, title: "Bless", practice: "Bless", emoji: "🤲", sectionKey: "bless",
    days: [
      { day: 1, scriptureRef: "Genesis 32:26", scriptureText: "Then he said, ‘Let me go, for the day is breaking.’ But Jacob said, ‘I will not let you go, unless you bless me.’", question: "Can you remember a time when you disagreed or argued with someone but you refused to give up on reconciliation? Can you think of a time when someone was committed to reconciliation with you, even if you had given up?", prayer: "Loving God, you bless the peacemakers. Help me to see that peace is possible with your love and help me to bless others by sharing your peace today." },
      { day: 2, scriptureRef: "Psalm 23", scriptureText: "Even though I walk through the darkest valley, I fear no evil; for you are with me; your rod and your staff—they comfort me.", question: "Can you remember a time when you were in a dark valley and could not find light? In what ways did you experience comfort? What did that experience teach you about how to comfort others?", prayer: "Loving God, now we see through a glass darkly. I face darkness in my days and I pray for your comfort and light. Help me to share your light into the darkness of others." },
      { day: 3, scriptureRef: "Romans 12:9-10", scriptureText: "Let love be genuine; hate what is evil, hold fast to what is good; love one another with mutual affection; outdo one another in showing honor.", question: "What has loving another person taught you about what is good? Have the lessons you have learned from love matured your ability to love? How?", prayer: "Gracious God, your love for me is perfect, patient and kind. Teach me to love others as you have loved me." },
      { day: 4, scriptureRef: "Romans 12:14", scriptureText: "Bless those who persecute you; bless and do not curse them. Rejoice with those who rejoice, weep with those who weep.", question: "In what ways do you feel persecuted? In what ways do you tolerate or contribute to the persecution of others?", prayer: "Creator God, teach me to seek and serve Christ in all people. Teach me to see the rejoicing and the weeping of my neighbor so that I can bless others with the Christ in me." },
      { day: 5, scriptureRef: "Matthew 25:37, 40", scriptureText: "“Lord, when was it that we saw you hungry … And the king will answer them, ‘Truly I tell you, just as you did it to one of the least of these who are members of my family, you did it to me.’”", question: "Which person or people in your life are the hardest to notice, to serve or to love? Why?", prayer: "Gracious God, give me eyes to see Christ in those who are invisible and help me to better understand or forgive those I have put outside of my care, so that I love and serve them as my siblings in your family." },
    ],
  },
  {
    week: 7, title: "Go", practice: "Go", emoji: "🌍", sectionKey: "go",
    days: [
      { day: 1, scriptureRef: "Jonah 3:1", scriptureText: "The word of the Lord came to Jonah a second time, saying, ‘Get up, go to Nineveh, that great city, and proclaim to it the message that I tell you.’ So Jonah set out …", question: "Can you think of a time when you felt challenged or called to seek God's way of love outside of your usual habits, stable relationships or chosen comforts? What did you learn?", prayer: "Loving God, you have promised to be with us, even to the close of the age. Help me to listen for your invitation to follow your way of love into people and places that are new to me." },
      { day: 2, scriptureRef: "1 John 3:11", scriptureText: "For this is the message you have heard from the beginning, that we should love one another. Little children, let us love, not in word or speech, but in truth and action.", question: "Can you remember a time when another person cared for you or loved you in a way that brought struggle, cost, or threat to them? Have you ever dared this active way of love yourself?", prayer: "Loving God, you stretched out your arms on the cross to love, liberate and redeem all people. Help me to see the vulnerable and to demonstrate the courage to stretch out my love toward neighbors I know and strangers I do not yet know." },
      { day: 3, scriptureRef: "1 John 3:24", scriptureText: "And by this we know that God abides in us, by the Spirit that he has given us.", question: "It can be easy to forget that God abides in us by the Spirit, whether or not we are thinking about or believing in God. What images, words or habits help to remind you that God abides in your life?", prayer: "Lord Jesus, you said that the kingdom of God is within us. Help me to remember and trust that no matter what I feel or believe, your love abides in my life." },
      { day: 4, scriptureRef: "Luke 10:27, 29", scriptureText: "“You shall love the Lord your God with all your heart, and with all your soul, and with all your strength, and with all your mind; and your neighbor as yourself.” … And he asked Jesus, ‘And who is my neighbor?’", question: "What is your greatest struggle in loving yourself? What has trying to love yourself taught you about loving others? And what is your greatest struggle in loving others?", prayer: "Gracious God, you search me and you know me and you love me as a sheep of your own fold. Help me to learn to love my life as you do and help me to go into the world of neighbors and share your way of love with all." },
      { day: 5, scriptureRef: "Luke 10:37", scriptureText: "‘Which of these three, do you think, was a neighbor to the man who fell into the hands of the robbers?’ He said, ‘The one who showed him mercy.’ Jesus said to him, ‘Go and do likewise.’", question: "Can you think of a time when someone showed you profound mercy? Is there a time when you have paid a price to show mercy? What holds you back from this kind of love?", prayer: "Merciful God, through baptism it is no longer I who live but Christ who lives in me. Help me to trust that Christ is in me and calling me to go and serve Christ in all persons." },
    ],
  },
  {
    week: 8, title: "Rest", practice: "Rest", emoji: "🌙", sectionKey: "rest",
    days: [
      { day: 1, scriptureRef: "Exodus 20:8", scriptureText: "Remember the Sabbath day, and keep it holy. Six days you shall labor and do all your work. But the seventh day is a sabbath to the Lord your God.", question: "What choices or activities in your life feel holy? What makes an experience, an idea or a choice holy to you?", prayer: "Loving God, you made the world and with you we declare that it is good. But then, you rested. Help me to choose to rest from my labors in order to find and feast on what you make holy in our world." },
      { day: 2, scriptureRef: "Psalm 127:2", scriptureText: "It is in vain that you rise up early and go late to rest, eating the bread of anxious toil; for the Lord gives sleep to his beloved.", question: "What are the things that make you anxious? What places or people or spiritual practices help you to calm your anxiety? What are the forces that keep you from seeking out peace?", prayer: "Holy God, you know all my pain and my anxious thoughts. But you are the Prince of Peace. Help me to find and practice habits of prayerful rest so that you have more space in my life to bring your peace." },
      { day: 3, scriptureRef: "Philippians 4:5, 7", scriptureText: "The Lord is near. Do not worry about anything … And the peace of God, which surpasses all understanding, will guard your hearts and your minds in Christ Jesus.", question: "Which people or places remind you that the Lord is near? When you worry, how can you remind yourself that the Lord is always near? What makes it hard to feel peace even when the Lord is near?", prayer: "Gracious God, help me to live into the promise that you will guard my heart and mind and be with me even to the close of the age. Help me to find rest in the gift of your peace." },
      { day: 4, scriptureRef: "Mark 6:30-32", scriptureText: "The apostles gathered around Jesus, and told him all that they had done and taught. He said to them, ‘Come away to a deserted place all by yourselves and rest a while.’ For many were coming and going, and they had no leisure even to eat. And they went away in the boat to a deserted place by themselves.", question: "Can you think of an experience that taught you about the power of pulling away to a place of quiet and rest? Who is a person in your life that reminds you of the need to rest, like Jesus did for his followers?", prayer: "Loving God, thank you that you put people in my life that remind me of the sacred practice of rest. Help me to find time and energy to pull away from my crowded days and sit quietly to feel and know your healing love for me." },
      { day: 5, scriptureRef: "Exodus 20:11", scriptureText: "For in six days the Lord made heaven and earth, the sea, and all that is in them, but rested the seventh day; therefore the Lord blessed the Sabbath day and consecrated it.", question: "To “consecrate” means to dedicate something to holy purposes. Can you think of a time when you dedicated a relationship or a time in your life to loving and holy purposes?", prayer: "Loving God, you consecrated the Sabbath by resting on that day. Teach me how dedicating myself to rest can renew and inspire me to seek holy and loving purpose in every other day of the week." },
    ],
  },
];

// ── Progress (local, per-device) ────────────────────────────────────────────
// A flat "week.day" set of completed days + the furthest-reached position. Kept
// in localStorage so the journey is a gentle invitation, not server state.
const PROGRESS_KEY = "phoebe:wol-journey:v1";

export type WolProgress = { done: string[] };

export function loadWolProgress(): WolProgress {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    if (raw) { const p = JSON.parse(raw) as WolProgress; if (Array.isArray(p.done)) return p; }
  } catch { /* ignore */ }
  return { done: [] };
}
export function saveWolProgress(p: WolProgress): void {
  try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(p)); } catch { /* ignore */ }
}
export const dayKey = (week: number, day: number) => `${week}.${day}`;

// The next uncompleted day, scanning weeks/days in order — where "Continue" lands.
export function nextWolDay(done: Set<string>): { week: number; day: number } {
  for (const w of WOL_DEVOTIONS) {
    for (const d of w.days) {
      if (!done.has(dayKey(w.week, d.day))) return { week: w.week, day: d.day };
    }
  }
  return { week: 8, day: 5 }; // all done — rest on the last day
}
