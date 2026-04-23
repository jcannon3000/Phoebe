// Holy Days from the BCP 1979 calendar (pp. 15–17) — the major
// feasts of apostles, evangelists, and other high-rank commemorations.
// These are fixed to a calendar date (not computed from Easter).
//
// Rank = "holy_day" for everything here except Principal Feasts
// (Christmas, Epiphany, All Saints), which are promoted to
// "principal_feast" per BCP.
//
// Life dates and descriptions are kept short; collects are NOT
// inlined — refer to the BCP for the authoritative text.

import type { FixedFeastEntry, LiturgicalColor } from "./types";

const white: LiturgicalColor = "white";
const red: LiturgicalColor = "red";
const violet: LiturgicalColor = "violet";

export const HOLY_DAYS: FixedFeastEntry[] = [
  {
    month: 1, day: 1,
    rank: "holy_day",
    name: "The Holy Name",
    color: white,
    description:
      "The eighth day of Christmas — the circumcision and naming of Jesus. Keeps in view the name itself, 'Jesus,' which means salvation.",
  },
  {
    month: 1, day: 6,
    rank: "principal_feast",
    name: "The Epiphany",
    color: white,
    description:
      "The manifestation of Christ to the Gentiles — the visit of the Magi. A principal feast and the opening of the season after Epiphany.",
  },
  {
    month: 1, day: 18,
    rank: "holy_day",
    name: "The Confession of Saint Peter the Apostle",
    color: white,
    description:
      "Peter's confession at Caesarea Philippi: 'You are the Messiah, the Son of the living God.' Opens the Week of Prayer for Christian Unity.",
  },
  {
    month: 1, day: 25,
    rank: "holy_day",
    name: "The Conversion of Saint Paul the Apostle",
    color: white,
    description:
      "The Damascus Road — the turn that made a persecutor into an apostle. Closes the Week of Prayer for Christian Unity.",
  },
  {
    month: 2, day: 2,
    rank: "holy_day",
    name: "The Presentation of Our Lord Jesus Christ in the Temple",
    color: white,
    description:
      "Forty days after Christmas. Simeon's Nunc Dimittis, Anna's recognition. Also called Candlemas, traditionally with a procession of lights.",
  },
  {
    month: 2, day: 24,
    rank: "holy_day",
    name: "Saint Matthias the Apostle",
    color: red,
    description:
      "Chosen by lot after the Ascension to replace Judas among the Twelve.",
    life: "first century",
  },
  {
    month: 3, day: 19,
    rank: "holy_day",
    name: "Saint Joseph",
    color: white,
    description:
      "Husband of the Virgin Mary, foster father of Jesus. Remembered for his quiet obedience and protection of the Holy Family.",
  },
  {
    month: 3, day: 25,
    rank: "holy_day",
    name: "The Annunciation",
    color: white,
    description:
      "Gabriel's visit to Mary. Nine months before Christmas — the incarnation begins with Mary's 'Let it be with me according to your word.'",
  },
  {
    month: 4, day: 25,
    rank: "holy_day",
    name: "Saint Mark the Evangelist",
    color: red,
    description:
      "Author of the second gospel. Traditionally a companion of Peter; remembered as the founder of the church in Alexandria.",
    life: "first century",
  },
  {
    month: 5, day: 1,
    rank: "holy_day",
    name: "Saints Philip and James, Apostles",
    color: red,
    description:
      "Philip, who brought Nathanael to Jesus; James the Less, son of Alphaeus. Remembered together.",
    life: "first century",
  },
  {
    month: 5, day: 31,
    rank: "holy_day",
    name: "The Visitation",
    color: white,
    description:
      "Mary's visit to her cousin Elizabeth, and the Magnificat — 'My soul magnifies the Lord.'",
  },
  {
    month: 6, day: 11,
    rank: "holy_day",
    name: "Saint Barnabas the Apostle",
    color: red,
    description:
      "The 'son of encouragement.' Brought Paul into the apostolic community; later missionary to Antioch and Cyprus.",
    life: "first century",
  },
  {
    month: 6, day: 24,
    rank: "holy_day",
    name: "The Nativity of Saint John the Baptist",
    color: white,
    description:
      "Six months before Christmas. The forerunner of Christ, voice in the wilderness, 'He must increase; I must decrease.'",
  },
  {
    month: 6, day: 29,
    rank: "holy_day",
    name: "Saint Peter and Saint Paul, Apostles",
    color: red,
    description:
      "Remembered together as the two great pillars of the apostolic church. Tradition places both martyrdoms in Rome.",
    life: "first century",
  },
  {
    month: 7, day: 4,
    rank: "holy_day",
    name: "Independence Day",
    color: white,
    description:
      "A national day of thanksgiving and prayer. The BCP provides proper lessons and a collect for the day.",
  },
  {
    month: 7, day: 22,
    rank: "holy_day",
    name: "Saint Mary Magdalene",
    color: white,
    description:
      "The first witness to the resurrection — 'Apostle to the Apostles.'",
    life: "first century",
  },
  {
    month: 7, day: 25,
    rank: "holy_day",
    name: "Saint James the Apostle",
    color: red,
    description:
      "Son of Zebedee, brother of John. The first of the Twelve to be martyred (Acts 12).",
    life: "d. c. 44",
  },
  {
    month: 8, day: 6,
    rank: "holy_day",
    name: "The Transfiguration of Our Lord Jesus Christ",
    color: white,
    description:
      "On the mountain: Jesus transfigured in glory with Moses and Elijah, and the voice from the cloud — 'This is my beloved Son.'",
  },
  {
    month: 8, day: 15,
    rank: "holy_day",
    name: "Saint Mary the Virgin, Mother of Our Lord Jesus Christ",
    color: white,
    description:
      "A principal feast of the Blessed Virgin Mary. Remembers her life, her Magnificat, and her witness at the foot of the cross.",
  },
  {
    month: 8, day: 24,
    rank: "holy_day",
    name: "Saint Bartholomew the Apostle",
    color: red,
    description:
      "One of the Twelve; often identified with Nathanael. Tradition places his later mission in Armenia.",
    life: "first century",
  },
  {
    month: 9, day: 14,
    rank: "holy_day",
    name: "Holy Cross Day",
    color: red,
    description:
      "The dedication of the basilicas at Jerusalem over the sites of the crucifixion and burial, and the finding of the true cross.",
  },
  {
    month: 9, day: 21,
    rank: "holy_day",
    name: "Saint Matthew, Apostle and Evangelist",
    color: red,
    description:
      "Tax collector called from his table; author of the first gospel.",
    life: "first century",
  },
  {
    month: 9, day: 29,
    rank: "holy_day",
    name: "Saint Michael and All Angels",
    color: white,
    description:
      "Michaelmas. A feast of the angelic host — ministers of God's will, guardians of the faithful.",
  },
  {
    month: 10, day: 18,
    rank: "holy_day",
    name: "Saint Luke the Evangelist",
    color: red,
    description:
      "Author of the third gospel and of Acts. The beloved physician, companion of Paul.",
    life: "first century",
  },
  {
    month: 10, day: 23,
    rank: "holy_day",
    name: "Saint James of Jerusalem, Brother of Our Lord Jesus Christ, and Martyr",
    color: red,
    description:
      "First bishop of Jerusalem, author of the epistle bearing his name, presided at the Council of Jerusalem (Acts 15).",
    life: "d. c. 62",
  },
  {
    month: 10, day: 28,
    rank: "holy_day",
    name: "Saint Simon and Saint Jude, Apostles",
    color: red,
    description:
      "Simon the Zealot and Jude (Thaddaeus), remembered together. Patron of lost causes (Jude).",
    life: "first century",
  },
  {
    month: 11, day: 1,
    rank: "principal_feast",
    name: "All Saints' Day",
    color: white,
    description:
      "A principal feast. Remembers all the saints, known and unknown — the great cloud of witnesses.",
  },
  {
    month: 11, day: 2,
    rank: "lesser_feast",
    name: "Commemoration of All Faithful Departed",
    color: white,
    description:
      "All Souls' Day. A remembrance of the faithful who have died, distinct from All Saints' Day.",
  },
  {
    month: 11, day: 30,
    rank: "holy_day",
    name: "Saint Andrew the Apostle",
    color: red,
    description:
      "Brother of Simon Peter; the first-called of the Twelve. Patron saint of Scotland.",
    life: "first century",
  },
  {
    month: 12, day: 21,
    rank: "holy_day",
    name: "Saint Thomas the Apostle",
    color: red,
    description:
      "Called Didymus. The doubter who cried 'My Lord and my God!' at the sight of the risen Christ.",
    life: "first century",
  },
  {
    month: 12, day: 25,
    rank: "principal_feast",
    name: "The Nativity of Our Lord Jesus Christ: Christmas Day",
    color: white,
    description:
      "A principal feast. The Word made flesh, dwelling among us.",
  },
  {
    month: 12, day: 26,
    rank: "holy_day",
    name: "Saint Stephen, Deacon and Martyr",
    color: red,
    description:
      "The first martyr — stoned for his witness. Remembered the day after Christmas.",
    life: "d. c. 35",
  },
  {
    month: 12, day: 27,
    rank: "holy_day",
    name: "Saint John, Apostle and Evangelist",
    color: white,
    description:
      "The Beloved Disciple. Author of the fourth gospel, three epistles, and the Revelation.",
    life: "first century",
  },
  {
    month: 12, day: 28,
    rank: "holy_day",
    name: "The Holy Innocents",
    color: red,
    description:
      "The children of Bethlehem, killed by Herod's order. A sober commemoration amid the light of Christmastide.",
  },
];

// Look up a Holy Day by calendar date. Returns the entry if this
// (month, day) matches a Holy Day, else undefined.
export function holyDayFor(month: number, day: number): FixedFeastEntry | undefined {
  return HOLY_DAYS.find(e => e.month === month && e.day === day);
}

// Thanksgiving Day — movable within November (4th Thursday).
// Computed on demand rather than stored as a fixed date.
export function thanksgivingDay(year: number): Date {
  // Find the first Thursday of November, add 21 days.
  const nov1 = new Date(year, 10, 1);
  const firstThu = new Date(year, 10, 1 + ((4 - nov1.getDay() + 7) % 7));
  return new Date(year, 10, firstThu.getDate() + 21);
}
