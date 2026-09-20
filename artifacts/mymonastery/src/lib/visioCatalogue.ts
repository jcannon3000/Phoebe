/**
 * Art in the Christian Tradition — the curated artwork LIBRARY.
 *
 * GENERATED FILE. Do not edit by hand: run
 *   node scripts/fetch-act-catalogue.mjs
 * which re-harvests EVERY ACT work by the library's artists (the allowlist
 * in that script — owner-curated) and re-verifies rights per record: either
 * a Commons-verified free licence, or ACT's recorded artist grant of
 * non-commercial use with attribution (Phoebe is a non-profit; the required
 * attribution is printed on the closing slide). Records with neither were
 * dropped rather than assumed. A keyword nudity screen runs at harvest;
 * runtime deletions and icon toggles made in the admin art-library tool
 * live in act_overrides, NOT here, and survive regeneration.
 *
 * `img` points at ACT's own S3 host rather than a bundled asset — the
 * collection is far too large to ship in the binary, and their host serves
 * only full-size JPEGs. The image is fetched when the practice opens.
 *
 * `refs` are the passages ACT tags a work to; visioSelect crosses them
 * against the day's appointed lessons. Works with NO refs are library-only:
 * they can never be chosen as the day's Visio image, but the admin tool and
 * the icon toggle can surface them. `people` and `subjects` are ACT's own
 * tags — searchable metadata, shown in the admin tool.
 */

export type CatalogueArtwork = {
  /** ACT's own record id. */
  id: number;
  title: string;
  artist: string | null;
  date: string | null;
  where: string | null;
  img: string;
  refs: string[];
  days: string[];
  people: string[];
  subjects: string[];
  essay: string;
  act: string;
  /** The verified licence (or the artist's recorded grant), named on the closing slide. */
  licence: string;
  attribution: string;
  /**
   * From the owner's own curated library rather than the commentary harvest.
   * A TIE-BREAK, not a filter: where a curated work and a harvested one answer
   * the week's reading equally well, the curated one wins — so reopening the
   * pool widened it without diluting the library the owner actually chose.
   * Set when the two catalogues are unioned; absent on a bare record.
   */
  curated?: boolean;
};

export const ACT_CATALOGUE: CatalogueArtwork[] = [
 {
  "id": 47583,
  "title": "Holy Family",
  "artist": "JESUS MAFA",
  "date": "1973",
  "where": "Cameroon",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Mafa001.jpg",
  "refs": [
   "Luke 2:22-40",
   "Psalm 32"
  ],
  "days": [
   "Year A Nativity of the Lord Proper I",
   "Year B Christmas 1st Sunday",
   "Year C Proper 26th Sunday",
   "",
   "Year B Nativity of the Lord Proper I"
  ],
  "people": [],
  "subjects": [
   "Holy Family",
   "Childhood of Jesus",
   "Culture: African",
   "Culture: Black"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/47583",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "JESUS MAFA. Holy Family, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: http://www.librairie-emmanuel.fr (contact page: https://www.librairie-emmanuel.fr/contact)."
 },
 {
  "id": 48266,
  "title": "The Rich Fool",
  "artist": "JESUS MAFA",
  "date": "1973",
  "where": "Cameroon",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Mafa002.jpg",
  "refs": [
   "Luke 12:13-21"
  ],
  "days": [
   "",
   "Year C Proper 13th Sunday"
  ],
  "people": [],
  "subjects": [
   "Culture: African",
   "Culture: Black",
   "Rich"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/48266",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "JESUS MAFA. The Rich Fool, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: http://www.librairie-emmanuel.fr (contact page: https://www.librairie-emmanuel.fr/contact)."
 },
 {
  "id": 48267,
  "title": "The Rich Man and Lazarus",
  "artist": "JESUS MAFA",
  "date": "1973",
  "where": "Cameroon",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Mafa003.jpg",
  "refs": [
   "Luke 16:19-31"
  ],
  "days": [
   "Year C Proper 21st Sunday",
   ""
  ],
  "people": [],
  "subjects": [
   "Culture: African",
   "Culture: Black",
   "Rich"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/48267",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "JESUS MAFA. The Rich Man and Lazarus, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: http://www.librairie-emmanuel.fr (contact page: https://www.librairie-emmanuel.fr/contact)."
 },
 {
  "id": 48268,
  "title": "The Pharisee and the Publican",
  "artist": "JESUS MAFA",
  "date": "1973",
  "where": "Cameroon",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Mafa004.jpg",
  "refs": [
   "Luke 18:9-14",
   "Matthew 6:1-6, 16-21"
  ],
  "days": [
   "Year C Proper 25th Sunday",
   "",
   "Year B Ash Wednesday",
   "Year A Ash Wednesday",
   "Year C Ash Wednesday"
  ],
  "people": [
   "Pharisees (Biblical figures)",
   "Publican (Biblical figure)"
  ],
  "subjects": [
   "Pride",
   "Humility",
   "Culture: African",
   "Culture: Black"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/48268",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "JESUS MAFA. The Pharisee and the Publican, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: http://www.librairie-emmanuel.fr (contact page: https://www.librairie-emmanuel.fr/contact)."
 },
 {
  "id": 48269,
  "title": "Jesus raises Lazarus to life",
  "artist": "JESUS MAFA",
  "date": "1973",
  "where": "Cameroon",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Mafa005.jpg",
  "refs": [
   "John 11:1-45",
   "John 11:32-44"
  ],
  "days": [
   "Year B All Saints Day",
   "Year A Lent 5th  Sunday",
   ""
  ],
  "people": [
   "Lazarus, of Bethany (Biblical figure)"
  ],
  "subjects": [
   "Raising from the Dead",
   "Culture: African",
   "Culture: Black"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/48269",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "JESUS MAFA. Jesus raises Lazarus to life, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: http://www.librairie-emmanuel.fr (contact page: https://www.librairie-emmanuel.fr/contact)."
 },
 {
  "id": 48271,
  "title": "Jesus drives out the merchants",
  "artist": "JESUS MAFA",
  "date": "1973",
  "where": "Cameroon",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Mafa006.jpg",
  "refs": [
   "John 2:13-22"
  ],
  "days": [
   "Year B Lent 3rd Sunday",
   ""
  ],
  "people": [],
  "subjects": [
   "Cleansing of the Temple",
   "Culture: African",
   "Culture: Black"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/48271",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "JESUS MAFA. Jesus drives out the merchants, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: http://www.librairie-emmanuel.fr (contact page: https://www.librairie-emmanuel.fr/contact)."
 },
 {
  "id": 48272,
  "title": "The Lord's Supper",
  "artist": "JESUS MAFA",
  "date": "1973",
  "where": "Cameroon",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Mafa007.jpg",
  "refs": [
   "John 13:1-17, 31b-35"
  ],
  "days": [
   "Year A Maundy Thursday",
   "Year B Holy Wednesday",
   "Year A Holy Wednesday",
   "Year B Proper 11th Sunday",
   "Year C Holy Wednesday"
  ],
  "people": [],
  "subjects": [
   "Passion of Jesus Christ: Last Supper",
   "Culture: African",
   "Culture: Black"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/48272",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "JESUS MAFA. The Lord's Supper, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: http://www.librairie-emmanuel.fr (contact page: https://www.librairie-emmanuel.fr/contact)."
 },
 {
  "id": 48273,
  "title": "Peter denies Jesus",
  "artist": "JESUS MAFA",
  "date": "1973",
  "where": "Cameroon",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Mafa008.jpg",
  "refs": [
   "Luke 22:14-23:56"
  ],
  "days": [
   "Year C Liturgy of Pass",
   ""
  ],
  "people": [
   "Peter, the Apostle (Biblical figure)"
  ],
  "subjects": [
   "Culture: African",
   "Culture: Black"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/48273",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "JESUS MAFA. Peter denies Jesus, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: http://www.librairie-emmanuel.fr (contact page: https://www.librairie-emmanuel.fr/contact)."
 },
 {
  "id": 48274,
  "title": "The Flagellation",
  "artist": "JESUS MAFA",
  "date": "1973",
  "where": "Cameroon",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Mafa009.jpg",
  "refs": [
   "Mark 14:1-15:47",
   "Luke 22:14-23:56",
   "Hebrews 2:14-18"
  ],
  "days": [
   "Year B Liturgy of Pass",
   "Year C Liturgy of Pass",
   "Year B Proper 19th Sunday",
   "",
   "Year B Lent 2nd Sunday",
   "Year C Presentation of the Lord",
   "Year A Presentation of the Lord",
   "Year B Presentation of the Lord"
  ],
  "people": [],
  "subjects": [
   "Passion of Jesus Christ: Flagellation",
   "Culture: African",
   "Culture: Black"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/48274",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "JESUS MAFA. The Flagellation, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: http://www.librairie-emmanuel.fr (contact page: https://www.librairie-emmanuel.fr/contact)."
 },
 {
  "id": 48275,
  "title": "Jesus appears at Emmaus",
  "artist": "JESUS MAFA",
  "date": "1973",
  "where": "Cameroon",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Mafa010.jpg",
  "refs": [
   "Luke 24:13-35",
   "Luke 24:13-49"
  ],
  "days": [
   "Year A Easter 3rd Sunday",
   "",
   "Year B Resurrection of the Lord"
  ],
  "people": [
   "Jesus Christ (Biblical figure)"
  ],
  "subjects": [
   "Emmaus: Supper",
   "Culture: African",
   "Culture: Black"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/48275",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "JESUS MAFA. Jesus appears at Emmaus, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: http://www.librairie-emmanuel.fr (contact page: https://www.librairie-emmanuel.fr/contact)."
 },
 {
  "id": 48278,
  "title": "The Annunciation - Gabriel and Mary",
  "artist": "JESUS MAFA",
  "date": "1973",
  "where": "Cameroon",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Mafa045.jpg",
  "refs": [
   "Luke 1:26-38",
   "Luke 1:46b-55"
  ],
  "days": [
   "Year B Advent 4th Sunday",
   "Year A Advent 3rd Sunday",
   "",
   "Year C Advent 4th Sunday"
  ],
  "people": [
   "Mary, the mother of Jesus (Biblical figure)"
  ],
  "subjects": [
   "Annunciation to Mary",
   "Culture: African",
   "Culture: Black"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/48278",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "JESUS MAFA. The Annunciation - Gabriel and Mary, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: http://www.librairie-emmanuel.fr (contact page: https://www.librairie-emmanuel.fr/contact)."
 },
 {
  "id": 48279,
  "title": "The Visitation - Mary and Elizabeth meet",
  "artist": "JESUS MAFA",
  "date": "1973",
  "where": "Cameroon",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Mafa012.jpg",
  "refs": [
   "Luke 1:39-57"
  ],
  "days": [
   "Year A Visitation of Mary to Elizabeth",
   "Year B Visitation of Mary to Elizabeth",
   "Year C Visitation of Mary to Elizabeth",
   "Year C Advent 4th Sunday"
  ],
  "people": [],
  "subjects": [
   "Visitation",
   "Culture: African",
   "Culture: Black"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/48279",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "JESUS MAFA. The Visitation - Mary and Elizabeth meet, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: http://www.librairie-emmanuel.fr (contact page: https://www.librairie-emmanuel.fr/contact)."
 },
 {
  "id": 48280,
  "title": "Jesus among the teachers",
  "artist": "JESUS MAFA",
  "date": "1973",
  "where": "Cameroon",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Mafa013.jpg",
  "refs": [
   "Luke 2:41-52",
   "Luke 1:68-79"
  ],
  "days": [
   "Year C Christmas 1st Sunday",
   "Year C Advent 2nd  Sunday",
   ""
  ],
  "people": [],
  "subjects": [
   "Childhood of Jesus",
   "Teaching",
   "Culture: African",
   "Culture: Black"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/48280",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "JESUS MAFA. Jesus among the teachers, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: http://www.librairie-emmanuel.fr (contact page: https://www.librairie-emmanuel.fr/contact)."
 },
 {
  "id": 48282,
  "title": "Jesus and the Samaritan Woman",
  "artist": "JESUS MAFA",
  "date": "1973",
  "where": "Cameroon",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Mafa014.jpg",
  "refs": [
   "John 4:5-42"
  ],
  "days": [
   "Year C Advent 3rd Sunday",
   "",
   "Year B Proper 24th Sunday",
   "Year C Easter 7th Sunday",
   "Year A Lent 3rd Sunday"
  ],
  "people": [
   "Jesus Christ (Biblical figure)",
   "Samaritan Woman (Biblical figure)"
  ],
  "subjects": [
   "Culture: African",
   "Culture: Black"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/48282",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "JESUS MAFA. Jesus and the Samaritan Woman, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: http://www.librairie-emmanuel.fr (contact page: https://www.librairie-emmanuel.fr/contact)."
 },
 {
  "id": 48284,
  "title": "The Sermon on the Mount",
  "artist": "JESUS MAFA",
  "date": "1973",
  "where": "Cameroon",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Mafa015.jpg",
  "refs": [
   "Matthew 5:1-12",
   "Matthew 6:24-34",
   "Luke 6:17-26"
  ],
  "days": [
   "",
   "Year A Epiphany 8th Sunday",
   "Year A Epiphany 4thSunday",
   "Year C Epiphany 6th Sunday"
  ],
  "people": [],
  "subjects": [
   "Culture: African",
   "Culture: Black",
   "Sermon on the Mount"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/48284",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "JESUS MAFA. The Sermon on the Mount, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: http://www.librairie-emmanuel.fr (contact page: https://www.librairie-emmanuel.fr/contact)."
 },
 {
  "id": 48285,
  "title": "The unfaithful wife",
  "artist": "JESUS MAFA",
  "date": "1973",
  "where": "Cameroon",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Mafa016.jpg",
  "refs": [
   "John 8:2-11"
  ],
  "days": [
   "Year C Advent 1st Sunday",
   ""
  ],
  "people": [],
  "subjects": [
   "Culture: African",
   "Culture: Black"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/48285",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "JESUS MAFA. The unfaithful wife, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: http://www.librairie-emmanuel.fr (contact page: https://www.librairie-emmanuel.fr/contact)."
 },
 {
  "id": 48286,
  "title": "The Hidden Treasure",
  "artist": "JESUS MAFA",
  "date": "1973",
  "where": "Cameroon",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Mafa017.jpg",
  "refs": [
   "Matthew 13:31-33, 44-52"
  ],
  "days": [
   "",
   "Year A Proper 12th Sunday"
  ],
  "people": [],
  "subjects": [
   "Culture: African",
   "Culture: Black"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/48286",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "JESUS MAFA. The Hidden Treasure, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: http://www.librairie-emmanuel.fr (contact page: https://www.librairie-emmanuel.fr/contact)."
 },
 {
  "id": 48287,
  "title": "Jesus multiplies the loaves and fish",
  "artist": "JESUS MAFA",
  "date": "1973",
  "where": "Cameroon",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Mafa018.jpg",
  "refs": [
   "Matthew 14:13-21"
  ],
  "days": [
   "",
   "Year A Proper 13th Sunday",
   "Year B Proper 12th Sunday"
  ],
  "people": [],
  "subjects": [
   "Fish",
   "Feeding the Multitude",
   "Culture: African",
   "Culture: Black"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/48287",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "JESUS MAFA. Jesus multiplies the loaves and fish, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: http://www.librairie-emmanuel.fr (contact page: https://www.librairie-emmanuel.fr/contact)."
 },
 {
  "id": 48288,
  "title": "The good shepherd",
  "artist": "JESUS MAFA",
  "date": "1973",
  "where": "Cameroon",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Mafa019.jpg",
  "refs": [
   "John 10:11-18",
   "Luke 15:1-10"
  ],
  "days": [
   "",
   "Year B Easter 4th Sunday",
   "Year A Easter 4th Sunday",
   "Year C Easter 4th Sunday",
   "Year A Proper 23rd Sunday",
   "Year C Proper 19th Sunday"
  ],
  "people": [],
  "subjects": [
   "Good Shepherd",
   "Culture: African",
   "Culture: Black"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/48288",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "JESUS MAFA. The good shepherd, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: http://www.librairie-emmanuel.fr (contact page: https://www.librairie-emmanuel.fr/contact)."
 },
 {
  "id": 48289,
  "title": "Mary and the child Jesus",
  "artist": "JESUS MAFA",
  "date": "1973",
  "where": "Cameroon",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Mafa020.jpg",
  "refs": [
   "Luke 1:68-79"
  ],
  "days": [
   "Year C Advent 2nd  Sunday",
   ""
  ],
  "people": [],
  "subjects": [
   "Madonna and Child",
   "Culture: African",
   "Culture: Black"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/48289",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "JESUS MAFA. Mary and the child Jesus, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: http://www.librairie-emmanuel.fr (contact page: https://www.librairie-emmanuel.fr/contact)."
 },
 {
  "id": 48290,
  "title": "John baptizes Jesus",
  "artist": "JESUS MAFA",
  "date": "1973",
  "where": "Cameroon",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Mafa021.jpg",
  "refs": [
   "Matthew 3:13-17"
  ],
  "days": [
   "Year A Baptism of the Lord",
   "Year B Baptism of the Lord",
   ""
  ],
  "people": [],
  "subjects": [
   "Baptism of Christ",
   "Culture: African",
   "Culture: Black"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/48290",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "JESUS MAFA. John baptizes Jesus, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: http://www.librairie-emmanuel.fr (contact page: https://www.librairie-emmanuel.fr/contact)."
 },
 {
  "id": 48291,
  "title": "Virgin and the child Jesus in a palm grove",
  "artist": "JESUS MAFA",
  "date": "1973",
  "where": "Cameroon",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Mafa022.jpg",
  "refs": [],
  "days": [
   ""
  ],
  "people": [],
  "subjects": [
   "Madonna and Child",
   "Culture: African",
   "Culture: Black"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/48291",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "JESUS MAFA. Virgin and the child Jesus in a palm grove, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: http://www.librairie-emmanuel.fr (contact page: https://www.librairie-emmanuel.fr/contact)."
 },
 {
  "id": 48292,
  "title": "Visit of the Three Wise Men",
  "artist": "JESUS MAFA",
  "date": "1973",
  "where": "Cameroon",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Mafa023.jpg",
  "refs": [
   "Matthew 2:1-12"
  ],
  "days": [
   "Year A Epiphany of the Lord",
   "Year B Epiphany of the Lord",
   "Year C Epiphany of the Lord",
   ""
  ],
  "people": [
   "Wise Men (Biblical figures)"
  ],
  "subjects": [
   "Culture: African",
   "Culture: Black"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/48292",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "JESUS MAFA. Visit of the Three Wise Men, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: http://www.librairie-emmanuel.fr (contact page: https://www.librairie-emmanuel.fr/contact)."
 },
 {
  "id": 48293,
  "title": "The Insistent Friend",
  "artist": "JESUS MAFA",
  "date": "1973",
  "where": "Cameroon",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Mafa024.jpg",
  "refs": [
   "Luke 11:1-13",
   "Matthew 18:15-20"
  ],
  "days": [
   "Year C Proper 12th Sunday",
   "",
   "Year A Proper 18th Sunday"
  ],
  "people": [],
  "subjects": [
   "Culture: African",
   "Culture: Black",
   "Community"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/48293",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "JESUS MAFA. The Insistent Friend, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: http://www.librairie-emmanuel.fr (contact page: https://www.librairie-emmanuel.fr/contact)."
 },
 {
  "id": 48295,
  "title": "Healing of the ten lepers",
  "artist": "JESUS MAFA",
  "date": "1973",
  "where": "Cameroon",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Mafa026.jpg",
  "refs": [
   "Luke 17:11-19"
  ],
  "days": [
   "",
   "Year C Thanksgiving Day",
   "Year A Thanksgiving Day",
   "Year B Proper 18th Sunday",
   "Year C Proper 23rd Sunday",
   "Year C Proper 9th Sunday"
  ],
  "people": [],
  "subjects": [
   "Healing",
   "Culture: African",
   "Culture: Black",
   "Leprosy"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/48295",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "JESUS MAFA. Healing of the ten lepers, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: http://www.librairie-emmanuel.fr (contact page: https://www.librairie-emmanuel.fr/contact)."
 },
 {
  "id": 48296,
  "title": "The Late-arriving Workers",
  "artist": "JESUS MAFA",
  "date": "1973",
  "where": "Cameroon",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Mafa027.jpg",
  "refs": [
   "Matthew 20:1-16"
  ],
  "days": [
   "Year A Proper 20th Sunday",
   ""
  ],
  "people": [],
  "subjects": [
   "Culture: African",
   "Culture: Black"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/48296",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "JESUS MAFA. The Late-arriving Workers, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: http://www.librairie-emmanuel.fr (contact page: https://www.librairie-emmanuel.fr/contact)."
 },
 {
  "id": 48297,
  "title": "Parable of the Three Servants, or, The Talents",
  "artist": "JESUS MAFA",
  "date": "1973",
  "where": "Cameroon",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Mafa028.jpg",
  "refs": [
   "Matthew 25:14-30"
  ],
  "days": [
   "Year A Proper 28th Sunday",
   ""
  ],
  "people": [],
  "subjects": [
   "Culture: African",
   "Culture: Black",
   "Parable of the Talents"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/48297",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "JESUS MAFA. Parable of the Three Servants, or, The Talents, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: http://www.librairie-emmanuel.fr (contact page: https://www.librairie-emmanuel.fr/contact)."
 },
 {
  "id": 48299,
  "title": "Jesus washes his disciples feet",
  "artist": "JESUS MAFA",
  "date": "1973",
  "where": "Cameroon",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Mafa030.jpg",
  "refs": [
   "John 13:1-17, 31b-35"
  ],
  "days": [
   "Year A Maundy Thursday",
   "Year B Maundy Thursday",
   ""
  ],
  "people": [],
  "subjects": [
   "Footwashing",
   "Jesus Washes Disciples Feet",
   "Culture: African",
   "Culture: Black"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/48299",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "JESUS MAFA. Jesus washes his disciples feet, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: http://www.librairie-emmanuel.fr (contact page: https://www.librairie-emmanuel.fr/contact)."
 },
 {
  "id": 48300,
  "title": "Kiss of Judas",
  "artist": "JESUS MAFA",
  "date": "1973",
  "where": "Cameroon",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Mafa031.jpg",
  "refs": [
   "Matthew 26:14-27:66",
   "Mark 14:1-15:47",
   "Luke 22:14-23:56"
  ],
  "days": [
   "Year A Liturgy of Pass",
   "Year B Liturgy of Pass",
   "Year C Liturgy of Pass",
   ""
  ],
  "people": [],
  "subjects": [
   "Passion of Jesus Christ: Arrest of Jesus",
   "Culture: African",
   "Culture: Black"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/48300",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "JESUS MAFA. Kiss of Judas, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: http://www.librairie-emmanuel.fr (contact page: https://www.librairie-emmanuel.fr/contact)."
 },
 {
  "id": 48301,
  "title": "Easter, Empty Tomb",
  "artist": "JESUS MAFA",
  "date": "1973",
  "where": "Cameroon",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Mafa032.jpg",
  "refs": [
   "Luke 24:13-49",
   "Matthew 28:1-10",
   "Luke 24:1-12"
  ],
  "days": [
   "Year A Easter Vigil",
   "Year A Resurrection of the Lord",
   "Year B Easter Vigil",
   "Year C Easter Vigil",
   "",
   "Year B Resurrection of the Lord",
   "Year C Resurrection of the Lord"
  ],
  "people": [],
  "subjects": [
   "Easter",
   "Culture: African",
   "Culture: Black",
   "Empty Tomb"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/48301",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "JESUS MAFA. Easter, Empty Tomb, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: http://www.librairie-emmanuel.fr (contact page: https://www.librairie-emmanuel.fr/contact)."
 },
 {
  "id": 48302,
  "title": "Jesus appears to Thomas",
  "artist": "JESUS MAFA",
  "date": "1973",
  "where": "Cameroon",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Mafa033.jpg",
  "refs": [
   "John 20:19-31"
  ],
  "days": [
   "",
   "Year B Easter 3rd Sunday",
   "Year A Easter 2nd Sunday",
   "Year B Easter 2nd Sunday",
   "Year C Easter 2nd Sunday"
  ],
  "people": [
   "Jesus Christ (Biblical figure)",
   "Thomas, the Apostle (Biblical figure)"
  ],
  "subjects": [
   "Culture: African",
   "Culture: Black"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/48302",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "JESUS MAFA. Jesus appears to Thomas, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: http://www.librairie-emmanuel.fr (contact page: https://www.librairie-emmanuel.fr/contact)."
 },
 {
  "id": 48303,
  "title": "Presentation of Jesus in the temple",
  "artist": "JESUS MAFA",
  "date": "1973",
  "where": "Cameroon",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Mafa034.jpg",
  "refs": [
   "Luke 2:22-40"
  ],
  "days": [
   "Year B Christmas 1st Sunday"
  ],
  "people": [],
  "subjects": [
   "Presentation of Jesus at the Temple",
   "Culture: African",
   "Culture: Black"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/48303",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "JESUS MAFA. Presentation of Jesus in the temple, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: http://www.librairie-emmanuel.fr (contact page: https://www.librairie-emmanuel.fr/contact)."
 },
 {
  "id": 48304,
  "title": "Jesus as a child in Nazareth",
  "artist": "JESUS MAFA",
  "date": "1973",
  "where": "Cameroon",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Mafa035.jpg",
  "refs": [
   "Luke 2:22-40"
  ],
  "days": [
   "Year B Proper 9th Sunday",
   "",
   "Year A Presentation of the Lord",
   "Year B Presentation of the Lord"
  ],
  "people": [],
  "subjects": [
   "Childhood of Jesus",
   "Culture: African",
   "Culture: Black"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/48304",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "JESUS MAFA. Jesus as a child in Nazareth, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: http://www.librairie-emmanuel.fr (contact page: https://www.librairie-emmanuel.fr/contact)."
 },
 {
  "id": 48305,
  "title": "The Wedding at Cana",
  "artist": "JESUS MAFA",
  "date": "1973",
  "where": "Cameroon",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Mafa036.jpg",
  "refs": [
   "John 2:1-11"
  ],
  "days": [
   "Year C Epiphany 2nd Sunday",
   "",
   "Year C Easter 5th Sunday"
  ],
  "people": [],
  "subjects": [
   "Marriage at Cana",
   "Culture: African",
   "Culture: Black"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/48305",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "JESUS MAFA. The Wedding at Cana, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: http://www.librairie-emmanuel.fr (contact page: https://www.librairie-emmanuel.fr/contact)."
 },
 {
  "id": 48306,
  "title": "Jesus heals a paralyzed man",
  "artist": "JESUS MAFA",
  "date": "1973",
  "where": "Cameroon",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Mafa037.jpg",
  "refs": [
   "Mark 2:1-12",
   "John 5:17-26"
  ],
  "days": [
   "",
   "Year B Epiphany 7th Sunday"
  ],
  "people": [],
  "subjects": [
   "Healing",
   "Culture: African",
   "Culture: Black"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/48306",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "JESUS MAFA. Jesus heals a paralyzed man, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: http://www.librairie-emmanuel.fr (contact page: https://www.librairie-emmanuel.fr/contact)."
 },
 {
  "id": 48307,
  "title": "Transfiguration",
  "artist": "JESUS MAFA",
  "date": "1973",
  "where": "Cameroon",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Mafa038.jpg",
  "refs": [
   "Matthew 17:1-9",
   "Mark 9:2-9",
   "Luke 9:28-36, (37-43)"
  ],
  "days": [
   "",
   "Year A Transfiguration Sunday",
   "Year B Transfiguration Sunday",
   "Year C Transfiguration Sunday"
  ],
  "people": [
   "Jesus Christ (Biblical figure)"
  ],
  "subjects": [
   "Transfiguration of Jesus",
   "Culture: African",
   "Culture: Black"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/48307",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "JESUS MAFA. Transfiguration, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: http://www.librairie-emmanuel.fr (contact page: https://www.librairie-emmanuel.fr/contact)."
 },
 {
  "id": 48309,
  "title": "The parable of the sower",
  "artist": "JESUS MAFA",
  "date": "1973",
  "where": "Cameroon",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Mafa039.jpg",
  "refs": [
   "Luke 8:4-15",
   "Matthew 13:1-9, 18-23"
  ],
  "days": [
   "",
   "Year B Proper 6th Sunday",
   "Year A Proper 10th Sunday"
  ],
  "people": [],
  "subjects": [
   "Culture: African",
   "Culture: Black",
   "Sowing seed"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/48309",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "JESUS MAFA. The parable of the sower, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: http://www.librairie-emmanuel.fr (contact page: https://www.librairie-emmanuel.fr/contact)."
 },
 {
  "id": 48310,
  "title": "Jesus lulls the storm",
  "artist": "JESUS MAFA",
  "date": "1973",
  "where": "Cameroon",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Mafa040.jpg",
  "refs": [
   "Mark 4:35-41"
  ],
  "days": [
   "",
   "Year B Proper 7th Sunday"
  ],
  "people": [],
  "subjects": [
   "Water",
   "Boats",
   "Culture: African",
   "Culture: Black",
   "Jesus Calms the Storm"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/48310",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "JESUS MAFA. Jesus lulls the storm, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: http://www.librairie-emmanuel.fr (contact page: https://www.librairie-emmanuel.fr/contact)."
 },
 {
  "id": 48311,
  "title": "Martha and Mary",
  "artist": "JESUS MAFA",
  "date": "1973",
  "where": "Cameroon",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Mafa041.jpg",
  "refs": [
   "Luke 10:38-42"
  ],
  "days": [
   "",
   "Year C Proper 11th Sunday"
  ],
  "people": [
   "Jesus Christ (Biblical figure)",
   "Martha, of Bethany (Biblical figure)",
   "Mary, of Bethany (Biblical figure)"
  ],
  "subjects": [
   "Culture: African",
   "Culture: Black"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/48311",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "JESUS MAFA. Martha and Mary, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: http://www.librairie-emmanuel.fr (contact page: https://www.librairie-emmanuel.fr/contact)."
 },
 {
  "id": 48312,
  "title": "Jesus is tempted - Matthew 4:1-11",
  "artist": "JESUS MAFA",
  "date": "1973",
  "where": "Cameroon",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Mafa042.jpg",
  "refs": [
   "Matthew 4:1-11",
   "Luke 4:1-13"
  ],
  "days": [
   "Year A Lent 1st Sunday",
   "Year C Lent 1st Sunday",
   "",
   "Year B Lent 1st Sunday"
  ],
  "people": [],
  "subjects": [
   "Temptation of Christ",
   "Culture: African",
   "Culture: Black"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/48312",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "JESUS MAFA. Jesus is tempted - Matthew 4:1-11, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: http://www.librairie-emmanuel.fr (contact page: https://www.librairie-emmanuel.fr/contact)."
 },
 {
  "id": 48313,
  "title": "Flight into Egypt",
  "artist": "JESUS MAFA",
  "date": "1973",
  "where": "Cameroon",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Mafa043.jpg",
  "refs": [
   "Matthew 2:13-23"
  ],
  "days": [
   "Year A Christmas 1st Sunday",
   ""
  ],
  "people": [],
  "subjects": [
   "Flight into Egypt",
   "Culture: African",
   "Culture: Black"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/48313",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "JESUS MAFA. Flight into Egypt, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: http://www.librairie-emmanuel.fr (contact page: https://www.librairie-emmanuel.fr/contact)."
 },
 {
  "id": 48314,
  "title": "The mission to the world",
  "artist": "JESUS MAFA",
  "date": "1973",
  "where": "Cameroon",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Mafa044.jpg",
  "refs": [
   "Matthew 28:16-20",
   "John 17:20-26",
   "John 16:12-15"
  ],
  "days": [
   "Year C Trinity Sunday",
   "Year A Trinity Sunday",
   "",
   "Year C Easter 7th Sunday",
   "Year B Epiphany 2nd Sunday",
   "Year B Lent 4th Sunday"
  ],
  "people": [
   "Jesus Christ (Biblical figure)"
  ],
  "subjects": [
   "Culture: African",
   "Culture: Black",
   "Mission"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/48314",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "JESUS MAFA. The mission to the world, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: http://www.librairie-emmanuel.fr (contact page: https://www.librairie-emmanuel.fr/contact)."
 },
 {
  "id": 48379,
  "title": "The first two disciples",
  "artist": "JESUS MAFA",
  "date": "1973",
  "where": "Cameroon",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Mafa046.jpg",
  "refs": [
   "Mark 1:14-20"
  ],
  "days": [
   "Year C Epiphany 5th Sunday",
   "Year B Epiphany 3rd Sunday",
   "Year B Epiphany 2nd Sunday"
  ],
  "people": [
   "Jesus Christ (Biblical figure)",
   "Disciples (Biblical figures)"
  ],
  "subjects": [
   "Culture: African",
   "Culture: Black",
   "Calling of the disciples"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/48379",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "JESUS MAFA. The first two disciples, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: http://www.librairie-emmanuel.fr (contact page: https://www.librairie-emmanuel.fr/contact)."
 },
 {
  "id": 48380,
  "title": "Virgin and Child",
  "artist": "JESUS MAFA",
  "date": "1973",
  "where": "Cameroon",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Mafa047.jpg",
  "refs": [
   "Luke 2:(1-7), 8-20",
   "Luke 1:39-57",
   "Isaiah 7:10-16"
  ],
  "days": [
   "Year A Nativity of the Lord Proper I",
   "Year A Advent 4th Sunday",
   "Year B Visitation of Mary to Elizabeth",
   "",
   "Year B Nativity of the Lord Proper I",
   "Year C Nativity of the Lord Proper I"
  ],
  "people": [],
  "subjects": [
   "Madonna and Child",
   "Culture: African",
   "Culture: Black"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/48380",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "JESUS MAFA. Virgin and Child, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: http://www.librairie-emmanuel.fr (contact page: https://www.librairie-emmanuel.fr/contact)."
 },
 {
  "id": 48381,
  "title": "The Good Samaritan",
  "artist": "JESUS MAFA",
  "date": "1973",
  "where": "Cameroon",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Mafa048.jpg",
  "refs": [
   "Luke 10:25-37"
  ],
  "days": [
   "Year C Proper 10th Sunday",
   "",
   "Year B Easter 4th Sunday"
  ],
  "people": [],
  "subjects": [
   "Good Samaritan",
   "Culture: African",
   "Culture: Black"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/48381",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "JESUS MAFA. The Good Samaritan, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: http://www.librairie-emmanuel.fr (contact page: https://www.librairie-emmanuel.fr/contact)."
 },
 {
  "id": 48382,
  "title": "The Possessed",
  "artist": "JESUS MAFA",
  "date": "1973",
  "where": "Cameroon",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Mafa050.jpg",
  "refs": [
   "Mark 9:17-29"
  ],
  "days": [
   "Year B Epiphany 4thSunday",
   ""
  ],
  "people": [],
  "subjects": [
   "Healing",
   "Culture: African",
   "Culture: Black"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/48382",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "JESUS MAFA. The Possessed, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: http://www.librairie-emmanuel.fr (contact page: https://www.librairie-emmanuel.fr/contact)."
 },
 {
  "id": 48383,
  "title": "Jesus cures the man born blind",
  "artist": "JESUS MAFA",
  "date": "1973",
  "where": "Cameroon",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Mafa051.jpg",
  "refs": [
   "John 9:1-41",
   "Matthew 11:2-11",
   "Isaiah 42:1-9",
   "Mark 10:46-52"
  ],
  "days": [
   "Year A Proper 25th Sunday",
   "Year A Advent 3rd Sunday",
   "",
   "Year A Lent 4th Sunday",
   "Year B Proper 25th Sunday"
  ],
  "people": [],
  "subjects": [
   "Healing",
   "Culture: African",
   "Culture: Black"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/48383",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "JESUS MAFA. Jesus cures the man born blind, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: http://www.librairie-emmanuel.fr (contact page: https://www.librairie-emmanuel.fr/contact)."
 },
 {
  "id": 48384,
  "title": "Jesus speaks about forgiveness",
  "artist": "JESUS MAFA",
  "date": "1973",
  "where": "Cameroon",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Mafa052.jpg",
  "refs": [
   "Luke 7:36-8:3",
   "John 12:1-8"
  ],
  "days": [
   "",
   "Year C Lent 5th  Sunday",
   "Year C Proper 6th Sunday",
   "Year B Proper 28th Sunday"
  ],
  "people": [
   "Woman Who Bathed Christs Feet with Tears (Biblical figure)"
  ],
  "subjects": [
   "Footwashing",
   "Anointing of Jesus",
   "Culture: African",
   "Culture: Black",
   "Forgiveness"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/48384",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "JESUS MAFA. Jesus speaks about forgiveness, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: http://www.librairie-emmanuel.fr (contact page: https://www.librairie-emmanuel.fr/contact)."
 },
 {
  "id": 48385,
  "title": "Nicodemus",
  "artist": "JESUS MAFA",
  "date": "1973",
  "where": "Cameroon",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Mafa053.jpg",
  "refs": [
   "John 3:1-17"
  ],
  "days": [
   "Year B Trinity Sunday",
   "",
   "Year A Lent 2nd Sunday"
  ],
  "people": [
   "Jesus Christ (Biblical figure)",
   "Nicodemus (Biblical figure)"
  ],
  "subjects": [
   "Culture: African",
   "Culture: Black"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/48385",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "JESUS MAFA. Nicodemus, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: http://www.librairie-emmanuel.fr (contact page: https://www.librairie-emmanuel.fr/contact)."
 },
 {
  "id": 48386,
  "title": "John the Baptist preaching in the desert",
  "artist": "JESUS MAFA",
  "date": "1973",
  "where": "Cameroon",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Mafa054.jpg",
  "refs": [
   "Matthew 3:1-12",
   "Luke 3:1-6"
  ],
  "days": [
   "Year A Advent 2nd  Sunday",
   "Year C Advent 2nd  Sunday",
   "Year C Advent 3rd Sunday",
   "",
   "Year B Advent 2nd  Sunday"
  ],
  "people": [
   "John, the Baptist (Biblical figure)"
  ],
  "subjects": [
   "Preaching",
   "Desert",
   "Culture: African",
   "Culture: Black"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/48386",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "JESUS MAFA. John the Baptist preaching in the desert, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: http://www.librairie-emmanuel.fr (contact page: https://www.librairie-emmanuel.fr/contact)."
 },
 {
  "id": 48387,
  "title": "The birth of Jesus with shepherds",
  "artist": "JESUS MAFA",
  "date": "1973",
  "where": "Cameroon",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Mafa055.jpg",
  "refs": [
   "Luke 2:(1-7), 8-20",
   "Luke 2:1-14, (15-20)"
  ],
  "days": [
   "Year A Nativity of the Lord Proper I",
   "",
   "Year C Nativity of the Lord Proper I"
  ],
  "people": [],
  "subjects": [
   "Birth",
   "Adoration of the Shepherds",
   "Culture: African",
   "Culture: Black"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/48387",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "JESUS MAFA. The birth of Jesus with shepherds, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: http://www.librairie-emmanuel.fr (contact page: https://www.librairie-emmanuel.fr/contact)."
 },
 {
  "id": 48388,
  "title": "Pentecost",
  "artist": "JESUS MAFA",
  "date": "1973",
  "where": "Cameroon",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Mafa056.jpg",
  "refs": [
   "Acts 2:1-21"
  ],
  "days": [
   "",
   "Year C Day of Pentecost",
   "Year A Day of Pentecost",
   "Year B Day of Pentecost"
  ],
  "people": [],
  "subjects": [
   "Holy Spirit",
   "Culture: African",
   "Culture: Black",
   "Pentecost"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/48388",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "JESUS MAFA. Pentecost, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: http://www.librairie-emmanuel.fr (contact page: https://www.librairie-emmanuel.fr/contact)."
 },
 {
  "id": 48389,
  "title": "Easter - Christ appears to Mary",
  "artist": "JESUS MAFA",
  "date": "1973",
  "where": "Cameroon",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Mafa057.jpg",
  "refs": [
   "John 20:1-18"
  ],
  "days": [
   "Year A Resurrection of the Lord",
   "",
   "Year B Resurrection of the Lord"
  ],
  "people": [
   "Jesus Christ (Biblical figure)",
   "Mary Magdalene (Biblical figure)"
  ],
  "subjects": [
   "Culture: African",
   "Culture: Black",
   "Jesus appears to Mary"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/48389",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "JESUS MAFA. Easter - Christ appears to Mary, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: http://www.librairie-emmanuel.fr (contact page: https://www.librairie-emmanuel.fr/contact)."
 },
 {
  "id": 48390,
  "title": "The Crucifixion; Jesus dies on the cross",
  "artist": "JESUS MAFA",
  "date": "1973",
  "where": "Cameroon",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Mafa058.jpg",
  "refs": [
   "Matthew 26:14-27:66",
   "Mark 14:1-15:47",
   "Luke 22:14-23:56"
  ],
  "days": [
   "Year A Liturgy of Pass",
   "Year B Liturgy of Pass",
   "Year C Liturgy of Pass",
   ""
  ],
  "people": [],
  "subjects": [
   "Passion of Jesus Christ: Crucifixion of Jesus",
   "Cross",
   "Culture: African",
   "Culture: Black"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/48390",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "JESUS MAFA. The Crucifixion; Jesus dies on the cross, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: http://www.librairie-emmanuel.fr (contact page: https://www.librairie-emmanuel.fr/contact)."
 },
 {
  "id": 48391,
  "title": "Christ on Gethsemane",
  "artist": "JESUS MAFA",
  "date": "1973",
  "where": "Cameroon",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Mafa059.jpg",
  "refs": [
   "Matthew 26:14-27:66",
   "Mark 14:1-15:47",
   "John 18:1-19:42",
   "Psalm 70",
   "Luke 12:49-56"
  ],
  "days": [
   "Year A Liturgy of Pass",
   "Year B Liturgy of Pass",
   "Year C Proper 15th Sunday",
   "",
   "Year B Lent 5th  Sunday",
   "Year C Holy Wednesday"
  ],
  "people": [],
  "subjects": [
   "Passion of Jesus Christ: Gethsemane",
   "Culture: African",
   "Culture: Black"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/48391",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "JESUS MAFA. Christ on Gethsemane, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Éditions de l’Emmanuel, https://www.editions-emmanuel.com/contact/."
 },
 {
  "id": 48392,
  "title": "The Widow's Mite",
  "artist": "JESUS MAFA",
  "date": "1973",
  "where": "Cameroon",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Mafa060.jpg",
  "refs": [
   "Luke 21:1-4",
   "Mark 12:38-44"
  ],
  "days": [
   "",
   "Year B Proper 24th Sunday",
   "Year B Proper 23rd Sunday",
   "Year B Proper 27th Sunday"
  ],
  "people": [],
  "subjects": [
   "Generosity",
   "Culture: African",
   "Culture: Black"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/48392",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "JESUS MAFA. The Widow's Mite, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: http://www.librairie-emmanuel.fr (contact page: https://www.librairie-emmanuel.fr/contact)."
 },
 {
  "id": 48393,
  "title": "Zaccheus welcomes Jesus",
  "artist": "JESUS MAFA",
  "date": "1973",
  "where": "Cameroon",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Mafa061.jpg",
  "refs": [
   "Luke 19:1-10"
  ],
  "days": [
   "Year C Proper 26th Sunday",
   ""
  ],
  "people": [
   "Jesus Christ (Biblical figure)",
   "Zacchaeus (Biblical figure)"
  ],
  "subjects": [
   "Culture: African",
   "Culture: Black"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/48393",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "JESUS MAFA. Zaccheus welcomes Jesus, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: http://www.librairie-emmanuel.fr (contact page: https://www.librairie-emmanuel.fr/contact)."
 },
 {
  "id": 48394,
  "title": "The Ten Young Women",
  "artist": "JESUS MAFA",
  "date": "1973",
  "where": "Cameroon",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Mafa062.jpg",
  "refs": [
   "Matthew 25:1-13"
  ],
  "days": [
   "Year A Proper 27th Sunday",
   ""
  ],
  "people": [],
  "subjects": [
   "Culture: African",
   "Culture: Black"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/48394",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "JESUS MAFA. The Ten Young Women, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: http://www.librairie-emmanuel.fr (contact page: https://www.librairie-emmanuel.fr/contact)."
 },
 {
  "id": 48395,
  "title": "Jesus welcomes the children",
  "artist": "JESUS MAFA",
  "date": "1973",
  "where": "Cameroon",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Mafa063.jpg",
  "refs": [
   "Mark 10:2-16",
   "Matthew 10:40-42",
   "Luke 12:32-40"
  ],
  "days": [
   "Year A Christmas 1st Sunday",
   "Year B Proper 22nd Sunday",
   "Year B Proper 10th Sunday",
   "",
   "Year A Proper 8th Sunday",
   "Year C Proper 14th Sunday",
   "Year B Proper 20th Sunday"
  ],
  "people": [
   "Jesus Christ (Biblical figure)"
  ],
  "subjects": [
   "Children",
   "Culture: African",
   "Culture: Black"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/48395",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "JESUS MAFA. Jesus welcomes the children, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: http://www.librairie-emmanuel.fr (contact page: https://www.librairie-emmanuel.fr/contact)."
 },
 {
  "id": 48396,
  "title": "The Unforgiving Servant",
  "artist": "JESUS MAFA",
  "date": "1973",
  "where": "Cameroon",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Mafa064.jpg",
  "refs": [
   "Matthew 18:21-35"
  ],
  "days": [
   "",
   "Year A Proper 19th Sunday"
  ],
  "people": [],
  "subjects": [
   "Culture: African",
   "Culture: Black"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/48396",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "JESUS MAFA. The Unforgiving Servant, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: http://www.librairie-emmanuel.fr (contact page: https://www.librairie-emmanuel.fr/contact)."
 },
 {
  "id": 48397,
  "title": "The poor invited to the feast",
  "artist": "JESUS MAFA",
  "date": "1973",
  "where": "Cameroon",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Mafa065.jpg",
  "refs": [
   "Psalm 113",
   "Luke 14:1, 7-14"
  ],
  "days": [
   "Year A Visitation of Mary to Elizabeth",
   "Year C Proper 17th Sunday",
   "Year B Easter 5th Sunday",
   "Year B Visitation of Mary to Elizabeth",
   "Year C Visitation of Mary to Elizabeth",
   "",
   "Year B Proper 5th Sunday",
   "Year B Proper 26th Sunday",
   "Year C Epiphany 3rd Sunday"
  ],
  "people": [],
  "subjects": [
   "Poor",
   "Food",
   "Culture: African",
   "Culture: Black",
   "Community"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/48397",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "JESUS MAFA. The poor invited to the feast, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: http://www.librairie-emmanuel.fr (contact page: https://www.librairie-emmanuel.fr/contact)."
 },
 {
  "id": 48398,
  "title": "The Ascension",
  "artist": "JESUS MAFA",
  "date": "1973",
  "where": "Cameroon",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Mafa011.jpg",
  "refs": [
   "Luke 24:44-53",
   "Peter I, 4:12-14; 5:6-11"
  ],
  "days": [
   "Year A Ascension of the Lord",
   "Year B Ascension of the Lord",
   "Year C Ascension of the Lord",
   "Year A Easter 7th Sunday",
   ""
  ],
  "people": [],
  "subjects": [
   "Ascension of Christ",
   "Culture: African",
   "Culture: Black"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/48398",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "JESUS MAFA. The Ascension, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: http://www.librairie-emmanuel.fr (contact page: https://www.librairie-emmanuel.fr/contact)."
 },
 {
  "id": 48399,
  "title": "The Three Wise Men",
  "artist": "JESUS MAFA",
  "date": "1973",
  "where": "Cameroon",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Mafa066.jpg",
  "refs": [
   "Matthew 2:1-12"
  ],
  "days": [
   "Year A Epiphany of the Lord",
   "Year C Epiphany of the Lord",
   ""
  ],
  "people": [
   "Wise Men (Biblical figures)"
  ],
  "subjects": [
   "Adoration of the Magi",
   "Culture: African",
   "Culture: Black"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/48399",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "JESUS MAFA. The Three Wise Men, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: http://www.librairie-emmanuel.fr (contact page: https://www.librairie-emmanuel.fr/contact)."
 },
 {
  "id": 54414,
  "title": "La presentación de Cristo en el templo",
  "artist": "Latimore, Kelly",
  "date": "2018",
  "where": "Longview, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Latimore-IMG_5045.jpg",
  "refs": [
   "Luke 2:22-40"
  ],
  "days": [
   "Year A Nativity of the Lord Proper I",
   "Year B Christmas 1st Sunday",
   "",
   "Year C Presentation of the Lord",
   "Year A Presentation of the Lord",
   "Year B Presentation of the Lord"
  ],
  "people": [
   "Simeon (Biblical figure)",
   "Anna (Biblical figure)"
  ],
  "subjects": [],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/54414",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Latimore, Kelly. La presentación de Cristo en el templo, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Kelly Latimore Icons, https://kellylatimoreicons.com/."
 },
 {
  "id": 54662,
  "title": "Prodigal Son",
  "artist": "JESUS MAFA",
  "date": "ca. 1970",
  "where": "Cameroon",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Mafa100.jpg",
  "refs": [
   "Luke 15:1-3, 11b-32"
  ],
  "days": [
   "",
   "Year C Lent 4th Sunday"
  ],
  "people": [],
  "subjects": [
   "Culture: African",
   "Culture: Black",
   "Parable of the Prodigal Son"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/54662",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "JESUS MAFA. Prodigal Son, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: http://www.librairie-emmanuel.fr (contact page: https://www.librairie-emmanuel.fr/contact)."
 },
 {
  "id": 55893,
  "title": "Multiplication of the Loaves and Fishes, detail",
  "artist": "Reid, Patricia",
  "date": "ca. 2000",
  "where": "New Skete Community, Cambridge, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/feed-fish-5918.jpg",
  "refs": [
   "Matthew 14:13-21",
   "John 6:1-21"
  ],
  "days": [
   "Year A Proper 13th Sunday",
   "Year B Proper 12th Sunday"
  ],
  "people": [],
  "subjects": [
   "Feeding the Multitude"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/55893",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Reid, Patricia. Multiplication of the Loaves and Fishes, detail, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: https://www.flickr.com/photos/jimforest/5125264193."
 },
 {
  "id": 56253,
  "title": "Lunchtime Rest",
  "artist": "Johnson, William H., 1901-1970",
  "date": "1940-1941",
  "where": "Smithsonian American Art Museum, Washington, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/wm-johnson-2klv9.jpg",
  "refs": [],
  "days": [
   "Year A Proper 27th Sunday",
   "",
   "Year B Proper 14th Sunday"
  ],
  "people": [],
  "subjects": [
   "Rest",
   "Work",
   "Culture: Black",
   "Culture: African American"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/56253",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Johnson, William H., 1901-1970. Lunchtime Rest, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: https://www.flickr.com/photos/americanartmuseum/3662422645/."
 },
 {
  "id": 56452,
  "title": "Miraculous Catch",
  "artist": "JESUS MAFA",
  "date": "1973",
  "where": "Cameroon",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Miraculous Catch MAFA.jpg",
  "refs": [
   "John 21:1-19"
  ],
  "days": [
   "",
   "Year C Easter 3rd Sunday"
  ],
  "people": [],
  "subjects": [
   "Culture: African",
   "Culture: Black"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/56452",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "JESUS MAFA. Miraculous Catch, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: http://www.librairie-emmanuel.fr (contact page: https://www.librairie-emmanuel.fr/contact)."
 },
 {
  "id": 56455,
  "title": "Healing of the Daughter of Jairus",
  "artist": "JESUS MAFA",
  "date": "1973",
  "where": "Cameroon",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Daughter of Jairus MAFA.jpg",
  "refs": [
   "Mark 5:21-43"
  ],
  "days": [
   "",
   "Year B Proper 8th Sunday"
  ],
  "people": [
   "Jesus Christ (Biblical figure)",
   "Daughter of Jairus (Biblical figure)"
  ],
  "subjects": [
   "Healing",
   "Culture: African",
   "Culture: Black"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/56455",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "JESUS MAFA. Healing of the Daughter of Jairus, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: http://www.librairie-emmanuel.fr (contact page: https://www.librairie-emmanuel.fr/contact)."
 },
 {
  "id": 56535,
  "title": "A Visit",
  "artist": "Swanson, John August",
  "date": "1995",
  "where": "Los Angeles, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Swanson-a-visit.jpg",
  "refs": [
   "Isaiah 9:2-7",
   "Psalm 16"
  ],
  "days": [
   "Year C Proper 8th Sunday",
   "Year B Nativity of the Lord Proper I"
  ],
  "people": [],
  "subjects": [
   "Animals",
   "Footwashing",
   "Bread",
   "Charity",
   "Hospitality",
   "Food",
   "Community"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/56535",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Swanson, John August. A Visit, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of John August Swanson, https://www.johnaugustswanson.com/."
 },
 {
  "id": 56537,
  "title": "Abraham and Isaac",
  "artist": "Swanson, John August",
  "date": "1976",
  "where": "Los Angeles, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Swanson-abraham-and-isaac.jpg",
  "refs": [
   "Genesis 22:1-18",
   "Genesis 22:1-14"
  ],
  "days": [
   "Year A Easter Vigil",
   "Year B Easter Vigil",
   "Year C Easter Vigil",
   "",
   "Year A Proper 8th Sunday"
  ],
  "people": [
   "Abraham (Biblical figure)",
   "Isaac (Biblical figure)"
  ],
  "subjects": [
   "Sacrifice of Isaac",
   "Culture: Hispanic and/or Latino"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/56537",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Swanson, John August. Abraham and Isaac, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of John August Swanson, https://www.johnaugustswanson.com/."
 },
 {
  "id": 56538,
  "title": "Celebration",
  "artist": "Swanson, John August",
  "date": "1997",
  "where": "Los Angeles, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Swanson-Celebration.jpg",
  "refs": [
   "Luke 15:1-10"
  ],
  "days": [
   "",
   "Year B Proper 6th Sunday",
   "Year C Proper 19th Sunday"
  ],
  "people": [],
  "subjects": [
   "Culture: Hispanic and/or Latino",
   "Dance",
   "Community",
   "Celebrations",
   "Joy"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/56538",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Swanson, John August. Celebration, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of John August Swanson, https://www.johnaugustswanson.com/."
 },
 {
  "id": 56539,
  "title": "Daniel",
  "artist": "Swanson, John August",
  "date": "2000",
  "where": "Los Angeles, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Swanson-Daniel.jpg",
  "refs": [
   "Daniel 12:1-3",
   "Daniel 7:9-10, 13-14",
   "Daniel 7:1-3, 15-18"
  ],
  "days": [
   "Year C All Saints Day",
   "",
   "Year B Reign of Christ",
   "Year B Proper 28th Sunday"
  ],
  "people": [
   "Daniel (Biblical figure)"
  ],
  "subjects": [
   "Hope",
   "Lions",
   "Culture: Hispanic and/or Latino",
   "Courage",
   "Storytelling"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/56539",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Swanson, John August. Daniel, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of John August Swanson, https://www.johnaugustswanson.com/."
 },
 {
  "id": 56540,
  "title": "David and Goliath",
  "artist": "Swanson, John August",
  "date": "2005",
  "where": "Los Angeles, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Swanson-David-and-Goliath.jpg",
  "refs": [
   "Samuel I, 17:57-18:5, 18:10-16"
  ],
  "days": [
   "",
   "Year B Proper 7th Sunday"
  ],
  "people": [
   "David, King of Israel (Biblical figure)",
   "Goliath (Biblical figure)"
  ],
  "subjects": [
   "Culture: Hispanic and/or Latino",
   "Courage"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/56540",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Swanson, John August. David and Goliath, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of John August Swanson, https://www.johnaugustswanson.com/."
 },
 {
  "id": 56541,
  "title": "Dream of Jacob",
  "artist": "Swanson, John August",
  "date": "1986",
  "where": "Los Angeles, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Swanson-Dream-of-Jacob.jpg",
  "refs": [
   "Genesis 28:10-19a"
  ],
  "days": [
   "",
   "Year A Proper 11th Sunday"
  ],
  "people": [],
  "subjects": [
   "Culture: Hispanic and/or Latino",
   "Jacobs Ladder"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/56541",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Swanson, John August. Dream of Jacob, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of John August Swanson, https://www.johnaugustswanson.com/."
 },
 {
  "id": 56542,
  "title": "Ecclesiastes",
  "artist": "Swanson, John August",
  "date": "1989",
  "where": "Los Angeles, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Swanson-Ecclesiastes.jpg",
  "refs": [
   "Ecclesiastes 3:1-13"
  ],
  "days": [
   "Year A New Year’s Day",
   "",
   "Year B New Year’s Day",
   "Year C New Year’s Day"
  ],
  "people": [],
  "subjects": [
   "Death",
   "Birth",
   "Mourning",
   "Culture: Hispanic and/or Latino",
   "Time",
   "Happiness"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/56542",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Swanson, John August. Ecclesiastes, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of John August Swanson, https://www.johnaugustswanson.com/."
 },
 {
  "id": 56544,
  "title": "Entry into the City",
  "artist": "Swanson, John August",
  "date": "1990",
  "where": "Los Angeles, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Swanson-entry-into-the-city.jpg",
  "refs": [
   "Luke 19:28-40",
   "Matthew 21:1-11",
   "Mark 11:1-11",
   "John 12:12-16"
  ],
  "days": [
   "Year C Liturgy of Palms",
   "",
   "Year A Liturgy of Palms",
   "Year B Liturgy of Palms"
  ],
  "people": [],
  "subjects": [
   "Entry into Jerusalem",
   "City",
   "Culture: Hispanic and/or Latino"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/56544",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Swanson, John August. Entry into the City, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of John August Swanson, https://www.johnaugustswanson.com/."
 },
 {
  "id": 56546,
  "title": "Festival of Lights",
  "artist": "Swanson, John August",
  "date": "2000",
  "where": "Los Angeles, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Swanson-FestivalOfLights.jpg",
  "refs": [
   "Hosea 1:2-10",
   "Matthew 5:13-20"
  ],
  "days": [
   "Year C Proper 12th Sunday",
   "Year C Advent 2nd  Sunday",
   "",
   "Year C Reign of Christ",
   "Year A Epiphany 5th Sunday"
  ],
  "people": [],
  "subjects": [
   "Peace",
   "Light",
   "Procession",
   "Candles",
   "Culture: Hispanic and/or Latino"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/56546",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Swanson, John August. Festival of Lights, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of John August Swanson, https://www.johnaugustswanson.com/."
 },
 {
  "id": 56547,
  "title": "Flight into Egypt",
  "artist": "Swanson, John August",
  "date": "2002",
  "where": "Los Angeles, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Swanson-FlightIntoEgypt.jpg",
  "refs": [
   "Matthew 2:13-23"
  ],
  "days": [
   "Year A Christmas 1st Sunday",
   ""
  ],
  "people": [],
  "subjects": [
   "Angels",
   "Flight into Egypt",
   "Culture: Hispanic and/or Latino"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/56547",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Swanson, John August. Flight into Egypt, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of John August Swanson, https://www.johnaugustswanson.com/."
 },
 {
  "id": 56548,
  "title": "Good Samaritan",
  "artist": "Swanson, John August",
  "date": "2002",
  "where": "Los Angeles, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Swanson-Good-Samaritan.jpg",
  "refs": [
   "Luke 10:25-37"
  ],
  "days": [
   "Year C Proper 10th Sunday",
   ""
  ],
  "people": [],
  "subjects": [
   "Good Samaritan",
   "Culture: Hispanic and/or Latino"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/56548",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Swanson, John August. Good Samaritan, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of John August Swanson, https://www.johnaugustswanson.com/."
 },
 {
  "id": 56549,
  "title": "Jonah",
  "artist": "Swanson, John August",
  "date": "1983",
  "where": "Los Angeles, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Swanson-Jonah.jpg",
  "refs": [
   "Jonah 3:10-4:11",
   "Jonah 3:1-5, 10"
  ],
  "days": [
   "Year A Proper 20th Sunday",
   "",
   "Year B Epiphany 3rd Sunday"
  ],
  "people": [
   "Jonah (Biblical figure)"
  ],
  "subjects": [
   "Culture: Hispanic and/or Latino"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/56549",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Swanson, John August. Jonah, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of John August Swanson, https://www.johnaugustswanson.com/."
 },
 {
  "id": 56550,
  "title": "The Great Catch",
  "artist": "Swanson, John August",
  "date": "1993",
  "where": "Los Angeles, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Swanson-GreatCatch.jpg",
  "refs": [
   "John 21:1-19"
  ],
  "days": [
   "",
   "Year C Easter 3rd Sunday"
  ],
  "people": [],
  "subjects": [
   "Culture: Hispanic and/or Latino",
   "Fishing",
   "Great Catch"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/56550",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Swanson, John August. The Great Catch, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of John August Swanson, https://www.johnaugustswanson.com/."
 },
 {
  "id": 56551,
  "title": "Kiss of Judas",
  "artist": "Swanson, John August",
  "date": "2008",
  "where": "Los Angeles, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Swanson-KissOfJudas.jpg",
  "refs": [
   "Matthew 26:14-27:66",
   "Mark 14:1-15:47",
   "Luke 22:14-23:56"
  ],
  "days": [
   "Year A Liturgy of Pass",
   "Year B Liturgy of Pass",
   "Year C Liturgy of Pass",
   ""
  ],
  "people": [
   "Judas Iscariot (Biblical figure)"
  ],
  "subjects": [
   "Passion of Jesus Christ: Arrest of Jesus",
   "Culture: Hispanic and/or Latino"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/56551",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Swanson, John August. Kiss of Judas, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of John August Swanson, https://www.johnaugustswanson.com/."
 },
 {
  "id": 56553,
  "title": "Loaves and Fishes",
  "artist": "Swanson, John August",
  "date": "2003",
  "where": "Los Angeles, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Swanson-LoavesAndFishes.jpg",
  "refs": [
   "Matthew 14:13-21",
   "John 6:1-21"
  ],
  "days": [
   "",
   "Year A Proper 13th Sunday",
   "Year B Proper 12th Sunday",
   "Year B Proper 24th Sunday"
  ],
  "people": [],
  "subjects": [
   "Feeding the Multitude",
   "Culture: Hispanic and/or Latino"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/56553",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Swanson, John August. Loaves and Fishes, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of John August Swanson, https://www.johnaugustswanson.com/."
 },
 {
  "id": 56554,
  "title": "Moses",
  "artist": "Swanson, John August",
  "date": "1983",
  "where": "Los Angeles, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Swanson-Moses.jpg",
  "refs": [
   "Exodus 17:1-7"
  ],
  "days": [
   "Year C Easter Vigil",
   "",
   "Year A Proper 19th Sunday",
   "Year A Proper 21st Sunday",
   "Year A Lent 3rd Sunday",
   "Year C Lent 3rd Sunday"
  ],
  "people": [
   "Moses (Biblical figure)"
  ],
  "subjects": [
   "Water",
   "Culture: Hispanic and/or Latino"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/56554",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Swanson, John August. Moses, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of John August Swanson, https://www.johnaugustswanson.com/."
 },
 {
  "id": 56556,
  "title": "Peaceable Kingdom",
  "artist": "Swanson, John August",
  "date": "1994",
  "where": "Los Angeles, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Swanson-PeaceableKingdom.jpg",
  "refs": [
   "Isaiah 11:1-10"
  ],
  "days": [
   "Year A Advent 2nd  Sunday",
   "Year B Proper 10th Sunday",
   ""
  ],
  "people": [],
  "subjects": [
   "Peaceableness",
   "Culture: Hispanic and/or Latino"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/56556",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Swanson, John August. Peaceable Kingdom, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of John August Swanson, https://www.johnaugustswanson.com/."
 },
 {
  "id": 56557,
  "title": "Presentation in the Temple",
  "artist": "Swanson, John August",
  "date": "1988",
  "where": "Los Angeles, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Swanson-Presentation.jpg",
  "refs": [
   "Luke 2:22-40",
   "Luke 1:46b-55"
  ],
  "days": [
   "Year B Christmas 1st Sunday",
   "Year C Advent 4th Sunday"
  ],
  "people": [],
  "subjects": [
   "Angels",
   "Presentation of Jesus at the Temple",
   "Culture: Hispanic and/or Latino"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/56557",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Swanson, John August. Presentation in the Temple, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of John August Swanson, https://www.johnaugustswanson.com/."
 },
 {
  "id": 56558,
  "title": "The Procession",
  "artist": "Swanson, John August",
  "date": "2007",
  "where": "Los Angeles, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Swanson-Procession.jpg",
  "refs": [
   "Psalm 98",
   "Psalm 111",
   "Psalm 103:1-13, 22"
  ],
  "days": [
   "",
   "Year C Epiphany 4thSunday",
   "Year B Epiphany 8th Sunday",
   "Year C Proper 23rd Sunday",
   "Year B Easter 6th Sunday"
  ],
  "people": [],
  "subjects": [
   "Music",
   "Procession",
   "Culture: Hispanic and/or Latino",
   "Community",
   "Singing",
   "Praise",
   "Spirituality"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/56558",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Swanson, John August. The Procession, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of John August Swanson, https://www.johnaugustswanson.com/."
 },
 {
  "id": 56559,
  "title": "Prodigal Son",
  "artist": "Swanson, John August",
  "date": "1984",
  "where": "Los Angeles, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Swanson-ProdigalSon1984.jpg",
  "refs": [
   "Luke 15:1-3, 11b-32"
  ],
  "days": [
   "",
   "Year C Lent 4th Sunday"
  ],
  "people": [],
  "subjects": [
   "Family",
   "Culture: Hispanic and/or Latino",
   "Forgiveness",
   "Parable of the Prodigal Son"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/56559",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Swanson, John August. Prodigal Son, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of John August Swanson, https://www.johnaugustswanson.com/."
 },
 {
  "id": 56560,
  "title": "Psalm 23",
  "artist": "Swanson, John August",
  "date": "2010",
  "where": "Los Angeles, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Swanson-psalm23.jpg",
  "refs": [
   "Psalm 23"
  ],
  "days": [
   "Year C Proper 17th Sunday",
   "",
   "Year A Lent 4th Sunday",
   "Year B Proper 11th Sunday",
   "Year B Easter 4th Sunday",
   "Year A Easter 4th Sunday",
   "Year C Easter 4th Sunday",
   "Year A Proper 23rd Sunday"
  ],
  "people": [],
  "subjects": [
   "Culture: Hispanic and/or Latino"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/56560",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Swanson, John August. Psalm 23, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of John August Swanson, https://www.johnaugustswanson.com/."
 },
 {
  "id": 56561,
  "title": "Story of Ruth",
  "artist": "Swanson, John August",
  "date": "1991",
  "where": "Los Angeles, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Swanson-StoryOfRuth.jpg",
  "refs": [
   "Ruth 3:1-5; 4:13-17",
   "Luke 16:1-13",
   "Ruth 1:1-18"
  ],
  "days": [
   "",
   "Year C Proper 20th Sunday",
   "Year B Proper 27th Sunday",
   "Year B Proper 26th Sunday"
  ],
  "people": [
   "Ruth (Biblical figure)"
  ],
  "subjects": [
   "Culture: Hispanic and/or Latino",
   "Faithfulness"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/56561",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Swanson, John August. Story of Ruth, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of John August Swanson, https://www.johnaugustswanson.com/."
 },
 {
  "id": 56562,
  "title": "Story of Joseph",
  "artist": "Swanson, John August",
  "date": "2005",
  "where": "Los Angeles, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Swanson-StoryofJoseph.jpg",
  "refs": [
   "Genesis 37:1-4, 12-28",
   "Genesis 45:3-11, 15"
  ],
  "days": [
   "Year C Epiphany 7th Sunday",
   "",
   "Year A Proper 14th Sunday",
   "Year A Proper 15th Sunday"
  ],
  "people": [
   "Joseph, the son of Jacob (Biblical figure)"
  ],
  "subjects": [
   "Culture: Hispanic and/or Latino"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/56562",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Swanson, John August. Story of Joseph, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of John August Swanson, https://www.johnaugustswanson.com/."
 },
 {
  "id": 56567,
  "title": "The Flood",
  "artist": "Swanson, John August",
  "date": "1974",
  "where": "Los Angeles, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Swanson-Noah_BuildingTheArc.jpg",
  "refs": [
   "Genesis 6:9-22; 7:24; 8:14-19",
   "Genesis 7:1-5, 11-18; 8:6-18; 9:8-13"
  ],
  "days": [
   "Year A Easter Vigil",
   "Year A Proper 4th Sunday",
   ""
  ],
  "people": [
   "Noah (Biblical figure)"
  ],
  "subjects": [
   "Flood in Genesis",
   "Noahs Ark",
   "Culture: Hispanic and/or Latino"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/56567",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Swanson, John August. The Flood, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of John August Swanson, https://www.johnaugustswanson.com/."
 },
 {
  "id": 56568,
  "title": "Rainbow",
  "artist": "Swanson, John August",
  "date": "1974",
  "where": "Los Angeles, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Swanson-Noah_TheRainbow.jpg",
  "refs": [
   "Genesis 6:9-22; 7:24; 8:14-19",
   "Genesis 7:1-5, 11-18; 8:6-18; 9:8-13"
  ],
  "days": [
   "Year A Easter Vigil",
   "Year A Proper 4th Sunday",
   "",
   "Year B Lent 1st Sunday"
  ],
  "people": [
   "Noah (Biblical figure)"
  ],
  "subjects": [
   "Noahs Ark",
   "Culture: Hispanic and/or Latino",
   "Rainbow",
   "Color"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/56568",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Swanson, John August. Rainbow, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of John August Swanson, https://www.johnaugustswanson.com/."
 },
 {
  "id": 56778,
  "title": "Icon of Crucifixion",
  "artist": null,
  "date": "ca. 1560",
  "where": "Benaki Museum, Athens, Greece",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Crucifixionqklenlkndl0i0kjnd28x.jpg",
  "refs": [
   "Matthew 26:14-27:66",
   "Mark 14:1-15:47",
   "Luke 22:14-23:56"
  ],
  "days": [
   "Year A Liturgy of Pass",
   "Year B Liturgy of Pass",
   "Year C Liturgy of Pass",
   "Year C Epiphany 4thSunday"
  ],
  "people": [],
  "subjects": [
   "Passion of Jesus Christ: Crucifixion of Jesus",
   "Prophets"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/56778",
  "licence": "Public domain",
  "attribution": "Icon of Crucifixion, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 57100,
  "title": "Martin Luther King, Jr.",
  "artist": "Latimore, Kelly",
  "date": "2019",
  "where": "St. Louis, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Latimore-IMG_5109.jpg",
  "refs": [
   "Psalm 72:1-7, 18-19"
  ],
  "days": [
   "Year A Advent 2nd  Sunday",
   ""
  ],
  "people": [
   "King, Martin Luther, Jr., 1929-1968"
  ],
  "subjects": [
   "Justice",
   "Love",
   "Culture: Black",
   "Culture: African American"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/57100",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Latimore, Kelly. Martin Luther King, Jr., from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Kelly Latimore Icons, https://kellylatimoreicons.com/."
 },
 {
  "id": 57101,
  "title": "Frederick Douglass",
  "artist": "Latimore, Kelly",
  "date": "2014",
  "where": "Cincinnati, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Latimore-IMG_3878.jpg",
  "refs": [
   "Isaiah 11:1-10"
  ],
  "days": [
   "Year A Advent 2nd  Sunday",
   ""
  ],
  "people": [
   "Douglass, Frederick, 1818-1895"
  ],
  "subjects": [
   "Justice",
   "Love",
   "Culture: Black",
   "Culture: African American"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/57101",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Latimore, Kelly. Frederick Douglass, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Kelly Latimore Icons, https://kellylatimoreicons.com/."
 },
 {
  "id": 57102,
  "title": "Nicholas Black Elk",
  "artist": "Latimore, Kelly",
  "date": "2019",
  "where": "St. Louis, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Latimore-IMG_4713.jpg",
  "refs": [
   "Psalm 72:1-7, 18-19"
  ],
  "days": [
   "Year A Advent 2nd  Sunday",
   ""
  ],
  "people": [
   "Black Elk, Nicolas, 1863-1950"
  ],
  "subjects": [
   "Justice",
   "Nature",
   "Love",
   "Culture: Native American"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/57102",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Latimore, Kelly. Nicholas Black Elk, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Kelly Latimore Icons, https://kellylatimoreicons.com/."
 },
 {
  "id": 57104,
  "title": "Maya Angelou",
  "artist": "Latimore, Kelly",
  "date": "2017",
  "where": "St. Louis, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Latimore-IMG_3194.jpg",
  "refs": [
   "Luke 1:46b-55"
  ],
  "days": [
   "Year A Advent 3rd Sunday",
   ""
  ],
  "people": [
   "Angelou, Maya, 1928-2014"
  ],
  "subjects": [
   "Culture: Black",
   "Reading",
   "Culture: African American",
   "Joy",
   "Magnificat"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/57104",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Latimore, Kelly. Maya Angelou, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Kelly Latimore Icons, https://kellylatimoreicons.com/."
 },
 {
  "id": 57105,
  "title": "Sojourner Truth",
  "artist": "Latimore, Kelly",
  "date": "2018",
  "where": "Takoma, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Latimore-IMG_4383.jpg",
  "refs": [
   "Isaiah 35:1-10",
   "John 18:33-37"
  ],
  "days": [
   "Year A Advent 3rd Sunday",
   "",
   "Year B Reign of Christ",
   "Year A Epiphany 5th Sunday"
  ],
  "people": [
   "Truth, Sojourner, 1799-1883"
  ],
  "subjects": [
   "Justice",
   "Culture: Black",
   "Culture: African American",
   "Joy",
   "Liberty"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/57105",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Latimore, Kelly. Sojourner Truth, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Kelly Latimore Icons, https://kellylatimoreicons.com/."
 },
 {
  "id": 57106,
  "title": "Mary: Keep Watch",
  "artist": "Latimore, Kelly",
  "date": "2015",
  "where": "St. Louis, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Latimore-IMG_4954.jpg",
  "refs": [
   "Matthew 1:18-25"
  ],
  "days": [
   "Year A Advent 4th Sunday",
   "",
   "Year A Presentation of the Lord",
   "Year A Holy Name of Jesus",
   "Year B Holy Name of Jesus"
  ],
  "people": [
   "Mary, the mother of Jesus (Biblical figure)",
   "Jesus Christ (Biblical figure)"
  ],
  "subjects": [
   "Madonna and Child",
   "Culture: Black"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/57106",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Latimore, Kelly. Mary: Keep Watch, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Kelly Latimore Icons, https://kellylatimoreicons.com/."
 },
 {
  "id": 57107,
  "title": "Simple Mary",
  "artist": "Latimore, Kelly",
  "date": "2011",
  "where": "Columbus, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Latimore-IMG_5680.jpg",
  "refs": [
   "Matthew 1:18-25"
  ],
  "days": [
   "Year A Advent 4th Sunday"
  ],
  "people": [
   "Mary, the mother of Jesus (Biblical figure)"
  ],
  "subjects": [
   "Peace"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/57107",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Latimore, Kelly. Simple Mary, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Kelly Latimore Icons, https://kellylatimoreicons.com/."
 },
 {
  "id": 57108,
  "title": "Refugees: Holy Family",
  "artist": "Latimore, Kelly",
  "date": "2018",
  "where": "Cincinnati, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Latimore-IMG_4035.jpg",
  "refs": [
   "Matthew 2:13-23"
  ],
  "days": [
   "Year A Christmas 1st Sunday"
  ],
  "people": [],
  "subjects": [
   "Flight into Egypt",
   "Holy Family",
   "Refugees"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/57108",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Latimore, Kelly. Refugees: Holy Family, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Kelly Latimore Icons, https://kellylatimoreicons.com/."
 },
 {
  "id": 57109,
  "title": "Refugees: La Sagrada Familia",
  "artist": "Latimore, Kelly",
  "date": "2016",
  "where": "New York, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Latimore-IMG_2361.jpg",
  "refs": [
   "Matthew 2:13-23"
  ],
  "days": [
   "Year A Christmas 1st Sunday",
   ""
  ],
  "people": [],
  "subjects": [
   "Flight into Egypt",
   "Holy Family",
   "Culture: Hispanic and/or Latino",
   "Refugees"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/57109",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Latimore, Kelly. Refugees: La Sagrada Familia, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Kelly Latimore Icons, https://kellylatimoreicons.com/."
 },
 {
  "id": 57110,
  "title": "Fannie Lou Hamer",
  "artist": "Latimore, Kelly",
  "date": "2019",
  "where": "St. Louis, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Latimore-IMG_5297.jpg",
  "refs": [
   "Amos 5:6-7, 10-15"
  ],
  "days": [
   "Year A Liturgy of Pass",
   "",
   "Year A Proper 11th Sunday",
   "Year B Ash Wednesday",
   "Year B Proper 23rd Sunday"
  ],
  "people": [
   "Hamer, Fannie Lou, 1917-1977"
  ],
  "subjects": [
   "Justice",
   "Sacrifice",
   "Culture: Black",
   "Culture: African American"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/57110",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Latimore, Kelly. Fannie Lou Hamer, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Kelly Latimore Icons, https://kellylatimoreicons.com/."
 },
 {
  "id": 57111,
  "title": "Our Lady of Prompt Succor",
  "artist": "Latimore, Kelly",
  "date": "2018",
  "where": "New Orleans, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Latimore-IMG_4671.jpg",
  "refs": [
   "Luke 2:(1-7), 8-20"
  ],
  "days": [
   "",
   "Year A Holy Name of Jesus"
  ],
  "people": [],
  "subjects": [
   "Madonna and Child",
   "Culture: Black",
   "Comforter"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/57111",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Latimore, Kelly. Our Lady of Prompt Succor, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Kelly Latimore Icons, https://kellylatimoreicons.com/."
 },
 {
  "id": 57112,
  "title": "Mother of God: Protectress of the Oppressed",
  "artist": "Latimore, Kelly",
  "date": "2019",
  "where": "St. Louis, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Latimore-IMG_5407.jpg",
  "refs": [
   "Galatians 4:4-7"
  ],
  "days": [
   "",
   "Year A Holy Name of Jesus",
   "Year A Epiphany 5th Sunday"
  ],
  "people": [],
  "subjects": [
   "Madonna and Child",
   "Culture: Hispanic and/or Latino",
   "Oppressed",
   "Refugees"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/57112",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Latimore, Kelly. Mother of God: Protectress of the Oppressed, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Kelly Latimore Icons, https://kellylatimoreicons.com/."
 },
 {
  "id": 57114,
  "title": "Transfiguration",
  "artist": "Latimore, Kelly",
  "date": "2014",
  "where": "Glendale, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Latimore-IMG_5681.jpg",
  "refs": [
   "Luke 21:25-36",
   "Matthew 17:1-9",
   "Mark 9:2-9"
  ],
  "days": [
   "Year C Advent 1st Sunday",
   "Year A Transfiguration Sunday",
   "Year B Transfiguration Sunday"
  ],
  "people": [],
  "subjects": [
   "Transfiguration of Jesus",
   "Light"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/57114",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Latimore, Kelly. Transfiguration, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Kelly Latimore Icons, https://kellylatimoreicons.com/."
 },
 {
  "id": 57115,
  "title": "Mother Jones",
  "artist": "Latimore, Kelly",
  "date": "2015",
  "where": "Toledo, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Latimore-IMG_4363.jpg",
  "refs": [
   "Micah 6:1-8"
  ],
  "days": [
   "Year A Epiphany 4thSunday"
  ],
  "people": [
   "Jones, Mother, 1837-1930"
  ],
  "subjects": [
   "Charity",
   "Justice"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/57115",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Latimore, Kelly. Mother Jones, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Kelly Latimore Icons, https://kellylatimoreicons.com/."
 },
 {
  "id": 57116,
  "title": "Moses the Black",
  "artist": "Latimore, Kelly",
  "date": "2019",
  "where": "Kansas City, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Latimore-IMG_5072.jpg",
  "refs": [],
  "days": [
   "Year A Proper 16th Sunday",
   "Year A Lent 1st Sunday",
   "Year A Proper 20th Sunday",
   "",
   "Year A Ash Wednesday"
  ],
  "people": [
   "Moses the Black, 330-405"
  ],
  "subjects": [
   "Culture: Black",
   "Culture: Ethiopian"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/57116",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Latimore, Kelly. Moses the Black, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Kelly Latimore Icons, https://kellylatimoreicons.com/."
 },
 {
  "id": 57117,
  "title": "John Muir",
  "artist": "Latimore, Kelly",
  "date": "2011",
  "where": "St. Louis, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Latimore-IMG_3551.jpg",
  "refs": [],
  "days": [
   "Year A Lent 1st Sunday",
   "Year A Ash Wednesday"
  ],
  "people": [
   "Muir, John, 1838-1914"
  ],
  "subjects": [
   "Nature",
   "Stewardship"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/57117",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Latimore, Kelly. John Muir, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Kelly Latimore Icons, https://kellylatimoreicons.com/."
 },
 {
  "id": 57118,
  "title": "Christ: Consider the Lilies",
  "artist": "Latimore, Kelly",
  "date": "2010",
  "where": "United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Latimore-IMG_3875.jpg",
  "refs": [
   "Matthew 6:25-33",
   "Matthew 6:24-34"
  ],
  "days": [
   "Year B Thanksgiving Day",
   "Year A Epiphany 8th Sunday"
  ],
  "people": [
   "Jesus Christ (Biblical figure)"
  ],
  "subjects": [
   "Flowers",
   "Sermon on the Mount",
   "Simple living"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/57118",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Latimore, Kelly. Christ: Consider the Lilies, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Kelly Latimore Icons, https://kellylatimoreicons.com/."
 },
 {
  "id": 57119,
  "title": "Cloud of Unknowing",
  "artist": "Latimore, Kelly",
  "date": "2010",
  "where": "St. Louis, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Latimore-IMG_4868.jpg",
  "refs": [
   "Acts 17:22-31"
  ],
  "days": [
   "Year A Easter 6th Sunday"
  ],
  "people": [],
  "subjects": [
   "Clouds",
   "Doubt"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/57119",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Latimore, Kelly. Cloud of Unknowing, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Kelly Latimore Icons, https://kellylatimoreicons.com/."
 },
 {
  "id": 57120,
  "title": "Roebuck \"Pops\" Staples",
  "artist": "Latimore, Kelly",
  "date": "2019",
  "where": "Chicago, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Latimore-IMG_4753.jpg",
  "refs": [
   "Psalm 95"
  ],
  "days": [
   "",
   "Year A Lent 3rd Sunday"
  ],
  "people": [],
  "subjects": [
   "Music",
   "Musicians",
   "Culture: Black",
   "Culture: African American",
   "Praise"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/57120",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Latimore, Kelly. Roebuck \"Pops\" Staples, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Kelly Latimore Icons, https://kellylatimoreicons.com/."
 },
 {
  "id": 57121,
  "title": "Good Shepherd",
  "artist": "Latimore, Kelly",
  "date": "2019",
  "where": "Good Shepherd Episcopal Church, Athens, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Latimore-IMG_5207.jpg",
  "refs": [
   "Psalm 23",
   "John 10:11-18"
  ],
  "days": [
   "",
   "Year A Lent 4th Sunday",
   "Year B Easter 4th Sunday"
  ],
  "people": [],
  "subjects": [
   "Good Shepherd",
   "Culture: Hispanic and/or Latino"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/57121",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Latimore, Kelly. Good Shepherd, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Kelly Latimore Icons, https://kellylatimoreicons.com/."
 },
 {
  "id": 57122,
  "title": "Dorothy Day with Homeless Christ",
  "artist": "Latimore, Kelly",
  "date": "2015",
  "where": "New York, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Latimore-IMG_4437.jpg",
  "refs": [
   "John 9:1-41"
  ],
  "days": [
   "Year A Lent 4th Sunday",
   "Year A Epiphany 4thSunday"
  ],
  "people": [
   "Jesus Christ (Biblical figure)",
   "Day, Dorothy, 1897-1980"
  ],
  "subjects": [
   "Hospitality",
   "Compassion",
   "Homelessness"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/57122",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Latimore, Kelly. Dorothy Day with Homeless Christ, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Kelly Latimore Icons, https://kellylatimoreicons.com/."
 },
 {
  "id": 57123,
  "title": "Trinity",
  "artist": "Latimore, Kelly",
  "date": "2016",
  "where": "United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Latimore-IMG_2737.jpg",
  "refs": [
   "Matthew 28:16-20",
   "John 16:12-15",
   "Romans 15:4-13"
  ],
  "days": [
   "Year C Trinity Sunday",
   "Year A Trinity Sunday",
   "Year A Advent 2nd  Sunday",
   "Year B Trinity Sunday"
  ],
  "people": [
   "Trinity"
  ],
  "subjects": [
   "Trinity"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/57123",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Latimore, Kelly. Trinity, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Kelly Latimore Icons, https://kellylatimoreicons.com/."
 },
 {
  "id": 57124,
  "title": "Christ: the Tekton",
  "artist": "Latimore, Kelly",
  "date": "2015",
  "where": "United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Latimore-IMG_5387.jpg",
  "refs": [
   "Matthew 21:33-46",
   "Ephesians 2:11-22",
   "Acts 4:5-12"
  ],
  "days": [
   "Year A Proper 22nd Sunday",
   "Year B Proper 11th Sunday",
   "Year B Easter 4th Sunday"
  ],
  "people": [],
  "subjects": [
   "Architect",
   "Building",
   "Cornerstone"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/57124",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Latimore, Kelly. Christ: the Tekton, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Kelly Latimore Icons, https://kellylatimoreicons.com/."
 },
 {
  "id": 57125,
  "title": "St. Teresa of Avila",
  "artist": "Latimore, Kelly",
  "date": "2016",
  "where": "St. Paul's Episcopal Church, Gallipoli, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Latimore-IMG_2753.jpg",
  "refs": [
   "Habakkuk 1:1-4; 2:1-4"
  ],
  "days": [
   "Year C Proper 26th Sunday",
   "Year C Proper 22nd Sunday"
  ],
  "people": [
   "Teresa of Avila, 1515-1582"
  ],
  "subjects": [
   "Saints",
   "Holy Spirit"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/57125",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Latimore, Kelly. St. Teresa of Avila, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Kelly Latimore Icons, https://kellylatimoreicons.com/."
 },
 {
  "id": 57435,
  "title": "Refugee Boy",
  "artist": "Johnson, William H., 1901-1970",
  "date": "ca. 1935-1939",
  "where": "Smithsonian American Art Museum, Washington, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Refugee49e4jk57g6f8c3f.jpg",
  "refs": [
   "Psalm 145:8-14"
  ],
  "days": [
   "Year A Proper 13th Sunday"
  ],
  "people": [],
  "subjects": [
   "Children",
   "Boy",
   "Refugees"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/57435",
  "licence": "Public domain",
  "attribution": "Johnson, William H., 1901-1970. Refugee Boy, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 57474,
  "title": "The Ascension",
  "artist": "JESUS MAFA",
  "date": "1973",
  "where": "Cameroon",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/BAscncbw.jpg",
  "refs": [
   "Luke 24:44-53",
   "Peter I, 4:12-14; 5:6-11"
  ],
  "days": [
   "Year A Ascension of the Lord",
   "Year B Ascension of the Lord",
   "Year A Easter 7th Sunday",
   ""
  ],
  "people": [],
  "subjects": [
   "Ascension of Christ",
   "Culture: African",
   "Culture: Black"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/57474",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "JESUS MAFA. The Ascension, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: http://www.librairie-emmanuel.fr (contact page: https://www.librairie-emmanuel.fr/contact)."
 },
 {
  "id": 57486,
  "title": "Transfiguration",
  "artist": "JESUS MAFA",
  "date": "1973",
  "where": "Cameroon",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/BTranbbw.jpg",
  "refs": [
   "Mark 9:2-9",
   "Luke 9:28-36, (37-43)"
  ],
  "days": [
   "",
   "Year B Transfiguration Sunday",
   "Year C Transfiguration Sunday"
  ],
  "people": [
   "Jesus Christ (Biblical figure)"
  ],
  "subjects": [
   "Transfiguration of Jesus",
   "Culture: African",
   "Culture: Black"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/57486",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "JESUS MAFA. Transfiguration, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: http://www.librairie-emmanuel.fr (contact page: https://www.librairie-emmanuel.fr/contact)."
 },
 {
  "id": 57499,
  "title": "Detail of Jesus from the Lord's Supper",
  "artist": "JESUS MAFA",
  "date": "1973",
  "where": "Cameroon",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/BLent03bw.jpg",
  "refs": [
   "Matthew 26:14-27:66",
   "Mark 14:1-15:47",
   "Luke 22:14-23:56"
  ],
  "days": [
   "Year A Liturgy of Pass",
   "Year B Liturgy of Pass",
   "Year C Liturgy of Pass",
   "Year A Resurrection of the Lord",
   "Year B Lent 3rd Sunday",
   "",
   "Year A Epiphany 3rd Sunday"
  ],
  "people": [],
  "subjects": [
   "Passion of Jesus Christ: Last Supper",
   "Culture: African",
   "Culture: Black"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/57499",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "JESUS MAFA. Detail of Jesus from the Lord's Supper, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: http://www.librairie-emmanuel.fr (contact page: https://www.librairie-emmanuel.fr/contact)."
 },
 {
  "id": 57503,
  "title": "Nicodemus",
  "artist": "JESUS MAFA",
  "date": "1973",
  "where": "Cameroon",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/BTrinbw.jpg",
  "refs": [
   "John 3:1-17"
  ],
  "days": [
   "Year B Trinity Sunday",
   ""
  ],
  "people": [
   "Jesus Christ (Biblical figure)",
   "Nicodemus (Biblical figure)"
  ],
  "subjects": [
   "Culture: African",
   "Culture: Black"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/57503",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "JESUS MAFA. Nicodemus, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: http://www.librairie-emmanuel.fr (contact page: https://www.librairie-emmanuel.fr/contact)."
 },
 {
  "id": 57527,
  "title": "Jesus Cures the Man Born Blind",
  "artist": "JESUS MAFA",
  "date": "1973",
  "where": "Cameroon",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/BProp25bw.jpg",
  "refs": [
   "Mark 10:46-52"
  ],
  "days": [
   "Year A Proper 25th Sunday",
   "",
   "Year B Proper 25th Sunday"
  ],
  "people": [],
  "subjects": [
   "Healing",
   "Culture: African",
   "Culture: Black",
   "Blindness"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/57527",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "JESUS MAFA. Jesus Cures the Man Born Blind, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: http://www.librairie-emmanuel.fr (contact page: https://www.librairie-emmanuel.fr/contact)."
 },
 {
  "id": 57531,
  "title": "The Widow's Mite",
  "artist": "JESUS MAFA",
  "date": "1973",
  "where": "Cameroon",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/BProp27bw.jpg",
  "refs": [
   "Mark 12:38-44"
  ],
  "days": [
   "",
   "Year B Proper 27th Sunday"
  ],
  "people": [],
  "subjects": [
   "Generosity",
   "Culture: African",
   "Culture: Black"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/57531",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "JESUS MAFA. The Widow's Mite, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: http://www.librairie-emmanuel.fr (contact page: https://www.librairie-emmanuel.fr/contact)."
 },
 {
  "id": 57561,
  "title": "The Late-arriving Workers",
  "artist": "JESUS MAFA",
  "date": "1973",
  "where": "Cameroon",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/AProp20bw.jpg",
  "refs": [
   "Matthew 20:1-16"
  ],
  "days": [
   "Year A Proper 20th Sunday",
   ""
  ],
  "people": [],
  "subjects": [
   "Culture: African",
   "Culture: Black"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/57561",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "JESUS MAFA. The Late-arriving Workers, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: http://www.librairie-emmanuel.fr (contact page: https://www.librairie-emmanuel.fr/contact)."
 },
 {
  "id": 57570,
  "title": "Parable of the Three Servants, or, The Talents",
  "artist": "JESUS MAFA",
  "date": "1973",
  "where": "Cameroon",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/AProp28bw.jpg",
  "refs": [
   "Matthew 25:14-30"
  ],
  "days": [
   "Year A Proper 28th Sunday",
   ""
  ],
  "people": [],
  "subjects": [
   "Culture: African",
   "Culture: Black",
   "Parable of the Talents"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/57570",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "JESUS MAFA. Parable of the Three Servants, or, The Talents, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: http://www.librairie-emmanuel.fr (contact page: https://www.librairie-emmanuel.fr/contact)."
 },
 {
  "id": 57572,
  "title": "Healing of the Ten Lepers",
  "artist": "JESUS MAFA",
  "date": "1973",
  "where": "Cameroon",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/ATDaybw.jpg",
  "refs": [
   "Luke 17:11-19"
  ],
  "days": [
   "Year A Thanksgiving Day",
   "Year C Proper 23rd Sunday"
  ],
  "people": [],
  "subjects": [
   "Healing",
   "Culture: African",
   "Culture: Black",
   "Leprosy"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/57572",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "JESUS MAFA. Healing of the Ten Lepers, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: http://www.librairie-emmanuel.fr (contact page: https://www.librairie-emmanuel.fr/contact)."
 },
 {
  "id": 58575,
  "title": "Shepherds",
  "artist": "Swanson, John August",
  "date": "1985",
  "where": "Los Angeles, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Swanson-Shepherds.jpg",
  "refs": [
   "Luke 2:(1-7), 8-20",
   "Luke 2:1-14, (15-20)"
  ],
  "days": [
   "Year A Nativity of the Lord Proper I",
   "",
   "Year B Nativity of the Lord Proper I",
   "Year C Nativity of the Lord Proper I",
   "Year A Holy Name of Jesus",
   "Year B Holy Name of Jesus",
   "Year C Holy Name of Jesus",
   "Year B Nativity of the Lord Proper II",
   "Year A Nativity of the Lord Proper II",
   "Year C Nativity of the Lord Proper II"
  ],
  "people": [
   "Angel (Biblical figure)",
   "Shepherds (Biblical figure)"
  ],
  "subjects": [
   "Animals",
   "Fire",
   "Sheep",
   "Culture: Hispanic and/or Latino",
   "Compassion"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/58575",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Swanson, John August. Shepherds, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of John August Swanson, https://www.johnaugustswanson.com/."
 },
 {
  "id": 58577,
  "title": "River",
  "artist": "Swanson, John August",
  "date": "1987",
  "where": "Los Angeles, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Swanson-River.jpg",
  "refs": [
   "Mark 1:4-11",
   "Matthew 3:13-17",
   "Luke 3:15-17, 21-22",
   "Luke 3:1-6",
   "Luke 3:7-18"
  ],
  "days": [
   "Year A Baptism of the Lord",
   "Year B Baptism of the Lord",
   "Year C Baptism of the Lord",
   "Year C Advent 2nd  Sunday",
   "Year C Advent 3rd Sunday",
   ""
  ],
  "people": [],
  "subjects": [
   "Water",
   "Baptism of Christ",
   "Culture: Hispanic and/or Latino"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/58577",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Swanson, John August. River, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of John August Swanson, https://www.johnaugustswanson.com/."
 },
 {
  "id": 58578,
  "title": "Take Away the Stone",
  "artist": "Swanson, John August",
  "date": "2005",
  "where": "Los Angeles, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/TakeAwaytheStone.jpg",
  "refs": [
   "John 11:1-45",
   "John 11:32-44"
  ],
  "days": [
   "Year B All Saints Day",
   "Year A Lent 5th  Sunday",
   ""
  ],
  "people": [
   "Lazarus, of Bethany (Biblical figure)"
  ],
  "subjects": [
   "Raising from the Dead",
   "Culture: Hispanic and/or Latino"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/58578",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Swanson, John August. Take Away the Stone, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of John August Swanson, https://www.johnaugustswanson.com/."
 },
 {
  "id": 58579,
  "title": "Washing of the Feet",
  "artist": "Swanson, John August",
  "date": "1999",
  "where": "Los Angeles, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/WashingOfTheFeet.jpg",
  "refs": [
   "John 13:1-17, 31b-35"
  ],
  "days": [
   "Year A Maundy Thursday",
   "",
   "Year B Proper 24th Sunday"
  ],
  "people": [
   "Jesus Christ (Biblical figure)",
   "Peter, the Apostle (Biblical figure)",
   "Disciples (Biblical figures)"
  ],
  "subjects": [
   "Footwashing",
   "Jesus Washes Disciples Feet",
   "Culture: Hispanic and/or Latino"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/58579",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Swanson, John August. Washing of the Feet, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of John August Swanson, https://www.johnaugustswanson.com/."
 },
 {
  "id": 58580,
  "title": "Washing of the Feet II",
  "artist": "Swanson, John August",
  "date": "2000",
  "where": "Los Angeles, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/WashingOfTheFeetII.jpg",
  "refs": [
   "John 13:1-17, 31b-35"
  ],
  "days": [
   "Year A Maundy Thursday",
   ""
  ],
  "people": [
   "Jesus Christ (Biblical figure)",
   "Peter, the Apostle (Biblical figure)",
   "Disciples (Biblical figures)"
  ],
  "subjects": [
   "Footwashing",
   "Jesus Washes Disciples Feet",
   "Culture: Hispanic and/or Latino"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/58580",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Swanson, John August. Washing of the Feet II, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of John August Swanson, https://www.johnaugustswanson.com/."
 },
 {
  "id": 58581,
  "title": "Wedding Feast",
  "artist": "Swanson, John August",
  "date": "1996",
  "where": "Los Angeles, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/WeddingFeast.jpg",
  "refs": [
   "John 2:1-11",
   "John 6:56-69"
  ],
  "days": [
   "Year C Epiphany 2nd Sunday",
   "Year B Proper 16th Sunday",
   ""
  ],
  "people": [],
  "subjects": [
   "Marriage at Cana",
   "Miracles"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/58581",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Swanson, John August. Wedding Feast, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of John August Swanson, https://www.johnaugustswanson.com/."
 },
 {
  "id": 58747,
  "title": "Transfiguration of Christ",
  "artist": "Anonymous",
  "date": "1600",
  "where": "Benaki Museum, Athens, Greece",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/transfiguration73lopr19.jpg",
  "refs": [
   "Matthew 17:1-9",
   "Mark 9:2-9",
   "Luke 9:28-36, (37-43)"
  ],
  "days": [
   "Year A Transfiguration Sunday",
   "Year B Transfiguration Sunday",
   "Year C Transfiguration Sunday"
  ],
  "people": [],
  "subjects": [],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/58747",
  "licence": "Public domain",
  "attribution": "Anonymous. Transfiguration of Christ, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58796,
  "title": "John the Baptist preaching in the desert",
  "artist": "JESUS MAFA",
  "date": "1973",
  "where": "Cameroon",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/CAdvt02bw.jpg",
  "refs": [
   "Matthew 3:1-12",
   "Luke 3:1-6"
  ],
  "days": [
   "Year C Advent 2nd  Sunday",
   "Year C Advent 3rd Sunday"
  ],
  "people": [
   "John, the Baptist (Biblical figure)"
  ],
  "subjects": [
   "Preaching",
   "Desert",
   "Culture: African",
   "Culture: Black"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/58796",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "JESUS MAFA. John the Baptist preaching in the desert, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: http://www.librairie-emmanuel.fr (contact page: https://www.librairie-emmanuel.fr/contact)."
 },
 {
  "id": 58801,
  "title": "Jesus among the teachers",
  "artist": "JESUS MAFA",
  "date": "1973",
  "where": "Cameroon",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/CXmas01bw.jpg",
  "refs": [
   "Luke 2:41-52"
  ],
  "days": [
   "Year C Christmas 1st Sunday",
   ""
  ],
  "people": [],
  "subjects": [
   "Childhood of Jesus",
   "Teaching",
   "Culture: African",
   "Culture: Black"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/58801",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "JESUS MAFA. Jesus among the teachers, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: http://www.librairie-emmanuel.fr (contact page: https://www.librairie-emmanuel.fr/contact)."
 },
 {
  "id": 59014,
  "title": "Flight into Egypt",
  "artist": "JESUS MAFA",
  "date": "1973",
  "where": "Cameroon",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/AXmas01bw48313.jpg",
  "refs": [
   "Matthew 2:13-23"
  ],
  "days": [
   "Year A Christmas 1st Sunday"
  ],
  "people": [],
  "subjects": [
   "Flight into Egypt",
   "Culture: African",
   "Culture: Black"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59014",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "JESUS MAFA. Flight into Egypt, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: http://www.librairie-emmanuel.fr (contact page: https://www.librairie-emmanuel.fr/contact)."
 },
 {
  "id": 59022,
  "title": "Jesus cures the man born blind",
  "artist": "JESUS MAFA",
  "date": "1973",
  "where": "Cameroon",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/ALent04bw48383.jpg",
  "refs": [
   "John 9:1-41"
  ],
  "days": [
   "",
   "Year A Lent 4th Sunday"
  ],
  "people": [],
  "subjects": [
   "Healing",
   "Culture: African",
   "Culture: Black"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59022",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "JESUS MAFA. Jesus cures the man born blind, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: http://www.librairie-emmanuel.fr (contact page: https://www.librairie-emmanuel.fr/contact)."
 },
 {
  "id": 59106,
  "title": "Hymn to the Virgin",
  "artist": "Poulakēs, Theodōros, approximately 1622-1692",
  "date": "1650-1699",
  "where": "Benaki Museum, Athens, Greece",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/hymnvirgin1j0s9v4m.jpg",
  "refs": [
   "Daniel 7:1-3, 15-18"
  ],
  "days": [
   "Year B All Saints Day"
  ],
  "people": [
   "Mary, the mother of Jesus (Biblical figure)"
  ],
  "subjects": [
   "Prophecy",
   "Visual Commentary on Scripture"
  ],
  "essay": "https://thevcs.org/daniels-four-beasts/game?first=6471",
  "act": "https://act.library.vanderbilt.edu/artworks/59106",
  "licence": "Public domain",
  "attribution": "Poulakēs, Theodōros, approximately 1622-1692. Hymn to the Virgin, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 59128,
  "title": "Story of Daniel and the Three Youths in the Fiery Furnace",
  "artist": "Konstantinos, Adrianoupolitis",
  "date": "ca. 1750-1799",
  "where": "Benaki Museum, Athens, Greece",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/danielyouths3921ghew.jpg",
  "refs": [
   "Daniel 3"
  ],
  "days": [],
  "people": [
   "Daniel (Biblical figure)",
   "Shadrach (Biblical figure)",
   "Meshach (Biblical figure)",
   "Abednego (Biblical figure)"
  ],
  "subjects": [
   "Martyrs",
   "Visual Commentary on Scripture",
   "RCL Daily Reading"
  ],
  "essay": "https://thevcs.org/fiery-furnace/shelter-most-high?first=4791",
  "act": "https://act.library.vanderbilt.edu/artworks/59128",
  "licence": "Public domain",
  "attribution": "Konstantinos, Adrianoupolitis. Story of Daniel and the Three Youths in the Fiery Furnace, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 59348,
  "title": "Martha and Mary",
  "artist": "JESUS MAFA",
  "date": "1973",
  "where": "Cameroon",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/CProp11bw48311.jpg",
  "refs": [
   "Luke 10:38-42"
  ],
  "days": [
   "Year C Proper 11th Sunday"
  ],
  "people": [
   "Jesus Christ (Biblical figure)",
   "Martha, of Bethany (Biblical figure)",
   "Mary, of Bethany (Biblical figure)"
  ],
  "subjects": [
   "Culture: African",
   "Culture: Black"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59348",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "JESUS MAFA. Martha and Mary, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: http://www.librairie-emmanuel.fr (contact page: https://www.librairie-emmanuel.fr/contact)."
 },
 {
  "id": 59355,
  "title": "Martha and Mary",
  "artist": "JESUS MAFA",
  "date": "1973",
  "where": "Cameroon",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/CProp11bw48311.jpg",
  "refs": [
   "Luke 10:38-42"
  ],
  "days": [
   "Year C Proper 11th Sunday"
  ],
  "people": [
   "Jesus Christ (Biblical figure)",
   "Martha, of Bethany (Biblical figure)",
   "Mary, of Bethany (Biblical figure)"
  ],
  "subjects": [
   "Culture: African",
   "Culture: Black"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59355",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "JESUS MAFA. Martha and Mary, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: http://www.librairie-emmanuel.fr (contact page: https://www.librairie-emmanuel.fr/contact)."
 },
 {
  "id": 59357,
  "title": "Jesus washes his disciples feet",
  "artist": "JESUS MAFA",
  "date": "1973",
  "where": "Cameroon",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/BHoly04bw.jpg",
  "refs": [
   "John 13:1-17, 31b-35"
  ],
  "days": [
   "Year A Maundy Thursday",
   "Year B Maundy Thursday",
   ""
  ],
  "people": [],
  "subjects": [
   "Footwashing",
   "Jesus Washes Disciples Feet",
   "Culture: African",
   "Culture: Black"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59357",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "JESUS MAFA. Jesus washes his disciples feet, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: http://www.librairie-emmanuel.fr (contact page: https://www.librairie-emmanuel.fr/contact)."
 },
 {
  "id": 59366,
  "title": "The birth of Jesus with shepherds",
  "artist": "JESUS MAFA",
  "date": "1973",
  "where": "Cameroon",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/CNatvbw.jpg",
  "refs": [
   "Luke 2:(1-7), 8-20",
   "Luke 2:1-14, (15-20)"
  ],
  "days": [
   "Year A Nativity of the Lord Proper I",
   "",
   "Year C Nativity of the Lord Proper I"
  ],
  "people": [],
  "subjects": [
   "Birth",
   "Adoration of the Shepherds",
   "Culture: African",
   "Culture: Black"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59366",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "JESUS MAFA. The birth of Jesus with shepherds, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: http://www.librairie-emmanuel.fr (contact page: https://www.librairie-emmanuel.fr/contact)."
 },
 {
  "id": 59642,
  "title": "Mary the Theotokos",
  "artist": "Miller, Mary Jane",
  "date": "2008",
  "where": "San Miguel de Allende, Guanajuato, Mexico",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Theotokus-Miller.jpg",
  "refs": [
   "Psalm 8"
  ],
  "days": [
   "Year A New Year’s Day",
   "Year B New Year’s Day",
   "Year C New Year’s Day"
  ],
  "people": [
   "Mary, the mother of Jesus (Biblical figure)",
   "Jesus Christ (Biblical figure)"
  ],
  "subjects": [
   "Love",
   "Maternal Love"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59642",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Miller, Mary Jane. Mary the Theotokos, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Mary Jane Miller, https://www.millericons.com/."
 },
 {
  "id": 59651,
  "title": "Mary the Universal Mother",
  "artist": "Miller, Mary Jane",
  "date": "2008",
  "where": "San Miguel de Allende, Guanajuato, Mexico",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Universal Mother-Miller.jpg",
  "refs": [
   "John 14:1-14"
  ],
  "days": [
   "Year A Easter 5th Sunday"
  ],
  "people": [
   "Mary, the mother of Jesus (Biblical figure)",
   "Jesus Christ (Biblical figure)"
  ],
  "subjects": [
   "Wisdom",
   "Forgiveness"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59651",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Miller, Mary Jane. Mary the Universal Mother, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Mary Jane Miller, https://www.millericons.com/."
 },
 {
  "id": 59652,
  "title": "Mary of Seven Sorrows",
  "artist": "Miller, Mary Jane",
  "date": "2008",
  "where": "San Miguel de Allende, Guanajuato, Mexico",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/May Swords-Miller.jpg",
  "refs": [
   "Luke 2:22-40"
  ],
  "days": [
   "Year C Presentation of the Lord",
   "Year A Presentation of the Lord",
   "Year B Presentation of the Lord"
  ],
  "people": [
   "Mary, the mother of Jesus (Biblical figure)"
  ],
  "subjects": [
   "Prayer",
   "Sorrow",
   "Climate change"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59652",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Miller, Mary Jane. Mary of Seven Sorrows, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Mary Jane Miller, https://www.millericons.com/."
 },
 {
  "id": 59653,
  "title": "Mary Enthroned with Christ",
  "artist": "Miller, Mary Jane",
  "date": "2008",
  "where": "San Miguel de Allende, Guanajuato, Mexico",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Mary enthroned-Miller.jpg",
  "refs": [
   "Corinthians II, 4:3-6"
  ],
  "days": [
   "Year B Transfiguration Sunday"
  ],
  "people": [
   "Mary, the mother of Jesus (Biblical figure)",
   "Jesus Christ (Biblical figure)"
  ],
  "subjects": [
   "Peace",
   "Teaching",
   "Light",
   "Eye of God"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59653",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Miller, Mary Jane. Mary Enthroned with Christ, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Mary Jane Miller, https://www.millericons.com/."
 },
 {
  "id": 59654,
  "title": "Virgin of Guadalupe",
  "artist": "Miller, Mary Jane",
  "date": "2008",
  "where": "San Miguel de Allende, Guanajuato, Mexico",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Guadelupe-Miller.jpg",
  "refs": [],
  "days": [],
  "people": [
   "Mary, the mother of Jesus (Biblical figure)"
  ],
  "subjects": [
   "Prayer"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59654",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Miller, Mary Jane. Virgin of Guadalupe, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: https://www.millericons.com/."
 },
 {
  "id": 59655,
  "title": "A Mother's Love Holds the World",
  "artist": "Miller, Mary Jane",
  "date": "2008",
  "where": "San Miguel de Allende, Guanajuato, Mexico",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Mary Holds a World of Wisdom-Miller.jpg",
  "refs": [
   "Psalm 24"
  ],
  "days": [
   "Year B Proper 10th Sunday",
   "Year B All Saints Day"
  ],
  "people": [
   "Mary, the mother of Jesus (Biblical figure)"
  ],
  "subjects": [
   "Wisdom",
   "World",
   "Climate change"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59655",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Miller, Mary Jane. A Mother's Love Holds the World, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: https://www.millericons.com/."
 },
 {
  "id": 59656,
  "title": "Mary of Three Hands",
  "artist": "Miller, Mary Jane",
  "date": "2008",
  "where": "San Miguel de Allende, Guanajuato, Mexico",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Mary Three Hands-Miller.jpg",
  "refs": [],
  "days": [],
  "people": [
   "Mary, the mother of Jesus (Biblical figure)",
   "Jesus Christ (Biblical figure)"
  ],
  "subjects": [
   "Prayer"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59656",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Miller, Mary Jane. Mary of Three Hands, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: https://www.millericons.com/."
 },
 {
  "id": 59657,
  "title": "Mary, the Rose without Thorns",
  "artist": "Miller, Mary Jane",
  "date": "2008",
  "where": "San Miguel de Allende, Guanajuato, Mexico",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Mary, The Rose Without Thorns-Miller.jpg",
  "refs": [
   "John 14:1-14"
  ],
  "days": [
   "Year A Easter 5th Sunday"
  ],
  "people": [
   "Mary, the mother of Jesus (Biblical figure)",
   "Jesus Christ (Biblical figure)"
  ],
  "subjects": [
   "Love",
   "Virgin Mother",
   "Beauty"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59657",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Miller, Mary Jane. Mary, the Rose without Thorns, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Mary Jane Miller, https://www.millericons.com/."
 },
 {
  "id": 59658,
  "title": "Mary of the Burning Bush",
  "artist": "Miller, Mary Jane",
  "date": "2008",
  "where": "San Miguel de Allende, Guanajuato, Mexico",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Mary of the Burning Bush-Miller.jpg",
  "refs": [
   "Luke 1:26-38",
   "Psalm 40:1-11"
  ],
  "days": [
   "Year B Annunciation of the Lord",
   "Year A Annunciation of the Lord",
   "Year C Annunciation of the Lord"
  ],
  "people": [
   "Mary, the mother of Jesus (Biblical figure)",
   "Jesus Christ (Biblical figure)"
  ],
  "subjects": [
   "Burning bush",
   "Love"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59658",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Miller, Mary Jane. Mary of the Burning Bush, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Mary Jane Miller, https://www.millericons.com/."
 },
 {
  "id": 59672,
  "title": "The Holy Trinity",
  "artist": "Miller, Mary Jane",
  "date": "2008",
  "where": "San Miguel de Allende, Guanajuato, Mexico",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Holy Trinity-Miller.jpg",
  "refs": [
   "Genesis 18:1-15, (21:1-7)"
  ],
  "days": [
   "Year A Proper 6th Sunday"
  ],
  "people": [
   "Jesus Christ (Biblical figure)",
   "God (Biblical figure)"
  ],
  "subjects": [
   "Holy Spirit"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59672",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Miller, Mary Jane. The Holy Trinity, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Mary Jane Miller, https://www.millericons.com/."
 },
 {
  "id": 59673,
  "title": "The Annunciation",
  "artist": "Miller, Mary Jane",
  "date": "2008",
  "where": "San Miguel de Allende, Guanajuato, Mexico",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Annunciation-Miller.jpg",
  "refs": [
   "Luke 1:26-38"
  ],
  "days": [
   "Year B Annunciation of the Lord",
   "Year A Annunciation of the Lord",
   "Year C Annunciation of the Lord"
  ],
  "people": [
   "Mary, the mother of Jesus (Biblical figure)",
   "Gabriel (archangel)"
  ],
  "subjects": [
   "Annunciation to Mary",
   "Queen of Heaven"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59673",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Miller, Mary Jane. The Annunciation, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Mary Jane Miller, https://www.millericons.com/."
 },
 {
  "id": 59674,
  "title": "The Nativity",
  "artist": "Miller, Mary Jane",
  "date": "2008",
  "where": "San Miguel de Allende, Guanajuato, Mexico",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Nativity-Miller.jpg",
  "refs": [
   "Luke 2:(1-7), 8-20",
   "Luke 1:26-38",
   "Matthew 2:1-12",
   "Luke 2:1-14, (15-20)"
  ],
  "days": [
   "Year A Nativity of the Lord Proper I",
   "Year A Epiphany of the Lord",
   "Year B Epiphany of the Lord",
   "Year C Epiphany of the Lord",
   "Year B Nativity of the Lord Proper I",
   "Year C Nativity of the Lord Proper I",
   "Year B Annunciation of the Lord",
   "Year A Annunciation of the Lord",
   "Year C Annunciation of the Lord"
  ],
  "people": [
   "Mary, the mother of Jesus (Biblical figure)",
   "Jesus Christ (Biblical figure)"
  ],
  "subjects": [
   "Nativity",
   "Love"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59674",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Miller, Mary Jane. The Nativity, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Mary Jane Miller, https://www.millericons.com/."
 },
 {
  "id": 59675,
  "title": "John the Baptist",
  "artist": "Miller, Mary Jane",
  "date": "2008",
  "where": "San Miguel de Allende, Guanajuato, Mexico",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/John the Baptist-Miller.jpg",
  "refs": [
   "Matthew 3:1-12"
  ],
  "days": [
   "Year A Advent 2nd  Sunday"
  ],
  "people": [
   "John, the Baptist (Biblical figure)"
  ],
  "subjects": [
   "Hand of God",
   "Knowledge"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59675",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Miller, Mary Jane. John the Baptist, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Mary Jane Miller, https://www.millericons.com/."
 },
 {
  "id": 59676,
  "title": "Wedding at Cana",
  "artist": "Miller, Mary Jane",
  "date": "2008",
  "where": "San Miguel de Allende, Guanajuato, Mexico",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Wedding at Cana-Miller.jpg",
  "refs": [
   "John 2:1-11"
  ],
  "days": [
   "Year C Epiphany 2nd Sunday"
  ],
  "people": [
   "Mary, the mother of Jesus (Biblical figure)",
   "Jesus Christ (Biblical figure)"
  ],
  "subjects": [
   "Marriage at Cana"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59676",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Miller, Mary Jane. Wedding at Cana, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Mary Jane Miller, https://www.millericons.com/."
 },
 {
  "id": 59677,
  "title": "Peter Walking on Water",
  "artist": "Miller, Mary Jane",
  "date": "2008",
  "where": "San Miguel de Allende, Guanajuato, Mexico",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Peter Walking on Water-Miller.jpg",
  "refs": [
   "Matthew 14:13-21"
  ],
  "days": [
   "Year A Proper 13th Sunday"
  ],
  "people": [
   "Jesus Christ (Biblical figure)",
   "Peter, the Apostle (Biblical figure)",
   "Disciples (Biblical figures)"
  ],
  "subjects": [
   "Faith",
   "Jesus Walks on Water"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59677",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Miller, Mary Jane. Peter Walking on Water, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Mary Jane Miller, https://www.millericons.com/."
 },
 {
  "id": 59678,
  "title": "Washing the Feet of the Disciples",
  "artist": "Miller, Mary Jane",
  "date": "2008",
  "where": "San Miguel de Allende, Guanajuato, Mexico",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Washing Feet-Miller.jpg",
  "refs": [
   "John 13:1-17, 31b-35"
  ],
  "days": [
   "Year A Maundy Thursday",
   "Year B Maundy Thursday",
   "Year C Maundy Thursday"
  ],
  "people": [
   "Jesus Christ (Biblical figure)",
   "Disciples (Biblical figures)"
  ],
  "subjects": [
   "Agape meal",
   "Equality"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59678",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Miller, Mary Jane. Washing the Feet of the Disciples, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Mary Jane Miller, https://www.millericons.com/."
 },
 {
  "id": 59679,
  "title": "Transfiguration",
  "artist": "Miller, Mary Jane",
  "date": "2008",
  "where": "San Miguel de Allende, Guanajuato, Mexico",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Transfiguration-Miller.jpg",
  "refs": [
   "Mark 9:2-9"
  ],
  "days": [
   "Year B Lent 2nd Sunday",
   "Year B Transfiguration Sunday"
  ],
  "people": [
   "Moses (Biblical figure)",
   "Jesus Christ (Biblical figure)",
   "Peter, the Apostle (Biblical figure)",
   "John, the Apostle (Biblical figure)",
   "Elijah (Biblical figure)",
   "James the Elder, the Apostle (Biblical figure)"
  ],
  "subjects": [
   "Transfiguration of Jesus"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59679",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Miller, Mary Jane. Transfiguration, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Mary Jane Miller, https://www.millericons.com/."
 },
 {
  "id": 59680,
  "title": "Pentecost",
  "artist": "Miller, Mary Jane",
  "date": "2008",
  "where": "San Miguel de Allende, Guanajuato, Mexico",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Pentecost 1-Miller.jpg",
  "refs": [
   "Acts 2:1-21"
  ],
  "days": [
   "Year C Day of Pentecost",
   "Year A Day of Pentecost",
   "Year B Day of Pentecost"
  ],
  "people": [
   "Disciples (Biblical figures)"
  ],
  "subjects": [
   "Wisdom",
   "Holy Spirit",
   "Pentecost"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59680",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Miller, Mary Jane. Pentecost, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Mary Jane Miller, https://www.millericons.com/."
 },
 {
  "id": 59681,
  "title": "Pentecost (A Second Version)",
  "artist": "Miller, Mary Jane",
  "date": "2008",
  "where": "San Miguel de Allende, Guanajuato, Mexico",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Pentecost 2-Miller.jpg",
  "refs": [
   "Acts 2:1-21"
  ],
  "days": [
   "Year C Day of Pentecost",
   "Year A Day of Pentecost",
   "Year B Day of Pentecost"
  ],
  "people": [
   "Disciples (Biblical figures)"
  ],
  "subjects": [
   "Wisdom",
   "Holy Spirit",
   "Pentecost"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59681",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Miller, Mary Jane. Pentecost (A Second Version), from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Mary Jane Miller, https://www.millericons.com/."
 },
 {
  "id": 59682,
  "title": "Holy Baptism",
  "artist": "Miller, Mary Jane",
  "date": "2008",
  "where": "San Miguel de Allende, Guanajuato, Mexico",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Baptism-Miller.jpg",
  "refs": [
   "Mark 1:4-11",
   "Matthew 3:13-17",
   "Luke 3:15-17, 21-22",
   "Peter I, 3:18-22"
  ],
  "days": [
   "Year A Baptism of the Lord",
   "Year B Baptism of the Lord",
   "Year C Baptism of the Lord",
   "Year B Lent 1st Sunday"
  ],
  "people": [
   "Angels (Biblical figures)",
   "Jesus Christ (Biblical figure)",
   "John, the Baptist (Biblical figure)"
  ],
  "subjects": [
   "Baptism of Christ",
   "Baptism"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59682",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Miller, Mary Jane. Holy Baptism, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Mary Jane Miller, https://www.millericons.com/."
 },
 {
  "id": 59683,
  "title": "Extravagant Love",
  "artist": "Miller, Mary Jane",
  "date": "2008",
  "where": "San Miguel de Allende, Guanajuato, Mexico",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Extravagant Love-Miller.jpg",
  "refs": [
   "Matthew 26:14-27:66",
   "Mark 14:1-15:47",
   "Luke 7:36-8:3",
   "John 12:1-8"
  ],
  "days": [
   "Year A Liturgy of Pass",
   "Year B Liturgy of Pass",
   "Year C Lent 5th  Sunday",
   "Year C Proper 6th Sunday"
  ],
  "people": [
   "Jesus Christ (Biblical figure)",
   "Woman Who Bathed Christs Feet with Tears (Biblical figure)"
  ],
  "subjects": [
   "Anointing of Jesus"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59683",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Miller, Mary Jane. Extravagant Love, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Mary Jane Miller, https://www.millericons.com/."
 },
 {
  "id": 59684,
  "title": "Doubting Thomas",
  "artist": "Miller, Mary Jane",
  "date": "2008",
  "where": "San Miguel de Allende, Guanajuato, Mexico",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Doubting-Miller.jpg",
  "refs": [
   "John 20:19-31"
  ],
  "days": [
   "Year A Easter 2nd Sunday",
   "Year B Easter 2nd Sunday",
   "Year C Easter 2nd Sunday"
  ],
  "people": [
   "Jesus Christ (Biblical figure)",
   "Thomas, the Apostle (Biblical figure)",
   "Disciples (Biblical figures)"
  ],
  "subjects": [
   "Faith",
   "Doubt"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59684",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Miller, Mary Jane. Doubting Thomas, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Mary Jane Miller, https://www.millericons.com/."
 },
 {
  "id": 59685,
  "title": "Raising Tabitha",
  "artist": "Miller, Mary Jane",
  "date": "2008",
  "where": "San Miguel de Allende, Guanajuato, Mexico",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Raising Tabitha-Miller.jpg",
  "refs": [
   "Acts 9:36-43"
  ],
  "days": [
   "Year C Easter 4th Sunday"
  ],
  "people": [
   "Peter, the Apostle (Biblical figure)",
   "Tabitha (Biblical figure)"
  ],
  "subjects": [
   "Raising from the Dead"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59685",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Miller, Mary Jane. Raising Tabitha, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Mary Jane Miller, https://www.millericons.com/."
 },
 {
  "id": 59686,
  "title": "Samaritan at the Well",
  "artist": "Miller, Mary Jane",
  "date": "2008",
  "where": "San Miguel de Allende, Guanajuato, Mexico",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Samaritan Woman-Miller.jpg",
  "refs": [
   "John 4:5-42"
  ],
  "days": [
   "Year A Lent 3rd Sunday"
  ],
  "people": [
   "Jesus Christ (Biblical figure)",
   "Samaritan Woman (Biblical figure)"
  ],
  "subjects": [
   "Love",
   "Well"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59686",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Miller, Mary Jane. Samaritan at the Well, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Mary Jane Miller, https://www.millericons.com/."
 },
 {
  "id": 59687,
  "title": "Jesus Casts Out a Demon",
  "artist": "Miller, Mary Jane",
  "date": "2008",
  "where": "San Miguel de Allende, Guanajuato, Mexico",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Casting Out Demons-Miller.jpg",
  "refs": [
   "Luke 11:14-23"
  ],
  "days": [],
  "people": [
   "Jesus Christ (Biblical figure)"
  ],
  "subjects": [
   "Demons"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59687",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Miller, Mary Jane. Jesus Casts Out a Demon, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Mary Jane Miller, https://www.millericons.com/."
 },
 {
  "id": 59688,
  "title": "First Apostle to the Apostles",
  "artist": "Miller, Mary Jane",
  "date": "2008",
  "where": "San Miguel de Allende, Guanajuato, Mexico",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Apostle to the Apostles-Miller.jpg",
  "refs": [
   "John 20:1-18"
  ],
  "days": [
   "Year A Resurrection of the Lord",
   "Year B Resurrection of the Lord",
   "Year C Resurrection of the Lord"
  ],
  "people": [
   "Jesus Christ (Biblical figure)",
   "Mary Magdalene (Biblical figure)"
  ],
  "subjects": [
   "Resurrection of Jesus",
   "Tree of Life"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59688",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Miller, Mary Jane. First Apostle to the Apostles, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Mary Jane Miller, https://www.millericons.com/."
 },
 {
  "id": 59763,
  "title": "Peter Walking on Water",
  "artist": "Miller, Mary Jane",
  "date": "2008",
  "where": "San Miguel de Allende, Guanajuato, Mexico",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Peter Walking-2389hd-bw.jpg",
  "refs": [
   "Matthew 14:13-21"
  ],
  "days": [
   "Year A Proper 14th Sunday"
  ],
  "people": [
   "Jesus Christ (Biblical figure)",
   "Peter, the Apostle (Biblical figure)",
   "Disciples (Biblical figures)"
  ],
  "subjects": [
   "Faith",
   "Jesus Walks on Water"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59763",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Miller, Mary Jane. Peter Walking on Water, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Mary Jane Miller, https://www.millericons.com/."
 },
 {
  "id": 57467,
  "title": "On the Road to Emmaus",
  "artist": "Hochhalter, Cara B.",
  "date": "2019",
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/On the Road to Emmaus - CH.jpg",
  "refs": [
   "Luke 24:13-49"
  ],
  "days": [
   "Year A Easter 3rd Sunday",
   "Year B Easter Evening",
   "Year A Easter Evening"
  ],
  "people": [
   "Jesus Christ (Biblical figure)",
   "Disciples (Biblical figures)"
  ],
  "subjects": [
   "Emmaus: Road"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/57467",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Hochhalter, Cara B.. On the Road to Emmaus, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Cara B. Hochhalter."
 },
 {
  "id": 57491,
  "title": "Maundy Thursday Foot-Washing",
  "artist": "Hochhalter, Cara B.",
  "date": "2019",
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Maundy Thursday Foot-Washing  - CH.jpg",
  "refs": [
   "John 13:1-17, 31b-35"
  ],
  "days": [
   "Year A Maundy Thursday",
   "Year B Maundy Thursday",
   "Year C Maundy Thursday"
  ],
  "people": [
   "Jesus Christ (Biblical figure)",
   "Disciples (Biblical figures)"
  ],
  "subjects": [
   "Footwashing",
   "Jesus Washes Disciples Feet",
   "Service"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/57491",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Hochhalter, Cara B.. Maundy Thursday Foot-Washing, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Cara B. Hochhalter."
 },
 {
  "id": 57507,
  "title": "A Parable - The Mustard Seed",
  "artist": "Hochhalter, Cara B.",
  "date": "2019",
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/A Parable - The Mustard Seed - CH.jpg",
  "refs": [
   "Mark 4:26-34",
   "Luke 13:18-19"
  ],
  "days": [
   "Year B Proper 6th Sunday"
  ],
  "people": [],
  "subjects": [
   "Parable of the Mustard Seed",
   "Kingdom of God",
   "Mustard Seed"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/57507",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Hochhalter, Cara B.. A Parable - The Mustard Seed, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Cara B. Hochhalter."
 },
 {
  "id": 57515,
  "title": "Communion/Eucharist",
  "artist": "Hochhalter, Cara B.",
  "date": "2019",
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Communion - Eucharist - CH.jpg",
  "refs": [
   "John 6:24-35"
  ],
  "days": [
   "Year B Proper 13th Sunday"
  ],
  "people": [],
  "subjects": [
   "Eucharist",
   "Communion"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/57515",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Hochhalter, Cara B.. Communion/Eucharist, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Cara B. Hochhalter."
 },
 {
  "id": 57553,
  "title": "Feeding the Multitudes",
  "artist": "Hochhalter, Cara B.",
  "date": "2019",
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Feeding the Multitudes - CH.jpg",
  "refs": [
   "Matthew 14:13-21"
  ],
  "days": [
   "Year A Proper 13th Sunday"
  ],
  "people": [
   "Jesus Christ (Biblical figure)",
   "Disciples (Biblical figures)"
  ],
  "subjects": [
   "Feeding the Multitude",
   "Giving thanks",
   "Stewardship"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/57553",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Hochhalter, Cara B.. Feeding the Multitudes, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Cara B. Hochhalter."
 },
 {
  "id": 58481,
  "title": "Abraham's Sacrifice",
  "artist": "Koenig, Peter",
  "date": "1970",
  "where": "United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Koenig-sacrifice2398y8.jpg",
  "refs": [
   "Genesis 22:1-18",
   "Genesis 22:1-14"
  ],
  "days": [
   "Year A Easter Vigil",
   "Year A Proper 8th Sunday"
  ],
  "people": [
   "Abraham (Biblical figure)",
   "Isaac (Biblical figure)",
   "Angel (Biblical figure)"
  ],
  "subjects": [
   "Sacrifice of Isaac"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/58481",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Koenig, Peter. Abraham's Sacrifice, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Peter Winfried (Canisius) Koenig, https://www.pwkoenig.co.uk/."
 },
 {
  "id": 58482,
  "title": "Boy and Snake",
  "artist": "Koenig, Peter",
  "date": "1985",
  "where": "United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Koenig-snake897923yhe78.jpg",
  "refs": [
   "Isaiah 11:1-10"
  ],
  "days": [
   "Year A Advent 2nd  Sunday"
  ],
  "people": [],
  "subjects": [
   "Serpent",
   "Peace",
   "Boy"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/58482",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Koenig, Peter. Boy and Snake, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Peter Winfried (Canisius) Koenig, https://www.pwkoenig.co.uk/."
 },
 {
  "id": 58483,
  "title": "Jacob Wrestles with the Angel",
  "artist": "Koenig, Peter",
  "date": "20th century",
  "where": "United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Koenig-jacob9382eh78.jpg",
  "refs": [
   "Genesis 32:22-31"
  ],
  "days": [
   "Year A Proper 13th Sunday"
  ],
  "people": [
   "Jacob (Biblical figure)",
   "Angel (Biblical figure)"
  ],
  "subjects": [],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/58483",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Koenig, Peter. Jacob Wrestles with the Angel, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Peter Winfried (Canisius) Koenig, https://www.pwkoenig.co.uk/."
 },
 {
  "id": 58484,
  "title": "My Vineyard",
  "artist": "Koenig, Peter",
  "date": "20th century",
  "where": "United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Koenig-vineyard89273.jpg",
  "refs": [
   "Isaiah 5:1-7"
  ],
  "days": [
   "Year A Proper 22nd Sunday"
  ],
  "people": [],
  "subjects": [
   "Vineyard"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/58484",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Koenig, Peter. My Vineyard, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Peter Winfried (Canisius) Koenig, https://www.pwkoenig.co.uk/."
 },
 {
  "id": 58485,
  "title": "Swords into Ploughshares",
  "artist": "Koenig, Peter",
  "date": "20th century",
  "where": "United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Koenig-Swords into Ploughshares-288275.jpg",
  "refs": [
   "Isaiah 2:1-5"
  ],
  "days": [
   "Year A Advent 1st Sunday"
  ],
  "people": [],
  "subjects": [
   "Peace"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/58485",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Koenig, Peter. Swords into Ploughshares, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Peter Winfried (Canisius) Koenig, https://www.pwkoenig.co.uk/."
 },
 {
  "id": 58486,
  "title": "Great Peace",
  "artist": "Koenig, Peter",
  "date": "20th century",
  "where": "United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Koenig-peace9823hd8.jpg",
  "refs": [
   "Isaiah 11:1-10"
  ],
  "days": [
   "Year A Advent 2nd  Sunday"
  ],
  "people": [],
  "subjects": [
   "Peace",
   "Lamb",
   "Wolf"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/58486",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Koenig, Peter. Great Peace, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Peter Winfried (Canisius) Koenig, https://www.pwkoenig.co.uk/."
 },
 {
  "id": 58487,
  "title": "Grasshopper",
  "artist": "Koenig, Peter",
  "date": "1993",
  "where": "United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Koenig-grass98hq78g.jpg",
  "refs": [
   "Isaiah 40:21-31"
  ],
  "days": [
   "Year B Epiphany 5th Sunday"
  ],
  "people": [],
  "subjects": [],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/58487",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Koenig, Peter. Grasshopper, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Peter Winfried (Canisius) Koenig, https://www.pwkoenig.co.uk/."
 },
 {
  "id": 58488,
  "title": "Hope for a Tree",
  "artist": "Koenig, Peter",
  "date": "20th century",
  "where": "United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Koenig-tree896r.jpg",
  "refs": [
   "Job 14:1-14"
  ],
  "days": [
   "Year A Holy Saturday"
  ],
  "people": [],
  "subjects": [
   "Hope",
   "Tree"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/58488",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Koenig, Peter. Hope for a Tree, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Peter Winfried (Canisius) Koenig, https://www.pwkoenig.co.uk/."
 },
 {
  "id": 58489,
  "title": "Drowning of Pharaoh's Army",
  "artist": "Koenig, Peter",
  "date": "20th century",
  "where": "United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Koenig-drown9823hd78.jpg",
  "refs": [
   "Exodus 14:19-31"
  ],
  "days": [
   "Year A Proper 19th Sunday"
  ],
  "people": [],
  "subjects": [],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/58489",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Koenig, Peter. Drowning of Pharaoh's Army, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Peter Winfried (Canisius) Koenig, https://www.pwkoenig.co.uk/."
 },
 {
  "id": 58490,
  "title": "The Ship of the Church",
  "artist": "Koenig, Peter",
  "date": "20th century",
  "where": "United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Koenig-ship2983hd7.jpg",
  "refs": [
   "Genesis 6:9-22; 7:24; 8:14-19",
   "Mark 4:35-41",
   "Peter I, 3:18-22"
  ],
  "days": [
   "Year A Proper 4th Sunday",
   "Year B Lent 1st Sunday",
   "Year B Proper 7th Sunday"
  ],
  "people": [],
  "subjects": [
   "Animals",
   "Church",
   "Flood in Genesis",
   "Noahs Ark",
   "Cross",
   "Sea"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/58490",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Koenig, Peter. The Ship of the Church, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Peter Winfried (Canisius) Koenig, https://www.pwkoenig.co.uk/."
 },
 {
  "id": 58492,
  "title": "Elijah and Elisha",
  "artist": "Koenig, Peter",
  "date": "1963",
  "where": "United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Koenig-27386g76.jpg",
  "refs": [
   "Kings II, 2:1-18"
  ],
  "days": [
   "Year C Proper 8th Sunday"
  ],
  "people": [
   "Elijah (Biblical figure)",
   "Elisha (Biblical figure)"
  ],
  "subjects": [
   "Horses",
   "Chariot"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/58492",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Koenig, Peter. Elijah and Elisha, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Peter Winfried (Canisius) Koenig, https://www.pwkoenig.co.uk/."
 },
 {
  "id": 58493,
  "title": "Shadow of Your Wings",
  "artist": "Koenig, Peter",
  "date": "1980",
  "where": "United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Koenig-wings873yheu.jpg",
  "refs": [
   "Psalm 17:1-9"
  ],
  "days": [
   "Year C Proper 27th Sunday"
  ],
  "people": [],
  "subjects": [],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/58493",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Koenig, Peter. Shadow of Your Wings, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Peter Winfried (Canisius) Koenig, https://www.pwkoenig.co.uk/."
 },
 {
  "id": 58495,
  "title": "Like a Deer Leaping Mountains",
  "artist": "Koenig, Peter",
  "date": "20th century",
  "where": "United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Koenig-deer32897y.jpg",
  "refs": [
   "Song of Solomon 2:8-13"
  ],
  "days": [
   "Year B Proper 17th Sunday",
   "Year A Proper 9th Sunday"
  ],
  "people": [],
  "subjects": [
   "Love",
   "Culture: Black",
   "Beloved"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/58495",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Koenig, Peter. Like a Deer Leaping Mountains, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Peter Winfried (Canisius) Koenig, https://www.pwkoenig.co.uk/."
 },
 {
  "id": 58496,
  "title": "Lattice Window",
  "artist": "Koenig, Peter",
  "date": "20th century",
  "where": "United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Koenig-window8976t7.jpg",
  "refs": [
   "Song of Solomon 2:8-13"
  ],
  "days": [
   "Year B Proper 17th Sunday",
   "Year A Proper 9th Sunday"
  ],
  "people": [],
  "subjects": [
   "Love",
   "Culture: Black",
   "Beloved"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/58496",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Koenig, Peter. Lattice Window, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Peter Winfried (Canisius) Koenig, https://www.pwkoenig.co.uk/."
 },
 {
  "id": 58497,
  "title": "Daniel in the Lion's Den",
  "artist": "Koenig, Peter",
  "date": "1967",
  "where": "United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Koenig-lions8956rf6.jpg",
  "refs": [
   "Daniel 6"
  ],
  "days": [],
  "people": [
   "Daniel (Biblical figure)"
  ],
  "subjects": [
   "Lions"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/58497",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Koenig, Peter. Daniel in the Lion's Den, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Peter Winfried (Canisius) Koenig, https://www.pwkoenig.co.uk/."
 },
 {
  "id": 58498,
  "title": "Christmas Triptych",
  "artist": "Koenig, Peter",
  "date": "1990",
  "where": "United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Peter_Koenig_Christmas_Triptych.jpg",
  "refs": [
   "John 2:1-11",
   "Matthew 2:1-12",
   "Acts 7:55-60",
   "Isaiah 2:1-5",
   "John 15:1-8",
   "Matthew 3:13-17",
   "Isaiah 40:1-11"
  ],
  "days": [
   "Year C Epiphany 2nd Sunday",
   "Year A Epiphany of the Lord",
   "Year A Easter 5th Sunday",
   "Year A Advent 1st Sunday",
   "Year A Baptism of the Lord",
   "Year B Advent 2nd  Sunday"
  ],
  "people": [
   "Mary, the mother of Jesus (Biblical figure)",
   "Jesus Christ (Biblical figure)",
   "Stephen (martyr), ca.5-33",
   "John, the Baptist (Biblical figure)",
   "Wise Men (Biblical figures)"
  ],
  "subjects": [
   "Marriage at Cana",
   "Adoration of the Magi",
   "Peace",
   "Vine",
   "Baptism of Christ",
   "Stoning"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/58498",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Koenig, Peter. Christmas Triptych, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Peter Winfried (Canisius) Koenig, https://www.pwkoenig.co.uk/."
 },
 {
  "id": 58499,
  "title": "The Good Shepherd and the Leviathan",
  "artist": "Koenig, Peter",
  "date": "20th century",
  "where": "Private Collection, United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Koenig-shepherd238276t.jpg",
  "refs": [
   "John 10:11-18",
   "John 10:1-10"
  ],
  "days": [
   "Year B Easter 4th Sunday",
   "Year A Easter 4th Sunday"
  ],
  "people": [
   "Jesus Christ (Biblical figure)"
  ],
  "subjects": [
   "Sheep",
   "Good Shepherd",
   "Leviathan"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/58499",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Koenig, Peter. The Good Shepherd and the Leviathan, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Peter Winfried (Canisius) Koenig, https://www.pwkoenig.co.uk/."
 },
 {
  "id": 58500,
  "title": "Christ the Vine",
  "artist": "Koenig, Peter",
  "date": "20th century",
  "where": "United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Koenig-vine9567g7.jpg",
  "refs": [
   "John 15:1-8"
  ],
  "days": [
   "Year B Easter 5th Sunday"
  ],
  "people": [
   "Jesus Christ (Biblical figure)"
  ],
  "subjects": [
   "Vine"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/58500",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Koenig, Peter. Christ the Vine, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Peter Winfried (Canisius) Koenig, https://www.pwkoenig.co.uk/."
 },
 {
  "id": 58501,
  "title": "Hen and Fox",
  "artist": "Koenig, Peter",
  "date": "20th century",
  "where": "United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Koenig-hen9089y78.jpg",
  "refs": [
   "Luke 13:31-35"
  ],
  "days": [
   "Year C Lent 2nd Sunday"
  ],
  "people": [],
  "subjects": [
   "Fox",
   "Jerusalem",
   "Lament",
   "Hen"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/58501",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Koenig, Peter. Hen and Fox, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Peter Winfried (Canisius) Koenig, https://www.pwkoenig.co.uk/."
 },
 {
  "id": 58502,
  "title": "Parable of the Yeast",
  "artist": "Koenig, Peter",
  "date": "1975",
  "where": "United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Koenig-yeast9089yh.jpg",
  "refs": [
   "Matthew 13:31-33, 44-52"
  ],
  "days": [
   "Year A Proper 12th Sunday"
  ],
  "people": [
   "Jesus Christ (Biblical figure)"
  ],
  "subjects": [
   "Woman",
   "Parable of the Leaven"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/58502",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Koenig, Peter. Parable of the Yeast, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Peter Winfried (Canisius) Koenig, https://www.pwkoenig.co.uk/."
 },
 {
  "id": 58503,
  "title": "Lazarus at the Gate",
  "artist": "Koenig, Peter",
  "date": "20th century",
  "where": "United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Koenig-lazar93829ye87.jpg",
  "refs": [
   "Luke 16:19-31"
  ],
  "days": [
   "Year C Proper 21st Sunday"
  ],
  "people": [
   "Lazarus (of Luke 16:19-21, Biblical figure)"
  ],
  "subjects": [
   "Dog"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/58503",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Koenig, Peter. Lazarus at the Gate, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Peter Winfried (Canisius) Koenig, https://www.pwkoenig.co.uk/."
 },
 {
  "id": 58504,
  "title": "A House Built on Rock",
  "artist": "Koenig, Peter",
  "date": "2018",
  "where": "United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Koenig-house23jhd8m.jpg",
  "refs": [
   "Mark 3:20-35",
   "Matthew 7:21-29",
   "Luke 6:39-49"
  ],
  "days": [
   "Year A Proper 4th Sunday",
   "Year B Proper 5th Sunday",
   "Year C Epiphany 8th Sunday",
   "Year A Epiphany 9th Sunday"
  ],
  "people": [],
  "subjects": [
   "Rock",
   "Flood",
   "House"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/58504",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Koenig, Peter. A House Built on Rock, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Peter Winfried (Canisius) Koenig, https://www.pwkoenig.co.uk/."
 },
 {
  "id": 58505,
  "title": "Prodigal and the Pigs",
  "artist": "Koenig, Peter",
  "date": "2018",
  "where": "United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Koenig-prodigal8932yhu.jpg",
  "refs": [
   "Luke 15:1-3, 11b-32"
  ],
  "days": [
   "Year C Lent 4th Sunday"
  ],
  "people": [],
  "subjects": [
   "Parable of the Prodigal Son"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/58505",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Koenig, Peter. Prodigal and the Pigs, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Peter Winfried (Canisius) Koenig, https://www.pwkoenig.co.uk/."
 },
 {
  "id": 58506,
  "title": "Prodigal Son",
  "artist": "Koenig, Peter",
  "date": "20th century",
  "where": "United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Koenig-prod-son0923879yh.jpg",
  "refs": [
   "Luke 15:1-3, 11b-32"
  ],
  "days": [
   "Year C Lent 4th Sunday"
  ],
  "people": [],
  "subjects": [
   "Parable of the Prodigal Son",
   "Feasting"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/58506",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Koenig, Peter. Prodigal Son, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Peter Winfried (Canisius) Koenig, https://www.pwkoenig.co.uk/."
 },
 {
  "id": 58507,
  "title": "Treasure in the Field",
  "artist": "Koenig, Peter",
  "date": "20th century",
  "where": "United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Koenig-field899u87.jpg",
  "refs": [
   "Matthew 13:31-33, 44-52"
  ],
  "days": [
   "Year A Proper 12th Sunday"
  ],
  "people": [],
  "subjects": [
   "Field"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/58507",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Koenig, Peter. Treasure in the Field, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Peter Winfried (Canisius) Koenig, https://www.pwkoenig.co.uk/."
 },
 {
  "id": 58508,
  "title": "A House Built on Rock (2)",
  "artist": "Koenig, Peter",
  "date": "2018",
  "where": "United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Koenig-house2h89dhbk.jpg",
  "refs": [
   "Mark 3:20-35",
   "Matthew 7:21-29",
   "Luke 6:39-49"
  ],
  "days": [
   "Year A Proper 4th Sunday",
   "Year B Proper 5th Sunday",
   "Year C Epiphany 8th Sunday",
   "Year A Epiphany 9th Sunday"
  ],
  "people": [],
  "subjects": [
   "Rock",
   "Flood",
   "House"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/58508",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Koenig, Peter. A House Built on Rock (2), from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Peter Winfried (Canisius) Koenig, https://www.pwkoenig.co.uk/."
 },
 {
  "id": 58509,
  "title": "Christ the Teacher",
  "artist": "Koenig, Peter",
  "date": "20th century",
  "where": "United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Koenig-teach2398749y78y.jpg",
  "refs": [
   "Luke 11:1-13",
   "Luke 16:19-31",
   "Luke 15:1-3, 11b-32",
   "Matthew 7:21-29",
   "Matthew 15:(10-20), 21-28",
   "Mark 10:17-31"
  ],
  "days": [
   "Year C Proper 12th Sunday",
   "Year C Proper 21st Sunday",
   "Year B Proper 23rd Sunday",
   "Year C Lent 4th Sunday",
   "Year A Proper 15th Sunday",
   "Year A Epiphany 9th Sunday"
  ],
  "people": [
   "Jesus Christ (Biblical figure)",
   "Lazarus (of Luke 16:19-21, Biblical figure)"
  ],
  "subjects": [
   "Scorpion",
   "Rock",
   "Parable of the Prodigal Son",
   "House"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/58509",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Koenig, Peter. Christ the Teacher, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Peter Winfried (Canisius) Koenig, https://www.pwkoenig.co.uk/."
 },
 {
  "id": 58510,
  "title": "True Shepherd and the Wolves",
  "artist": "Koenig, Peter",
  "date": "20th century",
  "where": "United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Koenig-shep9302jd78.jpg",
  "refs": [
   "John 10:11-18",
   "John 10:1-10"
  ],
  "days": [
   "Year B Easter 4th Sunday",
   "Year A Easter 4th Sunday"
  ],
  "people": [
   "Jesus Christ (Biblical figure)"
  ],
  "subjects": [
   "Sheep",
   "Good Shepherd",
   "Wolf"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/58510",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Koenig, Peter. True Shepherd and the Wolves, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Peter Winfried (Canisius) Koenig, https://www.pwkoenig.co.uk/."
 },
 {
  "id": 58511,
  "title": "I am the Gate",
  "artist": "Koenig, Peter",
  "date": "20th century",
  "where": "United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Koenig-gate902378yhey78.jpg",
  "refs": [
   "John 10:1-10"
  ],
  "days": [
   "Year A Easter 4th Sunday"
  ],
  "people": [
   "Jesus Christ (Biblical figure)"
  ],
  "subjects": [],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/58511",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Koenig, Peter. I am the Gate, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Peter Winfried (Canisius) Koenig, https://www.pwkoenig.co.uk/."
 },
 {
  "id": 58512,
  "title": "Mary and Elizabeth",
  "artist": "Koenig, Peter",
  "date": "1967",
  "where": "United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Koenig-visita2398798yh78.jpg",
  "refs": [
   "Luke 1:39-57"
  ],
  "days": [
   "Year A Visitation of Mary to Elizabeth"
  ],
  "people": [
   "Mary, the mother of Jesus (Biblical figure)",
   "Elizabeth (Biblical figure)"
  ],
  "subjects": [
   "Visitation"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/58512",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Koenig, Peter. Mary and Elizabeth, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Peter Winfried (Canisius) Koenig, https://www.pwkoenig.co.uk/."
 },
 {
  "id": 58515,
  "title": "Baptism of Christ",
  "artist": "Koenig, Peter",
  "date": "1963",
  "where": "Parish of St. Edward, Kettering, United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Koenig-baptism298378tyg678h.jpg",
  "refs": [
   "Matthew 3:13-17"
  ],
  "days": [
   "Year A Baptism of the Lord"
  ],
  "people": [
   "Jesus Christ (Biblical figure)",
   "John, the Baptist (Biblical figure)"
  ],
  "subjects": [
   "Baptism of Christ"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/58515",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Koenig, Peter. Baptism of Christ, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Peter Winfried (Canisius) Koenig, https://www.pwkoenig.co.uk/."
 },
 {
  "id": 58516,
  "title": "Temptation of Christ",
  "artist": "Koenig, Peter",
  "date": "20th century",
  "where": "Parish of St. Edward, Kettering, United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Koenig-tempt2309798yhui.jpg",
  "refs": [
   "Luke 4:1-13"
  ],
  "days": [
   "Year C Lent 1st Sunday"
  ],
  "people": [
   "Jesus Christ (Biblical figure)"
  ],
  "subjects": [
   "Temptation of Christ"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/58516",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Koenig, Peter. Temptation of Christ, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Peter Winfried (Canisius) Koenig, https://www.pwkoenig.co.uk/."
 },
 {
  "id": 58517,
  "title": "St. Peter and St. Andrew",
  "artist": "Koenig, Peter",
  "date": "20th century",
  "where": "United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Koenig-fisherm23978t76tfv.jpg",
  "refs": [
   "Matthew 4:12-23"
  ],
  "days": [
   "Year A Epiphany 3rd Sunday"
  ],
  "people": [
   "Peter, the Apostle (Biblical figure)",
   "Andrew, the Apostle (Biblical figure)"
  ],
  "subjects": [
   "Fish",
   "Calling of the disciples"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/58517",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Koenig, Peter. St. Peter and St. Andrew, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Peter Winfried (Canisius) Koenig, https://www.pwkoenig.co.uk/."
 },
 {
  "id": 58518,
  "title": "Draft of Fishes",
  "artist": "Koenig, Peter",
  "date": "20th century",
  "where": "United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/CEpip05bw.jpg",
  "refs": [
   "Luke 5:1-11"
  ],
  "days": [
   "Year C Epiphany 5th Sunday"
  ],
  "people": [
   "Jesus Christ (Biblical figure)",
   "Disciples (Biblical figures)"
  ],
  "subjects": [
   "Fish",
   "Calling of the disciples",
   "Miraculous Catch of Fish"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/58518",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Koenig, Peter. Draft of Fishes, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Peter Winfried (Canisius) Koenig, https://www.pwkoenig.co.uk/."
 },
 {
  "id": 58519,
  "title": "Wedding at Cana",
  "artist": "Koenig, Peter",
  "date": "20th century",
  "where": "United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Koenig-wedding3298y7u6ty87.jpg",
  "refs": [
   "John 2:1-11"
  ],
  "days": [
   "Year C Epiphany 2nd Sunday"
  ],
  "people": [],
  "subjects": [
   "Marriage at Cana"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/58519",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Koenig, Peter. Wedding at Cana, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Peter Winfried (Canisius) Koenig, https://www.pwkoenig.co.uk/."
 },
 {
  "id": 58520,
  "title": "Christ Overturns the Tables of the Moneylenders",
  "artist": "Koenig, Peter",
  "date": "2015",
  "where": "United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Koenig-temple9238hei87tug6t.jpg",
  "refs": [
   "John 2:13-22"
  ],
  "days": [
   "Year B Lent 3rd Sunday"
  ],
  "people": [
   "Jesus Christ (Biblical figure)"
  ],
  "subjects": [
   "Cleansing of the Temple"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/58520",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Koenig, Peter. Christ Overturns the Tables of the Moneylenders, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Peter Winfried (Canisius) Koenig, https://www.pwkoenig.co.uk/."
 },
 {
  "id": 58521,
  "title": "Christ at the Well",
  "artist": "Koenig, Peter",
  "date": "20th century",
  "where": "United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Koenig-well09856ghb.jpg",
  "refs": [
   "John 4:5-42"
  ],
  "days": [
   "Year A Lent 3rd Sunday"
  ],
  "people": [
   "Jesus Christ (Biblical figure)",
   "Woman at the well (Biblical figure)"
  ],
  "subjects": [
   "Living Water"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/58521",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Koenig, Peter. Christ at the Well, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Peter Winfried (Canisius) Koenig, https://www.pwkoenig.co.uk/."
 },
 {
  "id": 58522,
  "title": "Calming of the Storm",
  "artist": "Koenig, Peter",
  "date": "1995",
  "where": "United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Koenig-storm32895u4yuu78.jpg",
  "refs": [
   "Mark 4:35-41"
  ],
  "days": [
   "Year B Proper 7th Sunday"
  ],
  "people": [
   "Jesus Christ (Biblical figure)",
   "Disciples (Biblical figures)"
  ],
  "subjects": [
   "Jesus Calms the Storm"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/58522",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Koenig, Peter. Calming of the Storm, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Peter Winfried (Canisius) Koenig, https://www.pwkoenig.co.uk/."
 },
 {
  "id": 58523,
  "title": "Ten Lepers",
  "artist": "Koenig, Peter",
  "date": "1972",
  "where": "United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Koenig-lepers918236yegh67.jpg",
  "refs": [
   "Luke 17:11-19"
  ],
  "days": [
   "Year A Thanksgiving Day"
  ],
  "people": [
   "Jesus Christ (Biblical figure)"
  ],
  "subjects": [
   "Healing",
   "Giving thanks",
   "Cleansing Ten Lepers"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/58523",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Koenig, Peter. Ten Lepers, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Peter Winfried (Canisius) Koenig, https://www.pwkoenig.co.uk/."
 },
 {
  "id": 58524,
  "title": "Paralytic at Capernaum",
  "artist": "Koenig, Peter",
  "date": "20th century",
  "where": "Parish of St. Edward, Kettering, United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Koenig-para2389jh78t665.jpg",
  "refs": [
   "Mark 2:1-12"
  ],
  "days": [
   "Year B Epiphany 7th Sunday"
  ],
  "people": [
   "Jesus Christ (Biblical figure)"
  ],
  "subjects": [
   "Healing",
   "Paralytic"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/58524",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Koenig, Peter. Paralytic at Capernaum, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Peter Winfried (Canisius) Koenig, https://www.pwkoenig.co.uk/."
 },
 {
  "id": 58526,
  "title": "Casting Out Evil Spirits",
  "artist": "Koenig, Peter",
  "date": "1991",
  "where": "United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Koenig-demon2389785tgyuh78.jpg",
  "refs": [
   "Luke 8:26-39"
  ],
  "days": [
   "Year C Proper 7th Sunday"
  ],
  "people": [
   "Jesus Christ (Biblical figure)"
  ],
  "subjects": [
   "Demons"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/58526",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Koenig, Peter. Casting Out Evil Spirits, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Peter Winfried (Canisius) Koenig, https://www.pwkoenig.co.uk/."
 },
 {
  "id": 58527,
  "title": "Walking on Water",
  "artist": "Koenig, Peter",
  "date": "20th century",
  "where": "Parish of St. Edward, Kettering, United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Koenig-water8923juhe78.jpg",
  "refs": [
   "John 6:1-21",
   "Matthew 14:22-33"
  ],
  "days": [
   "Year B Proper 12th Sunday",
   "Year A Proper 14th Sunday"
  ],
  "people": [
   "Jesus Christ (Biblical figure)",
   "Disciples (Biblical figures)"
  ],
  "subjects": [
   "Sea",
   "Jesus Walks on Water"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/58527",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Koenig, Peter. Walking on Water, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Peter Winfried (Canisius) Koenig, https://www.pwkoenig.co.uk/."
 },
 {
  "id": 58528,
  "title": "Widow's Son",
  "artist": "Koenig, Peter",
  "date": "20th century",
  "where": "United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Koenig-nain9302jnd87.jpg",
  "refs": [
   "Luke 7:11-17"
  ],
  "days": [
   "Year C Proper 5th Sunday"
  ],
  "people": [
   "Jesus Christ (Biblical figure)",
   "Widow of Nain (Biblical figure)"
  ],
  "subjects": [
   "Raising from the Dead"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/58528",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Koenig, Peter. Widow's Son, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Peter Winfried (Canisius) Koenig, https://www.pwkoenig.co.uk/."
 },
 {
  "id": 58529,
  "title": "Transfiguration",
  "artist": "Koenig, Peter",
  "date": "20th century",
  "where": "United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Koenig-trans3892yef786.jpg",
  "refs": [
   "Mark 9:2-9"
  ],
  "days": [
   "Year B Transfiguration Sunday"
  ],
  "people": [
   "Moses (Biblical figure)",
   "Jesus Christ (Biblical figure)",
   "Elijah (Biblical figure)",
   "Disciples (Biblical figures)"
  ],
  "subjects": [
   "Transfiguration of Jesus"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/58529",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Koenig, Peter. Transfiguration, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Peter Winfried (Canisius) Koenig, https://www.pwkoenig.co.uk/."
 },
 {
  "id": 58530,
  "title": "The Daughter of the Canaanite Woman",
  "artist": "Koenig, Peter",
  "date": "2016",
  "where": "United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Koenig-daughter2389n87d67.jpg",
  "refs": [
   "Mark 7:24-37",
   "Matthew 15:(10-20), 21-28"
  ],
  "days": [
   "Year B Proper 18th Sunday",
   "Year A Proper 15th Sunday"
  ],
  "people": [
   "Jesus Christ (Biblical figure)",
   "Canaanite Woman (Biblical figure)"
  ],
  "subjects": [
   "Dog"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/58530",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Koenig, Peter. The Daughter of the Canaanite Woman, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Peter Winfried (Canisius) Koenig, https://www.pwkoenig.co.uk/."
 },
 {
  "id": 58531,
  "title": "Palm Sunday",
  "artist": "Koenig, Peter",
  "date": "20th century",
  "where": "United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Koenig-palm84937trgybvh87.jpg",
  "refs": [
   "Luke 19:28-40",
   "Matthew 21:1-11",
   "Mark 11:1-11",
   "John 12:12-16"
  ],
  "days": [
   "Year C Liturgy of Palms",
   "Year A Liturgy of Palms",
   "Year B Liturgy of Palms"
  ],
  "people": [
   "Jesus Christ (Biblical figure)"
  ],
  "subjects": [
   "Entry into Jerusalem",
   "Nations",
   "Donkey",
   "Palm Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/58531",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Koenig, Peter. Palm Sunday, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Peter Winfried (Canisius) Koenig, https://www.pwkoenig.co.uk/."
 },
 {
  "id": 58532,
  "title": "Garden of Gethsemane",
  "artist": "Koenig, Peter",
  "date": "1967",
  "where": "United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Koenig-garden2398eh87.jpg",
  "refs": [
   "Mark 14:1-15:47"
  ],
  "days": [
   "Year B Liturgy of Pass"
  ],
  "people": [
   "Jesus Christ (Biblical figure)",
   "Disciples (Biblical figures)"
  ],
  "subjects": [
   "Prayer",
   "Passion of Jesus Christ: Gethsemane"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/58532",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Koenig, Peter. Garden of Gethsemane, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Peter Winfried (Canisius) Koenig, https://www.pwkoenig.co.uk/."
 },
 {
  "id": 58533,
  "title": "Christ Washes the Feet of Peter",
  "artist": "Koenig, Peter",
  "date": "1967",
  "where": "United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Koenig-feet8923he78g.jpg",
  "refs": [
   "John 13:1-17, 31b-35"
  ],
  "days": [
   "Year A Maundy Thursday"
  ],
  "people": [
   "Jesus Christ (Biblical figure)",
   "Peter, the Apostle (Biblical figure)",
   "Disciples (Biblical figures)"
  ],
  "subjects": [
   "Footwashing",
   "Jesus Washes Disciples Feet"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/58533",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Koenig, Peter. Christ Washes the Feet of Peter, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Peter Winfried (Canisius) Koenig, https://www.pwkoenig.co.uk/."
 },
 {
  "id": 58534,
  "title": "Judas' Kiss",
  "artist": "Koenig, Peter",
  "date": "20th century",
  "where": "Parish of St. Edward, Kettering, United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Koenig-kiss9023jnu7y8g.jpg",
  "refs": [
   "Matthew 26:14-27:66"
  ],
  "days": [
   "Year A Liturgy of Pass"
  ],
  "people": [
   "Jesus Christ (Biblical figure)",
   "Judas Iscariot (Biblical figure)"
  ],
  "subjects": [
   "Kiss of Judas"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/58534",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Koenig, Peter. Judas' Kiss, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Peter Winfried (Canisius) Koenig, https://www.pwkoenig.co.uk/."
 },
 {
  "id": 58535,
  "title": "Mocking of Christ",
  "artist": "Koenig, Peter",
  "date": "1979",
  "where": "United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Koenig-scourge2397yt8gb.jpg",
  "refs": [
   "Mark 14:1-15:47"
  ],
  "days": [
   "Year B Liturgy of Pass"
  ],
  "people": [
   "Jesus Christ (Biblical figure)"
  ],
  "subjects": [
   "Passion of Jesus Christ: Mocking of Christ"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/58535",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Koenig, Peter. Mocking of Christ, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Peter Winfried (Canisius) Koenig, https://www.pwkoenig.co.uk/."
 },
 {
  "id": 58536,
  "title": "They Cast Lots",
  "artist": "Koenig, Peter",
  "date": "2018",
  "where": "United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Koenig-lots2893hee78gb.jpg",
  "refs": [
   "Matthew 27:11-54",
   "Psalm 22"
  ],
  "days": [
   "Year A Liturgy of Pass",
   "Year A Good Friday"
  ],
  "people": [],
  "subjects": [
   "Soldier",
   "Casting Lots"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/58536",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Koenig, Peter. They Cast Lots, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Peter Winfried (Canisius) Koenig, https://www.pwkoenig.co.uk/."
 },
 {
  "id": 58537,
  "title": "Pilate Washes His Hands",
  "artist": "Koenig, Peter",
  "date": "2019",
  "where": "United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Koenig-pilate782ge67ff.jpg",
  "refs": [
   "Matthew 26:14-27:66"
  ],
  "days": [
   "Year A Liturgy of Pass"
  ],
  "people": [
   "Jesus Christ (Biblical figure)",
   "Pontius Pilate, 1st century"
  ],
  "subjects": [
   "Passion of Jesus Christ: Jesus before Pilate"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/58537",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Koenig, Peter. Pilate Washes His Hands, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Peter Winfried (Canisius) Koenig, https://www.pwkoenig.co.uk/."
 },
 {
  "id": 58538,
  "title": "Mary Meets Jesus After the Resurrection",
  "artist": "Koenig, Peter",
  "date": "20th century",
  "where": "United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Koenig-marym90j897y6.jpg",
  "refs": [
   "John 20:1-18"
  ],
  "days": [
   "Year A Resurrection of the Lord"
  ],
  "people": [
   "Jesus Christ (Biblical figure)",
   "Mary Magdalene (Biblical figure)"
  ],
  "subjects": [
   "Resurrection of Jesus",
   "Empty Tomb"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/58538",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Koenig, Peter. Mary Meets Jesus After the Resurrection, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Peter Winfried (Canisius) Koenig, https://www.pwkoenig.co.uk/."
 },
 {
  "id": 58539,
  "title": "Harvest Resurrection",
  "artist": "Koenig, Peter",
  "date": "1975",
  "where": "United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Koenig-harvest2389hed78.jpg",
  "refs": [
   "Corinthians I, 15:12-20"
  ],
  "days": [
   "Year B Easter 3rd Sunday",
   "Year C Epiphany 6th Sunday"
  ],
  "people": [
   "Jesus Christ (Biblical figure)"
  ],
  "subjects": [
   "Harvesting",
   "Resurrection"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/58539",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Koenig, Peter. Harvest Resurrection, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Peter Winfried (Canisius) Koenig, https://www.pwkoenig.co.uk/."
 },
 {
  "id": 58540,
  "title": "Road to Emmaus",
  "artist": "Koenig, Peter",
  "date": "1982",
  "where": "United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Koenig-road89u2jb237f.jpg",
  "refs": [
   "Luke 24:13-35"
  ],
  "days": [
   "Year A Easter 3rd Sunday"
  ],
  "people": [
   "Jesus Christ (Biblical figure)"
  ],
  "subjects": [
   "Emmaus: Road"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/58540",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Koenig, Peter. Road to Emmaus, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Peter Winfried (Canisius) Koenig, https://www.pwkoenig.co.uk/."
 },
 {
  "id": 58541,
  "title": "Breakfast on the Beach",
  "artist": "Koenig, Peter",
  "date": "late 20th century",
  "where": "Parish of St. Edward, Kettering, United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Koenig-beach2387wgd73.jpg",
  "refs": [
   "John 21:1-19"
  ],
  "days": [
   "Year C Easter 3rd Sunday"
  ],
  "people": [
   "Jesus Christ (Biblical figure)",
   "Disciples (Biblical figures)"
  ],
  "subjects": [
   "Miraculous Catch of Fish"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/58541",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Koenig, Peter. Breakfast on the Beach, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Peter Winfried (Canisius) Koenig, https://www.pwkoenig.co.uk/."
 },
 {
  "id": 58542,
  "title": "Pentecost",
  "artist": "Koenig, Peter",
  "date": "1964",
  "where": "United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Koenig-pent389yh76.jpg",
  "refs": [
   "Acts 2:1-21"
  ],
  "days": [
   "Year A Day of Pentecost"
  ],
  "people": [],
  "subjects": [
   "Holy Spirit",
   "Pentecost"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/58542",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Koenig, Peter. Pentecost, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Peter Winfried (Canisius) Koenig, https://www.pwkoenig.co.uk/."
 },
 {
  "id": 58543,
  "title": "Conversion of St Paul",
  "artist": "Koenig, Peter",
  "date": "1965",
  "where": "United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Koenig-paul89237eyhg6.jpg",
  "refs": [
   "Acts 9:1-6, (7-20)"
  ],
  "days": [
   "Year C Easter 3rd Sunday"
  ],
  "people": [
   "Paul, the Apostle (Biblical figure)"
  ],
  "subjects": [
   "Conversion"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/58543",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Koenig, Peter. Conversion of St Paul, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Peter Winfried (Canisius) Koenig, https://www.pwkoenig.co.uk/."
 },
 {
  "id": 58545,
  "title": "Ceiling Painting for St Bede's",
  "artist": "Koenig, Peter",
  "date": "20th century",
  "where": "St Bede's Church, Newport Pagnell, United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Koenig-ceiling9283ye78.jpg",
  "refs": [
   "Matthew 4:12-23"
  ],
  "days": [
   "Year A Epiphany 3rd Sunday"
  ],
  "people": [
   "Disciples (Biblical figures)"
  ],
  "subjects": [
   "Fishing"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/58545",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Koenig, Peter. Ceiling Painting for St Bede's, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Peter Winfried (Canisius) Koenig, https://www.pwkoenig.co.uk/."
 },
 {
  "id": 58546,
  "title": "Tree of Life, Tree of Death",
  "artist": "Koenig, Peter",
  "date": "1983",
  "where": "United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Koenig-tree90ik3.jpg",
  "refs": [],
  "days": [],
  "people": [
   "Jesus Christ (Biblical figure)"
  ],
  "subjects": [
   "Cross",
   "Tree of Life"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/58546",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Koenig, Peter. Tree of Life, Tree of Death, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Peter Winfried (Canisius) Koenig, https://www.pwkoenig.co.uk/."
 },
 {
  "id": 58548,
  "title": "St Ignatius of Antioch",
  "artist": "Koenig, Peter",
  "date": "1984",
  "where": "United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Koenig-Ignatius908765rtfgvh.jpg",
  "refs": [],
  "days": [],
  "people": [
   "Ignatius, Bishop of Antioch"
  ],
  "subjects": [
   "Animals",
   "Saints",
   "Sea"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/58548",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Koenig, Peter. St Ignatius of Antioch, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Peter Winfried (Canisius) Koenig, https://www.pwkoenig.co.uk/."
 },
 {
  "id": 58549,
  "title": "St Christopher",
  "artist": "Koenig, Peter",
  "date": "20th century",
  "where": "United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Koenig-Chrisvmnjs8976yt.jpg",
  "refs": [],
  "days": [],
  "people": [
   "Jesus Christ (Biblical figure)",
   "Christopher, Saint, died ca.251"
  ],
  "subjects": [
   "Children",
   "Saints",
   "Cross"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/58549",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Koenig, Peter. St Christopher, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Peter Winfried (Canisius) Koenig, https://www.pwkoenig.co.uk/."
 },
 {
  "id": 58551,
  "title": "St Augustine",
  "artist": "Koenig, Peter",
  "date": "2020",
  "where": "St Augustine's Church, Milton Keynes, United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Koenig-Augus95nckps5.jpg",
  "refs": [],
  "days": [],
  "people": [
   "Augustine, Bishop of Hippo, 354-430"
  ],
  "subjects": [
   "Wisdom",
   "Faith",
   "Birds",
   "Sea"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/58551",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Koenig, Peter. St Augustine, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Peter Winfried (Canisius) Koenig, https://www.pwkoenig.co.uk/."
 },
 {
  "id": 58552,
  "title": "Pilate Washes His Hands, detail",
  "artist": "Koenig, Peter",
  "date": "2019",
  "where": "United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Koenig-Pilate-hands.jpg",
  "refs": [
   "Matthew 26:14-27:66"
  ],
  "days": [
   "Year A Liturgy of Pass"
  ],
  "people": [
   "Jesus Christ (Biblical figure)",
   "Pontius Pilate, 1st century"
  ],
  "subjects": [
   "Passion of Jesus Christ: Jesus before Pilate"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/58552",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Koenig, Peter. Pilate Washes His Hands, detail, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Peter Winfried (Canisius) Koenig, https://www.pwkoenig.co.uk/."
 },
 {
  "id": 58553,
  "title": "Pilate Washes His Hands, detail of Peter",
  "artist": "Koenig, Peter",
  "date": "2019",
  "where": "United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Koenig-Pilate-detail-denial.jpg",
  "refs": [
   "Matthew 26:14-27:66",
   "Mark 14:1-15:47",
   "Luke 22:14-23:56"
  ],
  "days": [
   "Year A Liturgy of Pass",
   "Year B Liturgy of Pass",
   "Year C Liturgy of Pass"
  ],
  "people": [
   "Jesus Christ (Biblical figure)",
   "Peter, the Apostle (Biblical figure)",
   "Pontius Pilate, 1st century"
  ],
  "subjects": [
   "Passion of Jesus Christ: Denial of Peter"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/58553",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Koenig, Peter. Pilate Washes His Hands, detail of Peter, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Peter Winfried (Canisius) Koenig, https://www.pwkoenig.co.uk/."
 },
 {
  "id": 58555,
  "title": "I am the Gate, detail of Christ",
  "artist": "Koenig, Peter",
  "date": "20th century",
  "where": "United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Koenig-gate-detail-God-Christ.jpg",
  "refs": [
   "John 10:1-10"
  ],
  "days": [
   "Year A Easter 4th Sunday"
  ],
  "people": [
   "Jesus Christ (Biblical figure)"
  ],
  "subjects": [
   "Garden"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/58555",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Koenig, Peter. I am the Gate, detail of Christ, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Peter Winfried (Canisius) Koenig, https://www.pwkoenig.co.uk/."
 },
 {
  "id": 58556,
  "title": "I am the Gate, detail of Dove",
  "artist": "Koenig, Peter",
  "date": "20th century",
  "where": "United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Koenig-gate-detail-dove.jpg",
  "refs": [
   "John 15:1-8",
   "John 10:1-10"
  ],
  "days": [
   "Year A Easter 4th Sunday",
   "Year B Easter 6th Sunday"
  ],
  "people": [
   "Jesus Christ (Biblical figure)"
  ],
  "subjects": [
   "Dove",
   "Garden",
   "Holy Spirit"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/58556",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Koenig, Peter. I am the Gate, detail of Dove, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Peter Winfried (Canisius) Koenig, https://www.pwkoenig.co.uk/."
 },
 {
  "id": 58558,
  "title": "St Francis of Assisi",
  "artist": "Koenig, Peter",
  "date": "1989",
  "where": "United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Koenig-Francis-birds.jpg",
  "refs": [],
  "days": [],
  "people": [
   "Jesus Christ (Biblical figure)",
   "Francis, of Assisi, 1182-1226"
  ],
  "subjects": [
   "Saints",
   "Cross",
   "Birds"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/58558",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Koenig, Peter. St Francis of Assisi, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Peter Winfried (Canisius) Koenig, https://www.pwkoenig.co.uk/."
 },
 {
  "id": 58560,
  "title": "Christ Overturns the Tables of the Moneylenders",
  "artist": "Koenig, Peter",
  "date": "2015",
  "where": "United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Koenig-temple-detail-9238hei87tug6t.jpg",
  "refs": [
   "John 2:13-22"
  ],
  "days": [
   "Year B Lent 3rd Sunday"
  ],
  "people": [
   "Jesus Christ (Biblical figure)"
  ],
  "subjects": [
   "Cleansing of the Temple"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/58560",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Koenig, Peter. Christ Overturns the Tables of the Moneylenders, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Peter Winfried (Canisius) Koenig, https://www.pwkoenig.co.uk/."
 },
 {
  "id": 58607,
  "title": "Good Shepherd and the Leviathan",
  "artist": "Koenig, Peter",
  "date": "late 29th century",
  "where": "United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Koenig-leviat2njfd90.jpg",
  "refs": [
   "John 10:11-18"
  ],
  "days": [
   "Year B Easter 4th Sunday"
  ],
  "people": [
   "Jesus Christ (Biblical figure)"
  ],
  "subjects": [
   "Good Shepherd",
   "Leviathan"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/58607",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Koenig, Peter. Good Shepherd and the Leviathan, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Peter Winfried (Canisius) Koenig, https://www.pwkoenig.co.uk/."
 },
 {
  "id": 58608,
  "title": "Cross of the Eucharist",
  "artist": "Koenig, Peter",
  "date": "20th century",
  "where": "Parish of St. Edward, Kettering, United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Koenig-cross-eucharist-full.jpg",
  "refs": [
   "Luke 22:14-23:56",
   "John 15:1-8",
   "Matthew 14:13-21",
   "John 6:24-35",
   "Kings I, 19:4-8"
  ],
  "days": [
   "Year C Liturgy of Pass",
   "Year B Easter 5th Sunday",
   "Year A Proper 13th Sunday",
   "Year B Proper 14th Sunday",
   "Year B Proper 13th Sunday"
  ],
  "people": [
   "Jesus Christ (Biblical figure)",
   "Elijah (Biblical figure)",
   "Angel (Biblical figure)",
   "Disciples (Biblical figures)",
   "Jezebel (Biblical figure)"
  ],
  "subjects": [
   "Fox",
   "Vine",
   "Passion of Jesus Christ: Last Supper",
   "Feeding the Multitude",
   "Eucharist",
   "Pelican",
   "Manna",
   "Bread of Life"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/58608",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Koenig, Peter. Cross of the Eucharist, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Peter Winfried (Canisius) Koenig, https://www.pwkoenig.co.uk/."
 },
 {
  "id": 58798,
  "title": "The Nativity",
  "artist": "Hochhalter, Cara B.",
  "date": "2019",
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/The Nativity - CH.jpg",
  "refs": [
   "Luke 2:(1-7), 8-20",
   "Luke 2:1-14, (15-20)"
  ],
  "days": [
   "Year A Nativity of the Lord Proper I",
   "Year B Nativity of the Lord Proper I",
   "Year C Nativity of the Lord Proper I"
  ],
  "people": [
   "Mary, the mother of Jesus (Biblical figure)",
   "Jesus Christ (Biblical figure)",
   "Joseph, the husband of Mary (Biblical figure)"
  ],
  "subjects": [
   "Nativity"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/58798",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Hochhalter, Cara B.. The Nativity, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Cara B. Hochhalter."
 },
 {
  "id": 58806,
  "title": "Reading from the Torah",
  "artist": "Hochhalter, Cara B.",
  "date": "2019",
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Reading from the Torah - CH.jpg",
  "refs": [
   "Luke 4:14-21"
  ],
  "days": [
   "Year C Epiphany 3rd Sunday"
  ],
  "people": [],
  "subjects": [
   "Healing",
   "Reading",
   "Oppressed",
   "Freedom"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/58806",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Hochhalter, Cara B.. Reading from the Torah, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Cara B. Hochhalter."
 },
 {
  "id": 58852,
  "title": "Draft of Fishes",
  "artist": "Koenig, Peter",
  "date": "20th century",
  "where": "United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Koenig-draft23089hd8h7.jpg",
  "refs": [
   "Luke 5:1-11"
  ],
  "days": [
   "Year C Epiphany 5th Sunday"
  ],
  "people": [
   "Jesus Christ (Biblical figure)",
   "Disciples (Biblical figures)"
  ],
  "subjects": [
   "Fish",
   "Calling of the disciples",
   "Miraculous Catch of Fish"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/58852",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Koenig, Peter. Draft of Fishes, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Peter Winfried (Canisius) Koenig, https://www.pwkoenig.co.uk/."
 },
 {
  "id": 58910,
  "title": "Martha and Mary",
  "artist": "Hochhalter, Cara B.",
  "date": "2019",
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Martha and Mary - CH.jpg",
  "refs": [
   "Luke 10:38-42"
  ],
  "days": [
   "Year C Proper 11th Sunday"
  ],
  "people": [
   "Jesus Christ (Biblical figure)",
   "Martha, of Bethany (Biblical figure)",
   "Mary, of Bethany (Biblical figure)"
  ],
  "subjects": [
   "Work",
   "Meditation"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/58910",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Hochhalter, Cara B.. Martha and Mary, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Cara B. Hochhalter."
 },
 {
  "id": 58918,
  "title": "On the Road to Emmaus",
  "artist": "Hochhalter, Cara B.",
  "date": "2019",
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/On the Road to Emmaus - CH.jpg",
  "refs": [
   "Luke 24:13-35",
   "Luke 24:13-49"
  ],
  "days": [
   "Year A Easter 3rd Sunday",
   "Year C Easter Evening"
  ],
  "people": [
   "Jesus Christ (Biblical figure)",
   "Disciples (Biblical figures)"
  ],
  "subjects": [
   "Emmaus: Road"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/58918",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Hochhalter, Cara B.. On the Road to Emmaus, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Cara B. Hochhalter."
 },
 {
  "id": 58923,
  "title": "Three Temptations",
  "artist": "Hochhalter, Cara B.",
  "date": "2019",
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Three Temptations  - CH.jpg",
  "refs": [
   "Matthew 4:1-11",
   "Luke 4:1-13"
  ],
  "days": [
   "Year A Lent 1st Sunday",
   "Year C Lent 1st Sunday"
  ],
  "people": [
   "Jesus Christ (Biblical figure)"
  ],
  "subjects": [
   "Temptation of Christ"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/58923",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Hochhalter, Cara B.. Three Temptations, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Cara B. Hochhalter."
 },
 {
  "id": 58926,
  "title": "As a Hen Gathers",
  "artist": "Hochhalter, Cara B.",
  "date": "2019",
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/As a Hen Gathers - CH.jpg",
  "refs": [
   "Luke 13:31-35"
  ],
  "days": [
   "Year C Lent 2nd Sunday"
  ],
  "people": [],
  "subjects": [
   "Birds",
   "Motherhood",
   "Caring",
   "Hen"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/58926",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Hochhalter, Cara B.. As a Hen Gathers, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Cara B. Hochhalter."
 },
 {
  "id": 58929,
  "title": "Maundy Thursday Foot-Washing",
  "artist": "Hochhalter, Cara B.",
  "date": "2019",
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Maundy Thursday Foot-Washing  - CH.jpg",
  "refs": [
   "John 13:1-17, 31b-35"
  ],
  "days": [
   "Year A Maundy Thursday",
   "Year B Maundy Thursday",
   "Year C Maundy Thursday"
  ],
  "people": [
   "Jesus Christ (Biblical figure)",
   "Disciples (Biblical figures)"
  ],
  "subjects": [
   "Footwashing",
   "Jesus Washes Disciples Feet",
   "Service"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/58929",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Hochhalter, Cara B.. Maundy Thursday Foot-Washing, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Cara B. Hochhalter."
 },
 {
  "id": 58944,
  "title": "Even the Dogs",
  "artist": "Hochhalter, Cara B.",
  "date": "2019",
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Even the Dogs - CH.jpg",
  "refs": [
   "Mark 7:24-37",
   "Matthew 15:(10-20), 21-28"
  ],
  "days": [
   "Year B Proper 18th Sunday"
  ],
  "people": [
   "Jesus Christ (Biblical figure)",
   "Canaanite Woman (Biblical figure)"
  ],
  "subjects": [],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/58944",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Hochhalter, Cara B.. Even the Dogs, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Cara B. Hochhalter."
 },
 {
  "id": 58947,
  "title": "A Parable - The Lost Sheep",
  "artist": "Hochhalter, Cara B.",
  "date": "2019",
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/A Parable - The Lost Sheep - CH.jpg",
  "refs": [
   "John 10:11-18",
   "Luke 15:1-10"
  ],
  "days": [
   "Year B Proper 11th Sunday",
   "Year C Proper 19th Sunday"
  ],
  "people": [
   "Jesus Christ (Biblical figure)"
  ],
  "subjects": [
   "Sheep",
   "Good Shepherd",
   "Parable of the Lost Sheep"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/58947",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Hochhalter, Cara B.. A Parable - The Lost Sheep, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Cara B. Hochhalter."
 },
 {
  "id": 58957,
  "title": "On the Road to Emmaus",
  "artist": "Hochhalter, Cara B.",
  "date": "2019",
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/On the Road to Emmaus - CH.jpg",
  "refs": [
   "Luke 24:13-35"
  ],
  "days": [
   "Year A Easter 3rd Sunday",
   "Year A Easter Evening"
  ],
  "people": [
   "Jesus Christ (Biblical figure)",
   "Disciples (Biblical figures)"
  ],
  "subjects": [
   "Emmaus: Road"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/58957",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Hochhalter, Cara B.. On the Road to Emmaus, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Cara B. Hochhalter."
 },
 {
  "id": 58962,
  "title": "A Parable - The Sower",
  "artist": "Hochhalter, Cara B.",
  "date": "2019",
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/A Parable - The Sower - CH.jpg",
  "refs": [
   "Luke 8:4-15",
   "Matthew 13:1-9, 18-23"
  ],
  "days": [
   "Year A Proper 10th Sunday"
  ],
  "people": [],
  "subjects": [
   "Parable of the Sower"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/58962",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Hochhalter, Cara B.. A Parable - The Sower, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Cara B. Hochhalter."
 },
 {
  "id": 59015,
  "title": "Transfiguration",
  "artist": "Hochhalter, Cara B.",
  "date": "2019",
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Transfiguration - CH.jpg",
  "refs": [
   "Matthew 17:1-9",
   "Luke 9:28-36, (37-43)"
  ],
  "days": [
   "Year A Transfiguration Sunday",
   "Year C Transfiguration Sunday"
  ],
  "people": [
   "Moses (Biblical figure)",
   "Jesus Christ (Biblical figure)",
   "Elijah (Biblical figure)",
   "Disciples (Biblical figures)"
  ],
  "subjects": [
   "Transfiguration of Jesus"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59015",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Hochhalter, Cara B.. Transfiguration, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Cara B. Hochhalter."
 },
 {
  "id": 59018,
  "title": "Palm Sunday: Even the Stones",
  "artist": "Hochhalter, Cara B.",
  "date": "2019",
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Palm Sunday - Even the Stones - CH.jpg",
  "refs": [
   "Luke 19:28-40"
  ],
  "days": [
   "Year C Liturgy of Palms"
  ],
  "people": [
   "Jesus Christ (Biblical figure)"
  ],
  "subjects": [
   "Entry into Jerusalem",
   "Donkey",
   "Palm Sunday",
   "Palms"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59018",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Hochhalter, Cara B.. Palm Sunday: Even the Stones, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Cara B. Hochhalter."
 },
 {
  "id": 59023,
  "title": "Woman at the Well",
  "artist": "Hochhalter, Cara B.",
  "date": "2019",
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Woman at the Well - CH.jpg",
  "refs": [
   "John 4:5-42"
  ],
  "days": [
   "Year A Lent 3rd Sunday"
  ],
  "people": [
   "Jesus Christ (Biblical figure)",
   "Woman at the well (Biblical figure)"
  ],
  "subjects": [
   "Love",
   "Living Water"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59023",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Hochhalter, Cara B.. Woman at the Well, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Cara B. Hochhalter."
 },
 {
  "id": 59025,
  "title": "Three Temptations",
  "artist": "Hochhalter, Cara B.",
  "date": "2019",
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Three Temptations  - CH.jpg",
  "refs": [
   "Matthew 4:1-11",
   "Luke 4:1-13"
  ],
  "days": [
   "Year A Lent 1st Sunday",
   "Year C Lent 1st Sunday"
  ],
  "people": [
   "Jesus Christ (Biblical figure)"
  ],
  "subjects": [
   "Temptation of Christ"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59025",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Hochhalter, Cara B.. Three Temptations, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Cara B. Hochhalter."
 },
 {
  "id": 59031,
  "title": "A House Built on Rock",
  "artist": "Koenig, Peter",
  "date": "2018",
  "where": "United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/AEpip09bw58504.jpg",
  "refs": [
   "Matthew 7:21-29"
  ],
  "days": [
   "Year A Epiphany 9th Sunday"
  ],
  "people": [],
  "subjects": [
   "Rock",
   "Flood",
   "House"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59031",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Koenig, Peter. A House Built on Rock, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Peter Winfried (Canisius) Koenig, https://www.pwkoenig.co.uk/."
 },
 {
  "id": 59034,
  "title": "Let Your Light Shine",
  "artist": "Hochhalter, Cara B.",
  "date": "2019",
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Let Your Light Shine - CH.jpg",
  "refs": [
   "Matthew 5:13-20"
  ],
  "days": [
   "Year A Epiphany 5th Sunday"
  ],
  "people": [],
  "subjects": [
   "Light",
   "Candles"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59034",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Hochhalter, Cara B.. Let Your Light Shine, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Cara B. Hochhalter."
 },
 {
  "id": 59035,
  "title": "St. Peter and St. Andrew",
  "artist": "Koenig, Peter",
  "date": "20th century",
  "where": "United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/AEpip03bw58517.jpg",
  "refs": [
   "Matthew 4:12-23"
  ],
  "days": [
   "Year A Epiphany 3rd Sunday"
  ],
  "people": [
   "Peter, the Apostle (Biblical figure)",
   "Andrew, the Apostle (Biblical figure)"
  ],
  "subjects": [
   "Fish",
   "Calling of the disciples"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59035",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Koenig, Peter. St. Peter and St. Andrew, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Peter Winfried (Canisius) Koenig, https://www.pwkoenig.co.uk/."
 },
 {
  "id": 59043,
  "title": "Swords Into Plowshares",
  "artist": "Hochhalter, Cara B.",
  "date": "2019",
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Swords into Plowshares - CH.jpg",
  "refs": [
   "Isaiah 2:1-5"
  ],
  "days": [
   "Year A Advent 1st Sunday"
  ],
  "people": [],
  "subjects": [
   "Peace",
   "Peacemaking"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59043",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Hochhalter, Cara B.. Swords Into Plowshares, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Cara B. Hochhalter."
 },
 {
  "id": 59048,
  "title": "A Parable - Where to Sit",
  "artist": "Hochhalter, Cara B.",
  "date": "2019",
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/A Parable - Where to Sit - CH.jpg",
  "refs": [
   "Luke 14:1, 7-14"
  ],
  "days": [
   "Year C Proper 17th Sunday"
  ],
  "people": [
   "Jesus Christ (Biblical figure)"
  ],
  "subjects": [
   "Poor",
   "Humility",
   "Hospitality"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59048",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Hochhalter, Cara B.. A Parable - Where to Sit, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Cara B. Hochhalter."
 },
 {
  "id": 59050,
  "title": "Zacchaeus",
  "artist": "Hochhalter, Cara B.",
  "date": "2019",
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Zacchaeus - CH.jpg",
  "refs": [
   "Luke 19:1-10"
  ],
  "days": [
   "Year C Proper 26th Sunday"
  ],
  "people": [
   "Jesus Christ (Biblical figure)",
   "Zacchaeus (Biblical figure)"
  ],
  "subjects": [
   "Love"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59050",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Hochhalter, Cara B.. Zacchaeus, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Cara B. Hochhalter."
 },
 {
  "id": 59056,
  "title": "A Parable - The Lost Coin",
  "artist": "Hochhalter, Cara B.",
  "date": "2019",
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/A Parable - The Lost Coin - CH.jpg",
  "refs": [
   "Luke 15:1-10"
  ],
  "days": [
   "Year C Proper 19th Sunday"
  ],
  "people": [],
  "subjects": [
   "Parable of the Lost Coin"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59056",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Hochhalter, Cara B.. A Parable - The Lost Coin, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Cara B. Hochhalter."
 },
 {
  "id": 59064,
  "title": "From the Lord's Prayer",
  "artist": "Hochhalter, Cara B.",
  "date": "2019",
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/From the Lord’s Prayer - CH.jpg",
  "refs": [
   "Luke 11:1-13"
  ],
  "days": [
   "Year C Proper 12th Sunday"
  ],
  "people": [],
  "subjects": [
   "Forgiveness",
   "Friendship",
   "Lords Prayer",
   "Equity"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59064",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Hochhalter, Cara B.. From the Lord's Prayer, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Cara B. Hochhalter."
 },
 {
  "id": 59253,
  "title": "Swords Into Plowshares",
  "artist": "Hochhalter, Cara B.",
  "date": "2019",
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Swords into Plowshares - CH.jpg",
  "refs": [
   "Isaiah 2:1-5"
  ],
  "days": [
   "Year A Advent 1st Sunday"
  ],
  "people": [],
  "subjects": [
   "Peace",
   "Peacemaking"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59253",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Hochhalter, Cara B.. Swords Into Plowshares, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Cara B. Hochhalter."
 },
 {
  "id": 59268,
  "title": "Mary Visits Elizabeth",
  "artist": "Hochhalter, Cara B.",
  "date": "2019",
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Mary Visits Elizabeth - CH.jpg",
  "refs": [
   "Luke 1:39-57"
  ],
  "days": [
   "Year A Visitation of Mary to Elizabeth",
   "Year B Visitation of Mary to Elizabeth",
   "Year C Visitation of Mary to Elizabeth"
  ],
  "people": [
   "Mary, the mother of Jesus (Biblical figure)",
   "Elizabeth (Biblical figure)"
  ],
  "subjects": [
   "Visitation"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59268",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Hochhalter, Cara B.. Mary Visits Elizabeth, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Cara B. Hochhalter."
 },
 {
  "id": 59269,
  "title": "On the Road to Emmaus",
  "artist": "Hochhalter, Cara B.",
  "date": "2019",
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/On the Road to Emmaus - CH.jpg",
  "refs": [
   "Luke 24:13-35"
  ],
  "days": [
   "Year A Easter 3rd Sunday"
  ],
  "people": [
   "Jesus Christ (Biblical figure)",
   "Disciples (Biblical figures)"
  ],
  "subjects": [
   "Emmaus: Road"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59269",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Hochhalter, Cara B.. On the Road to Emmaus, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Cara B. Hochhalter."
 },
 {
  "id": 59270,
  "title": "Easter Morning",
  "artist": "Hochhalter, Cara B.",
  "date": "2019",
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Easter Morning - CH.jpg",
  "refs": [
   "Luke 24:1-12"
  ],
  "days": [
   "Year C Easter Vigil",
   "Year C Resurrection of the Lord"
  ],
  "people": [
   "Mary, the mother of Jesus (Biblical figure)",
   "Angels (Biblical figures)",
   "Mary Magdalene (Biblical figure)"
  ],
  "subjects": [
   "Resurrection of Jesus",
   "Empty Tomb"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59270",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Hochhalter, Cara B.. Easter Morning, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Cara B. Hochhalter."
 },
 {
  "id": 59271,
  "title": "When They Crucified Jesus",
  "artist": "Hochhalter, Cara B.",
  "date": "2019",
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/When they Crucified Jesus - CH.jpg",
  "refs": [
   "John 18:1-19:42",
   "John 19:38-42"
  ],
  "days": [
   "Year A Good Friday",
   "Year A Holy Saturday",
   "Year B Holy Saturday",
   "Year C Holy Saturday",
   "Year B Good Friday",
   "Year C Good Friday"
  ],
  "people": [
   "Jesus Christ (Biblical figure)"
  ],
  "subjects": [
   "Passion of Jesus Christ: Crucifixion of Jesus",
   "Passion of Jesus Christ: Entombment of Christ"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59271",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Hochhalter, Cara B.. When They Crucified Jesus, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Cara B. Hochhalter."
 },
 {
  "id": 59272,
  "title": "Communion/Eucharist",
  "artist": "Hochhalter, Cara B.",
  "date": "2019",
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Communion - Eucharist - CH.jpg",
  "refs": [
   "John 6:24-35",
   "Mark 14:22-25"
  ],
  "days": [
   "Year B Proper 13th Sunday"
  ],
  "people": [],
  "subjects": [
   "Eucharist",
   "Communion"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59272",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Hochhalter, Cara B.. Communion/Eucharist, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Cara B. Hochhalter."
 },
 {
  "id": 59273,
  "title": "Maundy Thursday Foot-Washing",
  "artist": "Hochhalter, Cara B.",
  "date": "2019",
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Maundy Thursday Foot-Washing  - CH.jpg",
  "refs": [
   "John 13:1-17, 31b-35"
  ],
  "days": [
   "Year A Maundy Thursday",
   "Year B Maundy Thursday",
   "Year C Maundy Thursday"
  ],
  "people": [
   "Jesus Christ (Biblical figure)",
   "Disciples (Biblical figures)"
  ],
  "subjects": [
   "Footwashing",
   "Jesus Washes Disciples Feet",
   "Service"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59273",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Hochhalter, Cara B.. Maundy Thursday Foot-Washing, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Cara B. Hochhalter."
 },
 {
  "id": 59274,
  "title": "Palm Sunday: Even the Stones",
  "artist": "Hochhalter, Cara B.",
  "date": "2019",
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Palm Sunday - Even the Stones - CH.jpg",
  "refs": [
   "Luke 19:28-40"
  ],
  "days": [
   "Year C Liturgy of Palms"
  ],
  "people": [
   "Jesus Christ (Biblical figure)"
  ],
  "subjects": [
   "Donkey",
   "Palm Sunday",
   "Palms"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59274",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Hochhalter, Cara B.. Palm Sunday: Even the Stones, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Cara B. Hochhalter."
 },
 {
  "id": 59275,
  "title": "As a Hen Gathers",
  "artist": "Hochhalter, Cara B.",
  "date": "2019",
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/As a Hen Gathers - CH.jpg",
  "refs": [
   "Luke 13:31-35"
  ],
  "days": [
   "Year C Lent 2nd Sunday"
  ],
  "people": [],
  "subjects": [
   "Caring",
   "Hen"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59275",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Hochhalter, Cara B.. As a Hen Gathers, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Cara B. Hochhalter."
 },
 {
  "id": 59276,
  "title": "Part 5 - The Prodigal's Elder Brother",
  "artist": "Hochhalter, Cara B.",
  "date": "2019",
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Part 5 -  The Prodigal's Elder Brother.jpg",
  "refs": [
   "Luke 15:1-3, 11b-32"
  ],
  "days": [
   "Year C Lent 4th Sunday"
  ],
  "people": [],
  "subjects": [
   "Parable of the Prodigal Son"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59276",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Hochhalter, Cara B.. Part 5 - The Prodigal's Elder Brother, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Cara B. Hochhalter."
 },
 {
  "id": 59277,
  "title": "Part 4 - Celebrating the Prodigal",
  "artist": "Hochhalter, Cara B.",
  "date": "2019",
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Part 4 - Celebrating theProdigal - CH.jpg",
  "refs": [
   "Luke 15:1-3, 11b-32"
  ],
  "days": [
   "Year C Lent 4th Sunday"
  ],
  "people": [],
  "subjects": [
   "Hospitality",
   "Forgiveness",
   "Parable of the Prodigal Son",
   "Celebrations",
   "Joy",
   "Welcome"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59277",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Hochhalter, Cara B.. Part 4 - Celebrating the Prodigal, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Cara B. Hochhalter."
 },
 {
  "id": 59278,
  "title": "Part 3 - The Prodigal is Welcomed",
  "artist": "Hochhalter, Cara B.",
  "date": "2019",
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Part 3 - The Prodigal is Welcomed - CH.jpg",
  "refs": [
   "Luke 15:1-3, 11b-32"
  ],
  "days": [
   "Year C Lent 4th Sunday"
  ],
  "people": [],
  "subjects": [
   "Forgiveness",
   "Parable of the Prodigal Son"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59278",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Hochhalter, Cara B.. Part 3 - The Prodigal is Welcomed, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Cara B. Hochhalter."
 },
 {
  "id": 59279,
  "title": "Part 2 - The Prodigal Turns",
  "artist": "Hochhalter, Cara B.",
  "date": "2019",
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Part 2 - The Prodigal Turns - CH.jpg",
  "refs": [
   "Luke 15:1-3, 11b-32"
  ],
  "days": [
   "Year C Lent 4th Sunday"
  ],
  "people": [],
  "subjects": [
   "Parable of the Prodigal Son",
   "Repentance"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59279",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Hochhalter, Cara B.. Part 2 - The Prodigal Turns, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Cara B. Hochhalter."
 },
 {
  "id": 59280,
  "title": "Part 1 - The Prodigal Leaves",
  "artist": "Hochhalter, Cara B.",
  "date": "2019",
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/A Parable, Part 1 -  The Prodigal Leaves - CH.jpg",
  "refs": [
   "Luke 15:1-3, 11b-32"
  ],
  "days": [
   "Year C Lent 4th Sunday"
  ],
  "people": [],
  "subjects": [
   "Parable of the Prodigal Son"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59280",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Hochhalter, Cara B.. Part 1 - The Prodigal Leaves, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Cara B. Hochhalter."
 },
 {
  "id": 59281,
  "title": "A Parable - The Sower",
  "artist": "Hochhalter, Cara B.",
  "date": "2019",
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/A Parable - The Sower - CH.jpg",
  "refs": [
   "Luke 8:4-15"
  ],
  "days": [],
  "people": [],
  "subjects": [
   "Parable of the Sower"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59281",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Hochhalter, Cara B.. A Parable - The Sower, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Cara B. Hochhalter."
 },
 {
  "id": 59282,
  "title": "A Parable - The Mustard Seed",
  "artist": "Hochhalter, Cara B.",
  "date": "2019",
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/A Parable - The Mustard Seed - CH.jpg",
  "refs": [
   "Luke 13:18-19"
  ],
  "days": [],
  "people": [],
  "subjects": [
   "Parable of the Mustard Seed",
   "Kingdom of God",
   "Mustard Seed"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59282",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Hochhalter, Cara B.. A Parable - The Mustard Seed, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Cara B. Hochhalter."
 },
 {
  "id": 59283,
  "title": "A Parable - The Lost Coin",
  "artist": "Hochhalter, Cara B.",
  "date": "2019",
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/A Parable - The Lost Coin - CH.jpg",
  "refs": [
   "Luke 15:1-10"
  ],
  "days": [
   "Year C Proper 19th Sunday"
  ],
  "people": [],
  "subjects": [
   "Parable of the Lost Coin"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59283",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Hochhalter, Cara B.. A Parable - The Lost Coin, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Cara B. Hochhalter."
 },
 {
  "id": 59284,
  "title": "A Parable - The Lost Sheep",
  "artist": "Hochhalter, Cara B.",
  "date": "2019",
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/A Parable - The Lost Sheep - CH.jpg",
  "refs": [
   "Luke 15:1-10"
  ],
  "days": [
   "Year C Proper 19th Sunday"
  ],
  "people": [],
  "subjects": [
   "Parable of the Lost Sheep"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59284",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Hochhalter, Cara B.. A Parable - The Lost Sheep, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Cara B. Hochhalter."
 },
 {
  "id": 59285,
  "title": "A Parable - Where to Sit",
  "artist": "Hochhalter, Cara B.",
  "date": "2019",
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/A Parable - Where to Sit - CH.jpg",
  "refs": [
   "Luke 14:1, 7-14"
  ],
  "days": [
   "Year C Proper 17th Sunday"
  ],
  "people": [],
  "subjects": [
   "Humility",
   "Hospitality"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59285",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Hochhalter, Cara B.. A Parable - Where to Sit, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Cara B. Hochhalter."
 },
 {
  "id": 59287,
  "title": "A Parable - The Good Samaritan",
  "artist": "Hochhalter, Cara B.",
  "date": "2019",
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/A Parable -The Good Samaritan - CH.jpg",
  "refs": [
   "Luke 10:25-37"
  ],
  "days": [
   "Year C Proper 10th Sunday"
  ],
  "people": [],
  "subjects": [
   "Good Samaritan",
   "Love",
   "Compassion"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59287",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Hochhalter, Cara B.. A Parable - The Good Samaritan, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Cara B. Hochhalter."
 },
 {
  "id": 59288,
  "title": "Zacchaeus",
  "artist": "Hochhalter, Cara B.",
  "date": "2019",
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Zacchaeus - CH.jpg",
  "refs": [
   "Luke 19:1-10"
  ],
  "days": [
   "Year C Proper 26th Sunday"
  ],
  "people": [
   "Jesus Christ (Biblical figure)",
   "Zacchaeus (Biblical figure)"
  ],
  "subjects": [
   "Love"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59288",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Hochhalter, Cara B.. Zacchaeus, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Cara B. Hochhalter."
 },
 {
  "id": 59289,
  "title": "Welcoming the Children",
  "artist": "Hochhalter, Cara B.",
  "date": "2019",
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Welcoming the Children - CH.jpg",
  "refs": [
   "Mark 10:2-16"
  ],
  "days": [
   "Year B Proper 22nd Sunday"
  ],
  "people": [
   "Jesus Christ (Biblical figure)"
  ],
  "subjects": [
   "Children",
   "Hope",
   "Love"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59289",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Hochhalter, Cara B.. Welcoming the Children, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Cara B. Hochhalter."
 },
 {
  "id": 59290,
  "title": "Even the Dogs",
  "artist": "Hochhalter, Cara B.",
  "date": "2019",
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Even the Dogs - CH.jpg",
  "refs": [
   "Mark 7:24-37"
  ],
  "days": [
   "Year B Proper 18th Sunday"
  ],
  "people": [
   "Jesus Christ (Biblical figure)",
   "Canaanite Woman (Biblical figure)"
  ],
  "subjects": [],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59290",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Hochhalter, Cara B.. Even the Dogs, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Cara B. Hochhalter."
 },
 {
  "id": 59291,
  "title": "Feeding the Multitudes",
  "artist": "Hochhalter, Cara B.",
  "date": "2019",
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Feeding the Multitudes - CH.jpg",
  "refs": [
   "Matthew 14:13-21"
  ],
  "days": [
   "Year A Proper 13th Sunday"
  ],
  "people": [
   "Jesus Christ (Biblical figure)",
   "Disciples (Biblical figures)"
  ],
  "subjects": [
   "Feeding the Multitude",
   "Giving thanks",
   "Stewardship"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59291",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Hochhalter, Cara B.. Feeding the Multitudes, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Cara B. Hochhalter."
 },
 {
  "id": 59292,
  "title": "Martha and Mary",
  "artist": "Hochhalter, Cara B.",
  "date": "2019",
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Martha and Mary - CH.jpg",
  "refs": [
   "Luke 10:38-42"
  ],
  "days": [
   "Year C Proper 11th Sunday"
  ],
  "people": [
   "Jesus Christ (Biblical figure)",
   "Martha, of Bethany (Biblical figure)",
   "Mary, of Bethany (Biblical figure)"
  ],
  "subjects": [
   "Work",
   "Meditation"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59292",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Hochhalter, Cara B.. Martha and Mary, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Cara B. Hochhalter."
 },
 {
  "id": 59293,
  "title": "Just a Touch",
  "artist": "Hochhalter, Cara B.",
  "date": "2019",
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Just a Touch - CV.jpg",
  "refs": [
   "Mark 5:21-43"
  ],
  "days": [
   "Year B Proper 8th Sunday"
  ],
  "people": [
   "Jesus Christ (Biblical figure)",
   "Woman who touched the cloak of Jesus (Biblical figure)"
  ],
  "subjects": [
   "Prayer",
   "Healing"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59293",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Hochhalter, Cara B.. Just a Touch, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Cara B. Hochhalter."
 },
 {
  "id": 59294,
  "title": "Calming the Storm",
  "artist": "Hochhalter, Cara B.",
  "date": "2019",
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Calming the Storm - CH.jpg",
  "refs": [
   "Mark 4:35-41"
  ],
  "days": [
   "Year B Proper 7th Sunday"
  ],
  "people": [
   "Jesus Christ (Biblical figure)",
   "Disciples (Biblical figures)"
  ],
  "subjects": [
   "Faith",
   "Hope",
   "Peace",
   "Jesus Calms the Storm"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59294",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Hochhalter, Cara B.. Calming the Storm, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Cara B. Hochhalter."
 },
 {
  "id": 59295,
  "title": "Woman with the Alabaster Jar",
  "artist": "Hochhalter, Cara B.",
  "date": "2019",
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Woman with the Alabaster Jar - CH.jpg",
  "refs": [
   "Luke 7:36-8:3"
  ],
  "days": [
   "Year C Proper 6th Sunday"
  ],
  "people": [
   "Jesus Christ (Biblical figure)",
   "Woman Who Bathed Christs Feet with Tears (Biblical figure)"
  ],
  "subjects": [
   "Love",
   "Forgiveness"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59295",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Hochhalter, Cara B.. Woman with the Alabaster Jar, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Cara B. Hochhalter."
 },
 {
  "id": 59296,
  "title": "Woman at the Well",
  "artist": "Hochhalter, Cara B.",
  "date": "2019",
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Woman at the Well - CH.jpg",
  "refs": [
   "John 4:5-42"
  ],
  "days": [
   "Year A Lent 3rd Sunday"
  ],
  "people": [
   "Jesus Christ (Biblical figure)",
   "Woman at the well (Biblical figure)"
  ],
  "subjects": [
   "Love",
   "Living Water"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59296",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Hochhalter, Cara B.. Woman at the Well, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Cara B. Hochhalter."
 },
 {
  "id": 59297,
  "title": "Consider the Lilies",
  "artist": "Hochhalter, Cara B.",
  "date": "2019",
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Consider the Lilies - CH.jpg",
  "refs": [
   "Matthew 6:24-34"
  ],
  "days": [
   "Year B Thanksgiving Day"
  ],
  "people": [],
  "subjects": [
   "Peace",
   "Flowers"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59297",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Hochhalter, Cara B.. Consider the Lilies, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Cara B. Hochhalter."
 },
 {
  "id": 59298,
  "title": "Let Your Light Shine",
  "artist": "Hochhalter, Cara B.",
  "date": "2019",
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Let Your Light Shine - CH.jpg",
  "refs": [
   "Matthew 5:13-20"
  ],
  "days": [
   "Year A Epiphany 5th Sunday"
  ],
  "people": [],
  "subjects": [
   "Light",
   "Candles"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59298",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Hochhalter, Cara B.. Let Your Light Shine, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Cara B. Hochhalter."
 },
 {
  "id": 59299,
  "title": "Blessed are Those",
  "artist": "Hochhalter, Cara B.",
  "date": "2019",
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Blessed are those - CH.jpg",
  "refs": [
   "Luke 6:17-26"
  ],
  "days": [
   "Year C Epiphany 6th Sunday"
  ],
  "people": [],
  "subjects": [
   "Poor",
   "Rich",
   "Equity"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59299",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Hochhalter, Cara B.. Blessed are Those, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Cara B. Hochhalter."
 },
 {
  "id": 59300,
  "title": "Transfiguration",
  "artist": "Hochhalter, Cara B.",
  "date": "2019",
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Transfiguration - CH.jpg",
  "refs": [
   "Luke 9:28-36, (37-43)"
  ],
  "days": [
   "Year C Transfiguration Sunday"
  ],
  "people": [
   "Moses (Biblical figure)",
   "Jesus Christ (Biblical figure)",
   "Elijah (Biblical figure)",
   "Disciples (Biblical figures)"
  ],
  "subjects": [
   "Transfiguration of Jesus"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59300",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Hochhalter, Cara B.. Transfiguration, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Cara B. Hochhalter."
 },
 {
  "id": 59301,
  "title": "From the Lord's Prayer",
  "artist": "Hochhalter, Cara B.",
  "date": "2019",
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/From the Lord’s Prayer - CH.jpg",
  "refs": [
   "Luke 11:1-13"
  ],
  "days": [
   "Year C Proper 12th Sunday"
  ],
  "people": [],
  "subjects": [
   "Forgiveness",
   "Friendship",
   "Lords Prayer",
   "Equity"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59301",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Hochhalter, Cara B.. From the Lord's Prayer, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Cara B. Hochhalter."
 },
 {
  "id": 59302,
  "title": "Reading from the Torah",
  "artist": "Hochhalter, Cara B.",
  "date": "2019",
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Reading from the Torah - CH.jpg",
  "refs": [
   "Luke 4:14-21"
  ],
  "days": [
   "Year C Epiphany 3rd Sunday"
  ],
  "people": [],
  "subjects": [
   "Healing",
   "Reading",
   "Oppressed",
   "Freedom"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59302",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Hochhalter, Cara B.. Reading from the Torah, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Cara B. Hochhalter."
 },
 {
  "id": 59303,
  "title": "Water into Wine",
  "artist": "Hochhalter, Cara B.",
  "date": "2019",
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Water into Wine - CH.jpg",
  "refs": [
   "John 2:1-11"
  ],
  "days": [
   "Year C Epiphany 2nd Sunday"
  ],
  "people": [
   "Mary, the mother of Jesus (Biblical figure)",
   "Jesus Christ (Biblical figure)"
  ],
  "subjects": [
   "Marriage at Cana",
   "Water"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59303",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Hochhalter, Cara B.. Water into Wine, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Cara B. Hochhalter."
 },
 {
  "id": 59304,
  "title": "Three Temptations",
  "artist": "Hochhalter, Cara B.",
  "date": "2019",
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Three Temptations  - CH.jpg",
  "refs": [
   "Luke 4:1-13"
  ],
  "days": [
   "Year C Lent 1st Sunday"
  ],
  "people": [
   "Jesus Christ (Biblical figure)"
  ],
  "subjects": [
   "Temptation of Christ"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59304",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Hochhalter, Cara B.. Three Temptations, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Cara B. Hochhalter."
 },
 {
  "id": 59305,
  "title": "The Baptism of Jesus",
  "artist": "Hochhalter, Cara B.",
  "date": "2019",
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/The Baptism of Jesus - CH.jpg",
  "refs": [
   "Luke 3:15-17, 21-22"
  ],
  "days": [
   "Year C Baptism of the Lord"
  ],
  "people": [
   "Jesus Christ (Biblical figure)"
  ],
  "subjects": [
   "Dove",
   "Baptism of Christ"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59305",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Hochhalter, Cara B.. The Baptism of Jesus, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Cara B. Hochhalter."
 },
 {
  "id": 59306,
  "title": "The Magi",
  "artist": "Hochhalter, Cara B.",
  "date": "2019",
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/The Magi - CH.jpg",
  "refs": [
   "Matthew 2:1-12"
  ],
  "days": [
   "Year A Epiphany of the Lord",
   "Year B Epiphany of the Lord",
   "Year C Epiphany of the Lord"
  ],
  "people": [
   "Wise Men (Biblical figures)"
  ],
  "subjects": [
   "Adoration of the Magi"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59306",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Hochhalter, Cara B.. The Magi, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Cara B. Hochhalter, hochhalter.cara@gmail.com."
 },
 {
  "id": 59307,
  "title": "The Nativity",
  "artist": "Hochhalter, Cara B.",
  "date": "2019",
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/The Nativity - CH.jpg",
  "refs": [
   "Luke 2:(1-7), 8-20",
   "Luke 2:1-14, (15-20)"
  ],
  "days": [
   "Year A Nativity of the Lord Proper I",
   "Year B Nativity of the Lord Proper I",
   "Year C Nativity of the Lord Proper I"
  ],
  "people": [
   "Mary, the mother of Jesus (Biblical figure)",
   "Jesus Christ (Biblical figure)",
   "Joseph, the husband of Mary (Biblical figure)"
  ],
  "subjects": [
   "Nativity"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59307",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Hochhalter, Cara B.. The Nativity, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Cara B. Hochhalter."
 }
];
