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
  "id": 48298,
  "title": "Detail of Jesus from the Lord's Supper",
  "artist": "JESUS MAFA",
  "date": "1973",
  "where": "Cameroon",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Mafa029.jpg",
  "refs": [
   "Matthew 26:14-27:66",
   "Mark 14:1-15:47",
   "Luke 22:14-23:56",
   "John 6:51-58",
   "John 14:23-29"
  ],
  "days": [
   "Year A Liturgy of Pass",
   "Year B Liturgy of Pass",
   "Year C Liturgy of Pass",
   "Year A Resurrection of the Lord",
   "Year B Lent 3rd Sunday",
   "",
   "Year B Transfiguration Sunday",
   "Year C Easter 6th Sunday",
   "Year B Proper 15th Sunday",
   "Year A Epiphany 3rd Sunday"
  ],
  "people": [],
  "subjects": [
   "Passion of Jesus Christ: Last Supper",
   "Culture: African",
   "Culture: Black"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/48298",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "JESUS MAFA. Detail of Jesus from the Lord's Supper, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: http://www.librairie-emmanuel.fr (contact page: https://www.librairie-emmanuel.fr/contact)."
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
  "id": 56555,
  "title": "Enough",
  "artist": "Pittman, Lauren Wright",
  "date": "2018",
  "where": "United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/lewpstudio_enough_thumbnail.jpg",
  "refs": [
   "Luke 1:46b-55"
  ],
  "days": [
   "Year A Advent 3rd Sunday",
   ""
  ],
  "people": [],
  "subjects": [
   "Dove",
   "Obedience",
   "Culture: Black",
   "Culture: African American",
   "Joy",
   "Magnificat",
   "Advent"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/56555",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Pittman, Lauren Wright. Enough, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Lauren Wright Pittman, http://www.lewpstudio.com/."
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
  "id": 57074,
  "title": "Marys Song",
  "artist": "Pittman, Lauren Wright",
  "date": "2016",
  "where": "United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/lewpstudio_maryssong_thumbnail.jpg",
  "refs": [
   "Luke 1:46b-55"
  ],
  "days": [
   "Year A Advent 3rd Sunday",
   "Year B Advent 3rd Sunday",
   ""
  ],
  "people": [
   "Mary, the mother of Jesus (Biblical figure)"
  ],
  "subjects": [
   "Faith",
   "Culture: Black",
   "Culture: African American",
   "Praise",
   "Joy",
   "Magnificat",
   "Advent"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/57074",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Pittman, Lauren Wright. Marys Song, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Lauren Wright Pittman, http://www.lewpstudio.com/."
 },
 {
  "id": 57075,
  "title": "Complete Joy",
  "artist": "Pittman, Lauren Wright",
  "date": "2018",
  "where": "United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/lewpstudio_completejoy_thumbnail.jpg",
  "refs": [
   "Luke 1:46b-55",
   "Psalm 16",
   "John 14:15-21"
  ],
  "days": [
   "Year A Advent 3rd Sunday",
   "Year A Easter 6th Sunday",
   "",
   "Year B Proper 28th Sunday"
  ],
  "people": [],
  "subjects": [
   "Culture: Black",
   "Culture: African American",
   "Joy",
   "Magnificat"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/57075",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Pittman, Lauren Wright. Complete Joy, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Lauren Wright Pittman, http://www.lewpstudio.com/."
 },
 {
  "id": 57076,
  "title": "Raise Your Head",
  "artist": "Pittman, Lauren Wright",
  "date": "2018",
  "where": "United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/lewpstudio_raiseyourhead_thumbnail.jpg",
  "refs": [
   "Numbers 6:22-27",
   "John 1:(1-9), 10-18"
  ],
  "days": [
   "Year A Christmas 2nd Sunday",
   "",
   "Year C Lent 2nd Sunday",
   "Year C Holy Name of Jesus"
  ],
  "people": [],
  "subjects": [
   "Hope",
   "Light",
   "Culture: Black",
   "Word (The)",
   "Culture: African American"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/57076",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Pittman, Lauren Wright. Raise Your Head, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Lauren Wright Pittman, http://www.lewpstudio.com/."
 },
 {
  "id": 57077,
  "title": "Shining Hope",
  "artist": "Pittman, Lauren Wright",
  "date": "2016",
  "where": "United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/lewpstudio_shininghope_thumbnail.jpg",
  "refs": [
   "Matthew 2:1-12"
  ],
  "days": [
   "Year A Epiphany of the Lord",
   "Year B Epiphany of the Lord",
   "Year C Epiphany of the Lord",
   ""
  ],
  "people": [],
  "subjects": [
   "Adoration of the Magi",
   "Star",
   "Hope",
   "Light",
   "Culture: Black",
   "Culture: African American",
   "Joy"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/57077",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Pittman, Lauren Wright. Shining Hope, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Lauren Wright Pittman, http://www.lewpstudio.com/."
 },
 {
  "id": 57078,
  "title": "Rising Dust",
  "artist": "Pittman, Lauren Wright",
  "date": "2016",
  "where": "United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/lewpstudio_risingdust_thumbnail.jpg",
  "refs": [
   "Matthew 5:1-12"
  ],
  "days": [
   "",
   "Year A Epiphany 4thSunday"
  ],
  "people": [],
  "subjects": [
   "Blessed",
   "Culture: Black",
   "Culture: African American",
   "Salvation"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/57078",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Pittman, Lauren Wright. Rising Dust, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Lauren Wright Pittman, http://www.lewpstudio.com/."
 },
 {
  "id": 57079,
  "title": "Tears of the People",
  "artist": "Pittman, Lauren Wright",
  "date": "2016",
  "where": "United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/lewpstudio_tearsofthepeople_thumbnail.jpg",
  "refs": [
   "Matthew 5:1-12"
  ],
  "days": [
   "",
   "Year A Epiphany 4thSunday"
  ],
  "people": [],
  "subjects": [
   "Mourning",
   "Culture: Black",
   "Culture: African American",
   "Tears"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/57079",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Pittman, Lauren Wright. Tears of the People, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Lauren Wright Pittman, http://www.lewpstudio.com/."
 },
 {
  "id": 57080,
  "title": "Broken Vessel",
  "artist": "Pittman, Lauren Wright",
  "date": "2017",
  "where": "United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/lewpstudio_brokenvessel_thumbnail.jpg",
  "refs": [
   "Psalm 31:9-16"
  ],
  "days": [
   "Year A Liturgy of Pass",
   "",
   "Year A Ash Wednesday",
   "Year A Presentation of the Lord",
   "Year A Epiphany 5th Sunday"
  ],
  "people": [],
  "subjects": [
   "Culture: Black",
   "Culture: African American"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/57080",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Pittman, Lauren Wright. Broken Vessel, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Lauren Wright Pittman, http://www.lewpstudio.com/."
 },
 {
  "id": 57081,
  "title": "Time of the Season",
  "artist": "Pittman, Lauren Wright",
  "date": "2016",
  "where": "United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/lewpstudio_timeoftheseason_thumbnail.jpg",
  "refs": [],
  "days": [],
  "people": [],
  "subjects": [
   "Tree",
   "Sun",
   "Light",
   "Tree of Life",
   "Dawn",
   "Time"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/57081",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Pittman, Lauren Wright. Time of the Season, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Lauren Wright Pittman, http://www.lewpstudio.com/."
 },
 {
  "id": 57082,
  "title": "A Choice",
  "artist": "Pittman, Lauren Wright",
  "date": "2018",
  "where": "United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/lewpstudio_achoice_thumbnail.jpg",
  "refs": [
   "Matthew 4:1-11"
  ],
  "days": [
   "Year A Lent 1st Sunday",
   "Year A Liturgy of Pass",
   "",
   "Year A Liturgy of Palms",
   "Year B Epiphany 2nd Sunday",
   "Year A Proper 12th Sunday"
  ],
  "people": [
   "Jesus Christ (Biblical figure)"
  ],
  "subjects": [
   "Temptation",
   "Power",
   "Culture: Black",
   "Crown",
   "Kingdom of God"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/57082",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Pittman, Lauren Wright. A Choice, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Lauren Wright Pittman, http://www.lewpstudio.com/."
 },
 {
  "id": 57083,
  "title": "Bayou Baptism",
  "artist": "Pittman, Lauren Wright",
  "date": "2016",
  "where": "United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/lewpstudio_bayoubaptism_thumbnail.jpg",
  "refs": [
   "Mark 1:4-11",
   "Matthew 3:13-17",
   "Luke 3:15-17, 21-22"
  ],
  "days": [
   "Year A Baptism of the Lord",
   "Year B Baptism of the Lord",
   "Year C Baptism of the Lord"
  ],
  "people": [],
  "subjects": [
   "Baptism of Christ",
   "Sun",
   "Pelican",
   "Baptism"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/57083",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Pittman, Lauren Wright. Bayou Baptism, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Lauren Wright Pittman, http://www.lewpstudio.com/."
 },
 {
  "id": 57084,
  "title": "For Those in Darkness [Light is Dawning]",
  "artist": "Pittman, Lauren Wright",
  "date": "2018",
  "where": "United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/lewpstudio_forthoseindarkness_thumbnail.jpg",
  "refs": [
   "Isaiah 9:1-4"
  ],
  "days": [
   "",
   "Year A Epiphany 3rd Sunday"
  ],
  "people": [],
  "subjects": [
   "Despair",
   "Hope",
   "Light",
   "Culture: Black",
   "Dawn",
   "Culture: African American",
   "Darkness"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/57084",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Pittman, Lauren Wright. For Those in Darkness [Light is Dawning], from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Lauren Wright Pittman, http://www.lewpstudio.com/."
 },
 {
  "id": 57085,
  "title": "Anointed",
  "artist": "Pittman, Lauren Wright",
  "date": "2018",
  "where": "United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/lewpstudio_anointed_thumbnail.jpg",
  "refs": [
   "Luke 7:36-8:3",
   "John 12:1-8"
  ],
  "days": [
   "",
   "Year C Lent 5th  Sunday",
   "Year B Holy Monday",
   "Year C Proper 6th Sunday"
  ],
  "people": [
   "Mary, of Bethany (Biblical figure)"
  ],
  "subjects": [
   "Anointing of Jesus",
   "Culture: Black",
   "Culture: African American"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/57085",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Pittman, Lauren Wright. Anointed, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Lauren Wright Pittman, http://www.lewpstudio.com/."
 },
 {
  "id": 57086,
  "title": "Mary and Elizabeth",
  "artist": "Pittman, Lauren Wright",
  "date": "2018",
  "where": "United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/lewpstudio_maryandelizabeth_thumbnail.jpg",
  "refs": [
   "Luke 1:39-57"
  ],
  "days": [
   "Year A Visitation of Mary to Elizabeth",
   ""
  ],
  "people": [],
  "subjects": [
   "Visitation",
   "Culture: Black"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/57086",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Pittman, Lauren Wright. Mary and Elizabeth, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Lauren Wright Pittman, http://www.lewpstudio.com/."
 },
 {
  "id": 57087,
  "title": "Born Again",
  "artist": "Pittman, Lauren Wright",
  "date": "2016",
  "where": "United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/lewpstudio_bornagain(nicodemus)_thumbnail.jpg",
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
   "Culture: Black"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/57087",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Pittman, Lauren Wright. Born Again, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Lauren Wright Pittman, http://www.lewpstudio.com/."
 },
 {
  "id": 57088,
  "title": "Let There Be",
  "artist": "Pittman, Lauren Wright",
  "date": "2016",
  "where": "United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/lewpstudio_lettherebe_thumbnail.jpg",
  "refs": [
   "Genesis 1:1-2:4a"
  ],
  "days": [
   "Year A Trinity Sunday"
  ],
  "people": [],
  "subjects": [
   "Creation of the World"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/57088",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Pittman, Lauren Wright. Let There Be, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Lauren Wright Pittman, http://www.lewpstudio.com/."
 },
 {
  "id": 57089,
  "title": "Jesus of the Bayou",
  "artist": "Pittman, Lauren Wright",
  "date": "2014",
  "where": "United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/lewpstudio_jesusofthebayou_thumbnail.jpg",
  "refs": [
   "Matthew 28:1-10"
  ],
  "days": [
   "Year A Resurrection of the Lord",
   "",
   "Year A Proper 11th Sunday"
  ],
  "people": [
   "Jesus Christ (Biblical figure)"
  ],
  "subjects": [
   "Resurrection of Jesus",
   "Culture: Black",
   "Culture: African American"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/57089",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Pittman, Lauren Wright. Jesus of the Bayou, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Lauren Wright Pittman, http://www.lewpstudio.com/."
 },
 {
  "id": 57090,
  "title": "Kiss, The",
  "artist": "Pittman, Lauren Wright",
  "date": "2018",
  "where": "United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/lewpstudio_thekiss_thumbnail.jpg",
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
   "Culture: Black",
   "Culture: African American"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/57090",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Pittman, Lauren Wright. Kiss, The, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Lauren Wright Pittman, http://www.lewpstudio.com/."
 },
 {
  "id": 57091,
  "title": "In Tune (Deborah)",
  "artist": "Pittman, Lauren Wright",
  "date": "2018",
  "where": "United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/lewpstudio_intune(deoborah)_thumbnail.jpg",
  "refs": [
   "Judges 4:1-7",
   "Judges 5:2–31"
  ],
  "days": [
   "Year A Nativity of the Lord Proper I",
   "Year A Proper 26th Sunday",
   "Year A Proper 28th Sunday",
   "",
   "Year B Proper 15th Sunday",
   "Year A Liturgy of Palms"
  ],
  "people": [
   "Deborah (Biblical figure)"
  ],
  "subjects": [
   "Culture: Black",
   "Singing",
   "Culture: African American",
   "Palms"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/57091",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Pittman, Lauren Wright. In Tune (Deborah), from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Lauren Wright Pittman, http://www.lewpstudio.com/."
 },
 {
  "id": 57092,
  "title": "Multitudes",
  "artist": "Pittman, Lauren Wright",
  "date": "2018",
  "where": "United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/lewpstudio_multitudes_thumbnail.jpg",
  "refs": [
   "Psalm 72",
   "Isaiah 60:1-6"
  ],
  "days": [
   "Year A Epiphany of the Lord",
   "",
   "Year A Liturgy of Palms"
  ],
  "people": [
   "Jesus Christ (Biblical figure)"
  ],
  "subjects": [
   "Culture: Black",
   "Culture: African American"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/57092",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Pittman, Lauren Wright. Multitudes, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Lauren Wright Pittman, http://www.lewpstudio.com/."
 },
 {
  "id": 57093,
  "title": "Mother Hen",
  "artist": "Pittman, Lauren Wright",
  "date": "2018",
  "where": "United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/lewpstudio_motherhen_thumbnail.jpg",
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
   "Hen"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/57093",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Pittman, Lauren Wright. Mother Hen, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Lauren Wright Pittman, http://www.lewpstudio.com/."
 },
 {
  "id": 57094,
  "title": "Saint of the Gulf",
  "artist": "Pittman, Lauren Wright",
  "date": "2018",
  "where": "United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/lewpstudio_saintofthegulf_thumbnail.jpg",
  "refs": [],
  "days": [],
  "people": [],
  "subjects": [
   "Pelican",
   "Birds"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/57094",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Pittman, Lauren Wright. Saint of the Gulf, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Lauren Wright Pittman, http://www.lewpstudio.com/."
 },
 {
  "id": 57095,
  "title": "Tangled Blessing",
  "artist": "Pittman, Lauren Wright",
  "date": "2017",
  "where": "United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/lewpstudio_tangledblessing_thumbnail.jpg",
  "refs": [
   "Genesis 32:22-31"
  ],
  "days": [
   "",
   "Year A Ash Wednesday"
  ],
  "people": [
   "Jacob (Biblical figure)",
   "God (Biblical figure)",
   "Esau (Biblical figure)"
  ],
  "subjects": [
   "Blessing",
   "Culture: Black",
   "Culture: African American",
   "Struggles",
   "Strife"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/57095",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Pittman, Lauren Wright. Tangled Blessing, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Lauren Wright Pittman, http://www.lewpstudio.com/."
 },
 {
  "id": 57099,
  "title": "NOLA Map [Prepare the Way]",
  "artist": "Pittman, Lauren Wright",
  "date": "2013",
  "where": "United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/lewpstudio_nolamap_thumbnail.jpg",
  "refs": [
   "Matthew 3:1-12"
  ],
  "days": [
   "Year A Advent 2nd  Sunday"
  ],
  "people": [],
  "subjects": [
   "Preparation",
   "Path",
   "Way"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/57099",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Pittman, Lauren Wright. NOLA Map [Prepare the Way], from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Lauren Wright Pittman, http://www.lewpstudio.com/."
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
  "id": 58035,
  "title": "Ezekiel Saw the Wheel",
  "artist": "Johnson, William H., 1901-1970",
  "date": "ca. 1944-1945",
  "where": "Smithsonian American Art Museum, Washington, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Ezekiel58035.jpg",
  "refs": [],
  "days": [
   ""
  ],
  "people": [
   "Ezekiel (Biblical figure)"
  ],
  "subjects": [
   "Vision",
   "Culture: Black",
   "Culture: African American"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/58035",
  "licence": "Public domain",
  "attribution": "Johnson, William H., 1901-1970. Ezekiel Saw the Wheel, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58036,
  "title": "Going to Church",
  "artist": "Johnson, William H., 1901-1970",
  "date": "ca. 1940-1941",
  "where": "Smithsonian American Art Museum, Washington, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/church58036.jpg",
  "refs": [
   "Matthew 18:15-20",
   "Luke 15:1-3, 11b-32"
  ],
  "days": [
   "",
   "Year B Easter 4th Sunday",
   "Year A Proper 18th Sunday",
   "Year C Lent 4th Sunday"
  ],
  "people": [],
  "subjects": [
   "Church",
   "Faith",
   "Worship",
   "Family",
   "Culture: Black",
   "Community",
   "Friendship",
   "Culture: African American"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/58036",
  "licence": "Public domain",
  "attribution": "Johnson, William H., 1901-1970. Going to Church, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58037,
  "title": "Sowing",
  "artist": "Johnson, William H., 1901-1970",
  "date": "ca. 1940-1942",
  "where": "Smithsonian American Art Museum, Washington, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/sowing58037.jpg",
  "refs": [],
  "days": [
   ""
  ],
  "people": [],
  "subjects": [
   "Culture: Black",
   "Sowing seed",
   "Culture: African American",
   "Agriculture"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/58037",
  "licence": "Public domain",
  "attribution": "Johnson, William H., 1901-1970. Sowing, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
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
  "id": 59152,
  "title": "Woman at the Well",
  "artist": "Wesley, Frank, 1923-2002",
  "date": null,
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Woman at the Well-Frank Wesley.jpg",
  "refs": [
   "John 4:5-42"
  ],
  "days": [
   "",
   "Year A Lent 3rd Sunday"
  ],
  "people": [
   "Jesus Christ (Biblical figure)",
   "Woman at the well (Biblical figure)"
  ],
  "subjects": [
   "Culture: Indian"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59152",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Wesley, Frank, 1923-2002. Woman at the Well, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of Frank Wesley, http://www.frankwesleyart.com/main_page.htm."
 },
 {
  "id": 59159,
  "title": "Woman with the Flow of Blood",
  "artist": "Wesley, Frank, 1923-2002",
  "date": null,
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Woman with the Flow of Blood-Frank Wesley.jpg",
  "refs": [
   "Mark 5:21-43",
   "Matthew 9:9-13, 18-26",
   "Luke 8:43-48"
  ],
  "days": [
   "",
   "Year A Proper 5th Sunday",
   "Year B Proper 8th Sunday"
  ],
  "people": [
   "Jesus Christ (Biblical figure)",
   "Woman who touched the cloak of Jesus (Biblical figure)"
  ],
  "subjects": [
   "Faith",
   "Healing",
   "Culture: Indian"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59159",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Wesley, Frank, 1923-2002. Woman with the Flow of Blood, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of Frank Wesley, http://www.frankwesleyart.com/main_page.htm."
 },
 {
  "id": 59160,
  "title": "Walk to Emmaus",
  "artist": "Wesley, Frank, 1923-2002",
  "date": null,
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Walk to Emmaus-Frank Wesley.jpg",
  "refs": [
   "Luke 24:13-35",
   "Luke 24:13-49"
  ],
  "days": [
   "Year A Easter 3rd Sunday",
   "Year A Resurrection of the Lord",
   "Year B Resurrection of the Lord",
   "Year C Resurrection of the Lord"
  ],
  "people": [
   "Jesus Christ (Biblical figure)",
   "Disciples (Biblical figures)"
  ],
  "subjects": [
   "Emmaus: Road"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59160",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Wesley, Frank, 1923-2002. Walk to Emmaus, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of Frank Wesley, http://www.frankwesleyart.com/main_page.htm."
 },
 {
  "id": 59161,
  "title": "Twenty-Third Psalm",
  "artist": "Wesley, Frank, 1923-2002",
  "date": null,
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Twenty-Third Psalm-Frank Wesley.jpg",
  "refs": [
   "Psalm 23"
  ],
  "days": [
   "",
   "Year A Lent 4th Sunday",
   "Year B Proper 11th Sunday",
   "Year B Easter 4th Sunday",
   "Year A Easter 4th Sunday",
   "Year C Easter 4th Sunday",
   "Year A Proper 23rd Sunday"
  ],
  "people": [
   "Samuel (Biblical figure)",
   "Jesse (Biblical figure)"
  ],
  "subjects": [
   "Tree",
   "Holy Spirit",
   "Sheep",
   "Clouds",
   "Shepherd",
   "Culture: Indian",
   "Joy"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59161",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Wesley, Frank, 1923-2002. Twenty-Third Psalm, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of Frank Wesley, http://www.frankwesleyart.com/main_page.htm."
 },
 {
  "id": 59162,
  "title": "Visitation",
  "artist": "Wesley, Frank, 1923-2002",
  "date": null,
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Visitation-Frank Wesley.jpg",
  "refs": [
   "Luke 1:39-57",
   "Luke 1:39-45, (46-55)"
  ],
  "days": [
   "Year A Visitation of Mary to Elizabeth",
   "Year B Visitation of Mary to Elizabeth",
   "Year C Visitation of Mary to Elizabeth",
   "",
   "Year C Advent 4th Sunday"
  ],
  "people": [
   "Mary, the mother of Jesus (Biblical figure)",
   "Elizabeth (Biblical figure)"
  ],
  "subjects": [
   "Visitation",
   "Culture: Indian"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59162",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Wesley, Frank, 1923-2002. Visitation, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of Frank Wesley, http://www.frankwesleyart.com/main_page.htm."
 },
 {
  "id": 59163,
  "title": "The Writing on the Wall",
  "artist": "Wesley, Frank, 1923-2002",
  "date": null,
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/The Writing on the Wall-Frank Wesley.jpg",
  "refs": [
   "Daniel 5:1-28"
  ],
  "days": [
   ""
  ],
  "people": [
   "Daniel (Biblical figure)",
   "Belshazzar (Biblical figure)"
  ],
  "subjects": [
   "Culture: Indian",
   "Feasting"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59163",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Wesley, Frank, 1923-2002. The Writing on the Wall, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of Frank Wesley, http://www.frankwesleyart.com/main_page.htm."
 },
 {
  "id": 59164,
  "title": "The Tenth Piece of Silver",
  "artist": "Wesley, Frank, 1923-2002",
  "date": null,
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/The Tenth Piece of Silver-Frank Wesley.jpg",
  "refs": [
   "Luke 15:1-10"
  ],
  "days": [
   "",
   "Year C Proper 19th Sunday"
  ],
  "people": [],
  "subjects": [
   "Culture: Indian",
   "Parable of the Lost Coin"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59164",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Wesley, Frank, 1923-2002. The Tenth Piece of Silver, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of Frank Wesley, http://www.frankwesleyart.com/main_page.htm."
 },
 {
  "id": 59165,
  "title": "The Publican and the Pharisee",
  "artist": "Wesley, Frank, 1923-2002",
  "date": null,
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/The Publican and the Pharisee-Frank Wesley.jpg",
  "refs": [
   "Luke 18:9-14"
  ],
  "days": [
   "Year C Proper 25th Sunday",
   ""
  ],
  "people": [
   "Pharisees (Biblical figures)",
   "Publican (Biblical figure)"
  ],
  "subjects": [
   "Pride",
   "Humility",
   "Culture: Indian"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59165",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Wesley, Frank, 1923-2002. The Publican and the Pharisee, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of Frank Wesley, http://www.frankwesleyart.com/main_page.htm."
 },
 {
  "id": 59166,
  "title": "To Calvary",
  "artist": "Wesley, Frank, 1923-2002",
  "date": null,
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/To Calvary-Frank Wesley.jpg",
  "refs": [
   "John 18:1-19:42"
  ],
  "days": [
   "Year A Good Friday",
   "",
   "Year B Good Friday",
   "Year C Good Friday"
  ],
  "people": [
   "Jesus Christ (Biblical figure)"
  ],
  "subjects": [
   "Passion of Jesus Christ: Carrying the Cross",
   "Passion of Jesus Christ: Road to Calvary",
   "Culture: Indian"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59166",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Wesley, Frank, 1923-2002. To Calvary, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of Frank Wesley, http://www.frankwesleyart.com/main_page.htm."
 },
 {
  "id": 59167,
  "title": "The Mind of Christ (temptation story)",
  "artist": "Wesley, Frank, 1923-2002",
  "date": null,
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/The Mind of Christ-Frank Wesley.jpg",
  "refs": [
   "Matthew 4:1-11",
   "Luke 4:1-13"
  ],
  "days": [
   "Year A Lent 1st Sunday",
   "Year C Lent 1st Sunday",
   ""
  ],
  "people": [
   "Jesus Christ (Biblical figure)"
  ],
  "subjects": [
   "Temptation of Christ",
   "Wilderness",
   "Rock",
   "Culture: Indian"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59167",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Wesley, Frank, 1923-2002. The Mind of Christ (temptation story), from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of Frank Wesley, http://www.frankwesleyart.com/main_page.htm."
 },
 {
  "id": 59168,
  "title": "The Light of the World",
  "artist": "Wesley, Frank, 1923-2002",
  "date": null,
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/The Light of the World-Frank Wesley.jpg",
  "refs": [
   "Luke 2:(1-7), 8-20",
   "Luke 2:1-14, (15-20)",
   "Matthew 1:18-25",
   "John 1:1-14",
   "John 1:(1-9), 10-18"
  ],
  "days": [
   "Year A Nativity of the Lord Proper I",
   "Year A Christmas 2nd Sunday",
   "Year A Advent 4th Sunday",
   "",
   "Year B Nativity of the Lord Proper I",
   "Year C Nativity of the Lord Proper I",
   "Year B Christmas 2nd Sunday",
   "Year C Christmas 2nd Sunday"
  ],
  "people": [
   "Mary, the mother of Jesus (Biblical figure)",
   "Jesus Christ (Biblical figure)",
   "Joseph, the husband of Mary (Biblical figure)",
   "Shepherds (Biblical figure)"
  ],
  "subjects": [
   "Nativity",
   "Animals",
   "Light",
   "Birth",
   "Culture: Indian"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59168",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Wesley, Frank, 1923-2002. The Light of the World, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of Frank Wesley, http://www.frankwesleyart.com/main_page.htm."
 },
 {
  "id": 59169,
  "title": "The Only Room",
  "artist": "Wesley, Frank, 1923-2002",
  "date": null,
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/The Only Room-Frank Wesley.jpg",
  "refs": [
   "Luke 2:(1-7), 8-20",
   "Luke 2:1-14, (15-20)"
  ],
  "days": [
   "Year A Nativity of the Lord Proper I",
   "",
   "Year B Nativity of the Lord Proper I",
   "Year C Nativity of the Lord Proper I"
  ],
  "people": [
   "Mary, the mother of Jesus (Biblical figure)",
   "Joseph, the husband of Mary (Biblical figure)"
  ],
  "subjects": [
   "Donkey",
   "Culture: Indian"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59169",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Wesley, Frank, 1923-2002. The Only Room, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of Frank Wesley, http://www.frankwesleyart.com/main_page.htm."
 },
 {
  "id": 59170,
  "title": "The Burning Bush",
  "artist": "Wesley, Frank, 1923-2002",
  "date": null,
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/The Burning Bush-Frank Wesley.jpg",
  "refs": [
   "Exodus 3:1-15"
  ],
  "days": [
   "Year A Proper 17th Sunday",
   ""
  ],
  "people": [
   "Moses (Biblical figure)"
  ],
  "subjects": [
   "Burning bush",
   "Tree",
   "Culture: Indian"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59170",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Wesley, Frank, 1923-2002. The Burning Bush, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of Frank Wesley, http://www.frankwesleyart.com/main_page.htm."
 },
 {
  "id": 59171,
  "title": "The Flame Going to Nazareth",
  "artist": "Wesley, Frank, 1923-2002",
  "date": null,
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/The Flame Going to Nazareth-Frank Wesley.jpg",
  "refs": [
   "Luke 2:22-40",
   "Matthew 2:13-23"
  ],
  "days": [
   "Year B Christmas 1st Sunday",
   "Year A Christmas 1st Sunday",
   ""
  ],
  "people": [
   "Mary, the mother of Jesus (Biblical figure)",
   "Jesus Christ (Biblical figure)",
   "Joseph, the husband of Mary (Biblical figure)"
  ],
  "subjects": [
   "Dove",
   "Fire",
   "Journey",
   "Good Shepherd",
   "Culture: Indian"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59171",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Wesley, Frank, 1923-2002. The Flame Going to Nazareth, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of Frank Wesley, http://www.frankwesleyart.com/main_page.htm."
 },
 {
  "id": 59172,
  "title": "The Call to Samuel",
  "artist": "Wesley, Frank, 1923-2002",
  "date": null,
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/The Call to Samuel-Frank Wesley.jpg",
  "refs": [
   "Samuel I, 3:1-10"
  ],
  "days": [
   "Year B Proper 4th Sunday",
   "",
   "Year B Epiphany 2nd Sunday"
  ],
  "people": [
   "Samuel (Biblical figure)"
  ],
  "subjects": [
   "Temple",
   "Culture: Indian"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59172",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Wesley, Frank, 1923-2002. The Call to Samuel, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of Frank Wesley, http://www.frankwesleyart.com/main_page.htm."
 },
 {
  "id": 59173,
  "title": "Stephen Feeding the Poor, Acts 6:3, 5",
  "artist": "Wesley, Frank, 1923-2002",
  "date": null,
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Stephen Feeding the Poor-Frank Wesley.jpg",
  "refs": [
   "Acts 6:3, 5"
  ],
  "days": [
   ""
  ],
  "people": [
   "Stephen (martyr), ca.5-33"
  ],
  "subjects": [
   "Poor",
   "Culture: Indian",
   "Feed the Hungry"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59173",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Wesley, Frank, 1923-2002. Stephen Feeding the Poor, Acts 6:3, 5, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of Frank Wesley, http://www.frankwesleyart.com/main_page.htm."
 },
 {
  "id": 59174,
  "title": "Rest on the Flight",
  "artist": "Wesley, Frank, 1923-2002",
  "date": null,
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Rest on the Flight-Frank Wesley.jpg",
  "refs": [
   "Matthew 2:13-23"
  ],
  "days": [
   "Year A Christmas 1st Sunday",
   ""
  ],
  "people": [
   "Mary, the mother of Jesus (Biblical figure)",
   "Jesus Christ (Biblical figure)",
   "Joseph, the husband of Mary (Biblical figure)"
  ],
  "subjects": [
   "Flight into Egypt",
   "Rest",
   "Birds",
   "Flowers",
   "Culture: Indian",
   "Halo"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59174",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Wesley, Frank, 1923-2002. Rest on the Flight, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of Frank Wesley, http://www.frankwesleyart.com/main_page.htm."
 },
 {
  "id": 59175,
  "title": "Saul Riding to Damascus",
  "artist": "Wesley, Frank, 1923-2002",
  "date": null,
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Saul Riding to Damascus-Frank Wesley.jpg",
  "refs": [
   "Acts 9:1-6, (7-20)"
  ],
  "days": [
   "",
   "Year C Easter 3rd Sunday"
  ],
  "people": [
   "Paul, the Apostle (Biblical figure)"
  ],
  "subjects": [
   "Birds",
   "Clouds",
   "Culture: Indian"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59175",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Wesley, Frank, 1923-2002. Saul Riding to Damascus, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of Frank Wesley, http://www.frankwesleyart.com/main_page.htm."
 },
 {
  "id": 59176,
  "title": "Resurrection Appearance to the Fishermen",
  "artist": "Wesley, Frank, 1923-2002",
  "date": null,
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Resurrection Appearance to the Fishermen-Frank Wesley.jpg",
  "refs": [
   "John 21:1-19"
  ],
  "days": [
   "",
   "Year C Easter 3rd Sunday"
  ],
  "people": [
   "Jesus Christ (Biblical figure)",
   "Disciples (Biblical figures)"
  ],
  "subjects": [
   "Boats",
   "Resurrection",
   "Culture: Indian"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59176",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Wesley, Frank, 1923-2002. Resurrection Appearance to the Fishermen, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of Frank Wesley, http://www.frankwesleyart.com/main_page.htm."
 },
 {
  "id": 59177,
  "title": "Red Magnificat",
  "artist": "Wesley, Frank, 1923-2002",
  "date": null,
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Red Magnificat-Frank Wesley.jpg",
  "refs": [
   "Luke 1:46b-55"
  ],
  "days": [
   "Year B Advent 4th Sunday",
   "Year A Advent 3rd Sunday",
   "Year B Advent 3rd Sunday",
   "",
   "Year C Advent 4th Sunday"
  ],
  "people": [
   "Mary, the mother of Jesus (Biblical figure)"
  ],
  "subjects": [
   "Faith",
   "Culture: Indian",
   "Praise",
   "Joy",
   "Magnificat",
   "Advent",
   "Red"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59177",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Wesley, Frank, 1923-2002. Red Magnificat, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of Frank Wesley, http://www.frankwesleyart.com/main_page.htm."
 },
 {
  "id": 59178,
  "title": "Raising of Lazarus",
  "artist": "Wesley, Frank, 1923-2002",
  "date": null,
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Raising of Lazarus-Frank Wesley.jpg",
  "refs": [
   "John 11:1-45"
  ],
  "days": [
   "Year A Lent 5th  Sunday",
   ""
  ],
  "people": [
   "Jesus Christ (Biblical figure)",
   "Martha, of Bethany (Biblical figure)",
   "Mary, of Bethany (Biblical figure)",
   "Lazarus, of Bethany (Biblical figure)"
  ],
  "subjects": [
   "Raising from the Dead",
   "Culture: Indian"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59178",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Wesley, Frank, 1923-2002. Raising of Lazarus, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of Frank Wesley, http://www.frankwesleyart.com/main_page.htm."
 },
 {
  "id": 59179,
  "title": "Palm Sunday",
  "artist": "Wesley, Frank, 1923-2002",
  "date": "1960-1965",
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Palm Sunday-Frank Wesley.jpg",
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
  "people": [
   "Jesus Christ (Biblical figure)"
  ],
  "subjects": [
   "Culture: Indian",
   "Palm Sunday",
   "Palms"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59179",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Wesley, Frank, 1923-2002. Palm Sunday, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of Frank Wesley, http://www.frankwesleyart.com/main_page.htm."
 },
 {
  "id": 59180,
  "title": "New Wine in Old Wineskins",
  "artist": "Wesley, Frank, 1923-2002",
  "date": null,
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/New Wine in Old Wineskins-Frank Wesley.jpg",
  "refs": [
   "Mark 2:13-22"
  ],
  "days": [
   "",
   "Year B Epiphany 8th Sunday"
  ],
  "people": [],
  "subjects": [
   "Light",
   "Culture: Indian"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59180",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Wesley, Frank, 1923-2002. New Wine in Old Wineskins, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of Frank Wesley, http://www.frankwesleyart.com/main_page.htm."
 },
 {
  "id": 59181,
  "title": "Peter's Denial",
  "artist": "Wesley, Frank, 1923-2002",
  "date": null,
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Peter's Denial-Frank Wesley.jpg",
  "refs": [
   "Matthew 26:14-27:66",
   "Mark 14:1-15:47",
   "Luke 22:14-23:56",
   "John 18:1-19:42"
  ],
  "days": [
   "Year A Liturgy of Pass",
   "Year B Liturgy of Pass",
   "Year C Liturgy of Pass",
   "Year A Good Friday"
  ],
  "people": [
   "Peter, the Apostle (Biblical figure)"
  ],
  "subjects": [
   "Passion of Jesus Christ: Denial of Peter",
   "Rooster"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59181",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Wesley, Frank, 1923-2002. Peter's Denial, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of Frank Wesley, http://www.frankwesleyart.com/main_page.htm."
 },
 {
  "id": 59182,
  "title": "Nativity",
  "artist": "Wesley, Frank, 1923-2002",
  "date": null,
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Nativity-Frank Wesley.jpg",
  "refs": [
   "Luke 2:(1-7), 8-20",
   "Luke 2:1-14, (15-20)",
   "John 1:(1-9), 10-18"
  ],
  "days": [
   "Year A Nativity of the Lord Proper I",
   "Year A Christmas 2nd Sunday",
   "",
   "Year B Nativity of the Lord Proper I",
   "Year C Nativity of the Lord Proper I",
   "Year B Christmas 2nd Sunday",
   "Year C Christmas 2nd Sunday"
  ],
  "people": [
   "Mary, the mother of Jesus (Biblical figure)",
   "Jesus Christ (Biblical figure)"
  ],
  "subjects": [
   "Nativity",
   "Culture: Indian",
   "Halo"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59182",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Wesley, Frank, 1923-2002. Nativity, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of Frank Wesley, http://www.frankwesleyart.com/main_page.htm."
 },
 {
  "id": 59183,
  "title": "Noah",
  "artist": "Wesley, Frank, 1923-2002",
  "date": null,
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Noah-Frank Wesley.jpg",
  "refs": [
   "Genesis 6:9-22; 7:24; 8:14-19",
   "Genesis 7:1-5, 11-18; 8:6-18; 9:8-13"
  ],
  "days": [
   "Year A Easter Vigil",
   "Year B Easter Vigil",
   "Year C Easter Vigil",
   "Year A Proper 4th Sunday",
   ""
  ],
  "people": [
   "Noah (Biblical figure)"
  ],
  "subjects": [
   "Dove",
   "Noahs Ark",
   "Culture: Indian"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59183",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Wesley, Frank, 1923-2002. Noah, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of Frank Wesley, http://www.frankwesleyart.com/main_page.htm."
 },
 {
  "id": 59184,
  "title": "Nativity with Women Attending",
  "artist": "Wesley, Frank, 1923-2002",
  "date": null,
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Nativity with Women Attending-Frank Wesley.jpg",
  "refs": [
   "Luke 2:(1-7), 8-20",
   "Luke 2:1-14, (15-20)"
  ],
  "days": [
   "Year A Nativity of the Lord Proper I",
   "",
   "Year B Nativity of the Lord Proper I",
   "Year C Nativity of the Lord Proper I"
  ],
  "people": [
   "Mary, the mother of Jesus (Biblical figure)",
   "Jesus Christ (Biblical figure)"
  ],
  "subjects": [
   "Nativity",
   "Birth",
   "Culture: Indian"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59184",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Wesley, Frank, 1923-2002. Nativity with Women Attending, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of Frank Wesley, http://www.frankwesleyart.com/main_page.htm."
 },
 {
  "id": 59185,
  "title": "Moses and the Burning Bush",
  "artist": "Wesley, Frank, 1923-2002",
  "date": null,
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Moses and the Burning Bush-Frank Wesley.jpg",
  "refs": [
   "Exodus 3:1-15"
  ],
  "days": [
   "Year A Proper 17th Sunday",
   ""
  ],
  "people": [
   "Moses (Biblical figure)"
  ],
  "subjects": [
   "Burning bush",
   "Culture: Indian",
   "Eye of God"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59185",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Wesley, Frank, 1923-2002. Moses and the Burning Bush, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of Frank Wesley, http://www.frankwesleyart.com/main_page.htm."
 },
 {
  "id": 59186,
  "title": "Nativity with Children",
  "artist": "Wesley, Frank, 1923-2002",
  "date": null,
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Nativity with Children-Frank Wesley.jpg",
  "refs": [
   "Luke 2:(1-7), 8-20",
   "Luke 2:1-14, (15-20)",
   "Matthew 19:14"
  ],
  "days": [
   "Year A Nativity of the Lord Proper I",
   "Year B Nativity of the Lord Proper I",
   "Year C Nativity of the Lord Proper I"
  ],
  "people": [
   "Mary, the mother of Jesus (Biblical figure)",
   "Jesus Christ (Biblical figure)"
  ],
  "subjects": [
   "Nativity",
   "Children",
   "Culture: Indian"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59186",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Wesley, Frank, 1923-2002. Nativity with Children, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of Frank Wesley, http://www.frankwesleyart.com/main_page.htm."
 },
 {
  "id": 59187,
  "title": "Mary Magdalene Washing the Feet of Jesus",
  "artist": "Wesley, Frank, 1923-2002",
  "date": null,
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Mary Magdalene Washing the Feet of Jesus-Frank Wesley.jpg",
  "refs": [
   "Luke 7:36-8:3"
  ],
  "days": [
   "",
   "Year C Proper 6th Sunday"
  ],
  "people": [
   "Mary Magdalene (Biblical figure)"
  ],
  "subjects": [
   "Anointing of Jesus",
   "Culture: Indian",
   "Tears"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59187",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Wesley, Frank, 1923-2002. Mary Magdalene Washing the Feet of Jesus, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of Frank Wesley, http://www.frankwesleyart.com/main_page.htm."
 },
 {
  "id": 59188,
  "title": "Meeting with the Rich Young Ruler",
  "artist": "Wesley, Frank, 1923-2002",
  "date": null,
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Meeting with the Rich Young Ruler-Frank Wesley.jpg",
  "refs": [
   "Mark 10:17-31"
  ],
  "days": [
   "",
   "Year B Proper 23rd Sunday"
  ],
  "people": [
   "Jesus Christ (Biblical figure)",
   "Rich Young Man (Biblical figure)"
  ],
  "subjects": [
   "Rich",
   "Wealth",
   "Culture: Indian",
   "Eternal life"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59188",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Wesley, Frank, 1923-2002. Meeting with the Rich Young Ruler, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of Frank Wesley, http://www.frankwesleyart.com/main_page.htm."
 },
 {
  "id": 59189,
  "title": "Mary at the Tomb",
  "artist": "Wesley, Frank, 1923-2002",
  "date": null,
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Mary at the Tomb-Frank Wesley.jpg",
  "refs": [
   "John 20:1-18"
  ],
  "days": [
   "Year A Resurrection of the Lord",
   "",
   "Year B Resurrection of the Lord",
   "Year C Resurrection of the Lord"
  ],
  "people": [
   "Mary Magdalene (Biblical figure)"
  ],
  "subjects": [
   "Death",
   "Tree",
   "Resurrection of Jesus",
   "Empty Tomb",
   "Culture: Indian"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59189",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Wesley, Frank, 1923-2002. Mary at the Tomb, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of Frank Wesley, http://www.frankwesleyart.com/main_page.htm."
 },
 {
  "id": 59190,
  "title": "Mary Going to Visit Elizabeth",
  "artist": "Wesley, Frank, 1923-2002",
  "date": null,
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Mary Going to Visit Elizabeth-Frank Wesley.jpg",
  "refs": [
   "Luke 1:39-57"
  ],
  "days": [
   "Year A Visitation of Mary to Elizabeth",
   "Year B Visitation of Mary to Elizabeth",
   "Year C Visitation of Mary to Elizabeth",
   ""
  ],
  "people": [
   "Mary, the mother of Jesus (Biblical figure)"
  ],
  "subjects": [
   "Visitation",
   "Dove",
   "Peacock",
   "Birds",
   "Culture: Indian"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59190",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Wesley, Frank, 1923-2002. Mary Going to Visit Elizabeth, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of Frank Wesley, http://www.frankwesleyart.com/main_page.htm."
 },
 {
  "id": 59191,
  "title": "Madonna of the Mango Grove",
  "artist": "Wesley, Frank, 1923-2002",
  "date": null,
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Madonna of the Mango Grove-Frank Wesley.jpg",
  "refs": [],
  "days": [
   ""
  ],
  "people": [
   "Mary, the mother of Jesus (Biblical figure)",
   "Jesus Christ (Biblical figure)"
  ],
  "subjects": [
   "Tree",
   "Madonna and Child",
   "Culture: Indian"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59191",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Wesley, Frank, 1923-2002. Madonna of the Mango Grove, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of Frank Wesley, http://www.frankwesleyart.com/main_page.htm."
 },
 {
  "id": 59192,
  "title": "Madonna on Vermilion",
  "artist": "Wesley, Frank, 1923-2002",
  "date": null,
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Madonna on Vermilion-Frank Wesley.jpg",
  "refs": [],
  "days": [
   ""
  ],
  "people": [
   "Mary, the mother of Jesus (Biblical figure)"
  ],
  "subjects": [
   "Dove",
   "Madonna and Child",
   "Culture: Indian"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59192",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Wesley, Frank, 1923-2002. Madonna on Vermilion, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of Frank Wesley, http://www.frankwesleyart.com/main_page.htm."
 },
 {
  "id": 59193,
  "title": "Magnificat on Silk",
  "artist": "Wesley, Frank, 1923-2002",
  "date": null,
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Magnificat on Silk-Frank Wesley.jpg",
  "refs": [
   "Luke 1:46b-55"
  ],
  "days": [
   "Year B Advent 4th Sunday",
   "Year A Advent 3rd Sunday",
   "Year B Advent 3rd Sunday",
   "Year C Advent 4th Sunday"
  ],
  "people": [
   "Mary, the mother of Jesus (Biblical figure)"
  ],
  "subjects": [
   "Culture: Indian",
   "Magnificat"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59193",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Wesley, Frank, 1923-2002. Magnificat on Silk, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of Frank Wesley, http://www.frankwesleyart.com/main_page.htm."
 },
 {
  "id": 59194,
  "title": "Madonna of the Lotus Pool",
  "artist": "Wesley, Frank, 1923-2002",
  "date": null,
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Madonna of the Lotus Pool-Frank Wesley.jpg",
  "refs": [],
  "days": [
   ""
  ],
  "people": [
   "Mary, the mother of Jesus (Biblical figure)",
   "Jesus Christ (Biblical figure)"
  ],
  "subjects": [
   "Madonna and Child",
   "Flowers",
   "Culture: Indian"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59194",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Wesley, Frank, 1923-2002. Madonna of the Lotus Pool, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of Frank Wesley, http://www.frankwesleyart.com/main_page.htm."
 },
 {
  "id": 59195,
  "title": "Lazarus at the Door of the Rich Man",
  "artist": "Wesley, Frank, 1923-2002",
  "date": null,
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Lazarus at the Door of the Rich Man-Frank Wesley.jpg",
  "refs": [
   "Luke 16:19-31"
  ],
  "days": [
   "Year C Proper 21st Sunday",
   ""
  ],
  "people": [
   "Lazarus (of Luke 16:19-21, Biblical figure)"
  ],
  "subjects": [
   "Dog",
   "Poor",
   "Poverty",
   "Culture: Indian"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59195",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Wesley, Frank, 1923-2002. Lazarus at the Door of the Rich Man, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of Frank Wesley, http://www.frankwesleyart.com/main_page.htm."
 },
 {
  "id": 59196,
  "title": "Madonna of the Charpoi",
  "artist": "Wesley, Frank, 1923-2002",
  "date": null,
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Madonna of the Charpoi-Frank Wesley.jpg",
  "refs": [],
  "days": [
   ""
  ],
  "people": [
   "Mary, the mother of Jesus (Biblical figure)",
   "Jesus Christ (Biblical figure)"
  ],
  "subjects": [
   "Madonna and Child",
   "Culture: Indian"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59196",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Wesley, Frank, 1923-2002. Madonna of the Charpoi, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of Frank Wesley, http://www.frankwesleyart.com/main_page.htm."
 },
 {
  "id": 59197,
  "title": "Madonna Behind a Wall",
  "artist": "Wesley, Frank, 1923-2002",
  "date": null,
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Madonna Behind a Wall-Frank Wesley.jpg",
  "refs": [],
  "days": [
   ""
  ],
  "people": [
   "Mary, the mother of Jesus (Biblical figure)",
   "Jesus Christ (Biblical figure)"
  ],
  "subjects": [
   "Madonna and Child",
   "Culture: Indian"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59197",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Wesley, Frank, 1923-2002. Madonna Behind a Wall, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of Frank Wesley, http://www.frankwesleyart.com/main_page.htm."
 },
 {
  "id": 59198,
  "title": "Jonah in the Whale",
  "artist": "Wesley, Frank, 1923-2002",
  "date": null,
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Jonah in the Whale-Frank Wesley.jpg",
  "refs": [
   "Jonah 2:1-3:2",
   "Jonah 1:17"
  ],
  "days": [
   ""
  ],
  "people": [
   "Jonah (Biblical figure)"
  ],
  "subjects": [
   "Culture: Indian",
   "Eye of God",
   "Whale"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59198",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Wesley, Frank, 1923-2002. Jonah in the Whale, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of Frank Wesley, http://www.frankwesleyart.com/main_page.htm."
 },
 {
  "id": 59199,
  "title": "Home in Nazareth",
  "artist": "Wesley, Frank, 1923-2002",
  "date": null,
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Home in Nazareth-Frank Wesley.jpg",
  "refs": [
   "Matthew 2:13-23"
  ],
  "days": [
   "Year A Christmas 1st Sunday",
   ""
  ],
  "people": [
   "Mary, the mother of Jesus (Biblical figure)",
   "Jesus Christ (Biblical figure)",
   "Joseph, the husband of Mary (Biblical figure)"
  ],
  "subjects": [
   "Holy Family",
   "Childhood of Jesus",
   "Culture: Indian"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59199",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Wesley, Frank, 1923-2002. Home in Nazareth, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of Frank Wesley, http://www.frankwesleyart.com/main_page.htm."
 },
 {
  "id": 59200,
  "title": "Jacob and Rachel",
  "artist": "Wesley, Frank, 1923-2002",
  "date": null,
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Jacob and Rachel-Frank Wesley.jpg",
  "refs": [
   "Genesis 29:15-28",
   "Song of Solomon 4:1-4"
  ],
  "days": [
   "",
   "Year A Proper 12th Sunday"
  ],
  "people": [
   "Jacob (Biblical figure)",
   "Rachel (Biblical figure)"
  ],
  "subjects": [
   "Culture: Indian"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59200",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Wesley, Frank, 1923-2002. Jacob and Rachel, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of Frank Wesley, http://www.frankwesleyart.com/main_page.htm."
 },
 {
  "id": 59201,
  "title": "Holy Family in Saffron",
  "artist": "Wesley, Frank, 1923-2002",
  "date": null,
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Holy Family in Saffron-Frank Wesley.jpg",
  "refs": [
   "Luke 2:(1-7), 8-20",
   "Luke 2:22-40",
   "Luke 2:1-14, (15-20)"
  ],
  "days": [
   "Year A Nativity of the Lord Proper I",
   "Year B Christmas 1st Sunday",
   "",
   "Year C Presentation of the Lord",
   "Year B Nativity of the Lord Proper I",
   "Year C Nativity of the Lord Proper I",
   "Year A Presentation of the Lord",
   "Year B Presentation of the Lord"
  ],
  "people": [
   "Mary, the mother of Jesus (Biblical figure)",
   "Jesus Christ (Biblical figure)",
   "Joseph, the husband of Mary (Biblical figure)"
  ],
  "subjects": [
   "Holy Family",
   "Culture: Indian"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59201",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Wesley, Frank, 1923-2002. Holy Family in Saffron, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of Frank Wesley, http://www.frankwesleyart.com/main_page.htm."
 },
 {
  "id": 59203,
  "title": "Good Samaritan in Tibet",
  "artist": "Wesley, Frank, 1923-2002",
  "date": null,
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Good Samaritan in Tibet-Frank Wesley.jpg",
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
   "Culture: Indian"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59203",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Wesley, Frank, 1923-2002. Good Samaritan in Tibet, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of Frank Wesley, http://www.frankwesleyart.com/main_page.htm."
 },
 {
  "id": 59204,
  "title": "Flight by Boat",
  "artist": "Wesley, Frank, 1923-2002",
  "date": null,
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Flight by Boat-Frank Wesley.jpg",
  "refs": [
   "Matthew 2:13-23"
  ],
  "days": [
   "Year A Christmas 1st Sunday",
   ""
  ],
  "people": [
   "Mary, the mother of Jesus (Biblical figure)",
   "Jesus Christ (Biblical figure)",
   "Joseph, the husband of Mary (Biblical figure)"
  ],
  "subjects": [
   "Flight into Egypt",
   "Boats",
   "Culture: Indian"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59204",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Wesley, Frank, 1923-2002. Flight by Boat, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of Frank Wesley, http://www.frankwesleyart.com/main_page.htm."
 },
 {
  "id": 59205,
  "title": "Flight into Egypt",
  "artist": "Wesley, Frank, 1923-2002",
  "date": null,
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Flight into Egypt-Frank Wesley.jpg",
  "refs": [
   "Matthew 2:13-23"
  ],
  "days": [
   "Year A Christmas 1st Sunday",
   ""
  ],
  "people": [
   "Mary, the mother of Jesus (Biblical figure)",
   "Jesus Christ (Biblical figure)",
   "Joseph, the husband of Mary (Biblical figure)"
  ],
  "subjects": [
   "Flight into Egypt",
   "Culture: Indian"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59205",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Wesley, Frank, 1923-2002. Flight into Egypt, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of Frank Wesley, http://www.frankwesleyart.com/main_page.htm."
 },
 {
  "id": 59206,
  "title": "Hagar and Ishmael",
  "artist": "Wesley, Frank, 1923-2002",
  "date": null,
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Hagar and Ishmael-Frank Wesley.jpg",
  "refs": [
   "Genesis 21:8-21"
  ],
  "days": [
   "",
   "Year A Proper 7th Sunday"
  ],
  "people": [
   "Hagar (Biblical figure)",
   "Ishmael (Biblical figure)"
  ],
  "subjects": [
   "Culture: Indian",
   "Hardship"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59206",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Wesley, Frank, 1923-2002. Hagar and Ishmael, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of Frank Wesley, http://www.frankwesleyart.com/main_page.htm."
 },
 {
  "id": 59207,
  "title": "Forgiving Father",
  "artist": "Wesley, Frank, 1923-2002",
  "date": null,
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Forgiving Father-Frank Wesley.jpg",
  "refs": [
   "Luke 15:1-3, 11b-32"
  ],
  "days": [
   "",
   "Year C Lent 4th Sunday"
  ],
  "people": [],
  "subjects": [
   "Forgiveness",
   "Parable of the Prodigal Son",
   "Culture: Indian"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59207",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Wesley, Frank, 1923-2002. Forgiving Father, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of Frank Wesley, http://www.frankwesleyart.com/main_page.htm."
 },
 {
  "id": 59208,
  "title": "Finding of Moses",
  "artist": "Wesley, Frank, 1923-2002",
  "date": null,
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Finding of Moses-Frank Wesley.jpg",
  "refs": [
   "Exodus 2:1-10"
  ],
  "days": [
   ""
  ],
  "people": [
   "Moses (Biblical figure)",
   "Miriam (Biblical figure)"
  ],
  "subjects": [
   "Water",
   "Tree",
   "Culture: Indian"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59208",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Wesley, Frank, 1923-2002. Finding of Moses, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of Frank Wesley, http://www.frankwesleyart.com/main_page.htm."
 },
 {
  "id": 59209,
  "title": "Eve and the Serpent",
  "artist": "Wesley, Frank, 1923-2002",
  "date": null,
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Eve and the Serpent-Frank Wesley.jpg",
  "refs": [
   "Genesis 3:1-5"
  ],
  "days": [
   ""
  ],
  "people": [
   "Eve (Biblical figure)"
  ],
  "subjects": [
   "Serpent",
   "Garden of Eden",
   "Fruit",
   "Culture: Indian",
   "Tree of the Knowledge of Good and Evil"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59209",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Wesley, Frank, 1923-2002. Eve and the Serpent, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of Frank Wesley, http://www.frankwesleyart.com/main_page.htm."
 },
 {
  "id": 59212,
  "title": "Elisha Raising the Widow's Son",
  "artist": "Wesley, Frank, 1923-2002",
  "date": null,
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Elisha Raising the Widow's Son-Frank Wesley.jpg",
  "refs": [
   "Kings II, 4:8-37"
  ],
  "days": [
   ""
  ],
  "people": [
   "Elisha (Biblical figure)"
  ],
  "subjects": [
   "Healing",
   "Raising from the Dead",
   "Culture: Indian",
   "Living Water"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59212",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Wesley, Frank, 1923-2002. Elisha Raising the Widow's Son, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of Frank Wesley, http://www.frankwesleyart.com/main_page.htm."
 },
 {
  "id": 59213,
  "title": "Easter Morning",
  "artist": "Wesley, Frank, 1923-2002",
  "date": null,
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Easter Morning-Frank Wesley.jpg",
  "refs": [
   "Matthew 28:1-10"
  ],
  "days": [
   "Year A Easter Vigil",
   "Year A Resurrection of the Lord",
   ""
  ],
  "people": [
   "Jesus Christ (Biblical figure)",
   "Mary Magdalene (Biblical figure)"
  ],
  "subjects": [
   "Resurrection of Jesus",
   "Culture: Indian"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59213",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Wesley, Frank, 1923-2002. Easter Morning, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of Frank Wesley, http://www.frankwesleyart.com/main_page.htm."
 },
 {
  "id": 59214,
  "title": "Elegant Madonna",
  "artist": "Wesley, Frank, 1923-2002",
  "date": null,
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Elegant Madonna-Frank Wesley.jpg",
  "refs": [
   "John 1:(1-9), 10-18"
  ],
  "days": [
   "Year A Christmas 2nd Sunday",
   "",
   "Year B Christmas 2nd Sunday",
   "Year C Christmas 2nd Sunday"
  ],
  "people": [
   "Mary, the mother of Jesus (Biblical figure)",
   "Jesus Christ (Biblical figure)"
  ],
  "subjects": [
   "Madonna and Child",
   "Culture: Indian",
   "Joy",
   "Halo"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59214",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Wesley, Frank, 1923-2002. Elegant Madonna, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of Frank Wesley, http://www.frankwesleyart.com/main_page.htm."
 },
 {
  "id": 59215,
  "title": "Did You Eat Yesterday?",
  "artist": "Wesley, Frank, 1923-2002",
  "date": "1959",
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Did You Eat Yesterday-Frank Wesley.jpg",
  "refs": [
   "Amos 2:6-7"
  ],
  "days": [
   ""
  ],
  "people": [],
  "subjects": [
   "Children",
   "Poor",
   "Poverty",
   "Woman",
   "Hunger",
   "Needy",
   "Culture: Indian"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59215",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Wesley, Frank, 1923-2002. Did You Eat Yesterday?, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of Frank Wesley, http://www.frankwesleyart.com/main_page.htm."
 },
 {
  "id": 59216,
  "title": "Death of Moses",
  "artist": "Wesley, Frank, 1923-2002",
  "date": null,
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Death of Moses-Frank Wesley.jpg",
  "refs": [
   "Deuteronomy 34:1-12"
  ],
  "days": [
   "Year A Proper 25th Sunday",
   ""
  ],
  "people": [
   "Moses (Biblical figure)"
  ],
  "subjects": [
   "Hand of God",
   "Death",
   "Hands",
   "Culture: Indian",
   "Eternity"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59216",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Wesley, Frank, 1923-2002. Death of Moses, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of Frank Wesley, http://www.frankwesleyart.com/main_page.htm."
 },
 {
  "id": 59217,
  "title": "Dedication of Paul and Barnabas",
  "artist": "Wesley, Frank, 1923-2002",
  "date": null,
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Dedication of Paul and  Barnabas-Frank Wesley.jpg",
  "refs": [
   "Acts 13:2-3"
  ],
  "days": [
   ""
  ],
  "people": [
   "Paul, the Apostle (Biblical figure)",
   "Barnabas (Biblical figure)"
  ],
  "subjects": [
   "Dedication",
   "Culture: Indian",
   "Laying on of Hands"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59217",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Wesley, Frank, 1923-2002. Dedication of Paul and Barnabas, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of Frank Wesley, http://www.frankwesleyart.com/main_page.htm."
 },
 {
  "id": 59218,
  "title": "Crucifixion",
  "artist": "Wesley, Frank, 1923-2002",
  "date": null,
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Crucifixion-Frank Wesley.jpg",
  "refs": [
   "Luke 24:13-49"
  ],
  "days": [
   "Year A Resurrection of the Lord",
   "",
   "Year B Resurrection of the Lord",
   "Year C Resurrection of the Lord"
  ],
  "people": [
   "Jesus Christ (Biblical figure)"
  ],
  "subjects": [
   "Passion of Jesus Christ: Crucifixion of Jesus",
   "Love",
   "Light",
   "Forgiveness",
   "Culture: Indian",
   "Red"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59218",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Wesley, Frank, 1923-2002. Crucifixion, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of Frank Wesley, http://www.frankwesleyart.com/main_page.htm."
 },
 {
  "id": 59219,
  "title": "Cleansing of the Leper",
  "artist": "Wesley, Frank, 1923-2002",
  "date": null,
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Cleansing of the Leper-Frank Wesley.jpg",
  "refs": [
   "Matthew 8:2-3"
  ],
  "days": [
   ""
  ],
  "people": [
   "Jesus Christ (Biblical figure)"
  ],
  "subjects": [
   "Poor",
   "Healing",
   "Leprosy",
   "Culture: Indian"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59219",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Wesley, Frank, 1923-2002. Cleansing of the Leper, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of Frank Wesley, http://www.frankwesleyart.com/main_page.htm."
 },
 {
  "id": 59220,
  "title": "Daniel in the Lion's Cave",
  "artist": "Wesley, Frank, 1923-2002",
  "date": null,
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Daniel in the Lion's Cave-Frank Wesley.jpg",
  "refs": [
   "Daniel 6"
  ],
  "days": [
   ""
  ],
  "people": [
   "Daniel (Biblical figure)"
  ],
  "subjects": [
   "Hand of God",
   "Lions",
   "Culture: Indian"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59220",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Wesley, Frank, 1923-2002. Daniel in the Lion's Cave, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of Frank Wesley, http://www.frankwesleyart.com/main_page.htm."
 },
 {
  "id": 59221,
  "title": "Boy Jesus in the Temple",
  "artist": "Wesley, Frank, 1923-2002",
  "date": null,
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Boy Jesus in the Temple-Frank Wesley.jpg",
  "refs": [
   "Luke 2:41-52"
  ],
  "days": [
   "Year C Christmas 1st Sunday"
  ],
  "people": [
   "Mary, the mother of Jesus (Biblical figure)",
   "Jesus Christ (Biblical figure)",
   "Joseph, the husband of Mary (Biblical figure)"
  ],
  "subjects": [
   "Temple",
   "Childhood of Jesus",
   "Teaching",
   "Peacock"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59221",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Wesley, Frank, 1923-2002. Boy Jesus in the Temple, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of Frank Wesley, http://www.frankwesleyart.com/main_page.htm."
 },
 {
  "id": 59222,
  "title": "Churinga (pure light, glory of God)",
  "artist": "Wesley, Frank, 1923-2002",
  "date": null,
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Churinga (pure light, glory of God)-Frank Wesley.jpg",
  "refs": [
   "Exodus 33:12-23"
  ],
  "days": [
   "",
   "Year A Proper 24th Sunday"
  ],
  "people": [],
  "subjects": [
   "Fire",
   "Glory",
   "Light",
   "Culture: Indian",
   "Culture: Indigenous Peoples"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59222",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Wesley, Frank, 1923-2002. Churinga (pure light, glory of God), from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of Frank Wesley, http://www.frankwesleyart.com/main_page.htm."
 },
 {
  "id": 59223,
  "title": "Cain and Abel",
  "artist": "Wesley, Frank, 1923-2002",
  "date": null,
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Cain and Abel-Frank Wesley.jpg",
  "refs": [
   "Genesis 4:1-16"
  ],
  "days": [
   ""
  ],
  "people": [
   "Abel (Biblical figure)",
   "Cain (Biblical figure)"
  ],
  "subjects": [
   "Cross",
   "Rock",
   "Sin",
   "Culture: Indian"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59223",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Wesley, Frank, 1923-2002. Cain and Abel, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of Frank Wesley, http://www.frankwesleyart.com/main_page.htm."
 },
 {
  "id": 59224,
  "title": "Boy Jesus with the Teachers",
  "artist": "Wesley, Frank, 1923-2002",
  "date": null,
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Boy Jesus with the Teachers-Frank Wesley.jpg",
  "refs": [
   "Luke 2:41-52"
  ],
  "days": [
   "Year C Christmas 1st Sunday",
   ""
  ],
  "people": [
   "Jesus Christ (Biblical figure)"
  ],
  "subjects": [
   "Childhood of Jesus",
   "Teaching",
   "Culture: Indian"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59224",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Wesley, Frank, 1923-2002. Boy Jesus with the Teachers, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of Frank Wesley, http://www.frankwesleyart.com/main_page.htm."
 },
 {
  "id": 59225,
  "title": "Body of Christ",
  "artist": "Wesley, Frank, 1923-2002",
  "date": null,
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Body of Christ-Frank Wesley.jpg",
  "refs": [
   "Mark 14:1-15:47"
  ],
  "days": [
   "Year B Liturgy of Pass",
   ""
  ],
  "people": [
   "Jesus Christ (Biblical figure)"
  ],
  "subjects": [
   "Fish",
   "Fire",
   "Passion of Jesus Christ: Gethsemane",
   "Culture: Indian",
   "Eye of God"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59225",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Wesley, Frank, 1923-2002. Body of Christ, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of Frank Wesley, http://www.frankwesleyart.com/main_page.htm."
 },
 {
  "id": 59226,
  "title": "Blue Madonna",
  "artist": "Wesley, Frank, 1923-2002",
  "date": null,
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Blue Madonna-Frank Wesley-standard-scale-2_00x.jpg",
  "refs": [
   "Matthew 1:18-25"
  ],
  "days": [
   "Year A Advent 4th Sunday",
   ""
  ],
  "people": [
   "Mary, the mother of Jesus (Biblical figure)",
   "Jesus Christ (Biblical figure)"
  ],
  "subjects": [
   "Madonna and Child",
   "Culture: Indian"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59226",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Wesley, Frank, 1923-2002. Blue Madonna, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of Frank Wesley, http://www.frankwesleyart.com/main_page.htm."
 },
 {
  "id": 59227,
  "title": "Christ the Lord",
  "artist": "Wesley, Frank, 1923-2002",
  "date": null,
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Christ the Lord-Frank Wesley.jpg",
  "refs": [
   "Luke 2:41-52"
  ],
  "days": [
   "Year C Christmas 1st Sunday",
   ""
  ],
  "people": [
   "Jesus Christ (Biblical figure)"
  ],
  "subjects": [
   "Wisdom",
   "Knowledge",
   "Culture: Indian"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59227",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Wesley, Frank, 1923-2002. Christ the Lord, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of Frank Wesley, http://www.frankwesleyart.com/main_page.htm."
 },
 {
  "id": 59228,
  "title": "Black Madonna",
  "artist": "Wesley, Frank, 1923-2002",
  "date": null,
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Black Madonna-Frank Wesley-standard-scale-2_00x.jpg",
  "refs": [
   "Matthew 5:1-12"
  ],
  "days": [
   "Year A All Saints Day",
   "",
   "Year A Epiphany 4thSunday"
  ],
  "people": [
   "Mary, the mother of Jesus (Biblical figure)",
   "Jesus Christ (Biblical figure)"
  ],
  "subjects": [
   "Madonna and Child",
   "Culture: Indian"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59228",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Wesley, Frank, 1923-2002. Black Madonna, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of Frank Wesley, http://www.frankwesleyart.com/main_page.htm."
 },
 {
  "id": 59229,
  "title": "Australian Christmas",
  "artist": "Wesley, Frank, 1923-2002",
  "date": null,
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Australian Christmas-Frank Wesley.jpg",
  "refs": [
   "Luke 2:(1-7), 8-20",
   "Luke 2:1-14, (15-20)"
  ],
  "days": [
   "Year A Nativity of the Lord Proper I",
   "",
   "Year B Nativity of the Lord Proper I",
   "Year C Nativity of the Lord Proper I"
  ],
  "people": [
   "Mary, the mother of Jesus (Biblical figure)",
   "Jesus Christ (Biblical figure)",
   "Joseph, the husband of Mary (Biblical figure)"
  ],
  "subjects": [
   "Nativity",
   "Culture: Indian",
   "Culture: Indigenous Peoples"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59229",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Wesley, Frank, 1923-2002. Australian Christmas, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of Frank Wesley, http://www.frankwesleyart.com/main_page.htm."
 },
 {
  "id": 59231,
  "title": "Blessed are the Poor",
  "artist": "Wesley, Frank, 1923-2002",
  "date": null,
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Blessed are the Poor-Frank Wesley-lines-scale-4_00x.jpg",
  "refs": [
   "Matthew 5:1-12"
  ],
  "days": [
   "Year A All Saints Day",
   "",
   "Year A Epiphany 4thSunday"
  ],
  "people": [],
  "subjects": [
   "Children",
   "Poor",
   "Poverty",
   "Hunger",
   "Culture: Indian",
   "Widows"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59231",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Wesley, Frank, 1923-2002. Blessed are the Poor, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of Frank Wesley, http://www.frankwesleyart.com/main_page.htm."
 },
 {
  "id": 59232,
  "title": "At Home in Nazareth",
  "artist": "Wesley, Frank, 1923-2002",
  "date": null,
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/At Home in Nazareth-Frank Wesley.jpg",
  "refs": [
   "Luke 2:41-52"
  ],
  "days": [
   "Year C Christmas 1st Sunday",
   ""
  ],
  "people": [
   "Mary, the mother of Jesus (Biblical figure)",
   "Jesus Christ (Biblical figure)",
   "Joseph, the husband of Mary (Biblical figure)"
  ],
  "subjects": [
   "Childhood of Jesus",
   "Culture: Indian"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59232",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Wesley, Frank, 1923-2002. At Home in Nazareth, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of Frank Wesley, http://www.frankwesleyart.com/main_page.htm."
 },
 {
  "id": 59233,
  "title": "Arrival of the Kings",
  "artist": "Wesley, Frank, 1923-2002",
  "date": null,
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Arrival of the Kings-Frank Wesley.jpg",
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
   "Mary, the mother of Jesus (Biblical figure)",
   "Jesus Christ (Biblical figure)",
   "Wise Men (Biblical figures)"
  ],
  "subjects": [
   "Culture: Indian"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59233",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Wesley, Frank, 1923-2002. Arrival of the Kings, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of Frank Wesley, http://www.frankwesleyart.com/main_page.htm."
 },
 {
  "id": 59234,
  "title": "Annunciation",
  "artist": "Wesley, Frank, 1923-2002",
  "date": null,
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Annunciation-Frank Wesley.jpg",
  "refs": [
   "Luke 1:26-38"
  ],
  "days": [
   "Year B Advent 4th Sunday",
   "",
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
   "Motherhood",
   "Culture: Indian"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59234",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Wesley, Frank, 1923-2002. Annunciation, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of Frank Wesley, http://www.frankwesleyart.com/main_page.htm."
 },
 {
  "id": 59235,
  "title": "As it Began to Dawn",
  "artist": "Wesley, Frank, 1923-2002",
  "date": null,
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/As it Began to Dawn-Frank Wesley.jpg",
  "refs": [
   "Matthew 28:1-10"
  ],
  "days": [
   "Year A Easter Vigil",
   "Year A Resurrection of the Lord",
   ""
  ],
  "people": [
   "Mary Magdalene (Biblical figure)"
  ],
  "subjects": [
   "Resurrection of Jesus",
   "Empty Tomb",
   "Culture: Indian"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59235",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Wesley, Frank, 1923-2002. As it Began to Dawn, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of Frank Wesley, http://www.frankwesleyart.com/main_page.htm."
 },
 {
  "id": 59236,
  "title": "Annunciation in a Pavilion",
  "artist": "Wesley, Frank, 1923-2002",
  "date": null,
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Annunciation in a Pavilion-Frank Wesley.jpg",
  "refs": [
   "Luke 1:26-38"
  ],
  "days": [
   "Year B Advent 4th Sunday",
   "",
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
   "Culture: Indian"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59236",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Wesley, Frank, 1923-2002. Annunciation in a Pavilion, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of Frank Wesley, http://www.frankwesleyart.com/main_page.htm."
 },
 {
  "id": 59237,
  "title": "Abigail Begging David",
  "artist": "Wesley, Frank, 1923-2002",
  "date": null,
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Abigail Begging David, I Sam. 25, 23-Frank Wesley.jpg",
  "refs": [
   "Samuel I, 25"
  ],
  "days": [
   ""
  ],
  "people": [
   "David, King of Israel (Biblical figure)",
   "Abigail (Biblical figure)"
  ],
  "subjects": [
   "Culture: Indian"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59237",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Wesley, Frank, 1923-2002. Abigail Begging David, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of Frank Wesley, http://www.frankwesleyart.com/main_page.htm."
 },
 {
  "id": 59238,
  "title": "And the Word Became Flesh",
  "artist": "Wesley, Frank, 1923-2002",
  "date": null,
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/And the Word Became Flesh-Frank Wesley.jpg",
  "refs": [
   "John 1:1-14"
  ],
  "days": [
   "Year A Nativity of the Lord Proper I",
   "",
   "Year B Nativity of the Lord Proper I",
   "Year C Nativity of the Lord Proper I"
  ],
  "people": [
   "Mary, the mother of Jesus (Biblical figure)",
   "Jesus Christ (Biblical figure)"
  ],
  "subjects": [
   "Culture: Indian",
   "Word (The)"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59238",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Wesley, Frank, 1923-2002. And the Word Became Flesh, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of Frank Wesley, http://www.frankwesleyart.com/main_page.htm."
 },
 {
  "id": 59239,
  "title": "Arise",
  "artist": "Wesley, Frank, 1923-2002",
  "date": null,
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Arise-Frank Wesley.jpg",
  "refs": [
   "John 5:1-9"
  ],
  "days": [
   "",
   "Year C Easter 6th Sunday"
  ],
  "people": [
   "Jesus Christ (Biblical figure)"
  ],
  "subjects": [
   "Healing",
   "Miracles",
   "Love",
   "Culture: Indian"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59239",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Wesley, Frank, 1923-2002. Arise, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of Frank Wesley, http://www.frankwesleyart.com/main_page.htm."
 },
 {
  "id": 59240,
  "title": "Family of Man",
  "artist": "Wesley, Frank, 1923-2002",
  "date": null,
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Family of Man-Frank Wesley.jpg",
  "refs": [
   "Matthew 10:24-39"
  ],
  "days": [
   "",
   "Year A Proper 7th Sunday"
  ],
  "people": [],
  "subjects": [
   "Light",
   "Family",
   "Culture: Indian",
   "Hardship"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59240",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Wesley, Frank, 1923-2002. Family of Man, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of Frank Wesley, http://www.frankwesleyart.com/main_page.htm."
 },
 {
  "id": 59241,
  "title": "Hagar Speaking with the Angel",
  "artist": "Wesley, Frank, 1923-2002",
  "date": null,
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Hagar Speaking with the Angel-Frank Wesley.jpg",
  "refs": [
   "Genesis 16"
  ],
  "days": [
   ""
  ],
  "people": [
   "Hagar (Biblical figure)",
   "Angel (Biblical figure)"
  ],
  "subjects": [
   "Dove",
   "Culture: Indian"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59241",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Wesley, Frank, 1923-2002. Hagar Speaking with the Angel, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of Frank Wesley, http://www.frankwesleyart.com/main_page.htm."
 },
 {
  "id": 59242,
  "title": "Hoping He Will Bring Something to Eat",
  "artist": "Wesley, Frank, 1923-2002",
  "date": null,
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Hoping He Will Bring Something to Eat-Frank Wesley (1).jpg",
  "refs": [
   "Matthew 26:11"
  ],
  "days": [
   ""
  ],
  "people": [],
  "subjects": [
   "Children",
   "Poverty",
   "Hunger",
   "Motherhood",
   "Culture: Indian"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59242",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Wesley, Frank, 1923-2002. Hoping He Will Bring Something to Eat, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of Frank Wesley, http://www.frankwesleyart.com/main_page.htm."
 },
 {
  "id": 59243,
  "title": "Jesus in Benares",
  "artist": "Wesley, Frank, 1923-2002",
  "date": "late 20th century",
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Jesus in Benares-Frank Wesley.jpg",
  "refs": [
   "Matthew 21:23-32"
  ],
  "days": [
   "",
   "Year A Proper 21st Sunday",
   "Year B Easter 6th Sunday"
  ],
  "people": [
   "Jesus Christ (Biblical figure)"
  ],
  "subjects": [
   "Teaching",
   "Culture: Indian"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59243",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Wesley, Frank, 1923-2002. Jesus in Benares, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of Frank Wesley, http://www.frankwesleyart.com/main_page.htm."
 },
 {
  "id": 59245,
  "title": "Jai Krist",
  "artist": "Wesley, Frank, 1923-2002",
  "date": null,
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Jai Krist-Frank Wesley.jpg",
  "refs": [
   "Matthew 11:16-19, 25-30"
  ],
  "days": [
   "",
   "Year A Proper 9th Sunday"
  ],
  "people": [
   "Jesus Christ (Biblical figure)"
  ],
  "subjects": [
   "Children",
   "Yoke",
   "Shepherd",
   "Culture: Indian"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59245",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Wesley, Frank, 1923-2002. Jai Krist, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of Frank Wesley, http://www.frankwesleyart.com/main_page.htm."
 },
 {
  "id": 59246,
  "title": "Lily Resurrection",
  "artist": "Wesley, Frank, 1923-2002",
  "date": null,
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Lily Resurrection-Frank Wesley.jpg",
  "refs": [
   "John 1:1-14"
  ],
  "days": [
   "Year A Nativity of the Lord Proper I",
   "",
   "Year B Nativity of the Lord Proper I",
   "Year C Nativity of the Lord Proper I"
  ],
  "people": [],
  "subjects": [
   "Holy Spirit",
   "Light",
   "Culture: Indian",
   "Eternal life"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59246",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Wesley, Frank, 1923-2002. Lily Resurrection, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of Frank Wesley, http://www.frankwesleyart.com/main_page.htm."
 },
 {
  "id": 59247,
  "title": "Seed Resurrection",
  "artist": "Wesley, Frank, 1923-2002",
  "date": null,
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Seed Resurrection-Frank Wesley.jpg",
  "refs": [
   "John 12:20-33"
  ],
  "days": [
   "",
   "Year B Lent 5th  Sunday"
  ],
  "people": [],
  "subjects": [
   "Plants",
   "Culture: Indian",
   "Seeds"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59247",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Wesley, Frank, 1923-2002. Seed Resurrection, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of Frank Wesley, http://www.frankwesleyart.com/main_page.htm."
 },
 {
  "id": 59248,
  "title": "Lady in Blue Visitation",
  "artist": "Wesley, Frank, 1923-2002",
  "date": null,
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Lady in Blue Visitation-Frank Wesley.jpg",
  "refs": [
   "Luke 1:39-57",
   "Luke 1:46b-55"
  ],
  "days": [
   "Year A Visitation of Mary to Elizabeth",
   "Year B Advent 4th Sunday",
   "Year A Advent 3rd Sunday",
   "Year B Advent 3rd Sunday",
   "Year B Visitation of Mary to Elizabeth",
   "Year C Visitation of Mary to Elizabeth",
   "",
   "Year C Advent 4th Sunday"
  ],
  "people": [
   "Mary, the mother of Jesus (Biblical figure)"
  ],
  "subjects": [
   "Visitation",
   "Culture: Indian",
   "Happiness"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59248",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Wesley, Frank, 1923-2002. Lady in Blue Visitation, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of Frank Wesley, http://www.frankwesleyart.com/main_page.htm."
 },
 {
  "id": 59249,
  "title": "Mother of Heaven",
  "artist": "Wesley, Frank, 1923-2002",
  "date": null,
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Mother of Heaven-Frank Wesley.jpg",
  "refs": [
   "Colossians 1:15-28"
  ],
  "days": [
   "",
   "Year C Proper 11th Sunday"
  ],
  "people": [
   "Mary, the mother of Jesus (Biblical figure)"
  ],
  "subjects": [
   "Dove",
   "Holy Spirit",
   "Culture: Indian",
   "Eye of God",
   "Halo"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59249",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Wesley, Frank, 1923-2002. Mother of Heaven, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of Frank Wesley, http://www.frankwesleyart.com/main_page.htm."
 },
 {
  "id": 59250,
  "title": "Peter's Vision",
  "artist": "Wesley, Frank, 1923-2002",
  "date": null,
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Peter's Vision-Frank Wesley.jpg",
  "refs": [
   "Acts 10:17-20"
  ],
  "days": [
   ""
  ],
  "people": [
   "Peter, the Apostle (Biblical figure)",
   "John, the Apostle (Biblical figure)",
   "James the Elder, the Apostle (Biblical figure)",
   "Cornelius (Biblical figure)"
  ],
  "subjects": [
   "Fish",
   "Knowledge",
   "Light",
   "Rabbit",
   "Birds",
   "Culture: Indian",
   "Boar"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59250",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Wesley, Frank, 1923-2002. Peter's Vision, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of Frank Wesley, http://www.frankwesleyart.com/main_page.htm."
 },
 {
  "id": 59251,
  "title": "Peter's Little Faith",
  "artist": "Wesley, Frank, 1923-2002",
  "date": null,
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Peter's Little Faith-Frank Wesley.jpg",
  "refs": [
   "Matthew 14:22-33"
  ],
  "days": [
   "",
   "Year A Proper 14th Sunday"
  ],
  "people": [
   "Jesus Christ (Biblical figure)",
   "Peter, the Apostle (Biblical figure)",
   "Disciples (Biblical figures)"
  ],
  "subjects": [
   "Boats",
   "Faith",
   "Light",
   "Sea",
   "Hands",
   "Feet",
   "Culture: Indian"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59251",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Wesley, Frank, 1923-2002. Peter's Little Faith, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of Frank Wesley, http://www.frankwesleyart.com/main_page.htm."
 },
 {
  "id": 59252,
  "title": "St Francis with the Birds of India",
  "artist": "Wesley, Frank, 1923-2002",
  "date": null,
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/St. Francis with the Birds of India-Frank Wesley.jpg",
  "refs": [
   "Psalm 84:1-7"
  ],
  "days": [
   "Year C Proper 25th Sunday",
   ""
  ],
  "people": [
   "Francis, of Assisi, 1182-1226"
  ],
  "subjects": [
   "Peacock",
   "Pelican",
   "Birds",
   "Culture: Indian"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59252",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Wesley, Frank, 1923-2002. St Francis with the Birds of India, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of Frank Wesley, http://www.frankwesleyart.com/main_page.htm."
 },
 {
  "id": 59254,
  "title": "St. John",
  "artist": "Wesley, Frank, 1923-2002",
  "date": null,
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/St. John-Frank Wesley.jpg",
  "refs": [
   "Isaiah 40:21-31"
  ],
  "days": [
   "Year B Epiphany 5th Sunday",
   ""
  ],
  "people": [
   "John, the Apostle (Biblical figure)"
  ],
  "subjects": [
   "Dragons",
   "Dove",
   "Horses",
   "Madonna and Child",
   "Eagle (symbol of John, the Evangelist)",
   "Culture: Indian"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59254",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Wesley, Frank, 1923-2002. St. John, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of Frank Wesley, http://www.frankwesleyart.com/main_page.htm."
 },
 {
  "id": 59255,
  "title": "St. Mark",
  "artist": "Wesley, Frank, 1923-2002",
  "date": null,
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/St. Mark-Frank Wesley.jpg",
  "refs": [],
  "days": [
   ""
  ],
  "people": [
   "Mark, the Apostle (Biblical figure)"
  ],
  "subjects": [
   "Angels",
   "Lion, symbol of Mark the evangelist",
   "Sea",
   "Culture: Indian"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59255",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Wesley, Frank, 1923-2002. St. Mark, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of Frank Wesley, http://www.frankwesleyart.com/main_page.htm."
 },
 {
  "id": 59256,
  "title": "St. Luke",
  "artist": "Wesley, Frank, 1923-2002",
  "date": null,
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/St. Luke-Frank Wesley.jpg",
  "refs": [
   "Isaiah 1:10-18"
  ],
  "days": [
   "Year C Proper 26th Sunday",
   ""
  ],
  "people": [
   "Mary, the mother of Jesus (Biblical figure)",
   "Luke, the Apostle (Biblical figure)"
  ],
  "subjects": [
   "Bull",
   "Sacrifice",
   "Cross",
   "Culture: Indian"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59256",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Wesley, Frank, 1923-2002. St. Luke, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of Frank Wesley, http://www.frankwesleyart.com/main_page.htm."
 },
 {
  "id": 59257,
  "title": "St. Matthew",
  "artist": "Wesley, Frank, 1923-2002",
  "date": null,
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/St. Matthew-Frank Wesley.jpg",
  "refs": [
   "Matthew 1:1-17"
  ],
  "days": [
   ""
  ],
  "people": [
   "Matthew, the Apostle (Biblical figure)"
  ],
  "subjects": [
   "Angels",
   "Martyrs",
   "Tax Collectors",
   "Man (symbol of Matthew, the Evangelist)",
   "Culture: Indian"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59257",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Wesley, Frank, 1923-2002. St. Matthew, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of Frank Wesley, http://www.frankwesleyart.com/main_page.htm."
 },
 {
  "id": 59258,
  "title": "St. Paul in Prison",
  "artist": "Wesley, Frank, 1923-2002",
  "date": null,
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/St. Paul in Prison-Frank Wesley.jpg",
  "refs": [
   "Ephesians 4:1-16"
  ],
  "days": [
   "",
   "Year B Proper 13th Sunday"
  ],
  "people": [
   "Paul, the Apostle (Biblical figure)"
  ],
  "subjects": [
   "Prison",
   "Culture: Indian"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59258",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Wesley, Frank, 1923-2002. St. Paul in Prison, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of Frank Wesley, http://www.frankwesleyart.com/main_page.htm."
 },
 {
  "id": 59259,
  "title": "Temptations",
  "artist": "Wesley, Frank, 1923-2002",
  "date": null,
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Temptations-Frank Wesley.jpg",
  "refs": [
   "Luke 4:1-13"
  ],
  "days": [
   "Year C Lent 1st Sunday",
   ""
  ],
  "people": [
   "Jesus Christ (Biblical figure)"
  ],
  "subjects": [
   "Temptation of Christ",
   "Wilderness",
   "Holy Spirit",
   "River",
   "Culture: Indian"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59259",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Wesley, Frank, 1923-2002. Temptations, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of Frank Wesley, http://www.frankwesleyart.com/main_page.htm."
 },
 {
  "id": 59260,
  "title": "Altar of God",
  "artist": "Wesley, Frank, 1923-2002",
  "date": null,
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/The Altar of God-Frank Wesley.jpg",
  "refs": [
   "John 20:1-18"
  ],
  "days": [
   "Year A Resurrection of the Lord",
   "",
   "Year B Resurrection of the Lord",
   "Year C Resurrection of the Lord"
  ],
  "people": [
   "Peter, the Apostle (Biblical figure)",
   "John, the Apostle (Biblical figure)",
   "Mary Magdalene (Biblical figure)"
  ],
  "subjects": [
   "Eucharist",
   "Light",
   "Rock",
   "Empty Tomb"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59260",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Wesley, Frank, 1923-2002. Altar of God, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of Frank Wesley, http://www.frankwesleyart.com/main_page.htm."
 },
 {
  "id": 59261,
  "title": "The Hand of God is My Refuge",
  "artist": "Wesley, Frank, 1923-2002",
  "date": null,
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/The Hand of God is My Refuge-Frank Wesley.jpg",
  "refs": [
   "Exodus 33:12-23"
  ],
  "days": [
   "",
   "Year A Proper 24th Sunday"
  ],
  "people": [
   "Moses (Biblical figure)"
  ],
  "subjects": [
   "Hand of God",
   "Glory",
   "God"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59261",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Wesley, Frank, 1923-2002. The Hand of God is My Refuge, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of Frank Wesley, http://www.frankwesleyart.com/main_page.htm."
 },
 {
  "id": 59262,
  "title": "The Holy Spirit",
  "artist": "Wesley, Frank, 1923-2002",
  "date": null,
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/The Holy Spirit-Frank Wesley.jpg",
  "refs": [
   "John 14:8-17, (25-27)",
   "John 14:15-21"
  ],
  "days": [
   "Year A Easter 6th Sunday",
   "",
   "Year C Day of Pentecost"
  ],
  "people": [],
  "subjects": [
   "Four Evangelists",
   "Holy Spirit",
   "Culture: Indian",
   "Truth"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59262",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Wesley, Frank, 1923-2002. The Holy Spirit, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of Frank Wesley, http://www.frankwesleyart.com/main_page.htm."
 },
 {
  "id": 59263,
  "title": "The Healing Shadow of Peter",
  "artist": "Wesley, Frank, 1923-2002",
  "date": null,
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/The Healing Shadow of Peter-Frank Wesley.jpg",
  "refs": [
   "Acts 5:12-16"
  ],
  "days": [
   ""
  ],
  "people": [
   "Jesus Christ (Biblical figure)",
   "Peter, the Apostle (Biblical figure)"
  ],
  "subjects": [
   "Healing",
   "Keys",
   "River",
   "Culture: Indian",
   "Illness"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59263",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Wesley, Frank, 1923-2002. The Healing Shadow of Peter, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of Frank Wesley, http://www.frankwesleyart.com/main_page.htm."
 },
 {
  "id": 59264,
  "title": "Were You There? (Left panel)",
  "artist": "Wesley, Frank, 1923-2002",
  "date": null,
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Were You There- left panel-Frank Wesley.jpg",
  "refs": [
   "Matthew 27:11-54"
  ],
  "days": [
   "Year A Liturgy of Pass",
   ""
  ],
  "people": [
   "Mary, the mother of Jesus (Biblical figure)",
   "Jesus Christ (Biblical figure)",
   "Mary Magdalene (Biblical figure)",
   "Veronica (extra-biblical figure)",
   "Simon, the Cyrene (Biblical figure)"
  ],
  "subjects": [
   "Passion of Jesus Christ: Carrying the Cross",
   "Culture: Indian"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59264",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Wesley, Frank, 1923-2002. Were You There? (Left panel), from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of Frank Wesley, http://www.frankwesleyart.com/main_page.htm."
 },
 {
  "id": 59265,
  "title": "Were You There? (Right panel)",
  "artist": "Wesley, Frank, 1923-2002",
  "date": null,
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Were You There-right panel-Frank Wesley.jpg",
  "refs": [
   "Matthew 27:11-54"
  ],
  "days": [
   "Year A Liturgy of Pass",
   ""
  ],
  "people": [],
  "subjects": [
   "Passion of Jesus Christ: Carrying the Cross",
   "Suffering",
   "Culture: Indian",
   "Crowd"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59265",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Wesley, Frank, 1923-2002. Were You There? (Right panel), from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of Frank Wesley, http://www.frankwesleyart.com/main_page.htm."
 },
 {
  "id": 59266,
  "title": "Your Kingdom Come",
  "artist": "Wesley, Frank, 1923-2002",
  "date": null,
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Your Kingdom Come-Frank Wesley.jpg",
  "refs": [
   "Matthew 6:9-15"
  ],
  "days": [
   ""
  ],
  "people": [],
  "subjects": [
   "Fish",
   "Cross",
   "Rock",
   "Culture: Indian"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59266",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Wesley, Frank, 1923-2002. Your Kingdom Come, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of Frank Wesley, http://www.frankwesleyart.com/main_page.htm."
 },
 {
  "id": 59267,
  "title": "Woman Taken in Adultery",
  "artist": "Wesley, Frank, 1923-2002",
  "date": null,
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Woman Taking in Adultery-Frank Wesley.jpg",
  "refs": [
   "John 8:2-11"
  ],
  "days": [
   ""
  ],
  "people": [
   "Jesus Christ (Biblical figure)",
   "Woman accused of adultery (Biblical figure)"
  ],
  "subjects": [
   "Forgiveness",
   "Sin",
   "Culture: Indian"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59267",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Wesley, Frank, 1923-2002. Woman Taken in Adultery, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of Frank Wesley, http://www.frankwesleyart.com/main_page.htm."
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
  "id": 59644,
  "title": "Son of Hagar",
  "artist": "Wesley, Frank, 1923-2002",
  "date": null,
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Son of Hagar-Frank Wesley.jpg",
  "refs": [
   "Genesis 21:8-21"
  ],
  "days": [
   "Year A Proper 7th Sunday"
  ],
  "people": [
   "Hagar (Biblical figure)",
   "Ishmael (Biblical figure)"
  ],
  "subjects": [
   "Wilderness",
   "Suffering"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59644",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Wesley, Frank, 1923-2002. Son of Hagar, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of Frank Wesley, http://www.frankwesleyart.com/main_page.htm."
 },
 {
  "id": 59645,
  "title": "She is a Tree of Life to Them",
  "artist": "Wesley, Frank, 1923-2002",
  "date": null,
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/She is a Tree of Life to Them-Frank Wesley.jpg",
  "refs": [
   "Proverbs 3:18"
  ],
  "days": [],
  "people": [],
  "subjects": [
   "Motherhood",
   "Widows"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59645",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Wesley, Frank, 1923-2002. She is a Tree of Life to Them, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of Frank Wesley, http://www.frankwesleyart.com/main_page.htm."
 },
 {
  "id": 59646,
  "title": "Presentation in the Temple",
  "artist": "Wesley, Frank, 1923-2002",
  "date": null,
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Presentation in the Temple-Frank Wesley.jpg",
  "refs": [
   "Luke 2:22-40"
  ],
  "days": [
   "Year C Presentation of the Lord",
   "Year A Presentation of the Lord",
   "Year B Presentation of the Lord"
  ],
  "people": [
   "Mary, the mother of Jesus (Biblical figure)",
   "Jesus Christ (Biblical figure)",
   "Joseph, the husband of Mary (Biblical figure)"
  ],
  "subjects": [
   "Presentation of Jesus at the Temple"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59646",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Wesley, Frank, 1923-2002. Presentation in the Temple, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of Frank Wesley, http://www.frankwesleyart.com/main_page.htm."
 },
 {
  "id": 59647,
  "title": "Rich Young Ruler",
  "artist": "Wesley, Frank, 1923-2002",
  "date": null,
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Rich Young Ruler-Frank Wesley.jpg",
  "refs": [
   "Mark 10:17-31"
  ],
  "days": [
   "Year B Proper 23rd Sunday"
  ],
  "people": [
   "Rich Young Man (Biblical figure)"
  ],
  "subjects": [
   "Rich"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59647",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Wesley, Frank, 1923-2002. Rich Young Ruler, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of Frank Wesley, http://www.frankwesleyart.com/main_page.htm."
 },
 {
  "id": 59648,
  "title": "Vertical Flight in the Night",
  "artist": "Wesley, Frank, 1923-2002",
  "date": null,
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Vertical Flight in the Night-Frank Wesley.jpg",
  "refs": [
   "Psalm 138"
  ],
  "days": [
   "Year C Epiphany 5th Sunday"
  ],
  "people": [
   "Mary, the mother of Jesus (Biblical figure)",
   "Jesus Christ (Biblical figure)",
   "Joseph, the husband of Mary (Biblical figure)"
  ],
  "subjects": [
   "Flight into Egypt",
   "Tree"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59648",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Wesley, Frank, 1923-2002. Vertical Flight in the Night, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of Frank Wesley, http://www.frankwesleyart.com/main_page.htm."
 },
 {
  "id": 59649,
  "title": "Woman with the Flow of Blood (detail)",
  "artist": "Wesley, Frank, 1923-2002",
  "date": null,
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Woman with the Flow of Blood (detail)-Frank Wesley.jpg",
  "refs": [
   "Mark 5:21-43",
   "Matthew 9:9-13, 18-26",
   "Luke 8:43-48"
  ],
  "days": [
   "",
   "Year A Proper 5th Sunday",
   "Year B Proper 8th Sunday"
  ],
  "people": [
   "Jesus Christ (Biblical figure)",
   "Woman who touched the cloak of Jesus (Biblical figure)"
  ],
  "subjects": [
   "Faith",
   "Healing",
   "Culture: Indian"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59649",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Wesley, Frank, 1923-2002. Woman with the Flow of Blood (detail), from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of Frank Wesley, http://www.frankwesleyart.com/main_page.htm."
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
  "id": 59767,
  "title": "The Holy Family at Home - Toddler Jesus",
  "artist": "Wesley, Frank, 1923-2002",
  "date": "2001",
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Frank_Wesley_Holy_Family_at_Home.jpg",
  "refs": [
   "Luke 2:41-52"
  ],
  "days": [],
  "people": [
   "Mary, the mother of Jesus (Biblical figure)",
   "Jesus Christ (Biblical figure)"
  ],
  "subjects": [
   "Childhood of Jesus"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59767",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Wesley, Frank, 1923-2002. The Holy Family at Home - Toddler Jesus, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Kate Colquitt: kcolquitt349@gmail.com."
 },
 {
  "id": 59768,
  "title": "The Adoration : 1966",
  "artist": "Wesley, Frank, 1923-2002",
  "date": "1966",
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Frank_Wesley_Adoration.jpg",
  "refs": [
   "Matthew 2:1-12",
   "Luke 2:1-14, (15-20)"
  ],
  "days": [],
  "people": [
   "Mary, the mother of Jesus (Biblical figure)",
   "Jesus Christ (Biblical figure)"
  ],
  "subjects": [
   "Adoration of the Child (Mary)",
   "Birth"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59768",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Wesley, Frank, 1923-2002. The Adoration : 1966, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Kate Colquitt: kcolquitt349@gmail.com."
 },
 {
  "id": 59769,
  "title": "The Presentation In the Temple",
  "artist": "Wesley, Frank, 1923-2002",
  "date": "1950s-1960s",
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Frank_Wesley_Presentation_in_the_Temple_full.jpg",
  "refs": [
   "Luke 2:22-40"
  ],
  "days": [],
  "people": [
   "Mary, the mother of Jesus (Biblical figure)",
   "Jesus Christ (Biblical figure)",
   "Joseph, the husband of Mary (Biblical figure)"
  ],
  "subjects": [],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59769",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Wesley, Frank, 1923-2002. The Presentation In the Temple, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Kate Colquitt, kcolquitt349@gmail.com."
 }
];
