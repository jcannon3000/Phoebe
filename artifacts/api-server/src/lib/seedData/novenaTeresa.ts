// Structured seed data for "Novena of Saint Teresa" — derived from
// novena_teresa_original.txt (verbatim transcription, same directory).
//
// The 1846 original prints the invocation + two opening prayers + the anthem
// ONCE (Day 1, pp. 477-478) and the closing hymn/versicle/prayer ONCE (Day 1,
// pp. 479-480), then has Days 2-9 point back to them ("First Prayer... as in
// page 478", "Hymn, Vers. and Prayer... as in pages 479 and 480") rather than
// reprinting them — a standard space-saving convention in 19th-century prayer
// books. Each entry below RESOLVES those references so a single day reads as
// a complete, self-contained devotion (exactly what someone following the
// book would assemble for themselves) — the only day-to-day variation is each
// day's own proper prayer (SHARED.dayPrayer[N]), matching the original.
//
// The Fourth Day's missing "Second Prayer" reference line (see editorial
// note 2 in novena_teresa_original.txt) is resolved here by including the
// Second Prayer anyway, since every other day does and the day's own
// structure otherwise matches exactly — flagged, not silently assumed.

const INVOCATION =
  "In the name of the Father, and of the Son, and of the Holy Ghost. Amen.\n\n" +
  "Blessed be the holy and undivided Trinity, now and for evermore. Amen.\n\n" +
  "Come, O Holy Ghost, replenish my heart, and enkindle in it the fire of thy divine love. Amen.";

const FIRST_PRAYER =
  "O Almighty and eternal God, most holy and adorable Trinity, Father, Son, and Holy Ghost, " +
  "beginning and end of all things, in whom we live, and move, and have our being; I firmly " +
  "believe that thou art here present; I adore thee with the most profound humility; I praise " +
  "thee, I give thee thanks from the bottom of my heart, because thou hast created me after " +
  "thine own likeness; because thou hast redeemed me with the precious blood of thine only Son. " +
  "Behold, O Lord, I offer thee my thoughts, words, and actions; and firmly resolve from this " +
  "moment to bear with patience and resignation all the crosses and afflictions I may meet with " +
  "in the course of my life. I consecrate them entirely to the glory of thy name, in union with " +
  "those of my Lord and Saviour Jesus Christ, that through his infinite merits they may be " +
  "acceptable to thee. Give them, O Lord, a blessing. May thy divine love animate them, and may " +
  "they all tend to thy greater glory, and to procure for me a share of that heavenly felicity, " +
  "which the seraphic virgin, St. Teresa of Jesus, this day enjoys.";

// The 1846 text leaves a blank here for the reader's own petition — preserved
// as an editorial placeholder rather than filled in.
const SECOND_PRAYER =
  "Holy St. Teresa of Jesus, most pure virgin, if it be for the glory of God, and to thy honour, " +
  "that I obtain [here name your petition], which is what I desire and beg, by performing this " +
  "novena, obtain it for me, I beseech thee, O holy virgin, by thy prayers; if not, guide my " +
  "petition, and beg of Jesus for me, that which is most proper for his glory, and the salvation " +
  "of my immortal soul, which shall soon appear before the awful tribunal of his divine Majesty. " +
  "Amen.";

const ANTHEM =
  "Anthem. Come, O holy Teresa, spouse of Christ, receive the crown which the Lord hath prepared for thee for ever.";

const CLOSING =
  "Our Father. Hail Mary. Glory be to the Father.\n\n" +
  "Hymn.\n" +
  "As legate sent by God's command, Teresa quits her native land, In barbarous soils to sow the seed " +
  "Of Christian faith, or else to bleed.\n\n" +
  "But pains more gentle her attend— A softer death her life must end: Seraphic darts must strike her heart, " +
  "And she in pangs of love depart.\n\n" +
  "O Love's true victim! may thy fire, With holy warmth our hearts inspire; And thy intrusted nations keep " +
  "From hell's obscure and burning deep.\n\n" +
  "To God the Father and the Son, And Holy Ghost, three in one, Be equal glory, equal praise, " +
  "Both now and for eternal days. Amen.\n\n" +
  "V. Pray for us, O holy Mother, St. Teresa.\n" +
  "R. That we may be made worthy of the promises of Christ.\n\n" +
  "Let us pray. Hear us, O God our Saviour, that as we rejoice in the solemnity of blessed Teresa, thy " +
  "virgin and our mother, so we may be nourished with the food of her celestial doctrine, and improved " +
  "with the affection of solid piety: through Christ our Lord. Amen.\n\n" +
  "Our Father. Hail Mary. Glory be to the Father.";

// Each day's own proper prayer — the one piece of text that actually changes
// day to day in the original.
const DAY_PRAYER: string[] = [
  // Day 1
  "O Almighty and Eternal God, who didst inflame the heart of the seraphic Teresa with the love of thee, " +
    "and didst endow her with wonderful fortitude of mind in the pursuit of perfection, through every path " +
    "of life, and didst, moreover, by her means, illustrate the church with many pious and exemplary " +
    "children, grant, I most humbly beseech thee, by her merits and prayers, that we, who like her, put our " +
    "whole trust in thee, may obtain strength of mind and body, to the end that we may love and serve thee, " +
    "the true fountain of perfection here on earth, and hereafter see and enjoy thee in the kingdom of thy " +
    "glory: through our Lord Jesus Christ. Amen.",
  // Day 2
  "O Lord Jesus Christ, who art both the model and reward of true sanctity and humility, we beseech thee, " +
    "that as, by thy grace, blessed Teresa has been admitted to the enjoyments and delights of paradise, so " +
    "we also, by endeavouring to imitate her virtues, may arrive with joy to the revelation of thy " +
    "everlasting glory, who livest and reignest with the Father, world without end. Amen.",
  // Day 3
  "O Holy and invincible martyr, St. Teresa of Jesus, by that ardent love of God, which impelled you to " +
    "relinquish your father's house, at the tender age of seven years, to carry the light of the gospel " +
    "amongst the Moors, with the determined resolution of shedding your blood for the faith of your " +
    "heavenly Master, intercede for me, I beseech you, that I may always have such a lively faith, as to " +
    "regulate my life in conformity with the precepts of my holy religion, and that I may arrive at the " +
    "haven of salvation, to behold him face to face, in whom we believe and hope, in this valley of tears, " +
    "Christ Jesus our Lord. Amen.",
  // Day 4
  "Holy St. Teresa, most pure virgin, by that extraordinary favour, which Almighty God conferred on you, " +
    "in preserving you from the snares of the devil, during your stay in this life, I most humbly beseech " +
    "you to obtain for me, by your prayers, the grace of doing true and salutary penance for all my sins, " +
    "and of never offending the divine Majesty during the remainder of my life: through Christ Jesus our " +
    "Lord. Amen.",
  // Day 5
  "O Blessed Teresa, faithful teacher of the art of loving God above all things, by that abundance of " +
    "celestial lights, with which his divine Majesty filled thy happy mind; obtain for me, through thy " +
    "powerful intercession, that I may imitate thy virtues; pray for me, I beseech thee, O glorious Teresa; " +
    "and as thou hadst a sincere love for Jesus, and as Jesus always loved thee, obtain for me the " +
    "incomparable advantage of living faithful to Jesus, and of dying in his divine love. Amen.",
  // Day 6
  "O Teresa, most beloved spouse of the Son of God, by that special favour you received from Jesus Christ, " +
    "when in ecstasy, you heard him declare you his spouse, we beseech you to obtain of him for us, that " +
    "our souls having loved him faithfully here on earth, may be made worthy to enjoy him eternally in " +
    "heaven. Amen.",
  // Day 7
  "O Teresa, most fortunate in having inherited the fervent zeal of the great prophet and patriarch St. " +
    "Elias, we beseech you by that glory which redounds to your name, from your having been by Jesus " +
    "Christ made zealitrix of his honour, to obtain of him for us, that we may zealously guard all our " +
    "thoughts, words, and actions, lest by them we should be so unfortunate as to offend our good and " +
    "gracious God. Amen.",
  // Day 8
  "O Teresa, gifted with ecstatic contemplation, and seraphic love of the divine beauty, by that union of " +
    "spirit, and internal attachment which you had always to God, the only object of your thoughts and " +
    "affections; obtain for us the grace of a most fervent love for God, whereby we may seek or desire " +
    "nothing but to please him in this life, and in the next to enjoy him for eternity. Amen.",
  // Day 9
  "O Teresa, most pure victim of charity, having at length expired by the vehemence of your love for God, " +
    "by that inexplicable joy and grief you experienced when your heart was wounded by the celestial " +
    "seraphim, obtain for us, we beseech you, such an ardent love for God, as shall consume in our souls " +
    "everything that is earthly and sinful, and prepare them to receive the impressions of divine grace. " +
    "Amen.",
];

const DAY_TITLES = [
  "First Day", "Second Day", "Third Day", "Fourth Day", "Fifth Day",
  "Sixth Day", "Seventh Day", "Eighth Day", "Ninth Day",
];

export const NOVENA_TERESA = {
  title: "Novena of St. Teresa of Ávila",
  saint: "St. Teresa of Ávila",
  sourceNote:
    "“Novena of Saint Teresa,” from The Carmelite Manual, compiled by John Spratt, Dublin, 1846, pp. 477-488. Public domain.",
  dayCount: 9,
  days: DAY_TITLES.map((title, i) => ({
    dayNumber: i + 1,
    title,
    body: [INVOCATION, FIRST_PRAYER, SECOND_PRAYER, ANTHEM, DAY_PRAYER[i]!, CLOSING].join("\n\n"),
  })),
};
