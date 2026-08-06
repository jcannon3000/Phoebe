// "A Novena for Personal Discernment" — a Phoebe compilation, not a
// historical devotion and not attributed to any single author. Built from
// the 1979 BCP Psalter (actual verse text spliced in server-side by
// psalmNumber, exactly as with the Creation novena — never re-transcribed
// here) paired with a named BCP occasional collect for each day (cited by
// title and standard page reference only, not reproduced verbatim here —
// the exact wording should be read from a BCP, in the app's own Daily
// Office material, or a printed Prayer Book, rather than risk a
// misremembered "quotation" of liturgical text) and an original
// Phoebe-written reflection and prayer for each day's theme.
//
// May be begun at any time — discernment doesn't wait for a season.

const DAYS: Array<{ dayNumber: number; title: string; psalmNumber: number; collectTitle: string; collectRef: string; body: string }> = [
  {
    dayNumber: 1,
    title: "Opening the Question",
    psalmNumber: 25,
    collectTitle: "For Guidance",
    collectRef: "BCP, p. 100",
    body:
      "Every discernment starts the same way: naming, out loud or on paper, what it is you're actually " +
      "deciding. Today isn't for answers — it's for honesty about the question itself.\n\n" +
      "Turn to the Collect “For Guidance” in your Book of Common Prayer (or the app's Daily Office) " +
      "and pray it slowly.\n\n" +
      "God who already knows what I'm turning over, help me name it plainly today — not the version I've " +
      "rehearsed for other people, but the real question underneath. Amen.",
  },
  {
    dayNumber: 2,
    title: "Quieting the Heart",
    psalmNumber: 46,
    collectTitle: "For Quiet Confidence",
    collectRef: "BCP, p. 832",
    body:
      "“Be still, and know that I am God.” Discernment isn't a problem to solve by force of will — it " +
      "asks for a quieted heart before it asks for a clear head. Today, resist the urge to decide.\n\n" +
      "Pray the Collect “For Quiet Confidence.”\n\n" +
      "Still me, Lord, before you guide me. Let today be about quiet, not conclusions. Amen.",
  },
  {
    dayNumber: 3,
    title: "Trusting the Process",
    psalmNumber: 143,
    collectTitle: "A Collect for Grace",
    collectRef: "BCP, p. 100",
    body:
      "“Cause me to hear thy loving-kindness in the morning… show me the way that I should walk in.” " +
      "A real discernment takes time it doesn't feel like you have. Today, pray for the grace to trust " +
      "the process rather than rush the outcome.\n\n" +
      "Pray the Collect for Grace, appointed for the morning.\n\n" +
      "Lord, I want the answer today. Give me instead the grace to trust that you're not in a hurry " +
      "with me. Amen.",
  },
  {
    dayNumber: 4,
    title: "Naming the Fear",
    psalmNumber: 27,
    collectTitle: "A Collect for Peace",
    collectRef: "BCP, p. 99",
    body:
      "“The Lord is my light and my salvation; whom then shall I fear?” Most discernments carry a fear " +
      "underneath them — of the wrong choice, of disappointing someone, of what changes. Today, name " +
      "the fear instead of managing around it.\n\n" +
      "Pray the Collect for Peace.\n\n" +
      "God, here is what I'm actually afraid of. I don't need you to make it go away — just to sit with " +
      "me in it. Amen.",
  },
  {
    dayNumber: 5,
    title: "Being Known",
    psalmNumber: 139,
    collectTitle: "For the Right Use of God's Gifts",
    collectRef: "BCP, p. 827",
    body:
      "“Thou hast searched me out and known me.” Before this decision is about the world, it's about who " +
      "you are — your gifts, your limits, your particular shape. Today, ask what this choice would ask " +
      "of the person you actually are, not the person you wish you were.\n\n" +
      "Pray the Collect “For the Right Use of God's Gifts.”\n\n" +
      "You made me with these specific gifts and these specific limits, Lord. Help me choose in keeping " +
      "with who you made, not who I'm performing. Amen.",
  },
  {
    dayNumber: 6,
    title: "Offering the Choice",
    psalmNumber: 131,
    collectTitle: "A Prayer of Self-Dedication",
    collectRef: "BCP, p. 832",
    body:
      "“Like a child that is weaned from its mother.” Today's psalm is short on purpose — this is a day " +
      "for less striving, not more. Offer this decision to God the way you'd hand something heavy to " +
      "someone stronger than you.\n\n" +
      "Pray the Prayer of Self-Dedication.\n\n" +
      "Here it is, Lord — the whole weight of it. I'm not asking you to decide for me; I'm asking you " +
      "to decide with me. Amen.",
  },
  {
    dayNumber: 7,
    title: "Seeking Counsel",
    psalmNumber: 34,
    collectTitle: "A Collect for Aid against Perils",
    collectRef: "BCP, p. 124",
    body:
      "“O taste and see how gracious the Lord is.” Discernment done entirely alone tends to just confirm " +
      "what you already wanted. Today, if there's someone wise you trust, ask them what they see — and " +
      "actually listen.\n\n" +
      "Pray the Collect for Aid against Perils.\n\n" +
      "Lord, keep me from the peril of only hearing my own voice in this. Send me someone honest, and " +
      "give me the humility to hear them. Amen.",
  },
  {
    dayNumber: 8,
    title: "Gratitude for the Choosing",
    psalmNumber: 90,
    collectTitle: "General Thanksgiving",
    collectRef: "BCP, p. 101",
    body:
      "“Establish thou the work of our hands.” However this turns out, the fact that you have a choice " +
      "at all — a life, a future, a say in it — is itself a gift. Today, give thanks for the choosing, " +
      "not just the chosen.\n\n" +
      "Pray the General Thanksgiving.\n\n" +
      "Thank you for a life worth deliberating over, Lord. Whatever I decide, let it be offered back to " +
      "you in gratitude, not anxiety. Amen.",
  },
  {
    dayNumber: 9,
    title: "Stepping Forward",
    psalmNumber: 121,
    collectTitle: "For Guidance",
    collectRef: "BCP, p. 100",
    body:
      "“The Lord shall preserve thy going out and thy coming in.” Nine days in, you may have an answer, " +
      "or you may still be waiting — either is a faithful place to end a novena. Pray once more the " +
      "prayer you began with, now carrying whatever clarity, or continued not-knowing, these days have " +
      "given you.\n\n" +
      "Pray the Collect “For Guidance” once more, as you did on the first day.\n\n" +
      "Lord, I've brought you this question for nine days. Whatever comes next, go with me into it — " +
      "in my going out and my coming in, now and always. Amen.",
  },
];

export const NOVENA_DISCERNMENT = {
  title: "A Novena for Personal Discernment",
  saint: null as string | null,
  sourceNote:
    "A Phoebe compilation — not a historical devotion and not attributed to any single author. " +
    "1979 BCP Psalter texts, paired with a named BCP occasional collect each day (cited by title " +
    "and page — read the exact text from a Prayer Book or the app's own Daily Office) and original " +
    "Phoebe-written reflections and prayers.",
  history:
    "This novena is a Phoebe compilation, written for anyone facing a decision and seeking clarity — " +
    "it isn't drawn from any historical source or attributed to any particular author. Each day pairs " +
    "a psalm from the Book of Common Prayer with a named BCP collect and an original reflection.",
  intention:
    "To walk a real decision through nine days of prayer — naming the question honestly, quieting the " +
    "urge to rush, facing fear, being known, offering the choice to God, seeking counsel, giving " +
    "thanks, and finally stepping forward — rather than deciding alone and in a hurry.",
  dayCount: 9,
  days: DAYS.map((d) => ({
    dayNumber: d.dayNumber,
    title: d.title,
    psalmNumber: d.psalmNumber,
    body: d.body,
  })),
};
