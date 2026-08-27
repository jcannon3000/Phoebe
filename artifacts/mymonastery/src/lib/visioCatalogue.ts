/**
 * Art in the Christian Tradition — the Visio Divina catalogue.
 *
 * GENERATED FILE. Do not edit by hand: run
 *   node scripts/fetch-act-catalogue.mjs
 * which re-harvests ACT and re-verifies every licence. That script's header
 * explains why this is fetchable and why each entry is safe to display.
 *
 * Every entry here was either checked individually against the Wikimedia
 * Commons API (public domain, CC0, or a CC BY/BY-SA variant) or carries ACT's
 * recorded artist grant of non-commercial use with attribution (Phoebe is a
 * non-profit; the grant's required attribution is printed on the closing
 * slide, naming the artist's own source). Records with neither were dropped
 * rather than assumed.
 *
 * `img` points at ACT's own S3 host rather than a bundled asset: at 653
 * artworks this collection is far too large to ship inside the app binary, and
 * their host serves only full-size JPEGs (there is no IIIF derivative
 * endpoint). So the image is fetched when the practice opens.
 *
 * `refs` are the passages ACT tags the work to, and they are what lets the
 * image follow the day: visioSelect crosses them against the office's appointed
 * lessons. `days` are ACT's own lectionary labels ("Year B Lent 3rd Sunday"),
 * kept as a cross-check but not used for selection — they're free text, and the
 * passage match is exact. `essay` is a short commentary at thevcs.org —
 * LINKED, never reproduced.
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
  essay: string;
  act: string;
  /** The verified licence, named on the closing slide. */
  licence: string;
  attribution: string;
};

export const ACT_CATALOGUE: CatalogueArtwork[] = [
 {
  "id": 31722,
  "title": "Paul's Escape from Damascus on English Enamel Box",
  "artist": null,
  "date": "1178-1180",
  "where": "Victoria and Albert Museum, London, United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/00000345.jpg",
  "refs": [
   "Acts 9:23-25"
  ],
  "days": [],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/31722",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Paul's Escape from Damascus on English Enamel Box, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Prof. Patout J. Burns."
 },
 {
  "id": 31748,
  "title": "Peter's Dictation of Gospel to Mark on Italian Ivory Plaque",
  "artist": null,
  "date": null,
  "where": "Victoria and Albert Museum, London, United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/00000352.jpg",
  "refs": [
   "Mark 8:31-38"
  ],
  "days": [
   "Year B Lent 2nd Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/31748",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Peter's Dictation of Gospel to Mark on Italian Ivory Plaque, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Prof. Patout J. Burns."
 },
 {
  "id": 46134,
  "title": "Christ Crowned with Thorns",
  "artist": "Van Dyck, Anthony, 1599-1641",
  "date": "1620",
  "where": "Museo del Prado, Madrid, Spain",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Yorck_A_006.jpg",
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
  "essay": "https://thevcs.org/crowning-and-robing/christ-crowned",
  "act": "https://act.library.vanderbilt.edu/artworks/46134",
  "licence": "Public domain",
  "attribution": "Van Dyck, Anthony, 1599-1641. Christ Crowned with Thorns, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 46137,
  "title": "Angel Musicians (detail of Madonna altarpiece)",
  "artist": "Mantegna, Andrea, 1431-1506",
  "date": "1497",
  "where": "Civic Museum of Art and Painting, Castle Sforzesco, Milan, Italy",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Yorck_A_013.jpg",
  "refs": [
   "Psalm 148"
  ],
  "days": [
   "Year B Proper 22nd Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/46137",
  "licence": "Public domain",
  "attribution": "Mantegna, Andrea, 1431-1506. Angel Musicians (detail of Madonna altarpiece), from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 46203,
  "title": "Paul Visits Peter in Prison",
  "artist": "Lippi, Filippino, d. 1504",
  "date": "1481",
  "where": "Santa Maria del Carmine (Church : Florence, Italy), Florence, Italy",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Filippino_Lippi_003.jpg",
  "refs": [
   "Acts 12:1-11"
  ],
  "days": [
   "Year C Epiphany 4thSunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/46203",
  "licence": "Public domain",
  "attribution": "Lippi, Filippino, d. 1504. Paul Visits Peter in Prison, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 46217,
  "title": "Covered Table",
  "artist": "Faistauer, Anton, 1887-1930",
  "date": "1916",
  "where": "Sammlung Leopold, Vienna, Russia",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Yorck_A_106.jpg",
  "refs": [
   "Joel 2:23-32",
   "Corinthians I, 10:26"
  ],
  "days": [
   "Year C Thanksgiving Day",
   "Year A Thanksgiving Day",
   "Year B Thanksgiving Day"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/46217",
  "licence": "Public domain",
  "attribution": "Faistauer, Anton, 1887-1930. Covered Table, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 46223,
  "title": "Commutative Justice, detail from the Allegory of Good and Bad Government",
  "artist": "Lorenzetti, Ambrogio, 1285-approximately 1348",
  "date": "1338-1340",
  "where": "Palazzo pubblico (Siena, Italy), Siena, Italy",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Yorck_A_037.jpg",
  "refs": [
   "Micah 3:5-12"
  ],
  "days": [
   "Year A Proper 26th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/46223",
  "licence": "Public domain",
  "attribution": "Lorenzetti, Ambrogio, 1285-approximately 1348. Commutative Justice, detail from the Allegory of Good and Bad Government, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 46225,
  "title": "Pax, or Peace, detail from the Allegory of Good and Bad Government",
  "artist": "Lorenzetti, Ambrogio, 1285-approximately 1348",
  "date": "1338-1340",
  "where": "Palazzo pubblico (Siena, Italy), Siena, Italy",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Yorck_A_035.jpg",
  "refs": [
   "Psalm 122",
   "Psalm 29"
  ],
  "days": [
   "Year A Advent 1st Sunday",
   "Year B Trinity Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/46225",
  "licence": "Public domain",
  "attribution": "Lorenzetti, Ambrogio, 1285-approximately 1348. Pax, or Peace, detail from the Allegory of Good and Bad Government, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 46228,
  "title": "Normandy - Path on the Water",
  "artist": "Sisley, Alfred, 1839-1899",
  "date": "1894",
  "where": "Musée des Beaux-Arts de Rouen, Rouen, France",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Yorck_A_041.jpg",
  "refs": [
   "Psalm 23"
  ],
  "days": [
   "Year A Christmas 2nd Sunday",
   "Year B Proper 11th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/46228",
  "licence": "Public domain",
  "attribution": "Sisley, Alfred, 1839-1899. Normandy - Path on the Water, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 46233,
  "title": "The Jewish Bride (Esther)",
  "artist": "Gelder, Aert de, 1645-1727",
  "date": "1684",
  "where": "Alte Pinakothek, Munich, Germany",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Yorck_A_088.jpg",
  "refs": [
   "Esther 2:8"
  ],
  "days": [
   "Year B Proper 21st Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/46233",
  "licence": "Public domain",
  "attribution": "Gelder, Aert de, 1645-1727. The Jewish Bride (Esther), from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 46239,
  "title": "Washer Women",
  "artist": "Arkhipov, Abram Efimovich, 1862-1930",
  "date": "1901",
  "where": "Gosudarstvennai︠a︡ Tretʹi︠a︡kovskai︠a︡ galerei︠a︡, Moscow, Russia",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Yorck_A_095.jpg",
  "refs": [
   "Psalm 71:1-14"
  ],
  "days": [
   "Year C Holy Tuesday",
   "Year B Holy Wednesday",
   "Year B Ash Wednesday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/46239",
  "licence": "Public domain",
  "attribution": "Arkhipov, Abram Efimovich, 1862-1930. Washer Women, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 46266,
  "title": "Still Life",
  "artist": "Kauw, Albrecht (1621-1681)",
  "date": "1678",
  "where": "Kunstmuseum Bern, Bern, Switzerland",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Yorck_A_047.jpg",
  "refs": [
   "Joel 2:23-32"
  ],
  "days": [
   "Year C Easter 6th Sunday",
   "Year B Thanksgiving Day",
   "Year B Proper 25th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/46266",
  "licence": "Public domain",
  "attribution": "Kauw, Albrecht (1621-1681). Still Life, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 46275,
  "title": "Lion",
  "artist": "Dürer, Albrecht, 1471-1528",
  "date": "1494",
  "where": "Hamburger Kunsthalle, Hamburg, Germany",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Yorck_A_051.jpg",
  "refs": [
   "Hosea 11:1-11",
   "Amos 3:8",
   "Revelation 5:5"
  ],
  "days": [],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/46275",
  "licence": "Public domain",
  "attribution": "Dürer, Albrecht, 1471-1528. Lion, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 46323,
  "title": "Job on the dunghill, and his wife pours water on his sores",
  "artist": "Dürer, Albrecht, 1471-1528",
  "date": "1500-1503",
  "where": "Städel, Frankfurt, Germany",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Yorck_A_054.jpg",
  "refs": [
   "Job 2:7-13"
  ],
  "days": [],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/46323",
  "licence": "Public domain",
  "attribution": "Dürer, Albrecht, 1471-1528. Job on the dunghill, and his wife pours water on his sores, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 46410,
  "title": "Mother and Sister of the Artist",
  "artist": "Morisot, Berthe, 1841-1895",
  "date": "1869-1870",
  "where": "National Gallery of Art (U.S.), Washington, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Yorck_B_044.jpg",
  "refs": [
   "Ezekiel 16:44",
   "Matthew 12:50",
   "Mark 3:20-35"
  ],
  "days": [
   "Year B Proper 5th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/46410",
  "licence": "Public domain",
  "attribution": "Morisot, Berthe, 1841-1895. Mother and Sister of the Artist, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 46447,
  "title": "Prophet Hosea",
  "artist": "Duccio, di Buoninsegna, -1319?",
  "date": "1308-1311",
  "where": "Museo dell’Opera del Duomo (Siena, Italy), Siena, Italy",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Duccio_di_Buoninsegna_063.jpg",
  "refs": [
   "Hosea 1:2-10",
   "Hosea 2:14-20",
   "Hosea 5:15-6:6"
  ],
  "days": [
   "Year C Proper 12th Sunday",
   "Year A Proper 5th Sunday",
   "Year B Epiphany 8th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/46447",
  "licence": "Public domain",
  "attribution": "Duccio, di Buoninsegna, -1319?. Prophet Hosea, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 46477,
  "title": "Paul, the Apostle",
  "artist": "Crivelli, Carlo, 15th cent.",
  "date": "1473",
  "where": "Sant'Emidio, Ascoli, Italy",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Carlo_Crivelli_053.jpg",
  "refs": [
   "Philemon 1:1-21"
  ],
  "days": [
   "Year C Proper 18th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/46477",
  "licence": "Public domain",
  "attribution": "Crivelli, Carlo, 15th cent.. Paul, the Apostle, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 46517,
  "title": "Jephtha's Return",
  "artist": "Pellegrini, Giovanni Antonio, 1675-1741",
  "date": "1700-1725",
  "where": "Collection of Denis Mahon, London, United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Giovanni_Antonio_Pellegrini_001.jpg",
  "refs": [
   "Judges 11:29-40"
  ],
  "days": [],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/46517",
  "licence": "Public domain",
  "attribution": "Pellegrini, Giovanni Antonio, 1675-1741. Jephtha's Return, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 46582,
  "title": "Concordance",
  "artist": null,
  "date": "11th century",
  "where": "Bibliothèque nationale de France, Paris, France",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Yorck_B_031.jpg",
  "refs": [
   "Ezra 7:10"
  ],
  "days": [],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/46582",
  "licence": "Public domain",
  "attribution": "Concordance, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 46588,
  "title": "John Baptizing Jesus",
  "artist": "Notke, Bernt, ca. 1440-1509",
  "date": "1483",
  "where": "Sankt-Annen-Museum, Lubeck, Germany",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Yorck_B_023.jpg",
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
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/46588",
  "licence": "Public domain",
  "attribution": "Notke, Bernt, ca. 1440-1509. John Baptizing Jesus, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 46589,
  "title": "Cradle",
  "artist": "Morisot, Berthe, 1841-1895",
  "date": "1873",
  "where": "Musee d'Orsay, Paris, France",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Yorck_B_024.jpg",
  "refs": [
   "Psalm 113",
   "Psalm 139:1-6, 13-18"
  ],
  "days": [
   "Year A Epiphany 8th Sunday",
   "Year A Proper 3rd Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/46589",
  "licence": "Public domain",
  "attribution": "Morisot, Berthe, 1841-1895. Cradle, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 46621,
  "title": "Job and his Wife",
  "artist": "La Tour, Georges du Mesnil de, 1593-1652",
  "date": "1625-1650",
  "where": "Musee Departemental des Vosges, Epinal, France",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Georges_de_La_Tour_044.jpg",
  "refs": [
   "Job 2:7-13"
  ],
  "days": [
   "Year B Proper 22nd Sunday",
   "Year C Proper 27th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/46621",
  "licence": "Public domain",
  "attribution": "La Tour, Georges du Mesnil de, 1593-1652. Job and his Wife, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 46622,
  "title": "Job and his Wife, detail",
  "artist": "La Tour, Georges du Mesnil de, 1593-1652",
  "date": "1625-1650",
  "where": "Musee Departemental des Vosges, Epinal, France",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Georges_de_La_Tour_045.jpg",
  "refs": [
   "Job 2:7-13"
  ],
  "days": [
   "Year B Proper 22nd Sunday",
   "Year C Proper 27th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/46622",
  "licence": "Public domain",
  "attribution": "La Tour, Georges du Mesnil de, 1593-1652. Job and his Wife, detail, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 46623,
  "title": "Job and his Wife, detail",
  "artist": "La Tour, Georges du Mesnil de, 1593-1652",
  "date": "1625-1650",
  "where": "Musee Departemental des Vosges, Epinal, France",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Georges_de_La_Tour_046.jpg",
  "refs": [
   "Job 2:7-13"
  ],
  "days": [
   "Year B Proper 22nd Sunday",
   "Year C Proper 27th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/46623",
  "licence": "Public domain",
  "attribution": "La Tour, Georges du Mesnil de, 1593-1652. Job and his Wife, detail, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 46655,
  "title": "Baptism of Christ",
  "artist": "David, Gérard, approximately 1460-1523",
  "date": "1502-1508",
  "where": "Musee Communal, Bruge, Belgium",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Gerard_David_004.jpg",
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
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/46655",
  "licence": "Public domain",
  "attribution": "David, Gérard, approximately 1460-1523. Baptism of Christ, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 46672,
  "title": "The Battle at Ebenezer",
  "artist": "Bleker, Gerrit Claesz",
  "date": "1640",
  "where": "Szépművészeti Múzeum (Hungary), Budapest, Hungary",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Gerrit_Claesz_Bleker_001.jpg",
  "refs": [
   "Samuel I, 1:4-20",
   "Samuel I, 5:1"
  ],
  "days": [],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/46672",
  "licence": "Public domain",
  "attribution": "Bleker, Gerrit Claesz. The Battle at Ebenezer, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 46673,
  "title": "Elijah Feeding the Ravens",
  "artist": "Coninxloo, Gillis van, 1544-1606",
  "date": "ca. 1590",
  "where": "Musées Royaux des Beaux Arts de Belgique, Brussels, Belgium",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Gillis_van_Coninxloo_001.jpg",
  "refs": [
   "Kings I, 17:1-6"
  ],
  "days": [],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/46673",
  "licence": "Public domain",
  "attribution": "Coninxloo, Gillis van, 1544-1606. Elijah Feeding the Ravens, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 46693,
  "title": "Banks of the Seine, Vétheuil, 1880",
  "artist": "Monet, Claude, 1840-1926",
  "date": "1880",
  "where": "National Gallery of Art (U.S.), Washington, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Claude_Monet_001.jpg",
  "refs": [
   "Psalm 23"
  ],
  "days": [
   "Year B Easter 4th Sunday",
   "Year A Easter 4th Sunday",
   "Year C Easter 4th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/46693",
  "licence": "Public domain",
  "attribution": "Monet, Claude, 1840-1926. Banks of the Seine, Vétheuil, 1880, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 46701,
  "title": "Thistlefinch",
  "artist": "Fabritius, Carl Ferdinand, fl. 1664-1667",
  "date": "1654",
  "where": "Mauritshuis, The Hague, Netherlands",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Carel_Fabritius_002.jpg",
  "refs": [
   "Psalm 104:24-34, 35b"
  ],
  "days": [
   "Year B Proper 24th Sunday",
   "Year C Easter 5th Sunday",
   "Year A Proper 7th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/46701",
  "licence": "Public domain",
  "attribution": "Fabritius, Carl Ferdinand, fl. 1664-1667. Thistlefinch, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 46722,
  "title": "Ash Wednesday",
  "artist": "Spitzweg, Karl, 1808-1885",
  "date": "1855-1860",
  "where": "Staatsgalerie Stuttgart, Stuttgart, Germany",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Carl_Spitzweg_003.jpg",
  "refs": [
   "Proverbs 10:23",
   "Proverbs 11:29",
   "Psalm 142:7"
  ],
  "days": [
   "Year B Ash Wednesday",
   "Year A Ash Wednesday",
   "Year C Ash Wednesday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/46722",
  "licence": "Public domain",
  "attribution": "Spitzweg, Karl, 1808-1885. Ash Wednesday, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 46764,
  "title": "Birth of Christ",
  "artist": "La Tour, Georges du Mesnil de, 1593-1652",
  "date": "1645-1648",
  "where": "Museum of Fine Arts of Rennes, Paris, France",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Georges_de_la_Tour_020.jpg",
  "refs": [
   "Ephesians 5:8-14",
   "Psalm 36:5-11"
  ],
  "days": [
   "Year A Nativity of the Lord Proper I",
   "Year A Lent 4th Sunday",
   "Year B Holy Monday",
   "Year B Nativity of the Lord Proper I",
   "Year C Nativity of the Lord Proper I"
  ],
  "essay": "https://thevcs.org/children-light/choreography-light",
  "act": "https://act.library.vanderbilt.edu/artworks/46764",
  "licence": "Public domain",
  "attribution": "La Tour, Georges du Mesnil de, 1593-1652. Birth of Christ, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 46770,
  "title": "Baptism of Christ",
  "artist": "Gentile, da Fabriano, ca. 1370-1427",
  "date": "1425",
  "where": "Uffizi Gallery, Florence, Italy",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Gentile_da_Fabriano_076.jpg",
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
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/46770",
  "licence": "Public domain",
  "attribution": "Gentile, da Fabriano, ca. 1370-1427. Baptism of Christ, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 46806,
  "title": "Woman at the Window",
  "artist": "Friedrich, Caspar David, 1774-1840",
  "date": "1822",
  "where": "Alte Nationalgalerie, Berlin, Germany",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Caspar_David_Friedrich_018.jpg",
  "refs": [
   "Isaiah 5:1-7",
   "Psalm 62:5-12"
  ],
  "days": [
   "Year C Proper 15th Sunday",
   "Year A Proper 22nd Sunday",
   "Year B Epiphany 3rd Sunday"
  ],
  "essay": "https://thevcs.org/soul-desire/i-sought-him-whom-my-soul-loves?first=2131",
  "act": "https://act.library.vanderbilt.edu/artworks/46806",
  "licence": "Public domain",
  "attribution": "Friedrich, Caspar David, 1774-1840. Woman at the Window, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 47014,
  "title": "Embarkation of Paul to Ostia",
  "artist": "Lorrain, Claude, 1600-1682",
  "date": "1639-1640",
  "where": "Museo del Prado, Madrid, Spain",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Claude_Lorrain_006.jpg",
  "refs": [
   "Acts 27"
  ],
  "days": [],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/47014",
  "licence": "Public domain",
  "attribution": "Lorrain, Claude, 1600-1682. Embarkation of Paul to Ostia, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 47298,
  "title": "Autumn Tree in the Wind",
  "artist": "Schiele, Egon, 1890-1918",
  "date": "1912",
  "where": "Leopold Collection, Vienna, Austria",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Egon_Schiele_027.jpg",
  "refs": [
   "Mark 13:24-37"
  ],
  "days": [
   "Year B Advent 1st Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/47298",
  "licence": "Public domain",
  "attribution": "Schiele, Egon, 1890-1918. Autumn Tree in the Wind, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 47426,
  "title": "Jesus with Disciples",
  "artist": "Olivier, Ferdinand, 1785-1841",
  "date": "1840",
  "where": "Sammlung Georg Schäfer, Germany",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Ferdinand_Olivier_003.jpg",
  "refs": [
   "Mark 1:14-20",
   "Mark 6:1-13"
  ],
  "days": [],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/47426",
  "licence": "Public domain",
  "attribution": "Olivier, Ferdinand, 1785-1841. Jesus with Disciples, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 47427,
  "title": "Elijah",
  "artist": "Olivier, Ferdinand, 1785-1841",
  "date": "1830",
  "where": "Germany",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Ferdinand_Olivier_004.jpg",
  "refs": [
   "Kings I, 17:1-6",
   "Kings I, 19:1-18"
  ],
  "days": [
   "Year C Proper 7th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/47427",
  "licence": "Public domain",
  "attribution": "Olivier, Ferdinand, 1785-1841. Elijah, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 47433,
  "title": "An Angel Frees Peter from Prison",
  "artist": "Lippi, Filippino, d. 1504",
  "date": "1481",
  "where": "Santa Maria del Carmine (Church : Florence, Italy), Florence, Italy",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Filippino_Lippi_002.jpg",
  "refs": [
   "Acts 12:1-11"
  ],
  "days": [],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/47433",
  "licence": "Public domain",
  "attribution": "Lippi, Filippino, d. 1504. An Angel Frees Peter from Prison, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 47441,
  "title": "The Third of May",
  "artist": "Goya, Francisco, 1746-1828",
  "date": "1814",
  "where": "Museo del Prado, Madrid, Spain",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Francisco_de_Goya_y_Lucientes_023.jpg",
  "refs": [
   "Ecclesiastes 3:1-13"
  ],
  "days": [
   "Year A New Year’s Day",
   "Year B New Year’s Day",
   "Year C New Year’s Day"
  ],
  "essay": "https://thevcs.org/everything-season/time-war?first=1466",
  "act": "https://act.library.vanderbilt.edu/artworks/47441",
  "licence": "Public domain",
  "attribution": "Goya, Francisco, 1746-1828. The Third of May, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 47443,
  "title": "Adoration of the Magi",
  "artist": "Giorgione, 1477-1511",
  "date": "1500-1510",
  "where": "National Gallery (Great Britain), London, United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Giorgione_010.jpg",
  "refs": [
   "Mark 2:1-12"
  ],
  "days": [
   "Year A Epiphany of the Lord",
   "Year B Epiphany of the Lord",
   "Year C Epiphany of the Lord"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/47443",
  "licence": "Public domain",
  "attribution": "Giorgione, 1477-1511. Adoration of the Magi, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
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
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/47583",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "JESUS MAFA. Holy Family, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: http://www.librairie-emmanuel.fr (contact page: https://www.librairie-emmanuel.fr/contact)."
 },
 {
  "id": 47774,
  "title": "Transfiguration",
  "artist": "Angelico, fra, approximately 1400-1455",
  "date": "1450",
  "where": "Museo Nazionale di San Marco, Florence, Italy",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Fra_Angelico_042.jpg",
  "refs": [
   "Matthew 17:1-9",
   "Mark 9:2-9",
   "Luke 9:28-36, (37-43)",
   "Mark 9:2-8"
  ],
  "days": [
   "Year A Transfiguration Sunday",
   "Year B Transfiguration Sunday",
   "Year C Transfiguration Sunday"
  ],
  "essay": "https://thevcs.org/transfiguration",
  "act": "https://act.library.vanderbilt.edu/artworks/47774",
  "licence": "Public domain",
  "attribution": "Angelico, fra, approximately 1400-1455. Transfiguration, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 47778,
  "title": "Noli Me Tangere - \"Do not hold me.\"",
  "artist": "Angelico, fra, approximately 1400-1455",
  "date": "1450",
  "where": "Museo Nazionale di San Marco, Florence, Italy",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Fra_Angelico_039.jpg",
  "refs": [
   "John 20:1-18"
  ],
  "days": [
   "Year A Resurrection of the Lord",
   "Year B Resurrection of the Lord"
  ],
  "essay": "https://thevcs.org/noli-me-tangere/making-all-things-new",
  "act": "https://act.library.vanderbilt.edu/artworks/47778",
  "licence": "Public domain",
  "attribution": "Angelico, fra, approximately 1400-1455. Noli Me Tangere - \"Do not hold me.\", from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 47861,
  "title": "Peter Preaching - [Lectionary selection, Fifth Sunday of Easter, Year C]",
  "artist": "Angelico, fra, approximately 1400-1455",
  "date": "1433",
  "where": "Museo Nazionale di San Marco, Florence, Italy",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Fra_Angelico_092.jpg",
  "refs": [
   "Acts 11:1-18"
  ],
  "days": [
   "Year C Easter 5th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/47861",
  "licence": "Public domain",
  "attribution": "Angelico, fra, approximately 1400-1455. Peter Preaching - [Lectionary selection, Fifth Sunday of Easter, Year C], from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 48047,
  "title": "Christ Expelling the Money Changers in the Temple",
  "artist": "Greco, 1541?-1614",
  "date": "1600",
  "where": "National Gallery (Great Britain), London, United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/El_Greco_016.jpg",
  "refs": [
   "Matthew 21:12-16",
   "Mark 11:15-17",
   "Luke 19:45-46",
   "Kings I, 8:(1, 6, 10-11), 22-30, 41-43"
  ],
  "days": [
   "Year B Proper 16th Sunday",
   "Year B Lent 3rd Sunday"
  ],
  "essay": "https://thevcs.org/dedication-temple/space-holy",
  "act": "https://act.library.vanderbilt.edu/artworks/48047",
  "licence": "Public domain",
  "attribution": "Greco, 1541?-1614. Christ Expelling the Money Changers in the Temple, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 48067,
  "title": "Judah and Tamar",
  "artist": "Vernet, Emile-Jean-Horace, 1789-1863",
  "date": "1840",
  "where": "Wallace Collection, London, United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Emile_Jean_Horace_Vernet_001.jpg",
  "refs": [
   "Genesis 38"
  ],
  "days": [],
  "essay": "https://thevcs.org/tamar/double-standards?first=6671",
  "act": "https://act.library.vanderbilt.edu/artworks/48067",
  "licence": "Public domain",
  "attribution": "Vernet, Emile-Jean-Horace, 1789-1863. Judah and Tamar, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
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
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/48285",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "JESUS MAFA. The unfaithful wife, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: http://www.librairie-emmanuel.fr (contact page: https://www.librairie-emmanuel.fr/contact)."
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
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/48295",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "JESUS MAFA. Healing of the ten lepers, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: http://www.librairie-emmanuel.fr (contact page: https://www.librairie-emmanuel.fr/contact)."
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
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/48306",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "JESUS MAFA. Jesus heals a paralyzed man, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: http://www.librairie-emmanuel.fr (contact page: https://www.librairie-emmanuel.fr/contact)."
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
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/48385",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "JESUS MAFA. Nicodemus, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: http://www.librairie-emmanuel.fr (contact page: https://www.librairie-emmanuel.fr/contact)."
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
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/48391",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "JESUS MAFA. Christ on Gethsemane, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Éditions de l’Emmanuel, https://www.editions-emmanuel.com/contact/."
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
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/48397",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "JESUS MAFA. The poor invited to the feast, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: http://www.librairie-emmanuel.fr (contact page: https://www.librairie-emmanuel.fr/contact)."
 },
 {
  "id": 48725,
  "title": "Altar of the Mystical Lamb - Throne of God the Father",
  "artist": "Eyck, Hubert van, 1366-1426",
  "date": "1426-1432",
  "where": "Sint-Baafskathedraal te Gent, Ghent, Belgium",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Jan_van_Eyck_035.jpg",
  "refs": [
   "Psalm 50:1-8, 22-23"
  ],
  "days": [
   "Year C Ascension of the Lord",
   "Year C New Year’s Day",
   "Year C Proper 14th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/48725",
  "licence": "Public domain",
  "attribution": "Eyck, Hubert van, 1366-1426. Altar of the Mystical Lamb - Throne of God the Father, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 49140,
  "title": "Christ in the House of Mary and Martha",
  "artist": "Velázquez, Diego, 1599-1660",
  "date": "1618",
  "where": "National Gallery (Great Britain), London, United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Diego_Velazquez_008.jpg",
  "refs": [
   "Luke 10:38-42"
  ],
  "days": [
   "Year C Proper 11th Sunday"
  ],
  "essay": "https://thevcs.org/jesus-visits-martha-and-mary/marthas-shoes",
  "act": "https://act.library.vanderbilt.edu/artworks/49140",
  "licence": "Public domain",
  "attribution": "Velázquez, Diego, 1599-1660. Christ in the House of Mary and Martha, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 49155,
  "title": "Jesus Appears on Lake Tiberias",
  "artist": "Duccio, di Buoninsegna, -1319?",
  "date": "1308-1311",
  "where": "Museo dell’Opera del Duomo (Siena, Italy), Siena, Italy",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Duccio_di_Buoninsegna_015.jpg",
  "refs": [
   "John 21:1-19"
  ],
  "days": [
   "Year C Easter 3rd Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/49155",
  "licence": "Public domain",
  "attribution": "Duccio, di Buoninsegna, -1319?. Jesus Appears on Lake Tiberias, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 49605,
  "title": "Amnon and Tamar",
  "artist": "Steen, Jan, 1626-1679",
  "date": "ca. 1661-1670",
  "where": "Wallraf-Richartz-Museum, Cologne, Germany",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Jan_Steen_001.jpg",
  "refs": [
   "Samuel II, 13:1-22",
   "Samuel II, 13:1-19"
  ],
  "days": [],
  "essay": "https://thevcs.org/tamar-and-amnon/testosterones-toy?first=2041",
  "act": "https://act.library.vanderbilt.edu/artworks/49605",
  "licence": "Public domain",
  "attribution": "Steen, Jan, 1626-1679. Amnon and Tamar, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 49607,
  "title": "Christ with Mary and Martha",
  "artist": "Vermeer, Johannes, 1632-1675",
  "date": "1654",
  "where": "National Gallery of Scotland, Edinburgh, United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Jan_Vermeer_van_Delft_004.jpg",
  "refs": [
   "Luke 10:38-42"
  ],
  "days": [
   "Year C Proper 11th Sunday"
  ],
  "essay": "https://thevcs.org/jesus-visits-martha-and-mary/sibling-harmony",
  "act": "https://act.library.vanderbilt.edu/artworks/49607",
  "licence": "Public domain",
  "attribution": "Vermeer, Johannes, 1632-1675. Christ with Mary and Martha, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 49946,
  "title": "Christ as Sol Invictus",
  "artist": null,
  "date": "3rd century",
  "where": "St. Peter's Basilica, Vatican City",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/WK_ChristAsSol.jpg",
  "refs": [
   "Psalm 37:1-11, 39-40",
   "Ephesians 5:8-14"
  ],
  "days": [
   "Year A Lent 4th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/49946",
  "licence": "Public domain",
  "attribution": "Christ as Sol Invictus, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 49955,
  "title": "Three Youths in the Fiery Furnace",
  "artist": null,
  "date": "3rd century/early 4th century",
  "where": "Catacomb of Priscilla, Rome, Italy",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/WK_Fiery_furnace_01.jpg",
  "refs": [
   "Daniel 3"
  ],
  "days": [],
  "essay": "https://thevcs.org/fiery-furnace/baptism-fire?first=4786",
  "act": "https://act.library.vanderbilt.edu/artworks/49955",
  "licence": "Public domain",
  "attribution": "Three Youths in the Fiery Furnace, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 49967,
  "title": "Gedachtniskirche (Memorial Church)",
  "artist": null,
  "date": null,
  "where": "Speyer, Germany",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/WK_Kapernaum_Gedaechtniskirche_Speyer.jpg",
  "refs": [
   "Luke 7:1-10",
   "Matthew 8:5-13"
  ],
  "days": [],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/49967",
  "licence": "CC BY-SA 3.0",
  "attribution": "Gedachtniskirche (Memorial Church), from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 50249,
  "title": "Elijah in the Desert",
  "artist": "Allston, Washington, 1779-1843",
  "date": "1818",
  "where": "Museum of Fine Arts, Boston, Boston",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/MFA_70-1.jpg",
  "refs": [
   "Kings I, 17:1-6"
  ],
  "days": [],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/50249",
  "licence": "Public domain",
  "attribution": "Allston, Washington, 1779-1843. Elijah in the Desert, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 50252,
  "title": "Apples",
  "artist": "Whittredge, Worthington, 1820-1910",
  "date": "1867",
  "where": "Museum of Fine Arts, Boston, Boston",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/MFA_48-490.jpg",
  "refs": [
   "Proverbs 7:1-4",
   "Psalm 17:1-9"
  ],
  "days": [
   "Year A Proper 25th Sunday",
   "Year C Easter 6th Sunday",
   "Year C Proper 27th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/50252",
  "licence": "Public domain",
  "attribution": "Whittredge, Worthington, 1820-1910. Apples, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 50259,
  "title": "Libby Prison",
  "artist": "Blythe, David Gilmour, 1815-1865",
  "date": "1863",
  "where": "Museum of Fine Arts, Boston, Boston, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/MFA_48-414.jpg",
  "refs": [
   "Isaiah 42:1-9",
   "Psalm 120",
   "Psalm 9:15-20"
  ],
  "days": [
   "Year B Holy Monday",
   "Year B Proper 28th Sunday",
   "Year C Proper 9th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/50259",
  "licence": "Public domain",
  "attribution": "Blythe, David Gilmour, 1815-1865. Libby Prison, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 50263,
  "title": "April Showers",
  "artist": "Heade, Martin Johnson, 1819-1904",
  "date": "1868",
  "where": "Museum of Fine Arts, Boston, Boston",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/MFA_47-1173.jpg",
  "refs": [
   "Hosea 5:15-6:6",
   "Psalm 147"
  ],
  "days": [
   "Year B Epiphany 5th Sunday",
   "Year A Proper 5th Sunday",
   "Year B Easter 4th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/50263",
  "licence": "Public domain",
  "attribution": "Heade, Martin Johnson, 1819-1904. April Showers, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 50271,
  "title": "Clouds (Landscape near Cornish)",
  "artist": "Platt, Charles A. (Charles Adams), 1861-1933",
  "date": "1894",
  "where": "Museum of Fine Arts, Boston, Boston, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/MFA_37-1173.jpg",
  "refs": [
   "Psalm 147:1-11, 20c",
   "Job 37:16"
  ],
  "days": [
   "Year B Proper 24th Sunday",
   "Year B Easter 4th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/50271",
  "licence": "Public domain",
  "attribution": "Platt, Charles A. (Charles Adams), 1861-1933. Clouds (Landscape near Cornish), from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 50275,
  "title": "Hope",
  "artist": "Burne-Jones, Edward Coley, 1833-1898",
  "date": "1896",
  "where": "Museum of Fine Arts, Boston, Boston, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/MFA_40-778.jpg",
  "refs": [
   "Matthew 25:31-46",
   "Psalm 142:7",
   "Timothy II, 1:1-14",
   "Wisdom of Solomon 12:13, 16-19"
  ],
  "days": [
   "Year A New Year’s Day",
   "Year C Proper 22nd Sunday",
   "Year A Proper 11th Sunday",
   "Year A Reign of Christ"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/50275",
  "licence": "Public domain",
  "attribution": "Burne-Jones, Edward Coley, 1833-1898. Hope, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 50280,
  "title": "Morning on the Seine, near Giverny",
  "artist": "Monet, Claude, 1840-1926",
  "date": "1896",
  "where": "Museum of Fine Arts, Boston, Boston, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/MFA_39-655.jpg",
  "refs": [
   "Psalm 90:1-6, 13-17",
   "Psalm 92:1-4, 12-15",
   "Psalm 30"
  ],
  "days": [
   "Year A Proper 25th Sunday",
   "Year C Epiphany 8th Sunday",
   "Year B Epiphany 6th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/50280",
  "licence": "CC BY-SA 4.0",
  "attribution": "Monet, Claude, 1840-1926. Morning on the Seine, near Giverny, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 50281,
  "title": "Homer Dictating to Scribes",
  "artist": "Gelder, Aert de, 1645-1727",
  "date": "ca. 1700-1710",
  "where": "Museum of Fine Arts, Boston, Boston, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/MFA_39-45.jpg",
  "refs": [
   "Job 32:7",
   "Corinthians I, 1:18-31"
  ],
  "days": [
   "Year B Holy Tuesday",
   "Year A Holy Tuesday",
   "Year C Holy Tuesday",
   "Year A Epiphany 4thSunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/50281",
  "licence": "Public domain",
  "attribution": "Gelder, Aert de, 1645-1727. Homer Dictating to Scribes, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 50284,
  "title": "Where Do We Come From? What Are We? Where Are We Going?",
  "artist": "Gauguin, Paul, 1848-1903",
  "date": "1897-1898",
  "where": "Museum of Fine Arts, Boston, Boston, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/MFA_36-270.jpg",
  "refs": [
   "Ecclesiastes 1:2, 12-14; 2:18-23"
  ],
  "days": [
   "Year C Proper 13th Sunday"
  ],
  "essay": "https://thevcs.org/philosophy-pleasure-and-folly/personal-philosophy?first=2321",
  "act": "https://act.library.vanderbilt.edu/artworks/50284",
  "licence": "Public domain",
  "attribution": "Gauguin, Paul, 1848-1903. Where Do We Come From? What Are We? Where Are We Going?, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 50303,
  "title": "Young Beggars",
  "artist": "Decamps, Alexandre-Gabriel, 1803-1860",
  "date": "1803-1860",
  "where": "Museum of Fine Arts, Boston, Boston, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/MFA_23-508.jpg",
  "refs": [
   "Psalm 147",
   "Amos 8:4-7"
  ],
  "days": [
   "Year B Epiphany 5th Sunday",
   "Year B Proper 23rd Sunday",
   "Year C Proper 20th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/50303",
  "licence": "Public domain",
  "attribution": "Decamps, Alexandre-Gabriel, 1803-1860. Young Beggars, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 50325,
  "title": "Abraham Lincoln",
  "artist": "Hunt, William Morris, 1824-1879",
  "date": "1865",
  "where": "Museum of Fine Arts, Boston, Boston, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/MFA_19-9.jpg",
  "refs": [
   "Hebrews 2:14-18",
   "Psalm 106"
  ],
  "days": [
   "Year B Presentation of the Lord"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/50325",
  "licence": "Public domain",
  "attribution": "Hunt, William Morris, 1824-1879. Abraham Lincoln, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 50496,
  "title": "Fox in a Trap",
  "artist": "Troyon, Constant, 1810-1865",
  "date": "1855-1865",
  "where": "Museum of Fine Arts, Boston, Boston, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/MFA_21-8.jpg",
  "refs": [
   "Job 18:9-10",
   "Isaiah 8:14",
   "Psalm 31:4",
   "Amos 3:15"
  ],
  "days": [
   "Year C Proper 8th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/50496",
  "licence": "Public domain",
  "attribution": "Troyon, Constant, 1810-1865. Fox in a Trap, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 50498,
  "title": "The Angel Releasing St. Peter from Prison",
  "artist": "Allston, Washington, 1779-1843",
  "date": "1814-1816",
  "where": "National Gallery of Art (U.S.), Boston",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/MFA_21-1379.jpg",
  "refs": [
   "Acts 12:1-11"
  ],
  "days": [],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/50498",
  "licence": "Public domain",
  "attribution": "Allston, Washington, 1779-1843. The Angel Releasing St. Peter from Prison, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 50630,
  "title": "Saul Reproved by Samuel",
  "artist": "Copley, John Singleton, 1738-1815",
  "date": "1798",
  "where": "Museum of Fine Arts, Boston, Boston, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/MFA_25-99.jpg",
  "refs": [
   "Samuel I, 13:1-15"
  ],
  "days": [],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/50630",
  "licence": "Public domain",
  "attribution": "Copley, John Singleton, 1738-1815. Saul Reproved by Samuel, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 50934,
  "title": "Woodland Interior",
  "artist": "Durand, A. B. (Asher Brown), 1796-1886",
  "date": "1855",
  "where": "Museum of Fine Arts, Boston, Boston",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/MFA_63-269.jpg",
  "refs": [
   "Psalm 96:1-9, (10-13)"
  ],
  "days": [
   "Year A Proper 24th Sunday",
   "Year C Epiphany 9th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/50934",
  "licence": "Public domain",
  "attribution": "Durand, A. B. (Asher Brown), 1796-1886. Woodland Interior, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 50937,
  "title": "Hummingbirds with Nest",
  "artist": "Heade, Martin Johnson, 1819-1904",
  "date": "1863",
  "where": "Museum of Fine Arts, Boston, Boston",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/MFA_64-429.jpg",
  "refs": [
   "Psalm 84"
  ],
  "days": [
   "Year B Proper 16th Sunday",
   "Year C Presentation of the Lord",
   "Year A Presentation of the Lord",
   "Year B Presentation of the Lord"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/50937",
  "licence": "Public domain",
  "attribution": "Heade, Martin Johnson, 1819-1904. Hummingbirds with Nest, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 50942,
  "title": "Fruit Displayed on a Stand",
  "artist": "Caillebotte, Gustave, 1848-1894",
  "date": "1881-1882",
  "where": "Museum of Fine Arts, Boston, Boston",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/MFA_1979-196.jpg",
  "refs": [
   "Psalm 128"
  ],
  "days": [
   "Year A Proper 12th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/50942",
  "licence": "Public domain",
  "attribution": "Caillebotte, Gustave, 1848-1894. Fruit Displayed on a Stand, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 51103,
  "title": "St. Peter Released from Prison",
  "artist": "West, Benjamin, 1738-1820",
  "date": "1800",
  "where": "Museum of Fine Arts, Boston, Boston",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/MFA_58-974.jpg",
  "refs": [
   "Acts 12:1-11"
  ],
  "days": [],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/51103",
  "licence": "Public domain",
  "attribution": "West, Benjamin, 1738-1820. St. Peter Released from Prison, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 51130,
  "title": "Moses Striking the Rock and Bringing Forth the Water",
  "artist": "Bachiacca, 1494-1557",
  "date": "1540-1545",
  "where": "National Gallery of Scotland, Edinburgh, United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Yorck_B_001.jpg",
  "refs": [
   "Exodus 17:1-7",
   "Numbers 20:2-13"
  ],
  "days": [
   "Year A Proper 21st Sunday"
  ],
  "essay": "https://thevcs.org/striking-rock/miracle-presence?first=5956",
  "act": "https://act.library.vanderbilt.edu/artworks/51130",
  "licence": "Public domain",
  "attribution": "Bachiacca, 1494-1557. Moses Striking the Rock and Bringing Forth the Water, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 53079,
  "title": "A View of the Mountain Pass Called the Notch of the White Mountans (Crawford Notch)",
  "artist": "Cole, Thomas, 1801-1848",
  "date": "1839",
  "where": "National Gallery of Art (U.S.), Washington, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Thomas_Cole.jpg",
  "refs": [
   "Psalm 8"
  ],
  "days": [
   "Year B Proper 24th Sunday",
   "Year C Holy Name of Jesus"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/53079",
  "licence": "Public domain",
  "attribution": "Cole, Thomas, 1801-1848. A View of the Mountain Pass Called the Notch of the White Mountans (Crawford Notch), from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 54104,
  "title": "Sacrifice of Jephthah’s Daughter",
  "artist": "Opie, John, 1761-1807",
  "date": "1867",
  "where": "National Museum Cardiff, Cardiff, United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Jephtha111aza0n.jpg",
  "refs": [
   "Judges 11:29-40"
  ],
  "days": [],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/54104",
  "licence": "Public domain",
  "attribution": "Opie, John, 1761-1807. Sacrifice of Jephthah’s Daughter, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 54125,
  "title": "Ecce Ancilla Domini! (Behold the Lord's Servant)",
  "artist": "Rossetti, Dante Gabriel, 1828-1882",
  "date": "1849-1850",
  "where": "Tate Britain, London, United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/B_FourthSundayofAdvent.jpg",
  "refs": [
   "Luke 1:26-38"
  ],
  "days": [
   "Year B Advent 4th Sunday"
  ],
  "essay": "https://thevcs.org/annunciation/white-annunciation",
  "act": "https://act.library.vanderbilt.edu/artworks/54125",
  "licence": "Public domain",
  "attribution": "Rossetti, Dante Gabriel, 1828-1882. Ecce Ancilla Domini! (Behold the Lord's Servant), from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 54150,
  "title": "Salvation Mountain",
  "artist": "Knight, Leonard, 1931-",
  "date": "1993-2009",
  "where": "Salvation Mountain, Niland, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/B_TrinitySunday.jpg",
  "refs": [
   "Mark 8:31-38",
   "John 3:1-17",
   "Luke 9:51-62"
  ],
  "days": [
   "Year C Proper 8th Sunday",
   "Year B Trinity Sunday",
   "Year B Lent 2nd Sunday",
   "Year A Lent 2nd Sunday",
   "Year A Holy Cross"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/54150",
  "licence": "CC BY-SA 2.0",
  "attribution": "Knight, Leonard, 1931-. Salvation Mountain, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 54153,
  "title": "Women Holding a Basket of Corn",
  "artist": null,
  "date": "2008",
  "where": "Mexico",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/B_Proper12.jpg",
  "refs": [
   "John 6:1-21",
   "Luke 1:46b-55"
  ],
  "days": [
   "Year B Advent 3rd Sunday",
   "",
   "Year B Proper 12th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/54153",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Women Holding a Basket of Corn, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: http://www.flickr.com/photos/worldbank/2658290899/."
 },
 {
  "id": 54177,
  "title": "Nathan rebukes David with the parable of the poor man's lamb.",
  "artist": null,
  "date": "ca. 1130",
  "where": "Basilique Sainte-Marie-Madeleine de Vézelay, Vezelay, France",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/B_Proper13.jpg",
  "refs": [
   "Samuel II, 11:26-12:13a"
  ],
  "days": [
   "Year B Proper 13th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/54177",
  "licence": "Public domain",
  "attribution": "Nathan rebukes David with the parable of the poor man's lamb., from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 54179,
  "title": "Esther and Haman before Ahasuerus",
  "artist": "Victors, Jan, 1619-1676",
  "date": "between 1635 and 1640",
  "where": "Wallraf-Richartz-Museum, Cologne, Germany",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/B_Proper21.jpg",
  "refs": [
   "Esther 7:1-6, 9-10; 9:20-22"
  ],
  "days": [
   "Year B Proper 21st Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/54179",
  "licence": "Public domain",
  "attribution": "Victors, Jan, 1619-1676. Esther and Haman before Ahasuerus, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 54182,
  "title": "Summer, or, Ruth and Boaz",
  "artist": "Poussin, Nicolas, 1594?-1665",
  "date": "1660-1664",
  "where": "Louvre, Paris, France",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/B_Proper27.jpg",
  "refs": [
   "Ruth 3:1-5; 4:13-17"
  ],
  "days": [
   "Year B Proper 27th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/54182",
  "licence": "Public domain",
  "attribution": "Poussin, Nicolas, 1594?-1665. Summer, or, Ruth and Boaz, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 54184,
  "title": "A Mother in Israel: Hannah, Samuel and Eli - In memory of Agnes Nichols on 1862",
  "artist": "Wailes, William, 1808-1881",
  "date": "1862",
  "where": "Church of St. Mary the Virgin, Ambleside, United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/6676222261_ebefc5f0fa_ohan.jpg",
  "refs": [
   "Samuel I, 1:4-20"
  ],
  "days": [
   "Year B Proper 28th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/54184",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Wailes, William, 1808-1881. A Mother in Israel: Hannah, Samuel and Eli - In memory of Agnes Nichols on 1862, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: https://www.flickr.com/photos/76236133@N00/6676222261."
 },
 {
  "id": 54212,
  "title": "Christ in the House of Simon*",
  "artist": "Bouts, Dieric, 1415-1475",
  "date": "ca. 1440-1450",
  "where": "Staatliche Museen, Berlin, Berlin, Germany",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/C_Proper6.jpg",
  "refs": [
   "Luke 7:36-8:3"
  ],
  "days": [
   "Year C Proper 6th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/54212",
  "licence": "Public domain",
  "attribution": "Bouts, Dieric, 1415-1475. Christ in the House of Simon*, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 54223,
  "title": "The prophet Habakkuk",
  "artist": "Donatello, 1386?-1466",
  "date": "ca. 1425",
  "where": "Opera di S. Maria del Fiore (Florence, Italy). Museo, Florence, Italy",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/zuccone9320idn89.jpg",
  "refs": [
   "Habakkuk 1:1-4; 2:1-4"
  ],
  "days": [
   "Year C Proper 22nd Sunday"
  ],
  "essay": "https://thevcs.org/protest-faith/prophet-high?first=6226",
  "act": "https://act.library.vanderbilt.edu/artworks/54223",
  "licence": "CC BY-SA 4.0",
  "attribution": "Donatello, 1386?-1466. The prophet Habakkuk, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 54225,
  "title": "The Prophet Joel",
  "artist": "Michelangelo Buonarroti, 1475-1564",
  "date": "1508-1512",
  "where": "Sistine Chapel, Vatican City",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/C_Proper25.jpg",
  "refs": [
   "Joel 2:23-32"
  ],
  "days": [
   "Year C Proper 25th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/54225",
  "licence": "Public domain",
  "attribution": "Michelangelo Buonarroti, 1475-1564. The Prophet Joel, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 54271,
  "title": "Dancing figurines, perhaps snake goddess dance",
  "artist": null,
  "date": null,
  "where": "Heraklion Archaeological Museum, Crete, Greece",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/26529277850_7ee466dde4_5k34.jpg",
  "refs": [
   "Psalm 149"
  ],
  "days": [
   "Year A Proper 18th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/54271",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Dancing figurines, perhaps snake goddess dance, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: https://www.flickr.com/photos/garrettziegler/26529277850."
 },
 {
  "id": 54429,
  "title": "San Clemente - \"Triumph of the Cross\" - mosaics in apse of 12th century church",
  "artist": null,
  "date": "12th century",
  "where": "Basilica of Saint Clement, Rome, Italy",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/L42-clemente.jpg",
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
  "essay": "https://thevcs.org/thirsting-god/second-tree-life",
  "act": "https://act.library.vanderbilt.edu/artworks/54429",
  "licence": "Public domain",
  "attribution": "San Clemente - \"Triumph of the Cross\" - mosaics in apse of 12th century church, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 54435,
  "title": "Santa Prassede",
  "artist": null,
  "date": "780",
  "where": "S. Prassede (Church : Rome, Italy), Rome, Italy",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Interior_of_Basilica_di_Santa_Prassede,_Rome38.jpg",
  "refs": [
   "Isaiah 58:1-9a, (9b-12)",
   "Psalm 112:1-9 (10)"
  ],
  "days": [
   "Year A Epiphany 5th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/54435",
  "licence": "CC BY-SA 3.0",
  "attribution": "Santa Prassede, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 54439,
  "title": "Santa Prassede",
  "artist": null,
  "date": "780",
  "where": "S. Prassede (Church : Rome, Italy), Rome, Italy",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Santa_Prassede-571.jpg",
  "refs": [
   "Isaiah 58:1-9a, (9b-12)",
   "Psalm 112:1-9 (10)"
  ],
  "days": [
   "Year A Epiphany 5th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/54439",
  "licence": "CC BY-SA 3.0",
  "attribution": "Santa Prassede, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 54557,
  "title": "Mosaic from Kariye Camii showing Christ enthroned",
  "artist": "Anonymous",
  "date": "1315-1321",
  "where": "Kariye Museum (also known as Kariye Camii or Church of the Holy Savior of Chora), Istanbul, Turkey",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Chora_Church_Constantinople_(6)34.jpg",
  "refs": [
   "John 14:1-14",
   "Peter I, 2:2-10"
  ],
  "days": [
   "Year A Easter 5th Sunday"
  ],
  "essay": "https://thevcs.org/living-stone-and-chosen-people/built-spiritual-house",
  "act": "https://act.library.vanderbilt.edu/artworks/54557",
  "licence": "Public domain",
  "attribution": "Anonymous. Mosaic from Kariye Camii showing Christ enthroned, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 54666,
  "title": "Prodigal Son",
  "artist": "Rembrandt Harmenszoon van Rijn, 1606-1669",
  "date": "1636",
  "where": "Metropolitan Museum of Art, New York, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/prodigal-rembrandt4.jpg",
  "refs": [
   "Luke 15:1-3, 11b-32"
  ],
  "days": [
   "Year C Lent 4th Sunday"
  ],
  "essay": "https://thevcs.org/lords-prayer/father-forgives-we-forgive",
  "act": "https://act.library.vanderbilt.edu/artworks/54666",
  "licence": "Public domain",
  "attribution": "Rembrandt Harmenszoon van Rijn, 1606-1669. Prodigal Son, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 54707,
  "title": "Blinding of Samson, detail",
  "artist": "Rembrandt Harmenszoon van Rijn, 1606-1669",
  "date": "1636",
  "where": "Städel, Frankfurt am Main, Germany",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/samson-rembrandt.jpg",
  "refs": [
   "Judges 16:1-22"
  ],
  "days": [],
  "essay": "https://thevcs.org/samson-and-delilah/grim-delight?first=1106",
  "act": "https://act.library.vanderbilt.edu/artworks/54707",
  "licence": "Public domain",
  "attribution": "Rembrandt Harmenszoon van Rijn, 1606-1669. Blinding of Samson, detail, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 54731,
  "title": "Good Samaritan",
  "artist": "Rembrandt Harmenszoon van Rijn, 1606-1669",
  "date": "1633",
  "where": "Rijksmuseum Amsterdam, Amsterdam, Netherlands",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/good-rembrandt3.jpg",
  "refs": [
   "Luke 10:25-37"
  ],
  "days": [
   "Year C Proper 10th Sunday"
  ],
  "essay": "https://thevcs.org/good-samaritan/sht-happens",
  "act": "https://act.library.vanderbilt.edu/artworks/54731",
  "licence": "Public domain",
  "attribution": "Rembrandt Harmenszoon van Rijn, 1606-1669. Good Samaritan, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 54928,
  "title": "Saint Francis in the Desert",
  "artist": "Bellini, Giovanni, 1426?-1516",
  "date": "1480",
  "where": "Frick Collection, New York, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/bellini-francis.jpg",
  "refs": [
   "Psalm 139:1-6, 13-18",
   "Philippians 4:1-9"
  ],
  "days": [
   "Year C Proper 18th Sunday",
   "Year A Proper 23rd Sunday"
  ],
  "essay": "https://thevcs.org/exhortation-attentiveness/rejoice-lord-always",
  "act": "https://act.library.vanderbilt.edu/artworks/54928",
  "licence": "Public domain",
  "attribution": "Bellini, Giovanni, 1426?-1516. Saint Francis in the Desert, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 54940,
  "title": "Third Class Carriage",
  "artist": "Daumier, Honoré, 1808-1879",
  "date": "1856-1858",
  "where": "Palace of the Legion of Honor, San Francisco, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/daumier-third.jpg",
  "refs": [
   "Psalm 147"
  ],
  "days": [
   "Year B Epiphany 5th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/54940",
  "licence": "Public domain",
  "attribution": "Daumier, Honoré, 1808-1879. Third Class Carriage, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 54984,
  "title": "Parable of the Unjust Judge",
  "artist": "Millais, John Everett, 1829-1896",
  "date": "1863",
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/johnemparable.jpg",
  "refs": [
   "Luke 18:1-8"
  ],
  "days": [
   "Year C Proper 24th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/54984",
  "licence": "Public domain",
  "attribution": "Millais, John Everett, 1829-1896. Parable of the Unjust Judge, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 55003,
  "title": "Tower of Siloam",
  "artist": "Tissot, James, 1836-1902",
  "date": "ca. 1886-1894",
  "where": "Brooklyn Museum, New York, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/bmtower.jpg",
  "refs": [
   "Luke 13:1-9"
  ],
  "days": [
   "Year C Lent 3rd Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/55003",
  "licence": "Public domain",
  "attribution": "Tissot, James, 1836-1902. Tower of Siloam, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 55033,
  "title": "Esther and King Ahasuerus",
  "artist": null,
  "date": "15th century",
  "where": "Vange Church, Uppland, Sweden",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/esteroch.jpg",
  "refs": [
   "Esther 7:1-6, 9-10; 9:20-22"
  ],
  "days": [
   "Year B Proper 21st Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/55033",
  "licence": "Public domain",
  "attribution": "Esther and King Ahasuerus, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 55038,
  "title": "Disciples John and Peter on their way to the tomb on Easter morning",
  "artist": "Burnand, Eugène, 1850-1921",
  "date": "1898",
  "where": "Musee d'Orsay, Paris, France",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/burnandjean.jpg",
  "refs": [
   "John 20:1-18",
   "Peter I, 1:3-9"
  ],
  "days": [
   "Year A Resurrection of the Lord",
   "Year B Resurrection of the Lord",
   "Year A Easter 2nd Sunday"
  ],
  "essay": "https://thevcs.org/where-angels-long-look",
  "act": "https://act.library.vanderbilt.edu/artworks/55038",
  "licence": "Public domain",
  "attribution": "Burnand, Eugène, 1850-1921. Disciples John and Peter on their way to the tomb on Easter morning, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 55152,
  "title": "Tile from Peace Wall in Hamilton, New Zealand",
  "artist": null,
  "date": "20th century",
  "where": "Hamilton, New Zealand",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/shalom-love.jpg",
  "refs": [
   "Psalm 122",
   "Matthew 5:1-12"
  ],
  "days": [
   "Year A All Saints Day",
   "Year A Advent 1st Sunday",
   "Year C Advent 3rd Sunday",
   "Year B Proper 7th Sunday",
   "Year C Holy Name of Jesus"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/55152",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Tile from Peace Wall in Hamilton, New Zealand, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: http://www.flickr.com/photos/taniwha/7186824/."
 },
 {
  "id": 55160,
  "title": "Prophet Hannah in the temple; Samuel's prayer testing",
  "artist": "Workshop of Rembrandt",
  "date": "17th century",
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/BVis-hannah-temple.jpg",
  "refs": [
   "Samuel I, 1:4-20"
  ],
  "days": [
   "Year B Visitation of Mary to Elizabeth",
   "Year B Epiphany 2nd Sunday",
   "Year B Proper 28th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/55160",
  "licence": "Public domain",
  "attribution": "Workshop of Rembrandt. Prophet Hannah in the temple; Samuel's prayer testing, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 55165,
  "title": "He Who is of God Hears the Word of God",
  "artist": "Tissot, James, 1836-1902",
  "date": "ca. 1886-1894",
  "where": "Brooklyn Museum, New York, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/BEast07-tissot.jpg",
  "refs": [
   "John 17:6-19"
  ],
  "days": [
   "Year B Easter 7th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/55165",
  "licence": "Public domain",
  "attribution": "Tissot, James, 1836-1902. He Who is of God Hears the Word of God, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 55181,
  "title": "Hannah Giving Her Son Samuel to the Priest",
  "artist": "Victors, Jan, 1619-1676",
  "date": "1645",
  "where": "Staatliche Museen, Berlin, Berlin, Germany",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/BVis-hannah7.jpg",
  "refs": [
   "Samuel I, 1:4-20"
  ],
  "days": [
   "Year C Christmas 1st Sunday",
   "Year B Visitation of Mary to Elizabeth",
   "Year B Proper 28th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/55181",
  "licence": "Public domain",
  "attribution": "Victors, Jan, 1619-1676. Hannah Giving Her Son Samuel to the Priest, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 55188,
  "title": "Holy Spirit as Breath",
  "artist": null,
  "date": "980-993",
  "where": "Stadtbibliothek Trier, Trier, Germany",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/BPDay-codex.jpg",
  "refs": [
   "Acts 10:44-48"
  ],
  "days": [
   "Year A Day of Pentecost",
   "Year B Easter 6th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/55188",
  "licence": "Public domain",
  "attribution": "Holy Spirit as Breath, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 55198,
  "title": "King David Playing the Harp",
  "artist": "Rubens, Peter Paul, 1577-1640",
  "date": "early 17th c.",
  "where": "Städel, Frankfurt, Germany",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/BEast06-Davidold.jpg",
  "refs": [
   "Psalm 51:1-12",
   "Psalm 20"
  ],
  "days": [
   "Year A Proper 6th Sunday",
   "Year B Lent 5th  Sunday",
   "Year B Proper 6th Sunday",
   "Year B Holy Cross"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/55198",
  "licence": "Public domain",
  "attribution": "Rubens, Peter Paul, 1577-1640. King David Playing the Harp, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 55200,
  "title": "Hope",
  "artist": "Watts, George Frederick, 1817-1904",
  "date": "1886",
  "where": "Tate Britain, London, United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/BEast06-lyre.jpg",
  "refs": [
   "Psalm 71:1-14"
  ],
  "days": [
   "Year C Proper 16th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/55200",
  "licence": "Public domain",
  "attribution": "Watts, George Frederick, 1817-1904. Hope, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 55215,
  "title": "Christ in the House of Simon the Pharisee",
  "artist": "Rubens, Peter Paul, 1577-1640",
  "date": "ca. 1618-1620",
  "where": "Gosudarstvennyĭ Ėrmitazh (Russia), St. Petersburg, Russia",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/rubens-feast.jpg",
  "refs": [
   "Luke 7:36-8:3"
  ],
  "days": [
   "Year C Proper 6th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/55215",
  "licence": "Public domain",
  "attribution": "Rubens, Peter Paul, 1577-1640. Christ in the House of Simon the Pharisee, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 55288,
  "title": "Christ in Glory",
  "artist": null,
  "date": null,
  "where": "St. Charles Seminary, Carthagena, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Saint_Charles_Seminary_mosaic.jpg",
  "refs": [
   "Haggai 1:15b-2:9"
  ],
  "days": [
   "Year C Advent 1st Sunday",
   "Year C Proper 27th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/55288",
  "licence": "CC BY-SA 3.0",
  "attribution": "Christ in Glory, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 55312,
  "title": "Anointing of David",
  "artist": null,
  "date": "10th century",
  "where": "Bibliothèque nationale de France, Paris, France",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Paris_psaulter_gr139_fol3v.jpg",
  "refs": [
   "Samuel II, 5:1-5, 9-10",
   "Samuel I, 16:1-13"
  ],
  "days": [
   "Year B Proper 9th Sunday",
   "Year A Lent 4th Sunday"
  ],
  "essay": "https://thevcs.org/anointing-david/sacred-rule",
  "act": "https://act.library.vanderbilt.edu/artworks/55312",
  "licence": "Public domain",
  "attribution": "Anointing of David, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 55318,
  "title": "Ruth and Naomi in Boaz' fields",
  "artist": "Heemskerk, Martin van, 1498-1574",
  "date": "ca. 1530-1540",
  "where": "Kunsthistorisches Museum Wien, Wien, Austria",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Jan_van_Scorel_006.jpg",
  "refs": [
   "Ruth 3:1-5; 4:13-17"
  ],
  "days": [
   "Year B Proper 27th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/55318",
  "licence": "Public domain",
  "attribution": "Heemskerk, Martin van, 1498-1574. Ruth and Naomi in Boaz' fields, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 55330,
  "title": "Ruth meets Boaz as she gleans and Ruth visits Boaz",
  "artist": "William, de Brailes, active 13th century",
  "date": "13th century",
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/brailes-boaz.jpg",
  "refs": [
   "Ruth 2:1-13"
  ],
  "days": [
   "Year B Proper 27th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/55330",
  "licence": "Public domain",
  "attribution": "William, de Brailes, active 13th century. Ruth meets Boaz as she gleans and Ruth visits Boaz, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 55336,
  "title": "Miraculous Draught of Fishes",
  "artist": "Bassano, Jacopo, approximately 1518-1592",
  "date": "1545",
  "where": "National Gallery of Art (U.S.), Washington, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Fishes-Bassano.jpg",
  "refs": [
   "John 21:1-19"
  ],
  "days": [
   "Year C Easter 3rd Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/55336",
  "licence": "Public domain",
  "attribution": "Bassano, Jacopo, approximately 1518-1592. Miraculous Draught of Fishes, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 55337,
  "title": "Miraculous Draught of Fishes",
  "artist": "Beuckelaer, Joachim, approximately 1533-1575",
  "date": "1563",
  "where": "Getty Center, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Beuckelaer_-_The_Miraculous.jpg",
  "refs": [
   "John 21:1-19"
  ],
  "days": [
   "Year C Epiphany 5th Sunday",
   "Year C Easter 3rd Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/55337",
  "licence": "Public domain",
  "attribution": "Beuckelaer, Joachim, approximately 1533-1575. Miraculous Draught of Fishes, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 55346,
  "title": "Sermon on the Mount",
  "artist": "Bruegel, Jan, 1568-1625",
  "date": "1598",
  "where": "Getty Center, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Sermon_on_the_Mount8.jpg",
  "refs": [
   "Matthew 5:1-12",
   "Luke 6:17-26"
  ],
  "days": [
   "Year A Epiphany 4thSunday",
   "Year C Epiphany 6th Sunday"
  ],
  "essay": "https://thevcs.org/sermon-mount/righteousness-heart?first=1676",
  "act": "https://act.library.vanderbilt.edu/artworks/55346",
  "licence": "Public domain",
  "attribution": "Bruegel, Jan, 1568-1625. Sermon on the Mount, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 55347,
  "title": "Sermon on the Mount, detail",
  "artist": "Olrik, Henrik, 1830-1890",
  "date": "ca. 1860",
  "where": "Sankt Matthaeus Kirke, Copenhagen, Denmark",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Sankt_Matthaeus_Kirke.jpg",
  "refs": [
   "Matthew 5:1-12",
   "Matthew 6:24-34",
   "Samuel I, 2:1-10",
   "Luke 14:25-33"
  ],
  "days": [
   "Year B Visitation of Mary to Elizabeth",
   "Year C Visitation of Mary to Elizabeth",
   "Year C Proper 18th Sunday",
   "Year A Epiphany 8th Sunday",
   "Year A Epiphany 4thSunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/55347",
  "licence": "Public domain",
  "attribution": "Olrik, Henrik, 1830-1890. Sermon on the Mount, detail, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 55353,
  "title": "Wrath",
  "artist": "Bosch, Hieronymus, -1516",
  "date": "15th century",
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Bosch_Ira.jpg",
  "refs": [
   "Psalm 37:1-11, 39-40",
   "Leviticus 19:1-2, 9-18"
  ],
  "days": [
   "Year C Epiphany 7th Sunday",
   "Year A Epiphany 7th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/55353",
  "licence": "Public domain",
  "attribution": "Bosch, Hieronymus, -1516. Wrath, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 55366,
  "title": "Brow of the Hill Near Nazareth",
  "artist": "Tissot, James, 1836-1902",
  "date": "ca. 1886-1894",
  "where": "Brooklyn Museum, New York, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Brow_of_the_Hill.jpg",
  "refs": [
   "Luke 4:21-30"
  ],
  "days": [
   "Year C Epiphany 4thSunday"
  ],
  "essay": "https://thevcs.org/open-unexpected/brow-hill",
  "act": "https://act.library.vanderbilt.edu/artworks/55366",
  "licence": "Public domain",
  "attribution": "Tissot, James, 1836-1902. Brow of the Hill Near Nazareth, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 55391,
  "title": "White hen with chickens",
  "artist": "Hamilton, Anton Ignaz",
  "date": "18th century",
  "where": "Lazienki Palace, Warsaw, Poland",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/hen-with-chicks.jpg",
  "refs": [
   "Psalm 17:1-9",
   "Luke 13:31-35"
  ],
  "days": [
   "Year C Proper 27th Sunday",
   "Year C Lent 2nd Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/55391",
  "licence": "Public domain",
  "attribution": "Hamilton, Anton Ignaz. White hen with chickens, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 55392,
  "title": "Holy Face and Ten Names of God",
  "artist": "Dirc, van Delft, active 1365-1404",
  "date": "ca. 1400-1404",
  "where": "Walters Art Museum, Baltimore, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/delft-holy-face.jpg",
  "refs": [
   "Psalm 27",
   "Psalm 80:1-7, 17-19"
  ],
  "days": [
   "Year A Advent 4th Sunday",
   "Year C Lent 2nd Sunday",
   "Year A Holy Name of Jesus"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/55392",
  "licence": "Public domain",
  "attribution": "Dirc, van Delft, active 1365-1404. Holy Face and Ten Names of God, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 55397,
  "title": "Right hand",
  "artist": "Rodin, Auguste, 1840-1917",
  "date": null,
  "where": "Cantor Center for the Arts, Stanford, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Rodin_right_hand.jpg",
  "refs": [
   "Psalm 63:1-8"
  ],
  "days": [
   "Year C Lent 3rd Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/55397",
  "licence": "CC BY-SA 3.0",
  "attribution": "Rodin, Auguste, 1840-1917. Right hand, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 55398,
  "title": "Helping Hands",
  "artist": null,
  "date": "2000",
  "where": "Mandela Gardens, Millenium Square, Leeds, United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Helping_Hands_sculpture.jpg",
  "refs": [
   "Psalm 63:1-8",
   "Philippians 2:1-13",
   "Luke 16:1-13"
  ],
  "days": [
   "Year A Proper 21st Sunday",
   "Year C Proper 20th Sunday",
   "Year C Lent 3rd Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/55398",
  "licence": "CC BY-SA 3.0",
  "attribution": "Helping Hands, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 55402,
  "title": "God's Hand",
  "artist": "Milles, Carl, 1875-1955",
  "date": "1949-1953",
  "where": "Frank Murphy Hall, Detroit, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/770px-Guds_hand_2007.jpg",
  "refs": [
   "Psalm 63:1-8",
   "Isaiah 63:7-9",
   "Mark 2:23-3:6",
   "Corinthians II, 4:5-12"
  ],
  "days": [
   "Year B Proper 4th Sunday",
   "Year A New Year’s Day",
   "Year A Christmas 1st Sunday",
   "Year A Proper 9th Sunday",
   "Year A Holy Name of Jesus",
   "Year B Holy Name of Jesus",
   "Year C Holy Name of Jesus",
   "Year C Lent 3rd Sunday",
   "Year B Epiphany 9th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/55402",
  "licence": "CC BY-SA 3.0",
  "attribution": "Milles, Carl, 1875-1955. God's Hand, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 55404,
  "title": "La Mano Poderosa",
  "artist": "Anonymous",
  "date": null,
  "where": "Smithsonian American Art Museum, Washington, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/WLA_amart_La_Mano_Poderosa.jpg",
  "refs": [
   "Psalm 63:1-8",
   "Isaiah 63:7-9"
  ],
  "days": [
   "Year A Christmas 1st Sunday",
   "Year C Lent 3rd Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/55404",
  "licence": "CC BY-SA 2.5",
  "attribution": "Anonymous. La Mano Poderosa, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 55406,
  "title": "In the Orchard, or, Gardener near a Gnarled Apple Tree",
  "artist": "Gogh, Vincent van, 1853-1890",
  "date": "1883",
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Van_Gogh_Orchard.jpg",
  "refs": [
   "Luke 13:1-9"
  ],
  "days": [
   "Year C Lent 3rd Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/55406",
  "licence": "Public domain",
  "attribution": "Gogh, Vincent van, 1853-1890. In the Orchard, or, Gardener near a Gnarled Apple Tree, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 55408,
  "title": "As the Old Sing, the Young Pipe",
  "artist": "Jordaens, Jacob, 1593-1678",
  "date": "17th century",
  "where": "Private Collection, France",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Jordaens01.jpg",
  "refs": [
   "Psalm 98"
  ],
  "days": [
   "Year A Advent 3rd Sunday",
   "Year C Proper 27th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/55408",
  "licence": "Public domain",
  "attribution": "Jordaens, Jacob, 1593-1678. As the Old Sing, the Young Pipe, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 55409,
  "title": "Sing Forth the Honour of His Name",
  "artist": null,
  "date": null,
  "where": "Church of St. Brendan the Navigator, Bantry, County Cork, Ireland",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Bantry-window.jpg",
  "refs": [
   "Psalm 66:1-9"
  ],
  "days": [
   "Year C Advent 3rd Sunday",
   "Year C Proper 23rd Sunday",
   "Year C Proper 9th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/55409",
  "licence": "CC BY-SA 4.0",
  "attribution": "Sing Forth the Honour of His Name, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 55410,
  "title": "Dancing Lesson",
  "artist": "Eakins, Thomas",
  "date": "1878",
  "where": "Metropolitan Museum of Art, New York, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/dancing_lesson_thomas_eakins.jpg",
  "refs": [
   "Psalm 98",
   "Psalm 30",
   "Psalm 149"
  ],
  "days": [
   "Year C Easter 3rd Sunday",
   "Year B Nativity of the Lord Proper I",
   "Year A Proper 18th Sunday",
   "Year C Proper 9th Sunday",
   "Year C Proper 5th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/55410",
  "licence": "Public domain",
  "attribution": "Eakins, Thomas. Dancing Lesson, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 55411,
  "title": "Christ in Glory",
  "artist": "Bassano, Francesco, approximately 1470-approximately 1539",
  "date": "16th century",
  "where": "Capitoline Museum, Rome, Italy",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Christ_in_Glory.jpg",
  "refs": [
   "Mark 8:31-38"
  ],
  "days": [
   "Year B Lent 2nd Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/55411",
  "licence": "Public domain",
  "attribution": "Bassano, Francesco, approximately 1470-approximately 1539. Christ in Glory, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 55412,
  "title": "Small angel playing (detail from Madonna of Spedalingo)",
  "artist": "Fiorentino, Rosso, 1494-1540",
  "date": "1518",
  "where": "Uffizi Gallery, Florence, Italy",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Rosso_Fiorentino_Spedalingo.jpg",
  "refs": [
   "Psalm 98",
   "Psalm 92:1-4, 12-15",
   "Psalm 150"
  ],
  "days": [
   "Year B Nativity of the Lord Proper I",
   "Year C Easter 2nd Sunday",
   "Year C Epiphany 8th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/55412",
  "licence": "Public domain",
  "attribution": "Fiorentino, Rosso, 1494-1540. Small angel playing (detail from Madonna of Spedalingo), from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 55426,
  "title": "Laughter",
  "artist": "Boccioni, Umberto, 1882-1916",
  "date": "1911",
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Umberto_Boccioni_-_Laughter.jpg",
  "refs": [
   "Psalm 126"
  ],
  "days": [
   "Year C Lent 5th  Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/55426",
  "licence": "Public domain",
  "attribution": "Boccioni, Umberto, 1882-1916. Laughter, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 55432,
  "title": "Entry into Jerusalem",
  "artist": "Lorenzetti, Pietro, active 1320-1348",
  "date": "1320",
  "where": "Church of San Francesco, lower basilica, Assisi, Italy",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Assisi-entry.jpg",
  "refs": [
   "Luke 19:28-40",
   "Matthew 21:1-11",
   "Mark 11:1-11",
   "John 12:12-16",
   "Luke 13:31-35"
  ],
  "days": [
   "Year C Liturgy of Palms",
   "Year A Liturgy of Palms",
   "Year B Liturgy of Palms",
   "Year C Lent 2nd Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/55432",
  "licence": "Public domain",
  "attribution": "Lorenzetti, Pietro, active 1320-1348. Entry into Jerusalem, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 55466,
  "title": "Devil Causes the House of Job's Son to Fall Upon Job's Children",
  "artist": "Bartolo, di Fredi, 1330-1410",
  "date": "14th century",
  "where": "Collegiate Church, San Gimignano, Italy",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/house_of_Job_falls_on_his_children.jpg",
  "refs": [
   "Job 1:18-19"
  ],
  "days": [],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/55466",
  "licence": "Public domain",
  "attribution": "Bartolo, di Fredi, 1330-1410. Devil Causes the House of Job's Son to Fall Upon Job's Children, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 55469,
  "title": "Evolution -- Monument to the Drum",
  "artist": "Jimenez Rodriguez, Jesus D.",
  "date": "20th-21st centuries",
  "where": "Tobarra, Spain",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Tobarra-monumento-al-tambor-2.jpg",
  "refs": [
   "Psalm 92:1-4, 12-15"
  ],
  "days": [
   "Year B Proper 6th Sunday",
   "Year C Epiphany 8th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/55469",
  "licence": "Public domain",
  "attribution": "Jimenez Rodriguez, Jesus D.. Evolution -- Monument to the Drum, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 55471,
  "title": "Job",
  "artist": "Bonnat, Léon Joseph Florentin, 1833-1922",
  "date": "1880",
  "where": "Musee Bonnat, Bayonne, France",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Bonnat02.jpg",
  "refs": [
   "Job 14:1-14",
   "Job 19:23-27a"
  ],
  "days": [
   "Year A Holy Saturday",
   "Year B Holy Saturday",
   "Year C Holy Saturday",
   "Year C Proper 27th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/55471",
  "licence": "Public domain",
  "attribution": "Bonnat, Léon Joseph Florentin, 1833-1922. Job, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 55473,
  "title": "Vision of Cornelius the Centurion",
  "artist": "Eeckhout, Gerbrand van den, 1621-1674",
  "date": "1664",
  "where": "Walters Art Museum, Baltimore, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Vision_of_Cornelius_Walters_372492.jpg",
  "refs": [
   "Acts 10:1-8"
  ],
  "days": [],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/55473",
  "licence": "Public domain",
  "attribution": "Eeckhout, Gerbrand van den, 1621-1674. Vision of Cornelius the Centurion, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 55476,
  "title": "Ullswater, early morning",
  "artist": "Glover, John, 1767-1849",
  "date": "ca. 1824",
  "where": "Art Gallery of New South Wales, Sydney, Australia",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/John_Glover_-_Ullswater.jpg",
  "refs": [
   "Psalm 30",
   "Lamentations 3:1-9, 19-24"
  ],
  "days": [
   "Year C Holy Saturday",
   "Year C Easter 3rd Sunday",
   "Year B Proper 8th Sunday",
   "Year C Proper 9th Sunday",
   "Year B Epiphany 6th Sunday",
   "Year C Proper 5th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/55476",
  "licence": "Public domain",
  "attribution": "Glover, John, 1767-1849. Ullswater, early morning, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 55477,
  "title": "Moses the Abyssinian",
  "artist": null,
  "date": "11th-12th centuries",
  "where": "Deir Mar Musa al-Habashi, Syria",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Frescoes_Monastery_of_Saint_Moses.jpg",
  "refs": [
   "Romans 8:26-39"
  ],
  "days": [
   "",
   "Year A Proper 12th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/55477",
  "licence": "CC BY 2.0",
  "attribution": "Moses the Abyssinian, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 55479,
  "title": "Memorial to the Persecuted - Bearing a Heavy Weight Together",
  "artist": "Gáspár, Péter",
  "date": "1999",
  "where": "Komarno, Slovakia",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Komarom554.jpg",
  "refs": [
   "Zechariah 9:9-12",
   "Psalm 70",
   "Matthew 11:16-19, 25-30",
   "Psalm 145:8-14"
  ],
  "days": [
   "Year A Proper 9th Sunday",
   "Year C Holy Wednesday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/55479",
  "licence": "CC BY-SA 4.0",
  "attribution": "Gáspár, Péter. Memorial to the Persecuted - Bearing a Heavy Weight Together, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 55489,
  "title": "Children of the Sea",
  "artist": "Israëls, Jozef, 1824-1911",
  "date": "1872",
  "where": "Rijksmuseum Amsterdam, Amsterdam, Netherlands",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Jozef_Israels_children.jpg",
  "refs": [
   "Hosea 1:2-10"
  ],
  "days": [
   "Year C Proper 12th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/55489",
  "licence": "Public domain",
  "attribution": "Israëls, Jozef, 1824-1911. Children of the Sea, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 55490,
  "title": "Hosea and Gomer in an Embrace",
  "artist": null,
  "date": "1372",
  "where": "Den Haag, The Hague, Netherlands",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Hosea_and_Gomer-Haag.jpg",
  "refs": [
   "Hosea 1:2-10"
  ],
  "days": [
   "Year C Proper 12th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/55490",
  "licence": "Public domain",
  "attribution": "Hosea and Gomer in an Embrace, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 55491,
  "title": "Spring",
  "artist": "Millet, Jean François, 1814-1875",
  "date": "ca. 1868-1873",
  "where": "Musee D'Orsay, Paris, France",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Millet-Spring7.jpg",
  "refs": [
   "Psalm 85",
   "Isaiah 55:10-13",
   "Psalm 65"
  ],
  "days": [
   "Year A Easter Vigil",
   "Year C Proper 12th Sunday",
   "Year B Easter Vigil",
   "Year C Easter Vigil",
   "Year C Proper 10th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/55491",
  "licence": "Public domain",
  "attribution": "Millet, Jean François, 1814-1875. Spring, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 55492,
  "title": "Justice and Peace Kissing",
  "artist": null,
  "date": "ca. 1650",
  "where": "Schloss Friedenstein, Gotha, Germany",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Friedenskuss-Psalm-85v.jpg",
  "refs": [
   "Psalm 85"
  ],
  "days": [
   "Year C Proper 12th Sunday",
   "Year A Advent 2nd  Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/55492",
  "licence": "CC BY 2.0",
  "attribution": "Justice and Peace Kissing, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 55493,
  "title": "Kiss of Peace",
  "artist": "Cameron, Julia Margaret, 1815-1879",
  "date": "1869",
  "where": "Royal Photographic Society, Bath, United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Cameron_Kuss_des_Friedens_1869.jpg",
  "refs": [
   "Psalm 85"
  ],
  "days": [
   "Year C Proper 12th Sunday",
   "Year A Proper 25th Sunday",
   "Year A Advent 2nd  Sunday",
   "Year A Proper 14th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/55493",
  "licence": "Public domain",
  "attribution": "Cameron, Julia Margaret, 1815-1879. Kiss of Peace, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 55503,
  "title": "Francis of Assisi blessing the birds, detail",
  "artist": "Mileham, Harry, 1873-1957",
  "date": "1945",
  "where": "St. Mary's Church, Norfolk, United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Francis-with-birds.jpg",
  "refs": [
   "Hosea 11:1-11",
   "Psalm 84"
  ],
  "days": [
   "Year C Presentation of the Lord",
   "Year A Presentation of the Lord",
   "Year B Presentation of the Lord",
   "Year C Proper 13th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/55503",
  "licence": "CC BY-SA 2.0",
  "attribution": "Mileham, Harry, 1873-1957. Francis of Assisi blessing the birds, detail, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 55504,
  "title": "The Natchez",
  "artist": "Delacroix, Eugène, 1798-1863",
  "date": "1835",
  "where": "Metropolitan Museum of Art, New York, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Delacroix_Natchez.jpg",
  "refs": [
   "Hosea 11:1-11",
   "Psalm 139:1-6, 13-18"
  ],
  "days": [
   "Year C Proper 18th Sunday",
   "Year C Proper 13th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/55504",
  "licence": "Public domain",
  "attribution": "Delacroix, Eugène, 1798-1863. The Natchez, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 55506,
  "title": "Steps",
  "artist": "Fluegel, Robert J.",
  "date": "2010",
  "where": "Cap Haitien, Haiti",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/crutches-Haiti.jpg",
  "refs": [
   "Hosea 11:1-11"
  ],
  "days": [
   "Year C Proper 13th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/55506",
  "licence": "Public domain",
  "attribution": "Fluegel, Robert J.. Steps, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 55508,
  "title": "Sunday Morning",
  "artist": "Wood, Thomas Waterman, 1823-1903",
  "date": "ca. 1877",
  "where": "Smithsonian American Art Museum, Washington, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Wood-Sunday-morning.jpg",
  "refs": [
   "Hosea 11:1-11",
   "Psalm 116:1-2, 12-19"
  ],
  "days": [
   "Year A Easter 3rd Sunday",
   "Year A Easter 6th Sunday",
   "",
   "Year C Proper 13th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/55508",
  "licence": "Public domain",
  "attribution": "Wood, Thomas Waterman, 1823-1903. Sunday Morning, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 55512,
  "title": "St. Lawrence Distributing the Riches of the Church",
  "artist": "Strozzi, Bernardo, 1581-1644",
  "date": "ca. 1625",
  "where": "St. Louis Art Museum, St. Louis, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/strozzi-lawrence-riches.jpg",
  "refs": [
   "Luke 12:13-21",
   "Psalm 146:5-10"
  ],
  "days": [
   "Year A Advent 3rd Sunday",
   "Year C Proper 13th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/55512",
  "licence": "Public domain",
  "attribution": "Strozzi, Bernardo, 1581-1644. St. Lawrence Distributing the Riches of the Church, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 55525,
  "title": "Widow Costard's cow and goods, distrained for taxes, are redeemed by the generosity of Johnny Pearmain",
  "artist": "Penny, Edward, 1714-1791",
  "date": "1782",
  "where": "Yale Center for British Art, New Haven, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/widow-goods-redeemed.jpg",
  "refs": [
   "Matthew 18:21-35",
   "Isaiah 1:1, 10-20",
   "Psalm 146:5-10"
  ],
  "days": [
   "Year A Advent 3rd Sunday",
   "Year A Proper 19th Sunday",
   "Year A Thanksgiving Day",
   "Year C Proper 20th Sunday",
   "Year C Proper 14th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/55525",
  "licence": "Public domain",
  "attribution": "Penny, Edward, 1714-1791. Widow Costard's cow and goods, distrained for taxes, are redeemed by the generosity of Johnny Pearmain, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 55529,
  "title": "Beacon, off Mount Desert Island",
  "artist": "Church, Frederic Edwin, 1826-1900",
  "date": "1851",
  "where": "Private Collection",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Beacon_Frederic_Edwin_Church.jpg",
  "refs": [
   "Psalm 50:1-8, 22-23"
  ],
  "days": [
   "Year C Proper 14th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/55529",
  "licence": "Public domain",
  "attribution": "Church, Frederic Edwin, 1826-1900. Beacon, off Mount Desert Island, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 55530,
  "title": "Sunrise",
  "artist": "Hofheinz-Döring, Margret, 1910-",
  "date": "1991",
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Sonnenaufgang-heinz-doring.jpg",
  "refs": [
   "Psalm 50:1-8, 22-23"
  ],
  "days": [
   "Year C Proper 14th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/55530",
  "licence": "CC BY-SA 3.0",
  "attribution": "Hofheinz-Döring, Margret, 1910-. Sunrise, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 55531,
  "title": "Sacrifice of the Old Covenant",
  "artist": "Rubens, Peter Paul, 1577-1640",
  "date": "1626",
  "where": "Museum of Fine Arts, Boston, Boston, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Sacrifice_of_the_Old_Covenant_Rubens.jpg",
  "refs": [
   "Psalm 50:1-8, 22-23"
  ],
  "days": [
   "Year C Proper 14th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/55531",
  "licence": "Public domain",
  "attribution": "Rubens, Peter Paul, 1577-1640. Sacrifice of the Old Covenant, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 55536,
  "title": "Eye of Providence",
  "artist": null,
  "date": "19th century",
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Eye_of_Providence_(icon).jpg",
  "refs": [
   "Psalm 33:12-22"
  ],
  "days": [
   "Year C Proper 14th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/55536",
  "licence": "Public domain",
  "attribution": "Eye of Providence, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 55537,
  "title": "Eye of Providence",
  "artist": null,
  "date": null,
  "where": "Church of St. Anthony of Padua, Bento Goncalves, Brazil",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/1280px-Saint_Anthony_Brazil.jpg",
  "refs": [
   "Psalm 33:12-22"
  ],
  "days": [
   "Year C Proper 14th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/55537",
  "licence": "CC BY-SA 3.0",
  "attribution": "Eye of Providence, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 55546,
  "title": "Saint Anthony Convent, Canindé, Ceará, Brazil (Franciscans) - Eucharistic Chapel",
  "artist": null,
  "date": "20th century",
  "where": "Saint Anthony Convent, Caninde, Ceara, Brazil",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Saint_Anthony_Convent3.jpg",
  "refs": [
   "Luke 12:32-40",
   "Psalm 119:105-112"
  ],
  "days": [
   "Year C Proper 14th Sunday",
   "Year A Proper 10th Sunday",
   "Year A Epiphany 5th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/55546",
  "licence": "CC BY-SA 3.0",
  "attribution": "Saint Anthony Convent, Canindé, Ceará, Brazil (Franciscans) - Eucharistic Chapel, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 55553,
  "title": "Eastern Orthodox icon of Jesus Christ as the True Vine",
  "artist": null,
  "date": "16th century",
  "where": "Byzantine and Christian Museum, Athens, Greece",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Christ_the_True_Vin-icon.jpg",
  "refs": [
   "John 15:1-8",
   "Psalm 80:1-2, 8-19"
  ],
  "days": [
   "Year C Proper 15th Sunday",
   "Year B Easter 5th Sunday"
  ],
  "essay": "https://thevcs.org/subversive-horticulture/cultivation",
  "act": "https://act.library.vanderbilt.edu/artworks/55553",
  "licence": "Public domain",
  "attribution": "Eastern Orthodox icon of Jesus Christ as the True Vine, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 55562,
  "title": "Great Depression: unemployed, destitute man leaning against vacant store",
  "artist": "Lange, Dorothea",
  "date": "1935",
  "where": "Franklin D. Roosevelt Presidential Library and Museum, Hyde Park, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Destitute_man_vacant_store.jpg",
  "refs": [
   "Psalm 82",
   "Isaiah 60:1-6"
  ],
  "days": [
   "Year B Epiphany of the Lord",
   "Year C Proper 15th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/55562",
  "licence": "Public domain",
  "attribution": "Lange, Dorothea. Great Depression: unemployed, destitute man leaning against vacant store, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 55563,
  "title": "\"I Don't Give to Idlers!\"",
  "artist": "Pigal, Edmé Jean, 1798-1872",
  "date": null,
  "where": "National Institutes of Health, Bethesda, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Refusing_a_beggar_with_one_leg_and_a_crutch.jpg",
  "refs": [
   "Psalm 82",
   "Isaiah 60:1-6"
  ],
  "days": [
   "Year B Epiphany of the Lord",
   "Year C Proper 15th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/55563",
  "licence": "Public domain",
  "attribution": "Pigal, Edmé Jean, 1798-1872. \"I Don't Give to Idlers!\", from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 55568,
  "title": "Church of All Nations - original floor mosaics and current floor",
  "artist": "Barluzzi, Antonio",
  "date": "1919-1924",
  "where": "Jerusalem, Israel",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Church_of_All_Nations_20091021_mosaic.jpg",
  "refs": [
   "Psalm 82"
  ],
  "days": [
   "Year C Proper 15th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/55568",
  "licence": "CC BY-SA 3.0",
  "attribution": "Barluzzi, Antonio. Church of All Nations - original floor mosaics and current floor, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 55570,
  "title": "Church of All Nations - tympanum showing Christ as intercessor/conduit",
  "artist": "Barluzzi, Antonio",
  "date": "1919-1924",
  "where": "Jerusalem, Israel",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Church_of_all_nations.jpg",
  "refs": [
   "Psalm 82"
  ],
  "days": [
   "Year C Proper 15th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/55570",
  "licence": "CC BY-SA 3.0",
  "attribution": "Barluzzi, Antonio. Church of All Nations - tympanum showing Christ as intercessor/conduit, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 55597,
  "title": "Childbirth",
  "artist": null,
  "date": "ca. 2000",
  "where": "Gdansk, Poland",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Gdańsk_aleja_Hallera_17_(detal).jpg",
  "refs": [
   "Psalm 71:1-14"
  ],
  "days": [
   "Year B Holy Tuesday",
   "Year A Holy Tuesday",
   "Year C Holy Tuesday",
   "Year A Proper 22nd Sunday",
   "Year C Proper 16th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/55597",
  "licence": "CC0",
  "attribution": "Childbirth, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 55599,
  "title": "Peace Secure - Safe and Protected",
  "artist": "Nast, Thomas, 1840-1902",
  "date": "1875",
  "where": "Library of Congress, Washington, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Peace_Secure-Safe_and_Protected.jpg",
  "refs": [
   "Psalm 71:1-14"
  ],
  "days": [
   "Year C Proper 16th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/55599",
  "licence": "Public domain",
  "attribution": "Nast, Thomas, 1840-1902. Peace Secure - Safe and Protected, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 55613,
  "title": "Mount Horeb, Sinai",
  "artist": "Frith, Francis",
  "date": "1858",
  "where": "J. Paul Getty Museum, Los Angeles, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/frith-horeb.jpg",
  "refs": [
   "Kings I, 19:1-18",
   "Exodus 19:2-8a"
  ],
  "days": [
   "Year C Proper 7th Sunday",
   "Year A Proper 6th Sunday"
  ],
  "essay": "https://thevcs.org/sinai-calling/sinai-still",
  "act": "https://act.library.vanderbilt.edu/artworks/55613",
  "licence": "Public domain",
  "attribution": "Frith, Francis. Mount Horeb, Sinai, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 55623,
  "title": "Christ Teaches Humility",
  "artist": "Lauder, Robert Scott, 1803-1869",
  "date": null,
  "where": "Scottish National Gallery, Edinburgh, United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Christ_Teacheth_Humility.jpg",
  "refs": [
   "Matthew 23:1-12",
   "Luke 14:1, 7-14",
   "Micah 6:1-8"
  ],
  "days": [
   "Year C Proper 17th Sunday",
   "Year A Proper 26th Sunday",
   "Year A Epiphany 4thSunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/55623",
  "licence": "Public domain",
  "attribution": "Lauder, Robert Scott, 1803-1869. Christ Teaches Humility, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 55624,
  "title": "The Beggars",
  "artist": "Bruegel, Pieter, approximately 1525-1569",
  "date": "1568",
  "where": "Louvre, Paris, France",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Pieter_Bruegel_the_Elder_-_The_Cripples.jpg",
  "refs": [
   "Luke 14:1, 7-14"
  ],
  "days": [
   "Year C Proper 17th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/55624",
  "licence": "Public domain",
  "attribution": "Bruegel, Pieter, approximately 1525-1569. The Beggars, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 55626,
  "title": "Blind Beggar",
  "artist": "Bastien-Lepage, Jules, 1848-1884",
  "date": null,
  "where": "Musée des Beaux-Arts de Tournai, Tournai, France",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Jules_Bastien-Lepage_The_Blind_Beggar.jpg",
  "refs": [
   "Luke 14:1, 7-14",
   "Leviticus 19:1-2, 9-18"
  ],
  "days": [
   "Year C Proper 17th Sunday",
   "Year A Lent 4th Sunday",
   "Year A Epiphany 7th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/55626",
  "licence": "Public domain",
  "attribution": "Bastien-Lepage, Jules, 1848-1884. Blind Beggar, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 55627,
  "title": "Blind Men",
  "artist": "Ivanov, Sergey, 1864-1910",
  "date": "1883",
  "where": "Yekaterinburg Museum of Fine Arts, Yekaterinburg, Russia",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/1883_Ivanov_Blinde_anagoria.jpg",
  "refs": [
   "Luke 14:1, 7-14",
   "Matthew 15:(10-20), 21-28"
  ],
  "days": [
   "Year C Proper 17th Sunday",
   "Year A Proper 15th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/55627",
  "licence": "Public domain",
  "attribution": "Ivanov, Sergey, 1864-1910. Blind Men, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 55630,
  "title": "Francis of Assisi",
  "artist": null,
  "date": null,
  "where": "Sacro Monte di Orta, Orta San Giulio, Italy",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Sacro_Monte_di_Orta_014.jpg",
  "refs": [
   "Sirach 10:12-18",
   "Matthew 23:1-12",
   "Micah 6:1-8"
  ],
  "days": [
   "Year C Proper 17th Sunday",
   "Year A Proper 26th Sunday",
   "Year A Epiphany 4thSunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/55630",
  "licence": "Public domain",
  "attribution": "Francis of Assisi, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 55639,
  "title": "Water-Lily Pond and Weeping Willow",
  "artist": "Monet, Claude, 1840-1926",
  "date": "1916-1919",
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Claude_Monet-willow.jpg",
  "refs": [
   "Psalm 1"
  ],
  "days": [
   "Year C Proper 18th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/55639",
  "licence": "Public domain",
  "attribution": "Monet, Claude, 1840-1926. Water-Lily Pond and Weeping Willow, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 55642,
  "title": "Philemon and Apphia",
  "artist": null,
  "date": "early 21st century?",
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Philemon_and_Apphia.jpg",
  "refs": [
   "Philemon 1:1-21"
  ],
  "days": [
   "Year C Proper 18th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/55642",
  "licence": "Public domain",
  "attribution": "Philemon and Apphia, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 55645,
  "title": "The Windstorm",
  "artist": "Parreiras, Antônio, 1860-1937",
  "date": "1888",
  "where": "Pinacoteca do Estado de São Paulo, Sao Paolo, Brazil",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Parreiras-ventania-pinac.jpg",
  "refs": [
   "Mark 13:24-37",
   "Jeremiah 4:11-12, 22-28"
  ],
  "days": [
   "Year B Advent 1st Sunday",
   "Year C Proper 19th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/55645",
  "licence": "Public domain",
  "attribution": "Parreiras, Antônio, 1860-1937. The Windstorm, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 55647,
  "title": "The Course of Empire. Desolation",
  "artist": "Cole, Thomas, 1801-1848",
  "date": "1836",
  "where": "New York Historical Society, New York, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Desolation_Thomas_Cole_1836.jpg",
  "refs": [
   "Jeremiah 4:11-12, 22-28",
   "Daniel 7:1-3, 15-18"
  ],
  "days": [
   "Year B All Saints Day",
   "Year C Proper 19th Sunday"
  ],
  "essay": "https://thevcs.org/daniels-four-beasts/collapse?first=6471",
  "act": "https://act.library.vanderbilt.edu/artworks/55647",
  "licence": "Public domain",
  "attribution": "Cole, Thomas, 1801-1848. The Course of Empire. Desolation, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 55657,
  "title": "Peter Williams (1750-1823)",
  "artist": "Anonymous",
  "date": "ca. 1810-1815",
  "where": "New York Historical Society, New York, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/WLA_nyhistorical_Unidentified.jpg",
  "refs": [
   "Philemon 1:1-21",
   "Isaiah 61:1-4, 8-11"
  ],
  "days": [
   "Year B Advent 3rd Sunday",
   "",
   "Year C Proper 18th Sunday",
   "Year A Holy Name of Jesus",
   "Year B Holy Name of Jesus",
   "Year C Holy Name of Jesus"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/55657",
  "licence": "CC BY 2.5",
  "attribution": "Anonymous. Peter Williams (1750-1823), from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 55668,
  "title": "Young Boy Singing",
  "artist": "Candlelight Master",
  "date": "1650",
  "where": "Fine Arts Museums of San Francisco, San Francisco, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Candlelight_Master_Young_Boy_Singing.jpg",
  "refs": [
   "Psalm 98"
  ],
  "days": [
   "Year A Advent 3rd Sunday",
   "Year C Holy Cross"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/55668",
  "licence": "Public domain",
  "attribution": "Candlelight Master. Young Boy Singing, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 55670,
  "title": "Village Choir",
  "artist": "Webster, Thomas George, 1800-1886",
  "date": "1847",
  "where": "Victoria and Albert Museum, London, United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Thomas_Webster_-_A_Village_Choir.jpg",
  "refs": [
   "Psalm 98",
   "Psalm 100",
   "Ephesians 5:15-20"
  ],
  "days": [
   "Year B Proper 15th Sunday",
   "Year B Easter 4th Sunday",
   "Year A Ash Wednesday",
   "Year A Reign of Christ",
   "Year C Holy Cross"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/55670",
  "licence": "Public domain",
  "attribution": "Webster, Thomas George, 1800-1886. Village Choir, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 55672,
  "title": "St. Roch and the Redeemer",
  "artist": "Mezzastris, Pierantonio, approximately 1430-1506",
  "date": "ca. 1480",
  "where": "Church of San Giacomo, Foligno, Italy",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Foligno107.jpg",
  "refs": [
   "Psalm 78:1-2, 34-38"
  ],
  "days": [
   "Year C Holy Cross"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/55672",
  "licence": "CC BY-SA 3.0",
  "attribution": "Mezzastris, Pierantonio, approximately 1430-1506. St. Roch and the Redeemer, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 55676,
  "title": "For God so Loved the World...",
  "artist": null,
  "date": "2000",
  "where": "Rampton Parish Church, Rampton, United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/milen-banner.jpg",
  "refs": [
   "John 3:1-17",
   "John 3:14-21"
  ],
  "days": [
   "Year A Lent 2nd Sunday",
   "Year B Lent 4th Sunday",
   "Year A Holy Cross",
   "Year C Holy Cross"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/55676",
  "licence": "CC BY-SA 2.0",
  "attribution": "For God so Loved the World..., from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 55677,
  "title": "Fountain of Eternal Life",
  "artist": "Fredericks, Marshall M., 1908-1998",
  "date": "1964",
  "where": "Memorial Plaza, Cleveland, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Fountain_of_Eternal_Life.jpg",
  "refs": [
   "John 3:1-17",
   "John I, 5:9-13",
   "John 3:14-21"
  ],
  "days": [
   "Year A Lent 2nd Sunday",
   "Year B Easter 7th Sunday",
   "Year B Lent 4th Sunday",
   "Year A Holy Cross"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/55677",
  "licence": "Public domain",
  "attribution": "Fredericks, Marshall M., 1908-1998. Fountain of Eternal Life, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 55678,
  "title": "Savior of the World",
  "artist": "Vrelant, Guillaume, -1481",
  "date": "ca. 1460-1469",
  "where": "J. Paul Getty Museum, Los Angeles, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Willem_Vrelan.jpg",
  "refs": [
   "John 3:1-17",
   "John 3:14-21"
  ],
  "days": [
   "Year A Lent 2nd Sunday",
   "Year B Lent 4th Sunday",
   "Year A Holy Cross",
   "Year C Holy Cross"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/55678",
  "licence": "Public domain",
  "attribution": "Vrelant, Guillaume, -1481. Savior of the World, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 55681,
  "title": "El Salvador killed more than 75,000",
  "artist": null,
  "date": null,
  "where": "San Salvador, El Salvador",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/El_Salvador_killed_more_than_75.000.jpg",
  "refs": [
   "Psalm 14"
  ],
  "days": [],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/55681",
  "licence": "CC BY 2.0",
  "attribution": "El Salvador killed more than 75,000, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 55687,
  "title": "For I know my iniquity, and my sin is always before me.",
  "artist": "Anonymous",
  "date": "1794",
  "where": "Bibliothèque nationale de France, Paris, France",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Deputé_à_la_Convention_nationale.jpg",
  "refs": [
   "Psalm 51"
  ],
  "days": [
   "Year C Proper 19th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/55687",
  "licence": "Public domain",
  "attribution": "Anonymous. For I know my iniquity, and my sin is always before me., from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 55694,
  "title": "Wasted Gallantry",
  "artist": "Hope, James, 1819-1892",
  "date": "ca. 1862",
  "where": "National Park Service, Antietam, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Wasted_Gallantry_by_Captain_James_Hope.jpg",
  "refs": [
   "Psalm 79:1-9"
  ],
  "days": [
   "Year C Proper 20th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/55694",
  "licence": "Public domain",
  "attribution": "Hope, James, 1819-1892. Wasted Gallantry, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 55695,
  "title": "Jeremiah lamenting the destruction of Jerusalem",
  "artist": "Rembrandt Harmenszoon van Rijn, 1606-1669",
  "date": "1630",
  "where": "Rijksmuseum Amsterdam, Amsterdam, Netherlands",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Jeremiah-destruction-Jerusalem.jpg",
  "refs": [
   "Jeremiah 8:18-9:1",
   "Jeremiah 4:11-12, 22-28"
  ],
  "days": [
   "Year A Proper 17th Sunday",
   "Year C Proper 20th Sunday",
   "Year C Proper 19th Sunday"
  ],
  "essay": "https://thevcs.org/raising-standards/my-anguish-my-anguish?first=4261",
  "act": "https://act.library.vanderbilt.edu/artworks/55695",
  "licence": "Public domain",
  "attribution": "Rembrandt Harmenszoon van Rijn, 1606-1669. Jeremiah lamenting the destruction of Jerusalem, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 55696,
  "title": "Mill Children in Macon",
  "artist": "Hine, Lewis Wickes, 1874-1940",
  "date": "1909",
  "where": "Library of Congress, Washington, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Mill_Children_in_Macon.jpg",
  "refs": [
   "Amos 8:4-7"
  ],
  "days": [
   "Year B Proper 18th Sunday",
   "Year C Proper 20th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/55696",
  "licence": "Public domain",
  "attribution": "Hine, Lewis Wickes, 1874-1940. Mill Children in Macon, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 55697,
  "title": "Sculpture at the Bonegilla Migrant Camp",
  "artist": null,
  "date": "ca. 2000",
  "where": "Bonegilla, Australia",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/BonegillaMigrantCampSculpture.jpg",
  "refs": [
   "Amos 8:4-7"
  ],
  "days": [
   "Year C Proper 20th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/55697",
  "licence": "CC BY-SA 3.0",
  "attribution": "Sculpture at the Bonegilla Migrant Camp, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 55698,
  "title": "Dust Bowl Oklahoma",
  "artist": null,
  "date": "1936",
  "where": "Library of Congress, Washington, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Dust_Bowl_Oklahoma.jpg",
  "refs": [
   "Psalm 113"
  ],
  "days": [
   "Year C Proper 20th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/55698",
  "licence": "Public domain",
  "attribution": "Dust Bowl Oklahoma, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 55699,
  "title": "Motherhood",
  "artist": "Alves, Nelly Romeo",
  "date": null,
  "where": "Catacumba Park, Rio de Janeiro, Brazil",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Motherhood-scul.jpg",
  "refs": [
   "Hosea 11:1-11",
   "Psalm 113"
  ],
  "days": [
   "Year C Proper 20th Sunday",
   "Year C Proper 13th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/55699",
  "licence": "CC BY-SA 2.5",
  "attribution": "Alves, Nelly Romeo. Motherhood, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 55709,
  "title": "Right Hand of God Protecting the Faithful against the Demons",
  "artist": "Fouquet, Jean, approximately 1420-approximately 1480",
  "date": "1460",
  "where": "Metropolitan Museum of Art, New York, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/La_Descente_du_Saint-Esprit.jpg",
  "refs": [
   "Psalm 91:1-6, 14-16"
  ],
  "days": [
   "Year A Easter 7th Sunday",
   "Year C Proper 20th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/55709",
  "licence": "Public domain",
  "attribution": "Fouquet, Jean, approximately 1420-approximately 1480. Right Hand of God Protecting the Faithful against the Demons, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 55710,
  "title": "Beware of Luxury",
  "artist": "Steen, Jan, 1626-1679",
  "date": "1663",
  "where": "Kunsthistorisches Museum Wien, Vienna, Austria",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Jan_Steen_-_Beware_of_Luxury.jpg",
  "refs": [
   "Amos 6:1a, 4-7"
  ],
  "days": [
   "Year C Proper 21st Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/55710",
  "licence": "Public domain",
  "attribution": "Steen, Jan, 1626-1679. Beware of Luxury, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 55719,
  "title": "Tom Paine's nightly pest",
  "artist": "Gillray, James, 1756-1815",
  "date": "1792",
  "where": "Library of Congress, Washington, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Tom_Paines_nightly_pest.jpg",
  "refs": [
   "Psalm 37:1-9"
  ],
  "days": [
   "Year C Proper 22nd Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/55719",
  "licence": "Public domain",
  "attribution": "Gillray, James, 1756-1815. Tom Paine's nightly pest, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 55720,
  "title": "Rich Man and the Poor Lazarus",
  "artist": "Terbrugghen, Hendrik, 1588?-1629",
  "date": "1625",
  "where": "Centraal Museum, Utrecht, Netherlands",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Hendrick_ter_Brugghen-rich-laz.jpg",
  "refs": [
   "Luke 16:19-31"
  ],
  "days": [
   "Year C Proper 21st Sunday"
  ],
  "essay": "https://thevcs.org/reversal-fortunes/textured-story",
  "act": "https://act.library.vanderbilt.edu/artworks/55720",
  "licence": "Public domain",
  "attribution": "Terbrugghen, Hendrik, 1588?-1629. Rich Man and the Poor Lazarus, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 55729,
  "title": "Jesus Heals the Ten Lepers",
  "artist": "Anonymous",
  "date": "17th century",
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Jesus_sanat_decem.jpg",
  "refs": [
   "Luke 17:11-19"
  ],
  "days": [
   "Year A Thanksgiving Day",
   "Year C Proper 23rd Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/55729",
  "licence": "Public domain",
  "attribution": "Anonymous. Jesus Heals the Ten Lepers, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 55736,
  "title": "Prayer and Praise",
  "artist": "Cameron, Julia Margaret, 1815-1879",
  "date": "1865",
  "where": "J. Paul Getty Museum, Los Angeles, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Julia_Margaret-praise.jpg",
  "refs": [
   "Psalm 100"
  ],
  "days": [
   "Year C Thanksgiving Day"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/55736",
  "licence": "Public domain",
  "attribution": "Cameron, Julia Margaret, 1815-1879. Prayer and Praise, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 55737,
  "title": "Rainbow in the Berkshire Hills",
  "artist": "Inness, George, 1825-1894",
  "date": "1869",
  "where": "White House Administrative Office (U.S.), Washington, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/The_Rainbow_inness.jpg",
  "refs": [
   "Corinthians I, 3:1-9",
   "Isaiah 55:10-13",
   "Psalm 65",
   "Psalm 100"
  ],
  "days": [
   "Year A Nativity of the Lord Proper I",
   "Year A Epiphany 6th Sunday",
   "Year C Thanksgiving Day",
   "Year A Proper 10th Sunday",
   "Year C Epiphany 8th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/55737",
  "licence": "Public domain",
  "attribution": "Inness, George, 1825-1894. Rainbow in the Berkshire Hills, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 55739,
  "title": "Thanksgiving in camp (of General Louis Blenker) during the US Civil War on Thursday November 28th 1861",
  "artist": "Waud, Alfred R. (Alfred Rudolph), 1828-1891",
  "date": "1861",
  "where": "Library of Congress, Washington, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Thanksgiving_1861_croped.jpg",
  "refs": [
   "Psalm 100"
  ],
  "days": [
   "Year C Thanksgiving Day"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/55739",
  "licence": "Public domain",
  "attribution": "Waud, Alfred R. (Alfred Rudolph), 1828-1891. Thanksgiving in camp (of General Louis Blenker) during the US Civil War on Thursday November 28th 1861, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 55747,
  "title": "Plaque with the prophet Joel",
  "artist": "Anonymous",
  "date": "7th century",
  "where": "Louvre, Paris, France",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Anonymous_Plaque_Joel_Louvre_AC864.jpg",
  "refs": [
   "Joel 2:23-32"
  ],
  "days": [
   "Year C Proper 25th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/55747",
  "licence": "CC BY 2.5",
  "attribution": "Anonymous. Plaque with the prophet Joel, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 55748,
  "title": "River Landscape",
  "artist": "Bruegel, Jan, 1568-1625",
  "date": "1607",
  "where": "National Gallery of Art (U.S.), Washington, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Jan_Brueghel_the_Elder_River_Landscape.jpg",
  "refs": [
   "Psalm 65"
  ],
  "days": [
   "Year A Christmas 2nd Sunday",
   "Year C Proper 25th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/55748",
  "licence": "Public domain",
  "attribution": "Bruegel, Jan, 1568-1625. River Landscape, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 55749,
  "title": "Harvesters",
  "artist": "Bruegel, Pieter, approximately 1525-1569",
  "date": "1565",
  "where": "Metropolitan Museum of Art, New York, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Pieter_Bruegel_harv.jpg",
  "refs": [
   "Psalm 72",
   "Psalm 65"
  ],
  "days": [
   "Year A Advent 2nd  Sunday",
   "Year C Proper 25th Sunday",
   "Year B Proper 6th Sunday",
   "Year A Proper 10th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/55749",
  "licence": "Public domain",
  "attribution": "Bruegel, Pieter, approximately 1525-1569. Harvesters, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 55754,
  "title": "Swallow's Nest",
  "artist": null,
  "date": "1883",
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Die_Gartenlaube_(1883).jpg",
  "refs": [
   "Psalm 84"
  ],
  "days": [
   "Year B Proper 16th Sunday",
   "Year C Proper 25th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/55754",
  "licence": "Public domain",
  "attribution": "Swallow's Nest, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 55755,
  "title": "Blue Swallow",
  "artist": "Sharpe, Richard Bowdler, 1847-1909",
  "date": "1894",
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Blue_Swallow_-_Hirundo_atrocaerulea.jpg",
  "refs": [
   "Psalm 84"
  ],
  "days": [
   "Year C Proper 25th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/55755",
  "licence": "Public domain",
  "attribution": "Sharpe, Richard Bowdler, 1847-1909. Blue Swallow, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 55760,
  "title": "Yerres, the Effect of Rain",
  "artist": "Caillebotte, Gustave, 1848-1894",
  "date": "1875",
  "where": "Indiana University Art Museum, Bloomington, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/G_Caillebotte_-_LYerres_pluie.jpg",
  "refs": [
   "Psalm 84",
   "Psalm 65",
   "Jeremiah 14:7-10, 19-22"
  ],
  "days": [
   "Year C Proper 25th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/55760",
  "licence": "CC BY-SA 3.0",
  "attribution": "Caillebotte, Gustave, 1848-1894. Yerres, the Effect of Rain, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 55764,
  "title": "Pharisee and the Publican",
  "artist": "Millais, John Everett, 1829-1896",
  "date": null,
  "where": "Tate Britain, London, United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/MillaisThe_Pharisee.jpg",
  "refs": [
   "Luke 18:9-14"
  ],
  "days": [
   "Year A Proper 26th Sunday",
   "Year C Proper 25th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/55764",
  "licence": "Public domain",
  "attribution": "Millais, John Everett, 1829-1896. Pharisee and the Publican, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 55771,
  "title": "Angel musicians",
  "artist": "Macheln, Georg Anton",
  "date": "17th century",
  "where": "Church of St. Magnus, Bad Schussenried, Germany",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Bad_Schussenried_Kloster.jpg",
  "refs": [
   "Psalm 149"
  ],
  "days": [
   "Year C All Saints Day"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/55771",
  "licence": "Public domain",
  "attribution": "Macheln, Georg Anton. Angel musicians, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 55772,
  "title": "Karlskirche Fresco",
  "artist": "Rottmayr, Johann Michael, 1654-1730",
  "date": "17th-18th centuries",
  "where": "St. Karl Borromäus, Vienna, Austria",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Karlskirche_Frescos_-_Glaube_4.jpg",
  "refs": [
   "Psalm 149"
  ],
  "days": [
   "Year C All Saints Day"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/55772",
  "licence": "CC BY-SA 3.0",
  "attribution": "Rottmayr, Johann Michael, 1654-1730. Karlskirche Fresco, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 55786,
  "title": "Jane Addams",
  "artist": "Brush, George de Forest, 1855-1941",
  "date": "1906",
  "where": "Smithsonian American Art Museum, Washington, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Jane_Addams,_1906.jpg",
  "refs": [
   "Micah 6:1-8",
   "Amos 5:18-24",
   "Isaiah 1:1, 10-20",
   "Isaiah 61:1-4, 8-11"
  ],
  "days": [
   "Year A Proper 17th Sunday",
   "Year A Proper 26th Sunday",
   "Year C Proper 26th Sunday",
   "Year B Advent 3rd Sunday",
   "Year A Proper 27th Sunday",
   "Year A Holy Monday",
   "Year A Ash Wednesday",
   "Year A Epiphany 4thSunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/55786",
  "licence": "CC BY 2.0",
  "attribution": "Brush, George de Forest, 1855-1941. Jane Addams, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 55792,
  "title": "Silver Chalice from the Byzantine period",
  "artist": null,
  "date": null,
  "where": "Walters Art Museum, Baltimore, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Byzantine_-_ChaliceS.jpg",
  "refs": [
   "Haggai 1:15b-2:9"
  ],
  "days": [
   "Year C Proper 27th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/55792",
  "licence": "Public domain",
  "attribution": "Silver Chalice from the Byzantine period, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 55795,
  "title": "Jesus Christ, the light of the world",
  "artist": null,
  "date": "2010",
  "where": "Aulendorf, Germany",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Aulendorf_-_Blumenteppich_zu_Fronleichnam.jpg",
  "refs": [
   "John 9:1-41",
   "Matthew 5:13-20",
   "John 8:12"
  ],
  "days": [
   "Year A Lent 4th Sunday",
   "Year A Epiphany 5th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/55795",
  "licence": "CC BY-SA 3.0",
  "attribution": "Jesus Christ, the light of the world, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 55797,
  "title": "Saying Grace",
  "artist": "Bega, Cornelis Pietersz., approximately 1631-1664",
  "date": "1663",
  "where": "Rijksmuseum Amsterdam, Amsterdam, Netherlands",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/BegaPrayer.jpg",
  "refs": [
   "Romans 8:26-39",
   "Philippians 4:4-9",
   "Acts 2:42-47"
  ],
  "days": [
   "Year A Epiphany 2nd Sunday",
   "Year B Advent 3rd Sunday",
   "Year B Lent 3rd Sunday",
   "Year C Thanksgiving Day",
   "Year A Ash Wednesday",
   "Year A Easter 4th Sunday",
   "Year A Proper 12th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/55797",
  "licence": "Public domain",
  "attribution": "Bega, Cornelis Pietersz., approximately 1631-1664. Saying Grace, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 55807,
  "title": "Hannah presenting her son Samuel to the priest Eli",
  "artist": "Eeckhout, Gerbrand van den, 1621-1674",
  "date": "ca. 1665",
  "where": "Louvre, Paris, France",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/samuel-eli-eeckhout.jpg",
  "refs": [
   "Samuel I, 1:4-20"
  ],
  "days": [
   "Year B Proper 28th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/55807",
  "licence": "Public domain",
  "attribution": "Eeckhout, Gerbrand van den, 1621-1674. Hannah presenting her son Samuel to the priest Eli, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 55848,
  "title": "Interior of the Church of the Light",
  "artist": "Andō, Tadao, 1941-",
  "date": "1999",
  "where": "Church of the Light, Ibaraki, Japan",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Church_of_Light-Ando.jpg",
  "refs": [
   "John 9:1-41",
   "John 12:20-36",
   "Ephesians 5:8-14",
   "Matthew 4:12-23",
   "Romans 13:11-14",
   "John 3:14-21",
   "Peter I, 2:2-10"
  ],
  "days": [
   "Year B Holy Tuesday",
   "Year A Holy Tuesday",
   "Year C Holy Tuesday",
   "Year A Easter 5th Sunday",
   "Year A Advent 1st Sunday",
   "Year A Lent 4th Sunday",
   "Year B Lent 4th Sunday",
   "Year A Epiphany 3rd Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/55848",
  "licence": "CC BY-SA 2.5",
  "attribution": "Andō, Tadao, 1941-. Interior of the Church of the Light, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 55869,
  "title": "Winnowing Grain",
  "artist": "Johnson, Eastman, 1824-1906",
  "date": "ca. 1873-1879",
  "where": "Museum of Fine Arts, Boston, Boston, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Eastman_Johnson_-_Winnowing_Grain.jpg",
  "refs": [
   "Psalm 1"
  ],
  "days": [
   "Year A Christmas 2nd Sunday",
   "Year B Easter 7th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/55869",
  "licence": "Public domain",
  "attribution": "Johnson, Eastman, 1824-1906. Winnowing Grain, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 55884,
  "title": "God the Father, Mary, and Christ",
  "artist": "Anonymous",
  "date": "1690-1710",
  "where": "Musée du quai Branly, Paris, France",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Etiopia-dio-abba668.jpg",
  "refs": [
   "Romans 8:12-25"
  ],
  "days": [
   "Year A Proper 11th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/55884",
  "licence": "CC BY 3.0",
  "attribution": "Anonymous. God the Father, Mary, and Christ, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 55904,
  "title": "Disciples See Christ Walking on the Water",
  "artist": "Tanner, Henry Ossawa, 1859-1937",
  "date": "ca. 1907",
  "where": "Des Moines Art Center, Des Moines, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/tanner-walk-water-3002.jpg",
  "refs": [
   "John 6:1-21",
   "Matthew 14:22-33"
  ],
  "days": [
   "Year B Proper 12th Sunday",
   "Year A Proper 14th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/55904",
  "licence": "Public domain",
  "attribution": "Tanner, Henry Ossawa, 1859-1937. Disciples See Christ Walking on the Water, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 55968,
  "title": "Israelites Gathering Manna",
  "artist": "Roberti, Ercole de', -1496",
  "date": "ca. 1490-1499",
  "where": "National Gallery (Great Britain), London, United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Ercole_de_Roberti_mann39572.jpg",
  "refs": [
   "Exodus 16:2-15"
  ],
  "days": [
   "Year A Proper 20th Sunday",
   "",
   "Year B Proper 13th Sunday"
  ],
  "essay": "https://thevcs.org/manna-desert/stage-journey",
  "act": "https://act.library.vanderbilt.edu/artworks/55968",
  "licence": "Public domain",
  "attribution": "Roberti, Ercole de', -1496. Israelites Gathering Manna, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 55970,
  "title": "Yunus (Arabic for Jonah) under the gourd vine (plant/tree) and with the whale",
  "artist": "Rashid, al-Din",
  "date": "14th century",
  "where": "University of Edinburgh Library, Edinburgh, United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/yunus-ms-48923.jpg",
  "refs": [
   "Jonah 3:10-4:11"
  ],
  "days": [
   "Year A Proper 20th Sunday",
   ""
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/55970",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Rashid, al-Din. Yunus (Arabic for Jonah) under the gourd vine (plant/tree) and with the whale, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: https://www.flickr.com/photos/crcedinburgh/9322244680."
 },
 {
  "id": 55971,
  "title": "Jonah's Gourd",
  "artist": "Chapman-Bell, Philip",
  "date": "2008",
  "where": "United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/ori-gourd-49257461.jpg",
  "refs": [
   "Jonah 3:10-4:11"
  ],
  "days": [
   "Year A Proper 20th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/55971",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Chapman-Bell, Philip. Jonah's Gourd, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: https://www.flickr.com/photos/oschene/2310258960."
 },
 {
  "id": 55972,
  "title": "Jonah Praying",
  "artist": "Anonymous",
  "date": "ca. 280-290",
  "where": "Cleveland Museum of Art, Cleveland, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/jonah-sculp-43968217800.jpg",
  "refs": [
   "Jonah 3:10-4:11"
  ],
  "days": [
   "Year A Proper 20th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/55972",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Anonymous. Jonah Praying, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: https://www.flickr.com/photos/sphericalbull/7137574345."
 },
 {
  "id": 55974,
  "title": "Jonah Under the Gourd Vine",
  "artist": "Anonymous",
  "date": "ca. 280-290",
  "where": "Cleveland Museum of Art, Cleveland, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/jonah-vine-cleve-4920176.jpg",
  "refs": [
   "Jonah 3:10-4:11"
  ],
  "days": [
   "Year A Proper 20th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/55974",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Anonymous. Jonah Under the Gourd Vine, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: https://www.flickr.com/photos/sphericalbull/7137578487."
 },
 {
  "id": 55992,
  "title": "China 1944: A destitute boy with a wicker basket in the Poor People's Refuge in Changsa",
  "artist": "Beaton, Cecil, 1904-1980",
  "date": "1944",
  "where": "Imperial War Museum, London, United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Cecil_Beaton2885741.jpg",
  "refs": [
   "Isaiah 25:1-9",
   "Psalm 41"
  ],
  "days": [
   "",
   "Year B Epiphany 7th Sunday",
   "Year A Proper 23rd Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/55992",
  "licence": "Public domain",
  "attribution": "Beaton, Cecil, 1904-1980. China 1944: A destitute boy with a wicker basket in the Poor People's Refuge in Changsa, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 55993,
  "title": "Autumn Foliage",
  "artist": "Thomson, Thomas John, 1877-1917",
  "date": "1915",
  "where": "Art Gallery of Ontario, Ontario, Canada",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Tom_Thomson_293462659.jpg",
  "refs": [
   "Psalm 96:1-9, (10-13)"
  ],
  "days": [
   "Year A Proper 24th Sunday",
   "Year C Epiphany 9th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/55993",
  "licence": "Public domain",
  "attribution": "Thomson, Thomas John, 1877-1917. Autumn Foliage, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 55997,
  "title": "The Defeat of Sisera",
  "artist": "Giordano, Luca, 1634-1705",
  "date": "17th century",
  "where": "Museo del Prado, Madrid, Spain",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Giordano-defeat320198.jpg",
  "refs": [
   "Judges 4:1-7"
  ],
  "days": [
   "Year A Proper 28th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/55997",
  "licence": "Public domain",
  "attribution": "Giordano, Luca, 1634-1705. The Defeat of Sisera, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 55998,
  "title": "Deborah Beneath the Palm Tree",
  "artist": "Tissot, James, 1836-1902",
  "date": "1896-1902",
  "where": "Jewish Museum (New York City), New York, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Tissot_Deborah_Beneath_the_Palm_Tree.jpg",
  "refs": [
   "Judges 4:1-7"
  ],
  "days": [
   "Year A Proper 28th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/55998",
  "licence": "Public domain",
  "attribution": "Tissot, James, 1836-1902. Deborah Beneath the Palm Tree, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 55999,
  "title": "Deborah Judging Israel",
  "artist": "Lawrie, Lee, 1877-1963",
  "date": "1922-1932",
  "where": "Nebraska State Capitol, Lincoln, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Nebraska_Debo3520.jpg",
  "refs": [
   "Judges 4:1-7"
  ],
  "days": [
   "Year A Proper 28th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/55999",
  "licence": "CC0",
  "attribution": "Lawrie, Lee, 1877-1963. Deborah Judging Israel, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 56000,
  "title": "Deborah with her Lyre",
  "artist": null,
  "date": "16th century",
  "where": "Saint-Germain-l'Auxerrois, Paris, France",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Paris_Saint-Germain-lAuxerrois245.jpg",
  "refs": [
   "Judges 4:1-7"
  ],
  "days": [
   "Year A Proper 28th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/56000",
  "licence": "CC BY-SA 3.0",
  "attribution": "Deborah with her Lyre, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 56011,
  "title": "Christ and the Lepers",
  "artist": null,
  "date": "1035-1040",
  "where": "Diocesan Museum of the Archdiocese of Munich and Freising, Freising, Germany",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/aureus-lepers.jpg",
  "refs": [
   "Luke 17:11-19"
  ],
  "days": [
   "Year C Thanksgiving Day",
   "Year A Thanksgiving Day",
   "Year C Proper 23rd Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/56011",
  "licence": "Public domain",
  "attribution": "Christ and the Lepers, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 56060,
  "title": "Soup Kitchen for the Jewish Poor",
  "artist": null,
  "date": "1902",
  "where": "London, United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/soup-jewish301988467.jpg",
  "refs": [
   "Luke 3:7-18",
   "Psalm 41"
  ],
  "days": [
   "Year C Advent 3rd Sunday",
   "Year B Epiphany 7th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/56060",
  "licence": "CC BY-SA 2.0",
  "attribution": "Soup Kitchen for the Jewish Poor, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 56109,
  "title": "Father of These Children...",
  "artist": "Lange, Dorothea",
  "date": "ca. 1944-1946",
  "where": "National Archives and Records Administration, College Park, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Lange-alien-sm349isjd.jpg",
  "refs": [
   "Luke 13:31-35"
  ],
  "days": [
   "Year C Lent 2nd Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/56109",
  "licence": "Public domain",
  "attribution": "Lange, Dorothea. Father of These Children..., from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 56198,
  "title": "Paz -- Peace",
  "artist": "Emnamizouni",
  "date": "2015",
  "where": "Tunisia",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Paz_peace-2ks8.jpg",
  "refs": [
   "Psalm 122",
   "Luke 10:1-11, 16-20"
  ],
  "days": [
   "Year A Advent 1st Sunday",
   "Year C Proper 9th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/56198",
  "licence": "CC BY-SA 4.0",
  "attribution": "Emnamizouni. Paz -- Peace, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 56228,
  "title": "Wheat Field in Rain",
  "artist": "Gogh, Vincent van, 1853-1890",
  "date": "1889",
  "where": "Philadelphia Museum of Art, Philadelphia, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/gogh-rain-2kjj1.jpg",
  "refs": [
   "James 5:7-10"
  ],
  "days": [
   "Year A Advent 3rd Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/56228",
  "licence": "Public domain",
  "attribution": "Gogh, Vincent van, 1853-1890. Wheat Field in Rain, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 56275,
  "title": "Jesus Preaching in the Present",
  "artist": null,
  "date": "20th century",
  "where": "Söraby kyrka, Rottne, Sweden",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/ACT0009.jpg",
  "refs": [
   "Acts 10:34-43"
  ],
  "days": [
   "Year A Baptism of the Lord",
   "Year B Proper 11th Sunday",
   "Year C Epiphany 3rd Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/56275",
  "licence": "CC BY-SA 3.0",
  "attribution": "Jesus Preaching in the Present, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 56280,
  "title": "Decorated Incipit from Psalm 1",
  "artist": null,
  "date": "1240-1250",
  "where": "Getty Center, Los Angeles, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/ACT0014.jpg",
  "refs": [
   "Malachi 3:1-4",
   "Psalm 1"
  ],
  "days": [
   "Year C Presentation of the Lord",
   "Year A Presentation of the Lord",
   "Year B Presentation of the Lord"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/56280",
  "licence": "Public domain",
  "attribution": "Decorated Incipit from Psalm 1, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 56281,
  "title": "Niagra Falls from the American Side",
  "artist": "Church, Frederic Edwin, 1826-1900",
  "date": "1867",
  "where": "Scottish National Gallery, Edinburgh, United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/ACT0016.jpg",
  "refs": [
   "Psalm 96"
  ],
  "days": [
   "Year A Nativity of the Lord Proper I"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/56281",
  "licence": "CC BY-SA 3.0",
  "attribution": "Church, Frederic Edwin, 1826-1900. Niagra Falls from the American Side, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 56287,
  "title": "Four Men Kneeling before God",
  "artist": "Boucicaut Master, active 15th century",
  "date": "1413-1415",
  "where": "J. Paul Getty Museum, Los Angeles, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/ACT0022.jpg",
  "refs": [
   "Psalm 27:1, 4-9"
  ],
  "days": [
   "Year A Epiphany 3rd Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/56287",
  "licence": "Public domain",
  "attribution": "Boucicaut Master, active 15th century. Four Men Kneeling before God, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 56300,
  "title": "The Money Changer and His Wife or The Banker and His Wife",
  "artist": "Marinus Claeszoon van Reymerswaele",
  "date": "16th century",
  "where": "Musée des beaux-arts de Valenciennes, Valenciennes, France",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Marinus_Van_Reymerswale_The_Banker_and_His_Wife.jpg",
  "refs": [
   "Psalm 112:1-9 (10)"
  ],
  "days": [
   "Year A Epiphany 5th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/56300",
  "licence": "Public domain",
  "attribution": "Marinus Claeszoon van Reymerswaele. The Money Changer and His Wife or The Banker and His Wife, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 56306,
  "title": "Sun",
  "artist": "Munch, Edvard, 1863-1944",
  "date": "1912-1913",
  "where": "Munch Museum, Oslo, Norway",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/ACT0041.jpg",
  "refs": [
   "Matthew 5:38-48",
   "Psalm 31:9-16"
  ],
  "days": [
   "Year A Easter 5th Sunday",
   "Year A Easter 4th Sunday",
   "Year A Epiphany 7th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/56306",
  "licence": "Public domain",
  "attribution": "Munch, Edvard, 1863-1944. Sun, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 56320,
  "title": "Solar Eclipse from Mount Santa Lucia",
  "artist": "Watkins, Carleton E., 1829-1916",
  "date": "1889",
  "where": "Getty Center, Los Angeles, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/ACT0056.jpg",
  "refs": [
   "Mark 13:24-37"
  ],
  "days": [
   "Year B Advent 1st Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/56320",
  "licence": "Public domain",
  "attribution": "Watkins, Carleton E., 1829-1916. Solar Eclipse from Mount Santa Lucia, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 56321,
  "title": "Christ in Glory",
  "artist": "McLean, Helen",
  "date": "2000-2010",
  "where": "Church of the Transfiguration, Barnstable, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/ACT0058.jpg",
  "refs": [
   "Mark 13:24-37",
   "John 14:1-14",
   "Job 19:23-27a"
  ],
  "days": [
   "Year A Easter 5th Sunday",
   "Year B Advent 1st Sunday",
   "Year C Proper 27th Sunday",
   "Year A Easter 4th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/56321",
  "licence": "CC BY-SA 4.0",
  "attribution": "McLean, Helen. Christ in Glory, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 56328,
  "title": "Love and Faithfulness Meet",
  "artist": null,
  "date": "1850",
  "where": "St. Michael's Church, Golden Grove, Wales, United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/ACT0064.jpg",
  "refs": [
   "Timothy I, 6:6-19",
   "Psalm 85:1-2, 8-13"
  ],
  "days": [
   "Year C Proper 21st Sunday",
   "Year B Advent 2nd  Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/56328",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Love and Faithfulness Meet, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: https://www.flickr.com/photos/sevendipity/1410013612/."
 },
 {
  "id": 56329,
  "title": "Dancing on the Barn Floor",
  "artist": "Mount, William Sidney, 1807-1868",
  "date": "1831",
  "where": "Long Island Museum of American Art, History, and Carriages, Stony Brook, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/ACT0065.jpg",
  "refs": [
   "Psalm 126"
  ],
  "days": [
   "Year B Advent 3rd Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/56329",
  "licence": "Public domain",
  "attribution": "Mount, William Sidney, 1807-1868. Dancing on the Barn Floor, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 56342,
  "title": "Love is the Only Solution",
  "artist": null,
  "date": null,
  "where": "San Francisco, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/ACT0076.jpg",
  "refs": [
   "Psalm 89:1-4, 19-26"
  ],
  "days": [
   "Year B Advent 4th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/56342",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Love is the Only Solution, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: https://www.flickr.com/photos/thomashawk/5653108193 – Thomas Hawk."
 },
 {
  "id": 56380,
  "title": "Wilderness of Engedi",
  "artist": null,
  "date": "1843",
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/ACT0114.jpg",
  "refs": [
   "Psalm 29"
  ],
  "days": [
   "Year B Baptism of the Lord"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/56380",
  "licence": "CC BY 4.0",
  "attribution": "Wilderness of Engedi, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 56414,
  "title": "Sunset sets the sky ablaze at South Dakota's Waubay National Wildlife Refuge",
  "artist": "Neuharth, Spencer",
  "date": null,
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/ACT0148.jpg",
  "refs": [
   "Psalm 50:1-6",
   "Psalm 46"
  ],
  "days": [
   "Year A Proper 4th Sunday",
   "Year B Transfiguration Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/56414",
  "licence": "Public domain",
  "attribution": "Neuharth, Spencer. Sunset sets the sky ablaze at South Dakota's Waubay National Wildlife Refuge, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 56458,
  "title": "Samuel Relating to Eli the Judgments of God upon Eli's House",
  "artist": "Copley, John Singleton, 1738-1815",
  "date": "1780",
  "where": "Wadsworth Atheneum, Hartford, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/samelis987xcv.jpg",
  "refs": [
   "Samuel I, 3:1-10"
  ],
  "days": [
   "Year B Proper 4th Sunday",
   "Year B Epiphany 2nd Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/56458",
  "licence": "Public domain",
  "attribution": "Copley, John Singleton, 1738-1815. Samuel Relating to Eli the Judgments of God upon Eli's House, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 56472,
  "title": "Living Cross",
  "artist": "Hall, Sarah",
  "date": "21st century",
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Living_Cross_by_Sarah_Hall.jpg",
  "refs": [
   "Psalm 51"
  ],
  "days": [
   "Year B Ash Wednesday",
   "Year B Epiphany 2nd Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/56472",
  "licence": "CC BY-SA 3.0",
  "attribution": "Hall, Sarah. Living Cross, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 56474,
  "title": "Pharisee and the Publican",
  "artist": "Tissot, James, 1836-1902",
  "date": "1886-1894",
  "where": "Brooklyn Museum, New York, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/publi3d0x.jpg",
  "refs": [
   "Luke 18:9-14",
   "Matthew 6:1-6, 16-21"
  ],
  "days": [
   "Year C Proper 25th Sunday",
   "Year B Ash Wednesday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/56474",
  "licence": "Public domain",
  "attribution": "Tissot, James, 1836-1902. Pharisee and the Publican, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 56488,
  "title": "Faith",
  "artist": "Lecomte, Felix",
  "date": "1792",
  "where": "Metropolitan Museum of Art, New York, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Faith_and_Charity_MET_ES4850.jpg",
  "refs": [
   "Psalm 25:1-10"
  ],
  "days": [
   "Year B Lent 1st Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/56488",
  "licence": "CC0",
  "attribution": "Lecomte, Felix. Faith, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 56514,
  "title": "Get Thee Behind Me, Satan!",
  "artist": "Tissot, James, 1836-1902",
  "date": "ca. 1886-1894",
  "where": "Brooklyn Museum, New York, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/cmfgbl0697ka.jpg",
  "refs": [
   "Mark 8:31-38",
   "Matthew 16:21-28"
  ],
  "days": [
   "Year A Proper 17th Sunday",
   "Year B Proper 19th Sunday",
   "Year B Lent 2nd Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/56514",
  "licence": "Public domain",
  "attribution": "Tissot, James, 1836-1902. Get Thee Behind Me, Satan!, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
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
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/56535",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Swanson, John August. A Visit, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of John August Swanson, https://www.johnaugustswanson.com/."
 },
 {
  "id": 56543,
  "title": "Elijah",
  "artist": "Swanson, John August",
  "date": "2008",
  "where": "Los Angeles, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Swanson-elijah.jpg",
  "refs": [
   "Kings II, 2:1-18"
  ],
  "days": [
   "Year C Proper 8th Sunday",
   "",
   "Year B Transfiguration Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/56543",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Swanson, John August. Elijah, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of John August Swanson, https://www.johnaugustswanson.com/."
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
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/56546",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Swanson, John August. Festival of Lights, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of John August Swanson, https://www.johnaugustswanson.com/."
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
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/56550",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Swanson, John August. The Great Catch, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of John August Swanson, https://www.johnaugustswanson.com/."
 },
 {
  "id": 56552,
  "title": "Last Supper",
  "artist": "Swanson, John August",
  "date": "2009",
  "where": "Los Angeles, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Swanson-Last_Supper.jpg",
  "refs": [
   "Matthew 26:14-27:66",
   "Mark 14:1-15:47",
   "Luke 22:14-23:56",
   "John 18:1-19:42",
   "John 13:21-32"
  ],
  "days": [
   "Year A Liturgy of Pass",
   "Year B Liturgy of Pass",
   "Year C Liturgy of Pass",
   "Year A Good Friday",
   "Year A Holy Wednesday",
   "Year C Maundy Thursday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/56552",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Swanson, John August. Last Supper, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of John August Swanson, https://www.johnaugustswanson.com/."
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
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/56553",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Swanson, John August. Loaves and Fishes, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of John August Swanson, https://www.johnaugustswanson.com/."
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
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/56558",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Swanson, John August. The Procession, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of John August Swanson, https://www.johnaugustswanson.com/."
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
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/56561",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Swanson, John August. Story of Ruth, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of John August Swanson, https://www.johnaugustswanson.com/."
 },
 {
  "id": 56570,
  "title": "Mary and Baby Jesus",
  "artist": "Peterson, Kathleen",
  "date": "21st century",
  "where": "Spring City, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Mary and Baby Jesus.jpg",
  "refs": [
   "Isaiah 7:10-16",
   "James 3:13 - 4:3, 7-8a"
  ],
  "days": [
   "Year A Advent 4th Sunday",
   "Year B Proper 20th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/56570",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Peterson, Kathleen. Mary and Baby Jesus, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Kathleen Peterson, https://www.kathleenpetersonart.com."
 },
 {
  "id": 56583,
  "title": "Adams Memorial",
  "artist": "Saint-Gaudens, Augustus, 1848-1907",
  "date": "1886-1891",
  "where": "Smithsonian American Art Museum, Washington, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/1280px-Smithsonian-Saint-Gaudens-Adams_Memorial-2264.jpg",
  "refs": [
   "Psalm 130"
  ],
  "days": [
   "Year B Proper 14th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/56583",
  "licence": "Public domain",
  "attribution": "Saint-Gaudens, Augustus, 1848-1907. Adams Memorial, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 56589,
  "title": "Seat of Wisdom - Sedes Sapientiae",
  "artist": null,
  "date": "16th century",
  "where": "Museum M, Leuven, Belgium",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Sedes0386-2xazl.jpg",
  "refs": [
   "Psalm 111"
  ],
  "days": [
   "Year B Proper 19th Sunday",
   "Year B Proper 15th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/56589",
  "licence": "CC0",
  "attribution": "Seat of Wisdom - Sedes Sapientiae, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 56595,
  "title": "Underground Railroad",
  "artist": "Webber, Charles T.",
  "date": "1893",
  "where": "Cincinnati Art Museum, Cincinnati, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Charles_T._Webber_-_The_Underground_Railroad_-_Google_Art_Project.jpg",
  "refs": [
   "Joshua 24:1-2a, 14-18"
  ],
  "days": [
   "Year A Christmas 2nd Sunday",
   "Year B Proper 16th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/56595",
  "licence": "Public domain",
  "attribution": "Webber, Charles T.. Underground Railroad, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 56602,
  "title": "Moneylender and his Wife",
  "artist": "Matsys, Quentin",
  "date": "1514",
  "where": "Louvre, Paris, France",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Quentin_Massys_001.jpg",
  "refs": [
   "Psalm 15"
  ],
  "days": [
   "Year B Proper 17th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/56602",
  "licence": "Public domain",
  "attribution": "Matsys, Quentin. Moneylender and his Wife, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 56604,
  "title": "Head of a Pharisee",
  "artist": "Munkácsy, Mihály, 1844-1900",
  "date": "1881",
  "where": "Hungarian National Museum, Budapest, Hungary",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Mihaly_Munkacsy_Head_of_a_Pharisee.jpg",
  "refs": [
   "Mark 7:1-8, 14-15, 21-23",
   "Mark 2:13-22"
  ],
  "days": [
   "Year B Proper 17th Sunday",
   "Year B Epiphany 8th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/56604",
  "licence": "Public domain",
  "attribution": "Munkácsy, Mihály, 1844-1900. Head of a Pharisee, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 56605,
  "title": "Mother of God of Tenderness Towards Evil Hearts",
  "artist": "Petrov-Vodkin, Kuzma",
  "date": "1914",
  "where": "Russian Museum, St. Petersburg, Russia",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Kuzma_Petrov-Vodkin_-_The_Mother_of_God_of_Tenderness_Towards_Evil_Hearts_-_Google_Art_Project.jpg",
  "refs": [
   "Mark 7:1-8, 14-15, 21-23"
  ],
  "days": [
   "Year B Proper 17th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/56605",
  "licence": "Public domain",
  "attribution": "Petrov-Vodkin, Kuzma. Mother of God of Tenderness Towards Evil Hearts, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 56607,
  "title": "Charity Bazaar for the Widows and Orphans of German, Austrian, Hungarian and their allied solders",
  "artist": null,
  "date": "1916",
  "where": "Library of Congress, Washington, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/charity-bazar3420.jpg",
  "refs": [
   "Psalm 146"
  ],
  "days": [
   "Year B Proper 18th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/56607",
  "licence": "Public domain",
  "attribution": "Charity Bazaar for the Widows and Orphans of German, Austrian, Hungarian and their allied solders, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 56609,
  "title": "Migrant Farm Workers",
  "artist": null,
  "date": "1933-1934",
  "where": "Coit Tower, San Francisco, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/6331516045_75db8451f5_b.jpg",
  "refs": [
   "Mark 12:28-34",
   "James 2:1-10, (11-13), 14-17",
   "Jeremiah 29:1, 4-7"
  ],
  "days": [
   "Year B Proper 18th Sunday",
   "Year C Proper 23rd Sunday",
   "Year B Proper 26th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/56609",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Migrant Farm Workers, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: https://www.flickr.com/photos/cookwood/6331516045 - Liz Castro."
 },
 {
  "id": 56610,
  "title": "Hunger Wall",
  "artist": null,
  "date": "1968",
  "where": "National Museum of African American History and Culture, Washington, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/1280px-NMAAHC_(33628525655).jpg",
  "refs": [
   "James 2:1-10, (11-13), 14-17"
  ],
  "days": [
   "Year B Proper 18th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/56610",
  "licence": "CC BY-SA 2.0",
  "attribution": "Hunger Wall, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 56611,
  "title": "Bethlehem Girl",
  "artist": "Verlat, Charles",
  "date": "1876",
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Charles_Verlat_-_Jeune_fille_de_Bethlehem.jpg",
  "refs": [
   "Mark 7:24-37"
  ],
  "days": [
   "Year B Proper 18th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/56611",
  "licence": "Public domain",
  "attribution": "Verlat, Charles. Bethlehem Girl, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 56623,
  "title": "Saint Verena washes the hair of a plague patient",
  "artist": null,
  "date": "1525",
  "where": "Landesmuseum Württemberg, Württemberg, Germany",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/764px-1525_Heilige_Verena_wäscht_einem_Pestkranken_die_Haare_anagoria.jpg",
  "refs": [
   "James 3:13 - 4:3, 7-8a"
  ],
  "days": [
   "Year B Proper 20th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/56623",
  "licence": "Public domain",
  "attribution": "Saint Verena washes the hair of a plague patient, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 56630,
  "title": "Esther and Ahasuerus",
  "artist": "Blakeman, Charles F.",
  "date": "1957",
  "where": "Our Lady of Victories, Kensington, London, United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/8493819053_2c5200a237_o.jpg",
  "refs": [
   "Esther 7:1-6, 9-10; 9:20-22"
  ],
  "days": [
   "Year B Proper 21st Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/56630",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Blakeman, Charles F.. Esther and Ahasuerus, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: https://www.flickr.com/photos/paullew/8493819053 - Fr Lawrence Lew, O.P.."
 },
 {
  "id": 56633,
  "title": "Maistre Robert, a Blind Healer, Healing by Laying-On of Hands",
  "artist": "Anonymous",
  "date": null,
  "where": "Wellcome Collection, London, United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Maistre_Robert__healing_by_laying-on_of_hands.jpg",
  "refs": [
   "James 5:13-20"
  ],
  "days": [
   "Year B Proper 21st Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/56633",
  "licence": "CC BY 4.0",
  "attribution": "Anonymous. Maistre Robert, a Blind Healer, Healing by Laying-On of Hands, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 56643,
  "title": "African American Children Posed for Portrait on a Porch",
  "artist": null,
  "date": "1899-1900",
  "where": "Library of Congress, Washington, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/on_a_porch_LCCN99472390.jpg",
  "refs": [
   "Psalm 26"
  ],
  "days": [
   "Year B Proper 22nd Sunday",
   ""
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/56643",
  "licence": "Public domain",
  "attribution": "African American Children Posed for Portrait on a Porch, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 56654,
  "title": "Immigrants' Ship",
  "artist": "Dollman, John Charles, 1851-1934",
  "date": "1884",
  "where": "Art Gallery of South Australia, Adelaide, Australia",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/3mklsd923jbowhd.jpg",
  "refs": [
   "Psalm 91:9-16"
  ],
  "days": [
   "Year A Easter Vigil",
   "Year B Easter Vigil",
   "Year C Easter Vigil",
   "Year B Proper 24th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/56654",
  "licence": "Public domain",
  "attribution": "Dollman, John Charles, 1851-1934. Immigrants' Ship, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 56657,
  "title": "Bread for First Communion",
  "artist": null,
  "date": "2006",
  "where": "Poland",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Bread_for_1st_Communion_mass2yf.jpg",
  "refs": [
   "John 6:24-35",
   "Psalm 34:1-8, (19-22)"
  ],
  "days": [
   "Year B Proper 25th Sunday",
   "Year B Proper 13th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/56657",
  "licence": "CC BY-SA 2.0",
  "attribution": "Bread for First Communion, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 56665,
  "title": "Widow's Mite",
  "artist": "Tissot, James, 1836-1902",
  "date": "1886-1894",
  "where": "Brooklyn Museum, New York, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/tissot-widow-2389479709830hd832.jpg",
  "refs": [
   "Mark 12:38-44",
   "Mark 12:41-44",
   "Luke 20:45-21:4"
  ],
  "days": [
   "Year C Proper 20th Sunday",
   "Year B Proper 27th Sunday"
  ],
  "essay": "https://thevcs.org/widows-mite/all-she-had-left-give?first=5901",
  "act": "https://act.library.vanderbilt.edu/artworks/56665",
  "licence": "Public domain",
  "attribution": "Tissot, James, 1836-1902. Widow's Mite, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 56670,
  "title": "Harvesters Resting (Ruth and Boaz)",
  "artist": "Millet, Jean François, 1642-1679",
  "date": "1850-1853",
  "where": "Museum of Fine Arts, Boston, Boston, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/harvest329832874786uvnj.jpg",
  "refs": [
   "Ruth 3:1-5; 4:13-17"
  ],
  "days": [
   "Year B Proper 27th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/56670",
  "licence": "Public domain",
  "attribution": "Millet, Jean François, 1642-1679. Harvesters Resting (Ruth and Boaz), from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 56674,
  "title": "After a Thunderstorm -The Oxbow",
  "artist": "Cole, Thomas, 1801-1848",
  "date": "1836",
  "where": "Metropolitan Museum of Art, New York, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/oxbow0101010a.jpg",
  "refs": [
   "Samuel I, 2:1-10"
  ],
  "days": [
   "Year B Proper 28th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/56674",
  "licence": "Public domain",
  "attribution": "Cole, Thomas, 1801-1848. After a Thunderstorm -The Oxbow, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 56676,
  "title": "Snap the Whip",
  "artist": "Homer, Winslow, 1836-1910",
  "date": "1872",
  "where": "Metropolitan Museum of Art, New York, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/sanp0wmaoxcme.jpg",
  "refs": [
   "Psalm 16"
  ],
  "days": [
   "Year B Proper 28th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/56676",
  "licence": "Public domain",
  "attribution": "Homer, Winslow, 1836-1910. Snap the Whip, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 56692,
  "title": "Wheat",
  "artist": "Linnell, John, 1792-1882",
  "date": "1860",
  "where": "National Gallery of Victoria, Melbourne, Australia",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/wheatxxxxx9879rfuh.jpg",
  "refs": [
   "Psalm 126"
  ],
  "days": [
   "Year B Thanksgiving Day"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/56692",
  "licence": "Public domain",
  "attribution": "Linnell, John, 1792-1882. Wheat, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 56713,
  "title": "John the Baptist Preaching",
  "artist": "Ghirlandaio, Domenico, 1449-1494",
  "date": "ca. 1486-1490",
  "where": "Santa Maria Novella, Florence, Florence, Italy",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/preaching8219734js0-h5827.jpg",
  "refs": [
   "John 1:29-42",
   "Luke 3:7-18"
  ],
  "days": [
   "Year C Epiphany 2nd Sunday",
   "Year C Advent 3rd Sunday"
  ],
  "essay": "https://thevcs.org/misidentifying-prophet/visual-hierarchies",
  "act": "https://act.library.vanderbilt.edu/artworks/56713",
  "licence": "Public domain",
  "attribution": "Ghirlandaio, Domenico, 1449-1494. John the Baptist Preaching, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 56763,
  "title": "Baptism",
  "artist": null,
  "date": "2012",
  "where": "Lady Bird Lake, Austin, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/8244740212_5366adc71e_k.jpg",
  "refs": [
   "Acts 8:14-17"
  ],
  "days": [
   "Year C Baptism of the Lord"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/56763",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Baptism, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: https://www.flickr.com/photos/dingatx/8244740212."
 },
 {
  "id": 56818,
  "title": "Hand of God",
  "artist": null,
  "date": "1992",
  "where": "St. Elizabeth Ann Seton Parish, Pickerington, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/hand00q00x0ghggfd.jpg",
  "refs": [
   "Joel 2:1-2, 12-17",
   "Psalm 41"
  ],
  "days": [
   "Year B Epiphany 7th Sunday",
   "Year C Ash Wednesday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/56818",
  "licence": "CC BY-SA 4.0",
  "attribution": "Hand of God, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 56823,
  "title": "Guardian Angel",
  "artist": null,
  "date": "1907",
  "where": "Antonskirche (St. Anthony of Padua), Vienna, Austria",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Antonsplatz_22wshd823.jpg",
  "refs": [
   "Psalm 91:9-16"
  ],
  "days": [
   "Year C Lent 1st Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/56823",
  "licence": "CC BY-SA 3.0",
  "attribution": "Guardian Angel, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 56826,
  "title": "God's Hands and the Holy Spirit",
  "artist": null,
  "date": "20th century",
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/1547659026_389e8f60d7_o.jpg",
  "refs": [
   "Psalm 27"
  ],
  "days": [
   "Year C Lent 2nd Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/56826",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "God's Hands and the Holy Spirit, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: https://www.flickr.com/photos/basta-cosi/1547659026/ - Jean Bean."
 },
 {
  "id": 56827,
  "title": "Catskills",
  "artist": "Durand, A. B. (Asher Brown), 1796-1886",
  "date": "1859",
  "where": "Walters Art Museum, Baltimore, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Asher_Brown_Durand_-_The_Catskills_-_Walters_37122.jpg",
  "refs": [
   "Psalm 27"
  ],
  "days": [
   "Year C Lent 2nd Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/56827",
  "licence": "Public domain",
  "attribution": "Durand, A. B. (Asher Brown), 1796-1886. Catskills, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 56844,
  "title": "Return from the Harvest",
  "artist": "Bouguereau, William Adolphe, 1825-1905",
  "date": "1878",
  "where": "Cummer Museum of Art and Gardens, Jacksonville, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/child029knv87yuh23qciuh.jpg",
  "refs": [
   "Psalm 126"
  ],
  "days": [
   "Year C Lent 5th  Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/56844",
  "licence": "Public domain",
  "attribution": "Bouguereau, William Adolphe, 1825-1905. Return from the Harvest, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 56885,
  "title": "Supper at Emmaus",
  "artist": "Caravaggio, Michelangelo Merisi da, 1573-1610",
  "date": "1601",
  "where": "National Gallery (Great Britain), London, United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/supper410qwa.jpg",
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
  "essay": "https://thevcs.org/road-emmaus/simultaneity-and-surprise",
  "act": "https://act.library.vanderbilt.edu/artworks/56885",
  "licence": "Public domain",
  "attribution": "Caravaggio, Michelangelo Merisi da, 1573-1610. Supper at Emmaus, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 56887,
  "title": "Dorcas",
  "artist": null,
  "date": "1896",
  "where": "St Twrog's Church, Maentwrog, United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Dorcas0239.jpg",
  "refs": [
   "Acts 9:36-43"
  ],
  "days": [
   "Year C Easter 4th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/56887",
  "licence": "CC BY-SA 4.0",
  "attribution": "Dorcas, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 56889,
  "title": "Mourning Tabitha",
  "artist": null,
  "date": "20th century",
  "where": "Southwark Cathedral, London, United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Tabithab398sdf7yfv.jpg",
  "refs": [
   "Acts 9:36-43"
  ],
  "days": [
   "Year C Easter 4th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/56889",
  "licence": "CC0",
  "attribution": "Mourning Tabitha, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 56890,
  "title": "Raising of Tabitha",
  "artist": "Didron, Edouard",
  "date": "1881",
  "where": "Périgueux Cathedral, Périgueux, France",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Tabithanbvj2020.jpg",
  "refs": [
   "Acts 9:36-43"
  ],
  "days": [
   "Year C Easter 4th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/56890",
  "licence": "CC BY-SA 3.0",
  "attribution": "Didron, Edouard. Raising of Tabitha, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 56894,
  "title": "Saint Lydia Purpuraria",
  "artist": "Alkelda",
  "date": "2011",
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/8347293119_674c1d922b_o.jpg",
  "refs": [
   "Acts 16:9-15"
  ],
  "days": [
   "Year C Easter 6th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/56894",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Alkelda. Saint Lydia Purpuraria, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: https://www.flickr.com/photos/alkelda/8347293119 - Alkelda."
 },
 {
  "id": 56895,
  "title": "Lydia of Thyatira",
  "artist": null,
  "date": "20th century",
  "where": "Akhisar, Turkey",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/38314688816_0559a735b3_k.jpg",
  "refs": [
   "Acts 16:9-15"
  ],
  "days": [
   "Year C Easter 6th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/56895",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Lydia of Thyatira, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: https://www.flickr.com/photos/captspaulding/38314688816/ - CaptSpalding."
 },
 {
  "id": 56896,
  "title": "Lydia of Thyatira",
  "artist": null,
  "date": "20th century",
  "where": "Akhisar, Turkey",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/24499073678_0c3d96130e_k.jpg",
  "refs": [
   "Acts 16:9-15"
  ],
  "days": [
   "Year C Easter 6th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/56896",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Lydia of Thyatira, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: https://www.flickr.com/photos/captspaulding/24499073678/ - CaptSpalding."
 },
 {
  "id": 56897,
  "title": "Lydia of Thyatira",
  "artist": null,
  "date": "21st century",
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/14962284898_3c11450c8f_o.jpg",
  "refs": [
   "Acts 16:9-15"
  ],
  "days": [
   "Year C Easter 6th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/56897",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Lydia of Thyatira, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: https://www.flickr.com/photos/erifragiadaki/14962284898/ - Eri Fragiadaki."
 },
 {
  "id": 56933,
  "title": "Paradise Landscape with Animals",
  "artist": "Bruegel, Jan, 1568-1625",
  "date": "1613-1615",
  "where": "Museum of Fine Arts, Budapest, Budapest, Hungary",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/animalsbqxwax8p.jpg",
  "refs": [
   "Psalm 148"
  ],
  "days": [
   "Year C Easter 5th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/56933",
  "licence": "Public domain",
  "attribution": "Bruegel, Jan, 1568-1625. Paradise Landscape with Animals, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 56934,
  "title": "Orchard in Spring",
  "artist": "Sisley, Alfred, 1839-1899",
  "date": "1881",
  "where": "Museum Boijmans Van Beuningen, Rotterdam, Netherlands",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/springplil22x.jpg",
  "refs": [
   "Psalm 148"
  ],
  "days": [
   "Year C Easter 5th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/56934",
  "licence": "Public domain",
  "attribution": "Sisley, Alfred, 1839-1899. Orchard in Spring, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 56935,
  "title": "Snow Storm",
  "artist": "Turner, J. M. W. (Joseph Mallord William), 1775-1851",
  "date": "ca. 1842",
  "where": "Tate Britain, London, United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/snowbczaqpm19c4.jpg",
  "refs": [
   "Psalm 148"
  ],
  "days": [
   "Year C Easter 5th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/56935",
  "licence": "Public domain",
  "attribution": "Turner, J. M. W. (Joseph Mallord William), 1775-1851. Snow Storm, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 56939,
  "title": "Sunlight on the Coast",
  "artist": "Homer, Winslow, 1836-1910",
  "date": "1890",
  "where": "Toledo Museum of Art, Toledo, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/coastmlpqh61.jpg",
  "refs": [
   "Psalm 97"
  ],
  "days": [
   "Year C Easter 7th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/56939",
  "licence": "Public domain",
  "attribution": "Homer, Winslow, 1836-1910. Sunlight on the Coast, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 56944,
  "title": "Celebration Day",
  "artist": null,
  "date": "2014",
  "where": "Bujora Catholic Church, Mwanza, Tanzania",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Holy_celebration21obt.jpg",
  "refs": [
   "Romans 8:14-17"
  ],
  "days": [
   "",
   "Year C Day of Pentecost"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/56944",
  "licence": "CC BY-SA 4.0",
  "attribution": "Celebration Day, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 56947,
  "title": "Garden of Eden",
  "artist": "Cole, Thomas, 1801-1848",
  "date": "1828",
  "where": "Amon Carter Museum of American Art, Fort Worth, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/garden7mmb328cb3.jpg",
  "refs": [
   "Psalm 104:24-34, 35b"
  ],
  "days": [
   "Year C Day of Pentecost",
   "Year A Day of Pentecost"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/56947",
  "licence": "Public domain",
  "attribution": "Cole, Thomas, 1801-1848. Garden of Eden, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 56963,
  "title": "Elijah and Elisha",
  "artist": "Grafton, Samuel",
  "date": "ca. 1873-1897",
  "where": "Walton Well Road, Oxford, United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/431550496_395adc119e_o.jpg",
  "refs": [
   "Kings II,  2:1-2, 6-14"
  ],
  "days": [
   "Year C Proper 8th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/56963",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Grafton, Samuel. Elijah and Elisha, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: https://www.flickr.com/photos/paullew/431550496/ - Fr Lawrence Lew. O.P.."
 },
 {
  "id": 56972,
  "title": "Quiver Tree Forest",
  "artist": "Stieglitz, Hans",
  "date": "2012",
  "where": "Quiver Tree Forest, Keetmanshoop, Namibia",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Trees8892886bbdpq.jpg",
  "refs": [
   "Psalm 66:1-9"
  ],
  "days": [
   "Year C Proper 9th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/56972",
  "licence": "CC BY-SA 3.0",
  "attribution": "Stieglitz, Hans. Quiver Tree Forest, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 56988,
  "title": "Saint Ranerius Frees the Poor From Prison",
  "artist": "Sassetta, approximately 1400-1450",
  "date": "1437-1444",
  "where": "Louvre, Paris, France",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/poor2028nc8u.jpg",
  "refs": [
   "Amos 8:1-12"
  ],
  "days": [
   "Year C Proper 11th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/56988",
  "licence": "Public domain",
  "attribution": "Sassetta, approximately 1400-1450. Saint Ranerius Frees the Poor From Prison, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 56994,
  "title": "Land Stewardship Lab",
  "artist": null,
  "date": "2017",
  "where": "Witte Museum, San Antonio, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/landnbvcxhgj1298.jpg",
  "refs": [
   "Psalm 52"
  ],
  "days": [
   "Year C Proper 11th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/56994",
  "licence": "CC BY-SA 4.0",
  "attribution": "Land Stewardship Lab, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 57003,
  "title": "Wisconsin Fields",
  "artist": "Chen, Yinan",
  "date": "2013",
  "where": "Madison, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/wisc6709hre.jpg",
  "refs": [
   "Psalm 107:1-9, 43"
  ],
  "days": [
   "Year C Proper 13th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/57003",
  "licence": "Public Domain",
  "attribution": "Chen, Yinan. Wisconsin Fields, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 57004,
  "title": "Hands Around the World",
  "artist": null,
  "date": "2012",
  "where": "Christ Church Cathedral, Victoria, Canada",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/7402060432_690aa1605d_o.jpg",
  "refs": [
   "Psalm 49:1-12"
  ],
  "days": [
   "Year C Proper 13th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/57004",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Hands Around the World, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: https://www.flickr.com/photos/uk_parliament/7402060432."
 },
 {
  "id": 57010,
  "title": "Winged Altarpiece Shaped Like a Heart",
  "artist": "Cranach, Lucas the younger, 1515-1586",
  "date": "1584",
  "where": "Germanisches Nationalmuseum, Nuremberg, Germany",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/cran2708iuyokjgm.jpg",
  "refs": [
   "Matthew 26:14-27:66",
   "Mark 14:1-15:47",
   "Luke 22:14-23:56",
   "Psalm 33:12-22"
  ],
  "days": [
   "Year A Liturgy of Pass",
   "Year B Liturgy of Pass",
   "Year C Liturgy of Pass",
   "Year C Proper 14th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/57010",
  "licence": "Public domain",
  "attribution": "Cranach, Lucas the younger, 1515-1586. Winged Altarpiece Shaped Like a Heart, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 57021,
  "title": "Singing Windows",
  "artist": "J. & R. Lamb Studios",
  "date": "1932",
  "where": "University Chapel, Tuskegee, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Tuskee2b0-98ytfd.jpg",
  "refs": [
   "Luke 2:1-14, (15-20)",
   "Genesis 28:10-19a",
   "Exodus 20:1-17",
   "Psalm 47"
  ],
  "days": [
   "Year A Ascension of the Lord",
   "Year A Nativity of the Lord Proper I",
   "Year B Lent 3rd Sunday",
   "Year A Proper 11th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/57021",
  "licence": "Public domain",
  "attribution": "J. & R. Lamb Studios. Singing Windows, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 57039,
  "title": "Saint John the Baptist Bearing Witness (Pharisees, detail)",
  "artist": "Granacci, Francesco, 1469?-1543",
  "date": "ca. 1506-1507",
  "where": "Metropolitan Museum of Art, New York, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/phar4826825691_3bbb205cbf_o.jpg",
  "refs": [
   "Luke 14:1, 7-14"
  ],
  "days": [
   "Year C Proper 17th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/57039",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Granacci, Francesco, 1469?-1543. Saint John the Baptist Bearing Witness (Pharisees, detail), from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: https://www.flickr.com/photos/peterjr1961/4826825691/ - Peter Roan."
 },
 {
  "id": 57040,
  "title": "Blessed are the Merciful",
  "artist": "Tiffany, Louis Comfort, 1848-1933",
  "date": "1920",
  "where": "Arlington Street Church, Boston, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/angel5391897874_81eb43b7d6_o.jpg",
  "refs": [
   "Psalm 112:1-9 (10)"
  ],
  "days": [
   "Year C Proper 17th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/57040",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Tiffany, Louis Comfort, 1848-1933. Blessed are the Merciful, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: https://www.flickr.com/photos/thomashawk/5391897874/ - Thomas Hawk."
 },
 {
  "id": 57041,
  "title": "Sweet Honey in the Rock live at Ravinia",
  "artist": null,
  "date": "2006",
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Sweet_Honey_in_the_Roc4h3289675k.jpg",
  "refs": [
   "Psalm 81:1, 10-16"
  ],
  "days": [
   "Year C Proper 17th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/57041",
  "licence": "CC BY-SA 2.0",
  "attribution": "Sweet Honey in the Rock live at Ravinia, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 57045,
  "title": "Brothers #1",
  "artist": "Dove, Arthur Garfield, 1880-1946",
  "date": "1941",
  "where": "Honolulu Museum of Art, Honolulu, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/brothers09oplk13.jpg",
  "refs": [
   "Philemon 1:1-21"
  ],
  "days": [
   "Year C Proper 18th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/57045",
  "licence": "Public domain",
  "attribution": "Dove, Arthur Garfield, 1880-1946. Brothers #1, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 57047,
  "title": "Reading Woman",
  "artist": "Elinga, Pieter Janssens, 1623-1682",
  "date": "1665-1670",
  "where": "Alte Pinakothek, Munich, Germany",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/readn56b87rgw6.jpg",
  "refs": [
   "Psalm 1"
  ],
  "days": [
   "Year C Proper 18th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/57047",
  "licence": "Public domain",
  "attribution": "Elinga, Pieter Janssens, 1623-1682. Reading Woman, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 57051,
  "title": "Memorial to Hungarian Forced Labor Captives after World War II",
  "artist": null,
  "date": "20th century",
  "where": "Tomcsányi Castle, Vásárosnamény, Hungary",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/hungary823yuwgsd9c.jpg",
  "refs": [
   "Psalm 14"
  ],
  "days": [
   "Year C Proper 19th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/57051",
  "licence": "CC BY-SA 3.0",
  "attribution": "Memorial to Hungarian Forced Labor Captives after World War II, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 57065,
  "title": "Works of Mercy with Dives and Lazarus",
  "artist": null,
  "date": "ca. 1550",
  "where": "Wellcome Collection, London, United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Mercy096812yiurym.jpg",
  "refs": [
   "Psalm 91:1-6, 14-16"
  ],
  "days": [
   "Year C Proper 21st Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/57065",
  "licence": "CC BY 4.0",
  "attribution": "Works of Mercy with Dives and Lazarus, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 57066,
  "title": "Rich Man and the Poor Man Lazarus",
  "artist": null,
  "date": "ca. 1846",
  "where": "Rila Monastery, Rila, Bulgaria",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Rila398jfvnbdf93io.jpg",
  "refs": [
   "Amos 6:1a, 4-7"
  ],
  "days": [
   "Year C Proper 21st Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/57066",
  "licence": "CC BY-SA 3.0",
  "attribution": "Rich Man and the Poor Man Lazarus, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
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
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/57075",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Pittman, Lauren Wright. Complete Joy, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Lauren Wright Pittman, http://www.lewpstudio.com/."
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
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/57080",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Pittman, Lauren Wright. Broken Vessel, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Lauren Wright Pittman, http://www.lewpstudio.com/."
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
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/57092",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Pittman, Lauren Wright. Multitudes, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Lauren Wright Pittman, http://www.lewpstudio.com/."
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
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/57100",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Latimore, Kelly. Martin Luther King, Jr., from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Kelly Latimore Icons, https://kellylatimoreicons.com/."
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
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/57102",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Latimore, Kelly. Nicholas Black Elk, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Kelly Latimore Icons, https://kellylatimoreicons.com/."
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
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/57115",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Latimore, Kelly. Mother Jones, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Kelly Latimore Icons, https://kellylatimoreicons.com/."
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
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/57120",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Latimore, Kelly. Roebuck \"Pops\" Staples, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Kelly Latimore Icons, https://kellylatimoreicons.com/."
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
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/57122",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Latimore, Kelly. Dorothy Day with Homeless Christ, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Kelly Latimore Icons, https://kellylatimoreicons.com/."
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
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/57124",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Latimore, Kelly. Christ: the Tekton, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Kelly Latimore Icons, https://kellylatimoreicons.com/."
 },
 {
  "id": 57139,
  "title": "Miracle Catch",
  "artist": "Moyers, Mike",
  "date": "2019",
  "where": "United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Miracle_Catch_HR.jpg",
  "refs": [
   "Luke 5:1-11"
  ],
  "days": [
   "Year C Epiphany 5th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/57139",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Moyers, Mike. Miracle Catch, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Mike Moyers, https://www.mikemoyersfineart.com/."
 },
 {
  "id": 57142,
  "title": "Lenten Labyrinth",
  "artist": "Moyers, Mike",
  "date": "2012",
  "where": "United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Lenten_Labyrinth_HR.jpg",
  "refs": [
   "Psalm 32"
  ],
  "days": [
   "Year A Lent 1st Sunday",
   "Year C Proper 6th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/57142",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Moyers, Mike. Lenten Labyrinth, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Mike Moyers, https://www.mikemoyersfineart.com/."
 },
 {
  "id": 57144,
  "title": "Shine",
  "artist": "Moyers, Mike",
  "date": "2013",
  "where": "United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Shine_HR.jpg",
  "refs": [
   "Matthew 5:13-20",
   "Psalm 119:129-136"
  ],
  "days": [
   "Year A Proper 12th Sunday",
   "Year A Epiphany 5th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/57144",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Moyers, Mike. Shine, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Mike Moyers, https://www.mikemoyersfineart.com/."
 },
 {
  "id": 57148,
  "title": "Prayer",
  "artist": "Moyers, Mike",
  "date": "2014",
  "where": "United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Prayer_HR.jpg",
  "refs": [
   "Psalm 141:2"
  ],
  "days": [
   "Year A Ash Wednesday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/57148",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Moyers, Mike. Prayer, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Mike Moyers, https://www.mikemoyersfineart.com/."
 },
 {
  "id": 57156,
  "title": "Shepherd Tending His Flock",
  "artist": "Millet, Jean François, 1814-1875",
  "date": "1860-1865",
  "where": "Brooklyn Museum, New York, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Millet-kj48f791k2098fdg4x .jpg",
  "refs": [
   "Luke 17:5-10"
  ],
  "days": [
   "Year C Proper 22nd Sunday",
   "Year B Easter 4th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/57156",
  "licence": "Public domain",
  "attribution": "Millet, Jean François, 1814-1875. Shepherd Tending His Flock, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 57167,
  "title": "Old Woman Reading",
  "artist": "Dou, Gerard, 1613-1675",
  "date": "ca. 1631-1632",
  "where": "Rijksmuseum Amsterdam, Amsterdam, Netherlands",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Gerard_Dou_005cxmndsfjkhw87930-.jpg",
  "refs": [
   "Psalm 119:97-104"
  ],
  "days": [
   "Year C Proper 24th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/57167",
  "licence": "Public domain",
  "attribution": "Dou, Gerard, 1613-1675. Old Woman Reading, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 57169,
  "title": "Mountain of the Holy Cross",
  "artist": "Moran, Thomas, 1837-1926",
  "date": "1890",
  "where": "National Gallery of Art (U.S.), Washington, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/cross8eu3784efhj4576hf.jpg",
  "refs": [
   "Psalm 121"
  ],
  "days": [
   "Year C Proper 24th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/57169",
  "licence": "Public domain",
  "attribution": "Moran, Thomas, 1837-1926. Mountain of the Holy Cross, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 57173,
  "title": "Siesta",
  "artist": "Malhoa, José, 1855-1933",
  "date": "1909",
  "where": "Museu Nacional de Belas Artes, Rio de Janeiro, Brazil",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Josemcv09657yuh.jpg",
  "refs": [
   "Psalm 121"
  ],
  "days": [
   "Year C Proper 24th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/57173",
  "licence": "Public domain",
  "attribution": "Malhoa, José, 1855-1933. Siesta, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 57175,
  "title": "Justice as Protector",
  "artist": "Hirsch, Stefan, 1899-1964",
  "date": "1938",
  "where": "Charles E. Simmons, Jr. Federal Court House, Aiken, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/justiceb8b7c65v9nmhtbt.jpg",
  "refs": [
   "Luke 18:1-8"
  ],
  "days": [
   "Year C Proper 24th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/57175",
  "licence": "Public domain",
  "attribution": "Hirsch, Stefan, 1899-1964. Justice as Protector, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 57179,
  "title": "Ten Commandments",
  "artist": null,
  "date": "1979",
  "where": "Saint Augustine Parish Church, Baliuag, Philippines",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/BaliuagChurchjf9702_02.jpg",
  "refs": [
   "Exodus 20:1-17",
   "Psalm 119:137-144"
  ],
  "days": [
   "Year C Proper 26th Sunday",
   "Year B Lent 3rd Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/57179",
  "licence": "CC BY-SA 3.0",
  "attribution": "Ten Commandments, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 57192,
  "title": "Storm in the Rocky Mountains, Mt. Rosalie",
  "artist": "Bierstadt, Albert, 1830-1902",
  "date": "1866",
  "where": "Brooklyn Museum, New York, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Bierstadt45677y5yehfgb.jpg",
  "refs": [
   "Psalm 98"
  ],
  "days": [
   "Year C Proper 27th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/57192",
  "licence": "Public domain",
  "attribution": "Bierstadt, Albert, 1830-1902. Storm in the Rocky Mountains, Mt. Rosalie, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 57223,
  "title": "Heavy Sea at Pourville",
  "artist": "Monet, Claude, 1840-1926",
  "date": "1897",
  "where": "National Museum of Western Art, Tokyo, Japan",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Monetn590fdj5k.jpg",
  "refs": [
   "Psalm 98"
  ],
  "days": [
   "Year C Proper 28th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/57223",
  "licence": "Public domain",
  "attribution": "Monet, Claude, 1840-1926. Heavy Sea at Pourville, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 57233,
  "title": "Christ and Saint John the Evangelist",
  "artist": null,
  "date": "1300-1320",
  "where": "Cleveland Museum of Art, Cleveland, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Johnmjkdnsi8867325.jpg",
  "refs": [
   "John 13:21-32",
   "Psalm 46"
  ],
  "days": [
   "Year C Reign of Christ"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/57233",
  "licence": "CC0",
  "attribution": "Christ and Saint John the Evangelist, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 57243,
  "title": "Bee Mural",
  "artist": "Weareskyhigh",
  "date": "ca. 2018",
  "where": "Riverside Cafe In Kingston/Surbiton Surrey, South London, Kingston upon Thames, United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/bee38824836800_9b8a033b58_k.jpg",
  "refs": [
   "Psalm 100"
  ],
  "days": [
   "Year C Thanksgiving Day"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/57243",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Weareskyhigh. Bee Mural, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: https://www.flickr.com/photos/maureen_barlin/38824836800 - CC BY-NC-ND 2.0."
 },
 {
  "id": 57260,
  "title": "Tribute Money",
  "artist": "Masaccio, 1401-1428",
  "date": "1424-1428",
  "where": "Brancacci Chapel, Florence, Italy",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/tribute89023jr87.jpg",
  "refs": [
   "Matthew 22:15-22",
   "Matthew 17:22-27"
  ],
  "days": [
   "Year A Proper 24th Sunday"
  ],
  "essay": "https://thevcs.org/tribute-money/space-and-time?first=6601",
  "act": "https://act.library.vanderbilt.edu/artworks/57260",
  "licence": "Public domain",
  "attribution": "Masaccio, 1401-1428. Tribute Money, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 57263,
  "title": "Jael and Sisera",
  "artist": "Lazzarini, Gregorio",
  "date": "17th century",
  "where": "Private collection",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Jaelvu8948hud12.jpg",
  "refs": [
   "Judges 4:17-23",
   "Judges 5:2–31"
  ],
  "days": [],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/57263",
  "licence": "CC BY-SA 3.0",
  "attribution": "Lazzarini, Gregorio. Jael and Sisera, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 57265,
  "title": "Deborah, Jael and Barak",
  "artist": "Bray, Salomon de, 1597-1664",
  "date": "1635",
  "where": "Museum Catharijneconvent, Utrecht, Netherlands",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Jaelbmcvniokjn0z.jpg",
  "refs": [
   "Judges 4:17-23",
   "Judges 5:2–31"
  ],
  "days": [],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/57265",
  "licence": "Public domain",
  "attribution": "Bray, Salomon de, 1597-1664. Deborah, Jael and Barak, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 57267,
  "title": "Sacrifice of Jephthah’s Daughter",
  "artist": null,
  "date": "1240-1249",
  "where": "Morgan Library & Museum, New York, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Jep965762670987c.jpg",
  "refs": [
   "Judges 11:29-40"
  ],
  "days": [],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/57267",
  "licence": "Public domain",
  "attribution": "Sacrifice of Jephthah’s Daughter, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 57294,
  "title": "Crossing from the desert to the promised land",
  "artist": null,
  "date": "2019",
  "where": "Table View Methodist Church, 85 Janssens Ave, Table View, Cape Town, South Africa",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/b-crossing029834.jpg",
  "refs": [
   "Joshua 3:7-17"
  ],
  "days": [
   "Year A Proper 26th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/57294",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Crossing from the desert to the promised land, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Table View Methodist, https://tableviewmethodist.blogspot.com/p/bible-story-windows.html."
 },
 {
  "id": 57295,
  "title": "Life in the the promised land.",
  "artist": null,
  "date": "2019",
  "where": "Table View Methodist Church, 85 Janssens Ave, Table View, Cape Town, South Africa",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/e-promised98376y.jpg",
  "refs": [
   "Psalm 37:1-11, 39-40",
   "Psalm 37:1-9"
  ],
  "days": [
   "Year C Epiphany 7th Sunday",
   "Year C Proper 22nd Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/57295",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Life in the the promised land., from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Table View Methodist, https://tableviewmethodist.blogspot.com/p/bible-story-windows.html."
 },
 {
  "id": 57311,
  "title": "At the Deathbed",
  "artist": "Munch, Edvard, 1863-1944",
  "date": "1895",
  "where": "KODE Art museums and Composer Homes, Bergen, Norway",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/deathbvcg5498t.jpg",
  "refs": [
   "Psalm 130"
  ],
  "days": [
   "Year A Lent 5th  Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/57311",
  "licence": "Public domain",
  "attribution": "Munch, Edvard, 1863-1944. At the Deathbed, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 57317,
  "title": "Mountain Landscape",
  "artist": "Brabazon, Hercules Brabazon, 1821-1906",
  "date": null,
  "where": "Phillips Collection, Washington, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/mount489rueihdfsknxzm.jpg",
  "refs": [
   "Psalm 121"
  ],
  "days": [
   "Year A Lent 2nd Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/57317",
  "licence": "Public domain",
  "attribution": "Brabazon, Hercules Brabazon, 1821-1906. Mountain Landscape, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 57355,
  "title": "The Entombment of Christ",
  "artist": "Caravaggio, Michelangelo Merisi da, 1573-1610",
  "date": "ca. 1600-1604",
  "where": "Vatican Museums, Vatican City",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/entombbsw2796hfl02z.jpg",
  "refs": [
   "John 18:1-19:42"
  ],
  "days": [
   "Year A Good Friday",
   "Year B Good Friday",
   "Year C Good Friday"
  ],
  "essay": "https://thevcs.org/birth-church/descent-ascent",
  "act": "https://act.library.vanderbilt.edu/artworks/57355",
  "licence": "Public domain",
  "attribution": "Caravaggio, Michelangelo Merisi da, 1573-1610. The Entombment of Christ, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 57371,
  "title": "Great Isaiah Scroll MA A (1QIsa)",
  "artist": null,
  "date": "1st century",
  "where": "Israel Museum, Jerusalem, Israel",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/scrolldh4j3g675d12.jpg",
  "refs": [
   "Psalm 40:1-11"
  ],
  "days": [
   "Year A Annunciation of the Lord"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/57371",
  "licence": "Public domain",
  "attribution": "Great Isaiah Scroll MA A (1QIsa), from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 57420,
  "title": "Fog",
  "artist": null,
  "date": "2005",
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/fog1289234thgn.jpg",
  "refs": [
   "Psalm 68:1-10, 32-35"
  ],
  "days": [
   "Year A Easter 7th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/57420",
  "licence": "CC BY-SA 2.5",
  "attribution": "Fog, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 57432,
  "title": "Jacob Tending His Flock",
  "artist": "Ribera, Jusepe de, 1591-1652",
  "date": "1634",
  "where": "El Escorial, Madrid, Spain",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Jacob31d12sal.jpg",
  "refs": [
   "Psalm 105:1-11, 45b"
  ],
  "days": [
   "Year A Proper 12th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/57432",
  "licence": "Public domain",
  "attribution": "Ribera, Jusepe de, 1591-1652. Jacob Tending His Flock, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 57472,
  "title": "Holy Spirit",
  "artist": "Anonymous",
  "date": "ca. 1970-1999",
  "where": "Saint Paul Church, Yellow Springs, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/holy-dove932fi2h3u.jpg",
  "refs": [
   "Acts 10:44-48"
  ],
  "days": [
   "Year B Easter 6th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/57472",
  "licence": "CC BY-SA 4.0",
  "attribution": "Anonymous. Holy Spirit, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 57523,
  "title": "Praying Hands, or Study of the Hands of an Apostle",
  "artist": "Dürer, Albrecht, 1471-1528",
  "date": "1508-1512",
  "where": "Albertina Museum, Vienna, Austria",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/BProp21bw.jpg",
  "refs": [
   "James 5:13-20"
  ],
  "days": [
   "Year B Proper 21st Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/57523",
  "licence": "Public domain",
  "attribution": "Dürer, Albrecht, 1471-1528. Praying Hands, or Study of the Hands of an Apostle, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 57567,
  "title": "My Heart for the Lord",
  "artist": "Valente, Liz",
  "date": "2021",
  "where": "Viçosa, Brazil",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/My-Heart-for-the-Lord-LV.jpg",
  "refs": [
   "Matthew 5:1-12",
   "Psalm 111"
  ],
  "days": [
   "Year A All Saints Day",
   "Year B Epiphany 4thSunday",
   "Year B Proper 15th Sunday",
   "Year C Proper 23rd Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/57567",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Valente, Liz. My Heart for the Lord, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Liz Valente, https://www.instagram.com/donalizvalente/."
 },
 {
  "id": 57577,
  "title": "Meditation",
  "artist": "Jawlensky, Alexej von, 1864-1941",
  "date": "1936",
  "where": "Museum Pfalzgalerie Kaiserslautern, Kaiserslautern, Germany",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Alexej_von_Jawlensky_-_Meditation28937eet.jpg",
  "refs": [
   "Psalm 105:1-6, 23-26, 45b"
  ],
  "days": [
   "Year A Proper 17th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/57577",
  "licence": "Public domain",
  "attribution": "Jawlensky, Alexej von, 1864-1941. Meditation, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 57586,
  "title": "God our Father on the Rainbow",
  "artist": "Milles, Carl, 1875-1955, Fredericks, Marshall M., 1908-1998",
  "date": "1995",
  "where": "Nacka Stand, Stockholm, Sweden",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/god28dsf543h768f32.jpg",
  "refs": [
   "Psalm 138"
  ],
  "days": [
   "Year A Proper 16th Sunday",
   "Year A Proper 8th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/57586",
  "licence": "CC BY-SA 4.0",
  "attribution": "Milles, Carl, 1875-1955, Fredericks, Marshall M., 1908-1998. God our Father on the Rainbow, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 57589,
  "title": "Prophet Miriam",
  "artist": "Blackall, Pippa",
  "date": "2008",
  "where": "St Edmundsbury Cathedral, Bury St Edmunds, United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/miriam33172410852_bcf5c473db_k.jpg",
  "refs": [
   "Psalm 47",
   "Exodus 15:1b-11, 20-21"
  ],
  "days": [
   "Year B Ascension of the Lord",
   "",
   "Year A Proper 19th Sunday",
   "Year B Proper 8th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/57589",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Blackall, Pippa. Prophet Miriam, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: https://www.flickr.com/photos/paullew/33172410852."
 },
 {
  "id": 57590,
  "title": "Rocky Mountain Sheep",
  "artist": "Bierstadt, Albert, 1830-1902",
  "date": "ca. 1879",
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/ram239fdny712oji.jpg",
  "refs": [
   "Psalm 114"
  ],
  "days": [
   "Year A Proper 19th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/57590",
  "licence": "Public domain",
  "attribution": "Bierstadt, Albert, 1830-1902. Rocky Mountain Sheep, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 57604,
  "title": "Clare and Francis",
  "artist": null,
  "date": "20th century",
  "where": "Monastery of the Poor Clares, Canindé, Brazil",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/claren29nk80ojmnyt.jpg",
  "refs": [
   "Psalm 25:1-10"
  ],
  "days": [
   "Year A Proper 21st Sunday",
   "Year B Proper 7th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/57604",
  "licence": "CC BY-SA 3.0",
  "attribution": "Clare and Francis, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 57622,
  "title": "Figure of Job",
  "artist": null,
  "date": "ca. 1750-1850",
  "where": "Science Museum, London, United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/job2uhj69hj8576873bsdfg.jpg",
  "refs": [
   "Job 1:1, 2:1-10",
   "Job 19:23-27a"
  ],
  "days": [
   "Year B Proper 22nd Sunday",
   "Year C Proper 27th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/57622",
  "licence": "CC BY-SA 4.0",
  "attribution": "Figure of Job, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 57623,
  "title": "Job Mocked by His Wife",
  "artist": "Traversi, Gaspare, 1722 or 1723-1770",
  "date": "18th century",
  "where": "National Museum, Warsaw, Warsaw, Poland",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/job38mvvfknrnvucwwqxqzp0.jpg",
  "refs": [
   "Job 1:1, 2:1-10"
  ],
  "days": [
   "Year B Proper 22nd Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/57623",
  "licence": "Public domain",
  "attribution": "Traversi, Gaspare, 1722 or 1723-1770. Job Mocked by His Wife, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 57626,
  "title": "Job and His Daughters",
  "artist": null,
  "date": "5th century",
  "where": "Biblioteca Nazionale Vittorio Emanuele III, Naples, Italy",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/job389s321wxqz.jpg",
  "refs": [
   "Job 42:1-6, 10-17"
  ],
  "days": [
   "Year B Proper 25th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/57626",
  "licence": "Public domain",
  "attribution": "Job and His Daughters, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 57634,
  "title": "Job on the Ash Heap",
  "artist": "Ribera, Jusepe de, 1591-1652",
  "date": "ca. 1630",
  "where": "Private collection",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/job202kfkgob93jd62bfzp.jpg",
  "refs": [
   "Job 1:1, 2:1-10"
  ],
  "days": [
   "Year B Proper 22nd Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/57634",
  "licence": "Public domain",
  "attribution": "Ribera, Jusepe de, 1591-1652. Job on the Ash Heap, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 57653,
  "title": "Lions",
  "artist": null,
  "date": "13th century",
  "where": "Vatopedi Monastery, Mount Athos, Greece",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/jobVPEDI590fol29v.jpg",
  "refs": [
   "Job 4:10-11"
  ],
  "days": [],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/57653",
  "licence": "Public domain",
  "attribution": "Lions, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 57661,
  "title": "YHWH Responds to Job",
  "artist": null,
  "date": "12th century",
  "where": "Monastery of Great Lavra, Mount Athos, Greece",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/jobLB100fol165.jpg",
  "refs": [
   "Job 38:1-7, (34-41)",
   "Job 38:1-11"
  ],
  "days": [
   "Year B Proper 24th Sunday",
   "Year B Proper 7th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/57661",
  "licence": "Public domain",
  "attribution": "YHWH Responds to Job, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 57662,
  "title": "Job Finishes His Defense",
  "artist": null,
  "date": "12th century",
  "where": "Monastery of Great Lavra, Mount Athos, Greece",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/jobLB100fol124.jpg",
  "refs": [
   "Job 29"
  ],
  "days": [],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/57662",
  "licence": "CC0",
  "attribution": "Job Finishes His Defense, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 57663,
  "title": "Death of Job",
  "artist": null,
  "date": "1100-1125",
  "where": "Biblioteca apostolica vaticana, Vatican City",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/jobVAT1231fol453.jpg",
  "refs": [
   "Job 42:1-6, 10-17"
  ],
  "days": [
   "Year B Proper 25th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/57663",
  "licence": "Public domain",
  "attribution": "Death of Job, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 57665,
  "title": "Adversary of Job",
  "artist": null,
  "date": "1100-1125",
  "where": "Biblioteca apostolica vaticana, Vatican City",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/jobVAT1231fol240v.jpg",
  "refs": [
   "Job 16:10-14"
  ],
  "days": [],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/57665",
  "licence": "Public domain",
  "attribution": "Adversary of Job, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 57668,
  "title": "Anger of God",
  "artist": null,
  "date": "ca. 1300",
  "where": "Greek Patriarchal Library, Jerusalem, Israel",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/jobTAPHOU5fol90.jpg",
  "refs": [
   "Job 9:13"
  ],
  "days": [],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/57668",
  "licence": "Public domain",
  "attribution": "Anger of God, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 57669,
  "title": "Lions and Serpent",
  "artist": null,
  "date": "ca. 1300",
  "where": "Greek Patriarchal Library, Jerusalem, Israel",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/jobTAPHOU5fol58.jpg",
  "refs": [
   "Job 4:10-11"
  ],
  "days": [],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/57669",
  "licence": "Public domain",
  "attribution": "Lions and Serpent, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 57679,
  "title": "Restoration of Job",
  "artist": null,
  "date": "9th century",
  "where": "Monastery of St. John the Theologian, Patmos, Greece",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/jobPAT171p507.jpg",
  "refs": [
   "Job 42:1-6, 10-17",
   "Job 42:11"
  ],
  "days": [
   "Year B Proper 25th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/57679",
  "licence": "Public domain",
  "attribution": "Restoration of Job, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 57682,
  "title": "Eliphaz Speaks",
  "artist": null,
  "date": "9th century",
  "where": "Monastery of St. John the Theologian, Patmos, Greece",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/jobPAT171p75.jpg",
  "refs": [
   "Job 4:1"
  ],
  "days": [],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/57682",
  "licence": "Public domain",
  "attribution": "Eliphaz Speaks, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 57742,
  "title": "Spirit of Justice",
  "artist": "Jennewein, Carl Paul, 1890-1978",
  "date": "1961",
  "where": "Rayburn House Office Building, Washington, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Anonymous_photo_Spirit_of_Justice_(Washington_D.C.,_U.S.A.).jpg",
  "refs": [
   "Psalm 99"
  ],
  "days": [
   "Year A Proper 24th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/57742",
  "licence": "Public domain",
  "attribution": "Jennewein, Carl Paul, 1890-1978. Spirit of Justice, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 57744,
  "title": "Winter in Southern Louisiana",
  "artist": "Woodward, Ellsworth, 1861-1939",
  "date": "1911",
  "where": "Mississippi Museum of Art, Jackson, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/E_Woodward_Winter_in_Southern_Louisiana.jpg",
  "refs": [
   "Psalm 96:1-9, (10-13)"
  ],
  "days": [
   "Year A Proper 24th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/57744",
  "licence": "Public domain",
  "attribution": "Woodward, Ellsworth, 1861-1939. Winter in Southern Louisiana, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 57767,
  "title": "Ark of the Covenant",
  "artist": null,
  "date": "ca. 1400-1500",
  "where": "Museum Meermanno, The Hague, Netherlands",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/arkcov92jk90k87.jpg",
  "refs": [
   "Joshua 3:7-17"
  ],
  "days": [
   "Year A Proper 26th Sunday",
   "Year A Proper 27th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/57767",
  "licence": "Public domain",
  "attribution": "Ark of the Covenant, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 57768,
  "title": "Let Justice Roll Down Like Waters",
  "artist": "Conwill, Houston, 1947-2016",
  "date": "1993",
  "where": "Yerba Buena Gardens, San Francisco, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/just14001689723_3d956873b7_o.jpg",
  "refs": [
   "Amos 5:18-24",
   "Amos 6:1a, 4-7"
  ],
  "days": [
   "Year A Proper 27th Sunday",
   "Year B Proper 23rd Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/57768",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Conwill, Houston, 1947-2016. Let Justice Roll Down Like Waters, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: https://www.flickr.com/photos/elf-8/14001689723/ - CC BY-NC-ND 2.0."
 },
 {
  "id": 57773,
  "title": "Sunday School",
  "artist": null,
  "date": "2010",
  "where": "Korean Central Presbyterian Church, Centreville, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Kor14253dx3s1o9.jpg",
  "refs": [
   "Psalm 78:1-7"
  ],
  "days": [
   "Year A Proper 27th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/57773",
  "licence": "CC BY 2.0",
  "attribution": "Sunday School, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 57807,
  "title": "Pastoral Visit, Virginia",
  "artist": "Brooke, Richard Norris, 1847-1920",
  "date": "1881",
  "where": "National Gallery of Art (U.S.), Washington, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/pastor9832jh78rfvbn.jpg",
  "refs": [
   "Ephesians 1:11-23",
   "Psalm 25:1-10"
  ],
  "days": [
   "Year C Advent 1st Sunday",
   "",
   "Year A Reign of Christ"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/57807",
  "licence": "Public domain",
  "attribution": "Brooke, Richard Norris, 1847-1920. Pastoral Visit, Virginia, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 57839,
  "title": "Coral Reef near Curacao",
  "artist": null,
  "date": "2013",
  "where": "Coral Reef near Curaçao, Netherlands Antilles",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/9721975358_e82reef.jpg",
  "refs": [
   "Psalm 150"
  ],
  "days": [
   "Year C Easter 2nd Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/57839",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Coral Reef near Curacao, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: https://www.flickr.com/photos/dfinney23/9721975358/."
 },
 {
  "id": 57913,
  "title": "Snow-covered Landscape",
  "artist": "Renoir, Auguste, 1841-1919",
  "date": "1875",
  "where": "Musée de l'Orangerie, Paris, France",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/snow698tuihjfbv24563y4utjgk.jpg",
  "refs": [
   "Psalm 147"
  ],
  "days": [
   "Year B Christmas 2nd Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/57913",
  "licence": "Public domain",
  "attribution": "Renoir, Auguste, 1841-1919. Snow-covered Landscape, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 57921,
  "title": "Gust of Wind",
  "artist": "Courbet, Gustave, 1819-1877",
  "date": "1865",
  "where": "Museum of Fine Arts, Houston, Houston, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/wind2938jk760978bb6drc.jpg",
  "refs": [
   "Psalm 29"
  ],
  "days": [
   "Year B Trinity Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/57921",
  "licence": "Public domain",
  "attribution": "Courbet, Gustave, 1819-1877. Gust of Wind, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 57933,
  "title": "Harvest Moon",
  "artist": "Palmer, Samuel, 1805-1881",
  "date": "ca. 1833",
  "where": "Yale Center for British Art, New Haven, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/moon3278ijt762145drt34hj.jpg",
  "refs": [
   "Psalm 81:1, 10-16"
  ],
  "days": [
   "Year B Proper 4th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/57933",
  "licence": "Public domain",
  "attribution": "Palmer, Samuel, 1805-1881. Harvest Moon, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 57934,
  "title": "Gleaners",
  "artist": "Millet, Jean François, 1814-1875",
  "date": "1857",
  "where": "Musée d'Orsay, Paris, France",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/millet92j4738bvhfiasg.jpg",
  "refs": [
   "Mark 2:23-3:6"
  ],
  "days": [
   "Year B Proper 4th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/57934",
  "licence": "Public domain",
  "attribution": "Millet, Jean François, 1814-1875. Gleaners, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 57941,
  "title": "Hand of God",
  "artist": "Quinn, Lorenzo, 1966-",
  "date": "2013",
  "where": "Royal Exchange, London, London, United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/hand2893jhdfs45tfcz0kj.jpg",
  "refs": [
   "Psalm 138"
  ],
  "days": [
   "Year B Proper 5th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/57941",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Quinn, Lorenzo, 1966-. Hand of God, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: https://www.flickr.com/photos/korephotos/6350476010."
 },
 {
  "id": 57945,
  "title": "Caring for Children at the Orphanage in Haarlem: three Acts of Mercy",
  "artist": "Bray, Jan de, approximately 1627-1607",
  "date": "1663",
  "where": "Frans Hals Museum, Haarlem, Netherlands",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/children398266ed76.jpg",
  "refs": [
   "Mark 3:20-35"
  ],
  "days": [
   "Year B Proper 5th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/57945",
  "licence": "Public domain",
  "attribution": "Bray, Jan de, approximately 1627-1607. Caring for Children at the Orphanage in Haarlem: three Acts of Mercy, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 57953,
  "title": "Storm on the Sea of Galilee",
  "artist": "Rembrandt Harmenszoon van Rijn, 1606-1669",
  "date": "1633",
  "where": "Unknown",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/rembrandt9023r9gggyty6r54e.jpg",
  "refs": [
   "Mark 4:35-41",
   "Psalm 93"
  ],
  "days": [
   "Year A Ascension of the Lord",
   "Year B Ascension of the Lord",
   "Year C Ascension of the Lord",
   "Year B Proper 7th Sunday"
  ],
  "essay": "https://thevcs.org/over-troubled-water/waters-rise?first=3046",
  "act": "https://act.library.vanderbilt.edu/artworks/57953",
  "licence": "Public domain",
  "attribution": "Rembrandt Harmenszoon van Rijn, 1606-1669. Storm on the Sea of Galilee, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 57962,
  "title": "Heals the Woman with a Hemorrhage",
  "artist": null,
  "date": "6th century",
  "where": "Basilica of Sant'Apollinare Nuovo, Ravenna, Italy",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/woman2389yrgiuyg16f.jpg",
  "refs": [
   "Matthew 9:20-22",
   "Mark 5:21-43",
   "Luke 8:43-47"
  ],
  "days": [
   "Year B Proper 8th Sunday"
  ],
  "essay": "https://thevcs.org/woman-issue-blood/i-will-seek-your-face",
  "act": "https://act.library.vanderbilt.edu/artworks/57962",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Heals the Woman with a Hemorrhage, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: https://www.flickr.com/photos/damiavos/14125575880."
 },
 {
  "id": 57993,
  "title": "Ruth and Naomi",
  "artist": "Victors, Jan, 1619-1676",
  "date": "1653",
  "where": "Agnes Etherington Art Centre, Kingston, Canada",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/ruth267dc1290hixz06.jpg",
  "refs": [
   "Ruth 3:1-5; 4:13-17",
   "Ruth 1:1-18"
  ],
  "days": [
   "Year B Proper 27th Sunday",
   "Year B Proper 26th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/57993",
  "licence": "Public domain",
  "attribution": "Victors, Jan, 1619-1676. Ruth and Naomi, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 57994,
  "title": "Scribe Stood to Test Jesus",
  "artist": "Tissot, James, 1836-1902",
  "date": "1886-1894",
  "where": "Brooklyn Museum, Brooklyn, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/tempt82h2367drpo1.jpg",
  "refs": [
   "Mark 7:1-8, 14-15, 21-23",
   "Luke 6:20-31",
   "Mark 12:28-34"
  ],
  "days": [
   "Year C All Saints Day",
   "Year B Proper 17th Sunday",
   "Year B Proper 26th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/57994",
  "licence": "Public domain",
  "attribution": "Tissot, James, 1836-1902. Scribe Stood to Test Jesus, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58171,
  "title": "Good Samaritan",
  "artist": "Bassano, Jacopo, approximately 1518-1592",
  "date": "ca. 1562-1563",
  "where": "National Gallery (Great Britain), Westminster, United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/good3562456d3fd.jpg",
  "refs": [
   "Luke 10:25-37"
  ],
  "days": [
   "Year C Proper 10th Sunday"
  ],
  "essay": "https://thevcs.org/good-samaritan/go-and-do-likewise",
  "act": "https://act.library.vanderbilt.edu/artworks/58171",
  "licence": "Public domain",
  "attribution": "Bassano, Jacopo, approximately 1518-1592. Good Samaritan, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58179,
  "title": "Flight by Night",
  "artist": "Tanner, Henry Ossawa, 1859-1937",
  "date": "1923",
  "where": "Metropolitan Museum of Art, New York, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Ossawa_Tanner_Henry_Flight_into_Egypt.jpg",
  "refs": [
   "Matthew 2:13-23"
  ],
  "days": [
   "Year A Christmas 1st Sunday"
  ],
  "essay": "https://thevcs.org/flight-egypt/flight-night",
  "act": "https://act.library.vanderbilt.edu/artworks/58179",
  "licence": "Public domain",
  "attribution": "Tanner, Henry Ossawa, 1859-1937. Flight by Night, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58310,
  "title": "St Joseph and the Christ Child",
  "artist": "Greco, 1541?-1614",
  "date": "ca. 1600",
  "where": "Museum of Santa Cruz, Toledo, Spain",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/joseph23289h387h73sg276f6.jpg",
  "refs": [
   "Matthew 2:13-23"
  ],
  "days": [
   "Year A Christmas 1st Sunday"
  ],
  "essay": "https://thevcs.org/return-egypt/shepherding-good-shepherd/",
  "act": "https://act.library.vanderbilt.edu/artworks/58310",
  "licence": "Public domain",
  "attribution": "Greco, 1541?-1614. St Joseph and the Christ Child, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58311,
  "title": "Massacre of the Innocents",
  "artist": "Poussin, Nicolas, 1594?-1665",
  "date": "ca. 1632-1637",
  "where": "Musée Condé, Chantilly, France",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/poussin3e37eg67eg63fxp1.jpg",
  "refs": [
   "Matthew 2:13-23"
  ],
  "days": [
   "Year A Christmas 1st Sunday"
  ],
  "essay": "https://thevcs.org/massacre-innocents/tragedy-and-nobility/",
  "act": "https://act.library.vanderbilt.edu/artworks/58311",
  "licence": "Public domain",
  "attribution": "Poussin, Nicolas, 1594?-1665. Massacre of the Innocents, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58315,
  "title": "Baptism of the Chamberlain of Queen Candace of Ethiopia, detail",
  "artist": "Attributed to Hendrik van Balen and Jan Brueghel (II)",
  "date": "ca. 1625-1630",
  "where": "Mauritshuis, The Hague, Netherlands",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/eunuch2378hvor7326g.jpg",
  "refs": [
   "Acts 8:26-40"
  ],
  "days": [
   "Year B Easter 5th Sunday",
   ""
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/58315",
  "licence": "Public domain",
  "attribution": "Attributed to Hendrik van Balen and Jan Brueghel (II). Baptism of the Chamberlain of Queen Candace of Ethiopia, detail, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58316,
  "title": "Baptism of the Chamberlain of Queen Candace of Ethiopia",
  "artist": "Anonymous",
  "date": "ca. 1615-1635",
  "where": "British Museum, London, United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/eunuch1039bhi2456.jpg",
  "refs": [
   "Acts 8:26-40"
  ],
  "days": [
   "Year B Easter 5th Sunday",
   ""
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/58316",
  "licence": "Public domain",
  "attribution": "Anonymous. Baptism of the Chamberlain of Queen Candace of Ethiopia, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58317,
  "title": "Baptism of the Eunuch, detail",
  "artist": "Rembrandt Harmenszoon van Rijn, 1606-1669",
  "date": "1626",
  "where": "Museum Catharijneconvent, Utrecht, Netherlands",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/eunuch23897rem2908837.jpg",
  "refs": [
   "Acts 8:26-40"
  ],
  "days": [
   "Year B Easter 5th Sunday",
   ""
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/58317",
  "licence": "Public domain",
  "attribution": "Rembrandt Harmenszoon van Rijn, 1606-1669. Baptism of the Eunuch, detail, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58320,
  "title": "Sermon on the Mount",
  "artist": "Rosselli, Cosimo, 1439-1507",
  "date": "1481-1482",
  "where": "Sistine Chapel, Vatican City",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/sermon960578gf4e12.jpg",
  "refs": [
   "Matthew 5:1-12",
   "Matthew 7:21-29"
  ],
  "days": [
   "Year A Epiphany 4thSunday",
   "Year A Epiphany 9th Sunday"
  ],
  "essay": "https://thevcs.org/sermon-mount/teaching-action",
  "act": "https://act.library.vanderbilt.edu/artworks/58320",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Rosselli, Cosimo, 1439-1507. Sermon on the Mount, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: https://www.flickr.com/photos/snarfel/4287572119."
 },
 {
  "id": 58321,
  "title": "Sermon on the Mount",
  "artist": "Angelico, fra, approximately 1400-1455",
  "date": "ca. 1442",
  "where": "Museo Nazionale di San Marco, Florence, Italy",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Fra_Angelico_Sermon_on_the_Mount (1).jpg",
  "refs": [
   "Matthew 5:1-12",
   "Matthew 7:21-29"
  ],
  "days": [
   "Year A Epiphany 4thSunday",
   "Year A Epiphany 9th Sunday"
  ],
  "essay": "https://thevcs.org/sermon-mount/summit-law",
  "act": "https://act.library.vanderbilt.edu/artworks/58321",
  "licence": "Public domain",
  "attribution": "Angelico, fra, approximately 1400-1455. Sermon on the Mount, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58322,
  "title": "Annunciation, Gabriel",
  "artist": null,
  "date": "ca. 1151",
  "where": "Church of Santa Maria dell'Ammiraglio, Palermo, Italy",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/annun-gab4389jsd67548.jpg",
  "refs": [
   "Luke 1:26-38",
   "Luke 11:1-13"
  ],
  "days": [
   "Year B Advent 4th Sunday",
   "Year C Proper 12th Sunday"
  ],
  "essay": "https://thevcs.org/lords-prayer/virgin-prays-thy-will-be-done",
  "act": "https://act.library.vanderbilt.edu/artworks/58322",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Annunciation, Gabriel, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: https://www.flickr.com/photos/overton_cat/29194939633."
 },
 {
  "id": 58323,
  "title": "Bible of the Poor",
  "artist": null,
  "date": "1450-1465",
  "where": "Cleveland Museum of Art, Cleveland, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/biblia3897fbg25z0.jpg",
  "refs": [
   "Matthew 4:1-11",
   "Luke 11:1-13",
   "Luke 4:1-13"
  ],
  "days": [
   "Year A Lent 1st Sunday",
   "Year C Proper 12th Sunday",
   "Year C Lent 1st Sunday"
  ],
  "essay": "https://thevcs.org/lords-prayer/tempted-satan-and-delivered-through-christ",
  "act": "https://act.library.vanderbilt.edu/artworks/58323",
  "licence": "CC0",
  "attribution": "Bible of the Poor, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58325,
  "title": "Christ and the Woman with the Issue of Blood",
  "artist": null,
  "date": "4th century",
  "where": "Catacombs of Saints Marcellinus and Peter, Rome, Italy",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/woman478fh65f67g6y.jpg",
  "refs": [
   "Matthew 9:20-22",
   "Mark 5:21-43",
   "Luke 8:43-47"
  ],
  "days": [
   "Year B Proper 8th Sunday"
  ],
  "essay": "https://thevcs.org/woman-issue-blood/wide-eyed-wonder",
  "act": "https://act.library.vanderbilt.edu/artworks/58325",
  "licence": "Public domain",
  "attribution": "Christ and the Woman with the Issue of Blood, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58327,
  "title": "The Sower III (version 2)",
  "artist": "Gogh, Vincent van, 1853-1890",
  "date": "1888",
  "where": "Van Gogh Museum, Amsterdam, Netherlands",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/sower-gogh39uh23erf.jpg",
  "refs": [
   "Mark 4:1-11",
   "Luke 8:4-15",
   "Matthew 13:1-9, 18-23"
  ],
  "days": [
   "Year B Proper 6th Sunday",
   "Year A Proper 10th Sunday"
  ],
  "essay": "https://thevcs.org/parable-sower/there-went-out-sower-sow",
  "act": "https://act.library.vanderbilt.edu/artworks/58327",
  "licence": "Public domain",
  "attribution": "Gogh, Vincent van, 1853-1890. The Sower III (version 2), from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58328,
  "title": "There Will Be No Miracles Here",
  "artist": "Coley, Nathan, 1967-",
  "date": "2007-2009",
  "where": "Scottish National Gallery of Modern Art, Edinburgh, United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/miracles36d6t.jpg",
  "refs": [
   "Mark 6:1-13",
   "Luke 4:21-30"
  ],
  "days": [
   "Year B Proper 9th Sunday",
   "Year C Epiphany 4thSunday"
  ],
  "essay": "https://thevcs.org/open-unexpected/there-will-be-no-miracles-here",
  "act": "https://act.library.vanderbilt.edu/artworks/58328",
  "licence": "CC BY-SA 4.0",
  "attribution": "Coley, Nathan, 1967-. There Will Be No Miracles Here, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58329,
  "title": "Entry into Jerusalem",
  "artist": "T'oros Roslin, active 13th century",
  "date": "1262",
  "where": "Walters Art Museum, Baltimore, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/entry-toros893uhif.jpg",
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
  "essay": "https://thevcs.org/christs-triumphal-entry/image-and-prophecy",
  "act": "https://act.library.vanderbilt.edu/artworks/58329",
  "licence": "CC0",
  "attribution": "T'oros Roslin, active 13th century. Entry into Jerusalem, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58331,
  "title": "Wise Virgins",
  "artist": "Küng, Erhart, approximately 1420-1507",
  "date": "ca. 1460-1481",
  "where": "Bern Minster, Bern, Switzerland",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/virgins287g301mz0.jpg",
  "refs": [
   "Matthew 25:1-13"
  ],
  "days": [
   "Year A Proper 27th Sunday"
  ],
  "essay": "https://thevcs.org/wise-and-foolish-maidens/heart-it-all",
  "act": "https://act.library.vanderbilt.edu/artworks/58331",
  "licence": "CC BY 3.0",
  "attribution": "Küng, Erhart, approximately 1420-1507. Wise Virgins, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58332,
  "title": "Allegory of Mercy",
  "artist": null,
  "date": "1342-1352",
  "where": "Bigallo Museum, Florence, Italy",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Madonna_miseri3289yd76t.jpg",
  "refs": [
   "Matthew 25:31-46"
  ],
  "days": [
   "Year A Reign of Christ"
  ],
  "essay": "https://thevcs.org/sheep-and-goats/what-you-give-what-you-get",
  "act": "https://act.library.vanderbilt.edu/artworks/58332",
  "licence": "Public domain",
  "attribution": "Allegory of Mercy, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58334,
  "title": "Institution of the Eucharist",
  "artist": "Roberti, Ercole de', -1496",
  "date": "ca. 1490-1499",
  "where": "National Gallery (Great Britain), London, United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/euchar9028got98238w976e.jpg",
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
  "essay": "https://thevcs.org/last-supper/last-supper",
  "act": "https://act.library.vanderbilt.edu/artworks/58334",
  "licence": "Public domain",
  "attribution": "Roberti, Ercole de', -1496. Institution of the Eucharist, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58354,
  "title": "Annunciation, Mary",
  "artist": null,
  "date": "ca. 1151",
  "where": "Palatine Chapel, Palermo, Italy",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/annun-mary2398e6trds.jpg",
  "refs": [
   "Luke 1:26-38",
   "Luke 11:1-13"
  ],
  "days": [
   "Year B Advent 4th Sunday",
   "Year C Proper 12th Sunday"
  ],
  "essay": "https://thevcs.org/lords-prayer/virgin-prays-thy-will-be-done",
  "act": "https://act.library.vanderbilt.edu/artworks/58354",
  "licence": "CC BY 2.0",
  "attribution": "Annunciation, Mary, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58355,
  "title": "Christ Bound and Crowned with Thorns",
  "artist": "Solario, Andrea, approximately 1465-approximately 1520",
  "date": "ca. 1509",
  "where": "Philadelphia Museum of Art, Philadelphia, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/thorns2398ygty65tr.jpg",
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
  "essay": "https://thevcs.org/crowning-and-robing/christ-bound",
  "act": "https://act.library.vanderbilt.edu/artworks/58355",
  "licence": "Public domain",
  "attribution": "Solario, Andrea, approximately 1465-approximately 1520. Christ Bound and Crowned with Thorns, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58356,
  "title": "Crucifixion",
  "artist": "Mantegna, Andrea, 1431-1506",
  "date": "1457-1459",
  "where": "Louvre, Paris, France",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/mantegna28hu73ftvgs89ygtyfcf.jpg",
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
  "essay": "https://thevcs.org/casting-lots/die-cast",
  "act": "https://act.library.vanderbilt.edu/artworks/58356",
  "licence": "Public domain",
  "attribution": "Mantegna, Andrea, 1431-1506. Crucifixion, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58357,
  "title": "Passion and Crucifixion of Christ",
  "artist": "Luini, Bernardino, 1475?-1533?",
  "date": "1529",
  "where": "Church of Santa Maria degli Angeli, Lugano, Switzerland",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/luini39ijg782g76gvhj.jpg",
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
  "essay": "https://thevcs.org/casting-lots/opposite-charity",
  "act": "https://act.library.vanderbilt.edu/artworks/58357",
  "licence": "Public domain",
  "attribution": "Luini, Bernardino, 1475?-1533?. Passion and Crucifixion of Christ, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58358,
  "title": "Lamentation over the Dead Christ",
  "artist": "Mantegna, Andrea, 1431-1506",
  "date": "ca. 1483",
  "where": "Pinacoteca di Brera, Milan, Italy",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/dead98jnge78tg.jpg",
  "refs": [
   "Matthew 27:57-66",
   "Mark 15:1-39, (40-47)",
   "John 19:38-42"
  ],
  "days": [
   "Year B Liturgy of Pass",
   "Year A Holy Saturday"
  ],
  "essay": "https://thevcs.org/burial-christ/burial-christ",
  "act": "https://act.library.vanderbilt.edu/artworks/58358",
  "licence": "Public domain",
  "attribution": "Mantegna, Andrea, 1431-1506. Lamentation over the Dead Christ, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58359,
  "title": "Entombment (or Christ being carried to his Tomb)",
  "artist": "Michelangelo Buonarroti, 1475-1564",
  "date": "ca. 1500-1501",
  "where": "National Gallery (Great Britain), London, United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/michel3987tgyr5ft.jpg",
  "refs": [
   "Matthew 27:57-66",
   "John 19:38-42"
  ],
  "days": [
   "Year A Holy Saturday"
  ],
  "essay": "https://thevcs.org/burial-christ/burial-christ",
  "act": "https://act.library.vanderbilt.edu/artworks/58359",
  "licence": "Public domain",
  "attribution": "Michelangelo Buonarroti, 1475-1564. Entombment (or Christ being carried to his Tomb), from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58360,
  "title": "St. Sisoes at the Tomb of Alexander of Macedon",
  "artist": null,
  "date": "1500-1599",
  "where": "Varlaam Monastery, Meteora, Greece",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Varlaam52398hundyu78utgy.jpg",
  "refs": [
   "Mark 9:38-50"
  ],
  "days": [
   "Year B Proper 21st Sunday",
   "Year B Proper 28th Sunday"
  ],
  "essay": "https://thevcs.org/road-oblivion/i-cannot-believe-my-eyes",
  "act": "https://act.library.vanderbilt.edu/artworks/58360",
  "licence": "Public domain",
  "attribution": "St. Sisoes at the Tomb of Alexander of Macedon, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58361,
  "title": "New Harmony",
  "artist": "Klee, Paul, 1879-1940",
  "date": "1936",
  "where": "Solomon R. Guggenheim Museum, New York, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/klee98932hu67tf34r5f4.jpg",
  "refs": [
   "Mark 10:17-31"
  ],
  "days": [
   "Year B Proper 23rd Sunday"
  ],
  "essay": "https://thevcs.org/rich-young-man/hearing-colours-newly-arranged",
  "act": "https://act.library.vanderbilt.edu/artworks/58361",
  "licence": "Public domain",
  "attribution": "Klee, Paul, 1879-1940. New Harmony, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58362,
  "title": "Composite Camel with Attendant",
  "artist": null,
  "date": "ca. 1550-1575",
  "where": "Metropolitan Museum of Art, New York, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/camel54908urfiu82t5.jpg",
  "refs": [
   "Mark 10:17-31"
  ],
  "days": [
   "Year B Proper 23rd Sunday"
  ],
  "essay": "https://thevcs.org/rich-young-man/visualizing-impossibility",
  "act": "https://act.library.vanderbilt.edu/artworks/58362",
  "licence": "CC0",
  "attribution": "Composite Camel with Attendant, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58363,
  "title": "Annunciation with St. Margaret and St. Ansanus",
  "artist": "Martini, Simone, 1283-1344, Lippo Memmi",
  "date": "1333",
  "where": "Uffizi Gallery, Florence, Italy",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/martini32897gh56trgf.jpg",
  "refs": [
   "Luke 1:26-38"
  ],
  "days": [
   "Year B Advent 4th Sunday",
   "Year C Day of Pentecost"
  ],
  "essay": "https://thevcs.org/annunciation/angels-greeting",
  "act": "https://act.library.vanderbilt.edu/artworks/58363",
  "licence": "Public domain",
  "attribution": "Martini, Simone, 1283-1344, Lippo Memmi. Annunciation with St. Margaret and St. Ansanus, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58364,
  "title": "Annunciation",
  "artist": "Lippi, Filippo, approximately 1406-1469",
  "date": "ca. 1450-1453",
  "where": "National Gallery (Great Britain), London, United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/lippi398hubd78ytg.jpg",
  "refs": [
   "Luke 1:26-38"
  ],
  "days": [
   "Year B Advent 4th Sunday"
  ],
  "essay": "https://thevcs.org/annunciation/openings",
  "act": "https://act.library.vanderbilt.edu/artworks/58364",
  "licence": "Public domain",
  "attribution": "Lippi, Filippo, approximately 1406-1469. Annunciation, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58365,
  "title": "Visitation",
  "artist": "Pontormo, Jacopo da, 1494-1556",
  "date": "1514-1516",
  "where": "Santissima Annunziata (Florence), Florence, Italy",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/visit2389328987fbhj476tfcfr5.jpg",
  "refs": [
   "Luke 1:39-57"
  ],
  "days": [
   "Year A Visitation of Mary to Elizabeth"
  ],
  "essay": "https://thevcs.org/quickening-creation/mary-ark",
  "act": "https://act.library.vanderbilt.edu/artworks/58365",
  "licence": "CC BY 3.0",
  "attribution": "Pontormo, Jacopo da, 1494-1556. Visitation, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58366,
  "title": "Visitation",
  "artist": null,
  "date": "14th century",
  "where": "Timios Stavros (Pelendri), Pelendri, Cyprus",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Visitation_Pelendri2389uhd78g.jpg",
  "refs": [
   "Luke 1:39-57"
  ],
  "days": [
   "Year A Visitation of Mary to Elizabeth",
   ""
  ],
  "essay": "https://thevcs.org/quickening-creation/re-visiting-creation",
  "act": "https://act.library.vanderbilt.edu/artworks/58366",
  "licence": "Public domain",
  "attribution": "Visitation, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58367,
  "title": "Visitation",
  "artist": "Greco, 1541?-1614",
  "date": "ca. 1610-1614",
  "where": "Dumbarton Oaks, Washington, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/La_Visitacion_El_Greco3298uhduyu76.jpg",
  "refs": [
   "Luke 1:39-57"
  ],
  "days": [
   "Year A Visitation of Mary to Elizabeth"
  ],
  "essay": "https://thevcs.org/quickening-creation/beginning-again",
  "act": "https://act.library.vanderbilt.edu/artworks/58367",
  "licence": "Public domain",
  "attribution": "Greco, 1541?-1614. Visitation, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58368,
  "title": "Adoration of the Shepherds",
  "artist": "Maíno, Juan Bautista, 1581-1649",
  "date": "1615-1620",
  "where": "Meadows Museum, Dallas, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/nativity079iyjg89iuyjg57utjgm.jpg",
  "refs": [
   "Luke 2:(1-7), 8-20"
  ],
  "days": [
   "Year A Nativity of the Lord Proper I"
  ],
  "essay": "https://thevcs.org/adoration-shepherds/world-turned-upside-down",
  "act": "https://act.library.vanderbilt.edu/artworks/58368",
  "licence": "Public domain",
  "attribution": "Maíno, Juan Bautista, 1581-1649. Adoration of the Shepherds, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58369,
  "title": "Nativity with the Annunciation to the Shepherds and the Adoration of the Shepherds",
  "artist": null,
  "date": "1370-1371",
  "where": "National Gallery (Great Britain), London, United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/cione84378ryu4361245e4s.jpg",
  "refs": [
   "Luke 2:(1-7), 8-20"
  ],
  "days": [
   "Year A Nativity of the Lord Proper I"
  ],
  "essay": "https://thevcs.org/adoration-shepherds/people-walked-darkness",
  "act": "https://act.library.vanderbilt.edu/artworks/58369",
  "licence": "Public domain",
  "attribution": "Nativity with the Annunciation to the Shepherds and the Adoration of the Shepherds, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58370,
  "title": "Good Samaritan",
  "artist": null,
  "date": "500-599",
  "where": "Cattedrale Maria Santissima Achiropita (Rossano), Rossano, Italy",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/good437847654763684hbr.jpg",
  "refs": [
   "Luke 10:25-37"
  ],
  "days": [
   "Year C Proper 10th Sunday"
  ],
  "essay": "https://thevcs.org/good-samaritan/samaritan-jesus",
  "act": "https://act.library.vanderbilt.edu/artworks/58370",
  "licence": "Public domain",
  "attribution": "Good Samaritan, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58373,
  "title": "Kitchen Scene with Christ at Emmaus",
  "artist": "Beuckelaer, Joachim, approximately 1533-1575",
  "date": "ca. 1560-1565",
  "where": "Mauritshuis, The Hague, Netherlands",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/kitchenscene4yr29o1.jpg",
  "refs": [
   "Luke 24:13-35"
  ],
  "days": [
   "Year A Easter 3rd Sunday"
  ],
  "essay": "https://thevcs.org/road-emmaus/abundance-and-dissimulation",
  "act": "https://act.library.vanderbilt.edu/artworks/58373",
  "licence": "Public domain",
  "attribution": "Beuckelaer, Joachim, approximately 1533-1575. Kitchen Scene with Christ at Emmaus, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58374,
  "title": "Christ Disappearing at Emmaus",
  "artist": "Fuseli, Henry, 1741-1825",
  "date": "1792",
  "where": "Yale Center for British Art, New Haven, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/christdisappearing5r1mp0x8.jpg",
  "refs": [
   "Luke 24:13-49"
  ],
  "days": [
   "Year A Resurrection of the Lord"
  ],
  "essay": "https://thevcs.org/road-emmaus/visible-vanishing",
  "act": "https://act.library.vanderbilt.edu/artworks/58374",
  "licence": "Public domain",
  "attribution": "Fuseli, Henry, 1741-1825. Christ Disappearing at Emmaus, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58375,
  "title": "Preaching of Saint John the Baptist",
  "artist": "Bruegel, Pieter, 1564-1638",
  "date": "1566",
  "where": "Museum of Fine Arts, Budapest, Budapest, Hungary",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/sermon328956732huc.jpg",
  "refs": [
   "John 1:29-42",
   "Luke 3:7-18"
  ],
  "days": [
   "Year A Epiphany 2nd Sunday",
   "Year C Advent 3rd Sunday",
   "Year B Advent 2nd  Sunday"
  ],
  "essay": "https://thevcs.org/misidentifying-prophet/picturing-attention-and-inattention",
  "act": "https://act.library.vanderbilt.edu/artworks/58375",
  "licence": "Public domain",
  "attribution": "Bruegel, Pieter, 1564-1638. Preaching of Saint John the Baptist, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58376,
  "title": "Christ Blessing Saint John the Baptist",
  "artist": "Moretto, da Brescia, 1498?-1554",
  "date": "ca. 1520-1523",
  "where": "National Gallery, London, United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/christblessing1r4f6d9n.jpg",
  "refs": [
   "John 1:29-42"
  ],
  "days": [
   "Year A Epiphany 2nd Sunday"
  ],
  "essay": "https://thevcs.org/misidentifying-prophet/postures-humility",
  "act": "https://act.library.vanderbilt.edu/artworks/58376",
  "licence": "Public domain",
  "attribution": "Moretto, da Brescia, 1498?-1554. Christ Blessing Saint John the Baptist, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58377,
  "title": "Christ and the Samaritan Woman",
  "artist": "Fontana, Lavinia, 1552-1614",
  "date": "1607",
  "where": "National Museum of Capodimonte, Naples, Italy",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/christsamaritan45rfvb13.jpg",
  "refs": [
   "John 4:5-42"
  ],
  "days": [
   "Year A Lent 3rd Sunday"
  ],
  "essay": "https://thevcs.org/woman-well/pioneer-empowered",
  "act": "https://act.library.vanderbilt.edu/artworks/58377",
  "licence": "Public domain",
  "attribution": "Fontana, Lavinia, 1552-1614. Christ and the Samaritan Woman, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58379,
  "title": "Christ at the Pool of Bethesda",
  "artist": "Hogarth, William, 1697-1764",
  "date": "1735-1736",
  "where": "St Bartholomew's Hospital, Bart Museum, London, United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/christbethesda4r1m5g9s.jpg",
  "refs": [
   "John 5:1-9"
  ],
  "days": [
   "Year C Easter 6th Sunday"
  ],
  "essay": "https://thevcs.org/pool-bethesda/healing-hospital",
  "act": "https://act.library.vanderbilt.edu/artworks/58379",
  "licence": "CC BY 4.0",
  "attribution": "Hogarth, William, 1697-1764. Christ at the Pool of Bethesda, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58381,
  "title": "Golgotha",
  "artist": "Munch, Edvard, 1863-1944",
  "date": "1900",
  "where": "Munch Museum, Oslo, Norway",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/golgotha92kw05vp.jpg",
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
  "essay": "https://thevcs.org/imaging-trinity/rejected",
  "act": "https://act.library.vanderbilt.edu/artworks/58381",
  "licence": "Public domain",
  "attribution": "Munch, Edvard, 1863-1944. Golgotha, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58383,
  "title": "Trinity, Book of Hours, Royal 2 B XV f. 10v",
  "artist": null,
  "date": "1500",
  "where": "British Library, London, United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/trinityhours85hb1k9z.jpg",
  "refs": [
   "John 10:22-30"
  ],
  "days": [
   "Year C Easter 4th Sunday"
  ],
  "essay": "https://thevcs.org/imaging-trinity/father-and-i-are-one",
  "act": "https://act.library.vanderbilt.edu/artworks/58383",
  "licence": "Public domain",
  "attribution": "Trinity, Book of Hours, Royal 2 B XV f. 10v, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58384,
  "title": "Raising of Lazarus",
  "artist": "Piombo, Sebastiano Luciani, known as del, 1485-1547",
  "date": "1517-1519",
  "where": "National Gallery, London, United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/raisinglazarus27bout19.jpg",
  "refs": [
   "John 11:1-45"
  ],
  "days": [
   "Year A Lent 5th  Sunday"
  ],
  "essay": "https://thevcs.org/i-am-resurrection-and-life/lazarus-come-out",
  "act": "https://act.library.vanderbilt.edu/artworks/58384",
  "licence": "Public domain",
  "attribution": "Piombo, Sebastiano Luciani, known as del, 1485-1547. Raising of Lazarus, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58385,
  "title": "Triptych of the Micault Family",
  "artist": "Vermeyen, Jan Cornelisz, 1500-1559",
  "date": "ca. 1539-1559",
  "where": "Royal Museum of Fine Arts of Belgium, Brussels, Belgium",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/micaultfamily8t3n5b1v.jpg",
  "refs": [
   "John 11:1-45"
  ],
  "days": [
   "Year A Lent 5th  Sunday"
  ],
  "essay": "https://thevcs.org/i-am-resurrection-and-life/unbind-him-and-let-him-go",
  "act": "https://act.library.vanderbilt.edu/artworks/58385",
  "licence": "Public domain",
  "attribution": "Vermeyen, Jan Cornelisz, 1500-1559. Triptych of the Micault Family, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58386,
  "title": "Raising of Lazarus",
  "artist": "Duccio, di Buoninsegna, -1319?",
  "date": "ca. 1310-1311",
  "where": "Kimbell Art Museum, Fort Worth, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/raisinglazarus5ghut193.jpg",
  "refs": [
   "John 11:1-45"
  ],
  "days": [
   "Year A Lent 5th  Sunday"
  ],
  "essay": "https://thevcs.org/i-am-resurrection-and-life/take-away-stone",
  "act": "https://act.library.vanderbilt.edu/artworks/58386",
  "licence": "Public domain",
  "attribution": "Duccio, di Buoninsegna, -1319?. Raising of Lazarus, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58387,
  "title": "Vertumnus",
  "artist": "Arcimboldi, Giuseppe, 1527-1593",
  "date": "1590",
  "where": "Skokloster Castle, Habo Municipality, Sweden",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/vertumnus4g0h1mx8.jpg",
  "refs": [
   "John 15:1-8"
  ],
  "days": [
   "Year B Easter 5th Sunday"
  ],
  "essay": "https://thevcs.org/subversive-horticulture/restoration",
  "act": "https://act.library.vanderbilt.edu/artworks/58387",
  "licence": "Public domain",
  "attribution": "Arcimboldi, Giuseppe, 1527-1593. Vertumnus, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58388,
  "title": "Saint Sebastian",
  "artist": "Sodoma, 1477?-1549",
  "date": "1525",
  "where": "Palazzo Pitti, Florence, Italy",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/saintsebastian23edco91.jpg",
  "refs": [
   "John 15:18-27"
  ],
  "days": [],
  "essay": "https://thevcs.org/disciples-and-world/they-will-persecute-you",
  "act": "https://act.library.vanderbilt.edu/artworks/58388",
  "licence": "Public domain",
  "attribution": "Sodoma, 1477?-1549. Saint Sebastian, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58389,
  "title": "Christ Taking Leave of the Apostles",
  "artist": "Duccio, di Buoninsegna, -1319?",
  "date": "1308-1311",
  "where": "Museo dell'Opera del Duomo, Siena, Italy",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/christleave35ty10px.jpg",
  "refs": [
   "John 16:16-24"
  ],
  "days": [],
  "essay": "https://thevcs.org/presence-beyond-absence/vital-conversations",
  "act": "https://act.library.vanderbilt.edu/artworks/58389",
  "licence": "Public domain",
  "attribution": "Duccio, di Buoninsegna, -1319?. Christ Taking Leave of the Apostles, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58390,
  "title": "Mary Magdalene",
  "artist": "Savoldo, Gian Girolamo, approximately 1480-",
  "date": "ca. 1535-1540",
  "where": "National Gallery, London, United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/marymagdalene30jp1m6v.jpg",
  "refs": [
   "John 20:1-18"
  ],
  "days": [
   "Year B Resurrection of the Lord"
  ],
  "essay": "https://thevcs.org/mary-magdalene-tomb/rising-light",
  "act": "https://act.library.vanderbilt.edu/artworks/58390",
  "licence": "Public domain",
  "attribution": "Savoldo, Gian Girolamo, approximately 1480-. Mary Magdalene, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58391,
  "title": "Ark of the Covenant",
  "artist": null,
  "date": "806-811",
  "where": "Oratory at Germigny-des-Prés, Germigny-des-Prés, France",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/arkcovenant1fgpq956.jpg",
  "refs": [
   "John 20:1-18"
  ],
  "days": [
   "Year A Resurrection of the Lord"
  ],
  "essay": "https://thevcs.org/mary-magdalene-tomb/grave-clothes-lying-there",
  "act": "https://act.library.vanderbilt.edu/artworks/58391",
  "licence": "CC BY-SA 4.0",
  "attribution": "Ark of the Covenant, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58392,
  "title": "Noli me Tangere",
  "artist": "Titian, approximately 1488-1576",
  "date": "ca. 1514",
  "where": "National Gallery, London, United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/nolimetangere5g1m4n7r.jpg",
  "refs": [
   "John 20:1-18"
  ],
  "days": [
   "Year A Resurrection of the Lord"
  ],
  "essay": "https://thevcs.org/noli-me-tangere/heaven-and-earth-converge-meeting-lines",
  "act": "https://act.library.vanderbilt.edu/artworks/58392",
  "licence": "Public domain",
  "attribution": "Titian, approximately 1488-1576. Noli me Tangere, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58393,
  "title": "Christ Displaying His Wounds",
  "artist": "Galli, Giovanni Antonio, 1585-1652",
  "date": "ca. 1625-1635",
  "where": "Perth Museum and Art Gallery, Perth, United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/christwounds4t8x9q1k.jpg",
  "refs": [
   "John 20:19-31"
  ],
  "days": [
   "Year A Easter 2nd Sunday",
   "Year C Easter 2nd Sunday"
  ],
  "essay": "https://thevcs.org/doubting-thomas/because-thou-hast-seen-me",
  "act": "https://act.library.vanderbilt.edu/artworks/58393",
  "licence": "Public domain",
  "attribution": "Galli, Giovanni Antonio, 1585-1652. Christ Displaying His Wounds, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58394,
  "title": "Incredulity of St. Thomas",
  "artist": "Strozzi, Bernardo, 1581-1644",
  "date": "ca. 1620",
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Bernardo_Strozzi_The_Incredulity_of_Saint_Thomas.jpg",
  "refs": [
   "John 20:19-31"
  ],
  "days": [
   "Year A Easter 2nd Sunday",
   "Year B Easter 2nd Sunday",
   "Year C Easter 2nd Sunday"
  ],
  "essay": "https://thevcs.org/doubting-thomas/blessed-are-they-have-not-seen",
  "act": "https://act.library.vanderbilt.edu/artworks/58394",
  "licence": "Public domain",
  "attribution": "Strozzi, Bernardo, 1581-1644. Incredulity of St. Thomas, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58395,
  "title": "Ascension and Pentecost",
  "artist": null,
  "date": "1050-1100",
  "where": "Monasterio de Santo Domingo de Silos, Santo Domingo de Silos, Spain",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/ascensionpentecost4f6s8e1o.jpg",
  "refs": [
   "Acts 1:1-11",
   "Luke 24:44-53",
   "Acts 2:1-21"
  ],
  "days": [
   "Year A Ascension of the Lord",
   "Year A Day of Pentecost"
  ],
  "essay": "https://thevcs.org/pentecost/ups-and-downs",
  "act": "https://act.library.vanderbilt.edu/artworks/58395",
  "licence": "Public domain",
  "attribution": "Ascension and Pentecost, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58396,
  "title": "Pentecost",
  "artist": null,
  "date": "11th century",
  "where": "Hosios Loukas Monastery, Hosios Loukas, Greece",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/pentecost1p7k2m4f.jpg",
  "refs": [
   "Acts 2:1-21"
  ],
  "days": [
   "Year A Day of Pentecost"
  ],
  "essay": "https://thevcs.org/pentecost/power-preach",
  "act": "https://act.library.vanderbilt.edu/artworks/58396",
  "licence": "CC BY-SA 3.0",
  "attribution": "Pentecost, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58398,
  "title": "Stoning of Saint Stephen",
  "artist": "Lotto, Lorenzo, 1480?-1556?",
  "date": "1513-1516",
  "where": "Accademia Carrara, Bergamo, Italy",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Lotto_Lorenzo_Stoning_of_Saint_Stephen.jpg",
  "refs": [
   "Acts 7:55-60"
  ],
  "days": [
   "Year A Easter 5th Sunday"
  ],
  "essay": "https://thevcs.org/stoning-stephen/sharing-passion-christ",
  "act": "https://act.library.vanderbilt.edu/artworks/58398",
  "licence": "Public domain",
  "attribution": "Lotto, Lorenzo, 1480?-1556?. Stoning of Saint Stephen, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58399,
  "title": "Stoning of St. Stephen",
  "artist": "Carpaccio, Vittore, 1455?-1525?",
  "date": "1520",
  "where": "Staatsgalerie Stuttgart, Stuttgart, Germany",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/stoningstephen2b6j1s3w.jpg",
  "refs": [
   "Acts 7:55-60"
  ],
  "days": [
   "Year A Easter 5th Sunday"
  ],
  "essay": "https://thevcs.org/stoning-stephen/incomprehension-and-seed-faith",
  "act": "https://act.library.vanderbilt.edu/artworks/58399",
  "licence": "Public domain",
  "attribution": "Carpaccio, Vittore, 1455?-1525?. Stoning of St. Stephen, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58400,
  "title": "Composition of Hagia Sophia",
  "artist": null,
  "date": "13th century",
  "where": "Hagia Sophia, Istanbul, Turkey",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/deesis06kh9u87.jpg",
  "refs": [
   "Romans 3:24-25"
  ],
  "days": [
   "Year A Ash Wednesday"
  ],
  "essay": "https://thevcs.org/grace-works/he-might-be-just-and-justifier",
  "act": "https://act.library.vanderbilt.edu/artworks/58400",
  "licence": "Public domain",
  "attribution": "Composition of Hagia Sophia, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58401,
  "title": "Magic Apple Tree",
  "artist": "Palmer, Samuel, 1805-1881",
  "date": "ca. 1830",
  "where": "Fitzwilliam Museum, Cambridge, United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/magicapple4t8b3m2p.jpg",
  "refs": [
   "Romans 12:1-8"
  ],
  "days": [
   "Year A Proper 16th Sunday"
  ],
  "essay": "https://thevcs.org/be-transformed/fruitfulness-and-transfiguration",
  "act": "https://act.library.vanderbilt.edu/artworks/58401",
  "licence": "Public domain",
  "attribution": "Palmer, Samuel, 1805-1881. Magic Apple Tree, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58404,
  "title": "Self-Portrait with Fur-Trimmed Robe",
  "artist": "Dürer, Albrecht, 1471-1528",
  "date": "1500",
  "where": "Alte Pinakothek, Munich, Germany",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/durerself3916gnwr.jpg",
  "refs": [
   "Corinthians II, 3:12-4:2"
  ],
  "days": [
   "Year C Transfiguration Sunday"
  ],
  "essay": "https://thevcs.org/glory-glory-advancing/paradox-portraiture",
  "act": "https://act.library.vanderbilt.edu/artworks/58404",
  "licence": "Public domain",
  "attribution": "Dürer, Albrecht, 1471-1528. Self-Portrait with Fur-Trimmed Robe, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58405,
  "title": "Jali Lattice Window",
  "artist": null,
  "date": "ca. 1572",
  "where": "Humayun's Tomb, Delhi, India",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/jaalilattice4h6j8a3r.jpg",
  "refs": [
   "Corinthians II, 3:12-4:2"
  ],
  "days": [
   "Year C Transfiguration Sunday"
  ],
  "essay": "https://thevcs.org/glory-glory-advancing/beyond-veil",
  "act": "https://act.library.vanderbilt.edu/artworks/58405",
  "licence": "CC BY-SA 2.0",
  "attribution": "Jali Lattice Window, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58406,
  "title": "Processional Cross",
  "artist": null,
  "date": "ca. 1150-1175",
  "where": "Metropolitan Museum of Art, New York, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/processionalcross12hb98xk.jpg",
  "refs": [
   "Ephesians 2:11-22"
  ],
  "days": [
   "Year B Proper 11th Sunday"
  ],
  "essay": "https://thevcs.org/flight-egypt/flight-night",
  "act": "https://act.library.vanderbilt.edu/artworks/58406",
  "licence": "CC BY-SA 2.5",
  "attribution": "Processional Cross, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58408,
  "title": "Woman on the Stairs",
  "artist": "Friedrich, Caspar David, 1774-1840",
  "date": "ca. 1825",
  "where": "Pomeranian State Museum, Greifswald, Germany",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/womanstairs5y1m9x7w.jpg",
  "refs": [
   "Ephesians 5:8-14"
  ],
  "days": [
   "Year A Lent 4th Sunday"
  ],
  "essay": "https://thevcs.org/children-light/what-kind-light",
  "act": "https://act.library.vanderbilt.edu/artworks/58408",
  "licence": "Public domain",
  "attribution": "Friedrich, Caspar David, 1774-1840. Woman on the Stairs, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58409,
  "title": "Shadow of Death",
  "artist": "Hunt, William Holman, 1827-1910",
  "date": "ca. 1870-1873",
  "where": "Manchester City Art Gallery, Manchester, United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/shadowdeath2084fkqp.jpg",
  "refs": [
   "Philippians 2:5-11"
  ],
  "days": [
   "Year B Holy Name of Jesus"
  ],
  "essay": "https://thevcs.org/christ-hymn/being-found-human-form",
  "act": "https://act.library.vanderbilt.edu/artworks/58409",
  "licence": "Public domain",
  "attribution": "Hunt, William Holman, 1827-1910. Shadow of Death, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58410,
  "title": "Still Life of Flowers and Grapes encircling a Monstrance in a Niche",
  "artist": "Kessel, Jan van, 1626-1679",
  "date": "ca. 1670",
  "where": "National Gallery of Scotland, Edinburgh, United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/stillflowers12rewm97.jpg",
  "refs": [
   "Philippians 4:1-9"
  ],
  "days": [
   "Year A Proper 23rd Sunday"
  ],
  "essay": "https://thevcs.org/flight-egypt/flight-night",
  "act": "https://act.library.vanderbilt.edu/artworks/58410",
  "licence": "Public domain",
  "attribution": "Kessel, Jan van, 1626-1679. Still Life of Flowers and Grapes encircling a Monstrance in a Niche, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58411,
  "title": "Pantocrator, God the Son, as the Creator of the Universe",
  "artist": null,
  "date": "ca. 1226-1234",
  "where": "Catedral de Toledo, Toledo, Spain",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/pantocrator4tg7uj8.jpg",
  "refs": [
   "Colossians 1:1-14",
   "Colossians 1:11-20"
  ],
  "days": [
   "Year C Proper 10th Sunday",
   "Year C Reign of Christ"
  ],
  "essay": "https://thevcs.org/cosmic-christ-and-his-gospel/pantocrator-mother-creation",
  "act": "https://act.library.vanderbilt.edu/artworks/58411",
  "licence": "Public domain",
  "attribution": "Pantocrator, God the Son, as the Creator of the Universe, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58414,
  "title": "Angelus Novus",
  "artist": "Klee, Paul, 1879-1940",
  "date": "1920",
  "where": "Israel Museum, Jerusalem, Israel",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/angelusnovus53bo1c9d.jpg",
  "refs": [
   "Thessalonians I, 5:1-11"
  ],
  "days": [
   "Year A Proper 28th Sunday"
  ],
  "essay": "https://thevcs.org/faith-hope-and-love/angels-hinterland",
  "act": "https://act.library.vanderbilt.edu/artworks/58414",
  "licence": "Public domain",
  "attribution": "Klee, Paul, 1879-1940. Angelus Novus, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58415,
  "title": "Self-Portrait between the Clock and the Bed",
  "artist": "Munch, Edvard, 1863-1944",
  "date": "1940-1943",
  "where": "Munch Museum, Oslo, Norway",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/selfmunch46gw19km.jpg",
  "refs": [
   "Thessalonians I, 5:1-11"
  ],
  "days": [
   "Year A Proper 28th Sunday"
  ],
  "essay": "https://thevcs.org/faith-hope-and-love/be-alert",
  "act": "https://act.library.vanderbilt.edu/artworks/58415",
  "licence": "Public domain",
  "attribution": "Munch, Edvard, 1863-1944. Self-Portrait between the Clock and the Bed, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58425,
  "title": "Slave pen, Alexandria, Va",
  "artist": null,
  "date": "1861-1865",
  "where": "Library of Congress, Washington, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/slavepen91vb0z4d.jpg",
  "refs": [
   "Timothy I, 6:6-19"
  ],
  "days": [
   "Year C Proper 21st Sunday"
  ],
  "essay": "https://thevcs.org/slaves-and-masters-rich-and-poor/pen-mighty",
  "act": "https://act.library.vanderbilt.edu/artworks/58425",
  "licence": "Public domain",
  "attribution": "Slave pen, Alexandria, Va, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58427,
  "title": "Blood of the Redeemer",
  "artist": "Bellini, Giovanni, 1426?-1516",
  "date": "ca. 1465",
  "where": "National Gallery, London, United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/bloodredeemer49m1t0xp.jpg",
  "refs": [
   "Hebrews 9:11-15"
  ],
  "days": [
   "Year B Proper 26th Sunday"
  ],
  "essay": "https://thevcs.org/sanctuary-not-made-hands/drink-immortality",
  "act": "https://act.library.vanderbilt.edu/artworks/58427",
  "licence": "Public domain",
  "attribution": "Bellini, Giovanni, 1426?-1516. Blood of the Redeemer, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58430,
  "title": "Fishing Boats on the Beach at Les Saintes-Maries-de-la-Mer",
  "artist": "Gogh, Vincent van, 1853-1890",
  "date": "1888",
  "where": "Van Gogh Museum, Amsterdam, Netherlands",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/boats390vn78l.jpg",
  "refs": [
   "Psalm 107:1-3, 23-32"
  ],
  "days": [
   "Year B Proper 7th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/58430",
  "licence": "CC BY-SA 2.0",
  "attribution": "Gogh, Vincent van, 1853-1890. Fishing Boats on the Beach at Les Saintes-Maries-de-la-Mer, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58432,
  "title": "David is Anointed and Affirmed as King",
  "artist": null,
  "date": "3rd century",
  "where": "Dura Europos, Salhiyé, Syria",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/dura932jng78hjb43n.jpg",
  "refs": [
   "Samuel II, 5:1-5, 9-10",
   "Samuel I, 16:1-13"
  ],
  "days": [
   "Year B Proper 9th Sunday",
   "Year A Lent 4th Sunday"
  ],
  "essay": "https://thevcs.org/anointing-david/gods-saving-hand-history",
  "act": "https://act.library.vanderbilt.edu/artworks/58432",
  "licence": "Public domain",
  "attribution": "David is Anointed and Affirmed as King, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58433,
  "title": "Madonna Hodegetria",
  "artist": "Tedice, Enrico di",
  "date": "ca. 1250",
  "where": "Bargello, Florence, Italy",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/madw9843jhd7g.jpg",
  "refs": [
   "Hebrews 10:5-10"
  ],
  "days": [
   "Year C Advent 4th Sunday"
  ],
  "essay": "https://thevcs.org/willing-victim-his-birth/new-way",
  "act": "https://act.library.vanderbilt.edu/artworks/58433",
  "licence": "Public domain",
  "attribution": "Tedice, Enrico di. Madonna Hodegetria, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58434,
  "title": "Coronation of the Virgin",
  "artist": "Angelico, fra, approximately 1400-1455",
  "date": "ca. 1435",
  "where": "Uffizi Gallery, Florence, Italy",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/fra9032jknf87213w4sx1a.jpg",
  "refs": [
   "James 1:17-27"
  ],
  "days": [
   "Year B Proper 17th Sunday"
  ],
  "essay": "https://thevcs.org/movement-spheres/crown-life",
  "act": "https://act.library.vanderbilt.edu/artworks/58434",
  "licence": "Public domain",
  "attribution": "Angelico, fra, approximately 1400-1455. Coronation of the Virgin, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58435,
  "title": "Narcissus",
  "artist": "Caravaggio, Michelangelo Merisi da, 1573-1610",
  "date": "ca. 1597-1599",
  "where": "Galleria Nazionale d'Arte Antica, Rome, Italy",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Narcissus3298dhj236tgdr54.jpg",
  "refs": [
   "James 1:17-27"
  ],
  "days": [
   "Year B Proper 17th Sunday"
  ],
  "essay": "https://thevcs.org/movement-spheres/circle-self",
  "act": "https://act.library.vanderbilt.edu/artworks/58435",
  "licence": "Public domain",
  "attribution": "Caravaggio, Michelangelo Merisi da, 1573-1610. Narcissus, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58436,
  "title": "Rondanini Pietà",
  "artist": "Michelangelo Buonarroti, 1475-1564",
  "date": "1553-1564",
  "where": "Sforza Castle, Milan, Italy",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Michelangelo_pi3288ydhty65.jpg",
  "refs": [
   "Peter I, 2:2-10"
  ],
  "days": [
   "Year A Easter 5th Sunday"
  ],
  "essay": "https://thevcs.org/living-stone-and-chosen-people/rejected-mortals",
  "act": "https://act.library.vanderbilt.edu/artworks/58436",
  "licence": "CC BY-SA 3.0",
  "attribution": "Michelangelo Buonarroti, 1475-1564. Rondanini Pietà, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58437,
  "title": "Christ appearing to Saint Peter on the Appian Way",
  "artist": "Carracci, Annibale, 1560-1609",
  "date": "1601-1602",
  "where": "National Gallery, London, United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/christappearing3r6h9s1d.jpg",
  "refs": [
   "Peter I, 4:12-14; 5:6-11"
  ],
  "days": [
   "Year A Easter 7th Sunday"
  ],
  "essay": "https://thevcs.org/finding-meaning-suffering/named-and-unashamed",
  "act": "https://act.library.vanderbilt.edu/artworks/58437",
  "licence": "Public domain",
  "attribution": "Carracci, Annibale, 1560-1609. Christ appearing to Saint Peter on the Appian Way, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58438,
  "title": "Last Judgment",
  "artist": "Lochner, Stefan, approximately 1410-1451",
  "date": "ca. 1435",
  "where": "Wallraf-Richartz-Museum, Cologne, Germany",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/lastjudgment6y1b9z0a.jpg",
  "refs": [
   "Matthew 25:31-46"
  ],
  "days": [
   "Year A New Year’s Day"
  ],
  "essay": "https://thevcs.org/finding-meaning-suffering/beginning-household-god",
  "act": "https://act.library.vanderbilt.edu/artworks/58438",
  "licence": "Public domain",
  "attribution": "Lochner, Stefan, approximately 1410-1451. Last Judgment, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58439,
  "title": "Destruction of Sodom and Gomorrah",
  "artist": "Martin, John, 1789-1854",
  "date": "1852",
  "where": "Laing Art Gallery, Newcastle upon Tyne, United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/destructionsodom4613gmpq.jpg",
  "refs": [
   "Peter II, 3:8-15a"
  ],
  "days": [
   "Year B Advent 2nd  Sunday"
  ],
  "essay": "https://thevcs.org/fire/inferno",
  "act": "https://act.library.vanderbilt.edu/artworks/58439",
  "licence": "Public domain",
  "attribution": "Martin, John, 1789-1854. Destruction of Sodom and Gomorrah, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58440,
  "title": "Nataraja, Shiva as the Lord of Dance",
  "artist": null,
  "date": "11th century",
  "where": "Cleveland Museum of Art, Cleveland, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/shivadance4671bwqs.jpg",
  "refs": [
   "Peter II, 3:8-15a"
  ],
  "days": [
   "Year B Advent 2nd  Sunday"
  ],
  "essay": "https://thevcs.org/fire/ring-fire",
  "act": "https://act.library.vanderbilt.edu/artworks/58440",
  "licence": "CC0",
  "attribution": "Nataraja, Shiva as the Lord of Dance, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58441,
  "title": "Division of the Light from the Darkness",
  "artist": "Nash, Paul, 1889-1946",
  "date": "1924",
  "where": "Fine Arts Museums of San Francisco, San Francisco, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/divisionlight845gme1k.jpg",
  "refs": [
   "Genesis 1:1-5"
  ],
  "days": [
   "Year B Baptism of the Lord"
  ],
  "essay": "https://thevcs.org/let-there-be-light/light-chaos",
  "act": "https://act.library.vanderbilt.edu/artworks/58441",
  "licence": "CC BY 4.0",
  "attribution": "Nash, Paul, 1889-1946. Division of the Light from the Darkness, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58442,
  "title": "Creation of Light",
  "artist": "Martin, John, 1789-1854",
  "date": "1824",
  "where": "Cleveland Museum of Art, Cleveland, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/creationlight31jp94vw.jpg",
  "refs": [
   "Genesis 1:1-2:4a"
  ],
  "days": [
   "Year A Trinity Sunday"
  ],
  "essay": "https://thevcs.org/let-there-be-light/dawn-creation",
  "act": "https://act.library.vanderbilt.edu/artworks/58442",
  "licence": "Public domain",
  "attribution": "Martin, John, 1789-1854. Creation of Light, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58443,
  "title": "Pietà",
  "artist": "Vecchietta, approximately 1412-1480",
  "date": "1448-1450",
  "where": "Diocesan Museum, Oratory of the Compagnia di San Bernardino, Siena, Italy",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/pieta3289fh76t.jpg",
  "refs": [
   "Genesis 3:8-15"
  ],
  "days": [
   "Year B Proper 5th Sunday"
  ],
  "essay": "https://thevcs.org/crushing-serpent/his-own-devotion",
  "act": "https://act.library.vanderbilt.edu/artworks/58443",
  "licence": "CC BY-SA 3.0",
  "attribution": "Vecchietta, approximately 1412-1480. Pietà, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58444,
  "title": "Noah's Ark on the Mount Ararat",
  "artist": "Myle, Simon de",
  "date": "1570",
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/arknn5vu37dt6t.jpg",
  "refs": [
   "Genesis 6:9-22; 7:24; 8:14-19",
   "Genesis 7:1-5, 11-18; 8:6-18; 9:8-13"
  ],
  "days": [
   "Year A Easter Vigil",
   "Year A Proper 4th Sunday"
  ],
  "essay": "https://thevcs.org/out-ark/life-abundance",
  "act": "https://act.library.vanderbilt.edu/artworks/58444",
  "licence": "Public domain",
  "attribution": "Myle, Simon de. Noah's Ark on the Mount Ararat, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58445,
  "title": "Madonna and Child with St Anne",
  "artist": "Caravaggio, Michelangelo Merisi da, 1573-1610",
  "date": "1606",
  "where": "Galleria Borghese, Rome, Italy",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Madonna_with_the_Serpent2347.jpg",
  "refs": [
   "Genesis 3:8-15"
  ],
  "days": [
   "Year B Proper 5th Sunday"
  ],
  "essay": "https://thevcs.org/crushing-serpent/rejected-masterpiece",
  "act": "https://act.library.vanderbilt.edu/artworks/58445",
  "licence": "Public domain",
  "attribution": "Caravaggio, Michelangelo Merisi da, 1573-1610. Madonna and Child with St Anne, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58446,
  "title": "Exit from Noah's Ark",
  "artist": "Bedford Master, active 1415-1430",
  "date": "ca. 1410-1430",
  "where": "British Library, London, United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/exitark1048gpqm.jpg",
  "refs": [
   "Genesis 6:9-22; 7:24; 8:14-19",
   "Genesis 7:1-5, 11-18; 8:6-18; 9:8-13"
  ],
  "days": [
   "Year A Easter Vigil",
   "Year A Proper 4th Sunday"
  ],
  "essay": "https://thevcs.org/out-ark/new-world-miniature",
  "act": "https://act.library.vanderbilt.edu/artworks/58446",
  "licence": "Public domain",
  "attribution": "Bedford Master, active 1415-1430. Exit from Noah's Ark, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58447,
  "title": "Rainbow Dome",
  "artist": "Foppa, Vincenzo, active 1459-1490",
  "date": "ca. 1462-1468",
  "where": "Basilica of Sant'Eustorgio, Portinari Chapel, Milan, Italy",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/dome39gj68j5am.jpg",
  "refs": [
   "Genesis 7:1-5, 11-18; 8:6-18; 9:8-13"
  ],
  "days": [
   "Year A Easter Vigil",
   "Year B Easter Vigil",
   "Year C Easter Vigil"
  ],
  "essay": "https://thevcs.org/first-rainbow/rainbow",
  "act": "https://act.library.vanderbilt.edu/artworks/58447",
  "licence": "CC BY 3.0",
  "attribution": "Foppa, Vincenzo, active 1459-1490. Rainbow Dome, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58449,
  "title": "Olive Trees",
  "artist": "Gogh, Vincent van, 1853-1890",
  "date": "1889",
  "where": "Metropolitan Museum of Art, New York, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/BProp06_58449.jpg",
  "refs": [
   "Psalm 92:1-4, 12-15",
   "Ezekiel 17:22-24"
  ],
  "days": [
   "Year B Proper 6th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/58449",
  "licence": "CC BY-SA 4.0",
  "attribution": "Gogh, Vincent van, 1853-1890. Olive Trees, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58452,
  "title": "Barn Swallows",
  "artist": "Audubon, John James, 1785-1851",
  "date": "1827",
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/swallow-nest9238fji98.jpg",
  "refs": [
   "Psalm 84"
  ],
  "days": [
   "Year B Proper 16th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/58452",
  "licence": "CC BY-SA 4.0",
  "attribution": "Audubon, John James, 1785-1851. Barn Swallows, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58459,
  "title": "Banquet of Esther and Ahasuerus",
  "artist": "Victors, Jan, 1619-1676",
  "date": "1640s",
  "where": "Gemäldegalerie Alte Meister, Kassel, Germany",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/esther328dbg78.jpg",
  "refs": [
   "Esther 7:1-6, 9-10; 9:20-22"
  ],
  "days": [
   "Year B Proper 21st Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/58459",
  "licence": "Public domain",
  "attribution": "Victors, Jan, 1619-1676. Banquet of Esther and Ahasuerus, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58465,
  "title": "Hospitality of Abraham",
  "artist": "Rublev, Andreĭ, Saint, -approximately 1430",
  "date": "ca. 1420",
  "where": "Tretyakov Gallery, Moscow, Russia",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/hospitalityabe298ght1y.jpg",
  "refs": [
   "Genesis 18:1-15, (21:1-7)",
   "Genesis 18:1-10a"
  ],
  "days": [
   "Year C Trinity Sunday",
   "Year A Trinity Sunday",
   "Year B Trinity Sunday",
   "Year A Proper 6th Sunday",
   "Year C Proper 11th Sunday"
  ],
  "essay": "https://thevcs.org/hospitality-abraham",
  "act": "https://act.library.vanderbilt.edu/artworks/58465",
  "licence": "Public domain",
  "attribution": "Rublev, Andreĭ, Saint, -approximately 1430. Hospitality of Abraham, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58466,
  "title": "Hagar",
  "artist": "Lewis, Edmonia",
  "date": "1875",
  "where": "Smithsonian American Art Museum, Washington, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/hagar3056gcxw.jpg",
  "refs": [
   "Genesis 21:8-21"
  ],
  "days": [
   "Year A Proper 7th Sunday"
  ],
  "essay": "https://thevcs.org/get-out/wilderness",
  "act": "https://act.library.vanderbilt.edu/artworks/58466",
  "licence": "CC0",
  "attribution": "Lewis, Edmonia. Hagar, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58467,
  "title": "Wooded Landscape with Abraham and Isaac",
  "artist": "Bruegel, Jan, 1568-1625",
  "date": "1599",
  "where": "National Museum of Western Art, Tokyo, Japan",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/woodabeisaac471bnm9x.jpg",
  "refs": [
   "Genesis 22:1-18"
  ],
  "days": [
   "Year A Proper 8th Sunday"
  ],
  "essay": "https://thevcs.org/journey-moriah/figures-landscape",
  "act": "https://act.library.vanderbilt.edu/artworks/58467",
  "licence": "Public domain",
  "attribution": "Bruegel, Jan, 1568-1625. Wooded Landscape with Abraham and Isaac, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58468,
  "title": "Vision of the Sermon (Jacob Wrestling with the Angel)",
  "artist": "Gauguin, Paul, 1848-1903",
  "date": "1888",
  "where": "Scottish National Gallery, Edinburgh, United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/visionjacob82vo1f3s.jpg",
  "refs": [
   "Genesis 32:22-31"
  ],
  "days": [
   "Year A Proper 13th Sunday",
   "Year C Proper 24th Sunday"
  ],
  "essay": "https://thevcs.org/jacob-wrestling-angel/one-who-wont-let-go",
  "act": "https://act.library.vanderbilt.edu/artworks/58468",
  "licence": "Public domain",
  "attribution": "Gauguin, Paul, 1848-1903. Vision of the Sermon (Jacob Wrestling with the Angel), from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58469,
  "title": "Joseph Sent to Shechem by Jacob",
  "artist": null,
  "date": "ca. 500-550",
  "where": "Austrian National Library, Vienna, Austria",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/josephshechem84th1k9s.jpg",
  "refs": [
   "Genesis 37:1-4, 12-28"
  ],
  "days": [
   "Year A Proper 14th Sunday"
  ],
  "essay": "https://thevcs.org/joseph-sold/behold-dreamer-cometh",
  "act": "https://act.library.vanderbilt.edu/artworks/58469",
  "licence": "Public domain",
  "attribution": "Joseph Sent to Shechem by Jacob, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58470,
  "title": "Roundel Illustrating Episodes from the Biblical Story of Joseph",
  "artist": null,
  "date": "7th century",
  "where": "Metropolitan Museum of Art, New York, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/roundeljoseph3bn5j8d.jpg",
  "refs": [
   "Genesis 37:1-4, 12-28"
  ],
  "days": [
   "Year A Proper 14th Sunday"
  ],
  "essay": "https://thevcs.org/joseph-sold/story-comes-full-circle",
  "act": "https://act.library.vanderbilt.edu/artworks/58470",
  "licence": "CC0",
  "attribution": "Roundel Illustrating Episodes from the Biblical Story of Joseph, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58471,
  "title": "Miriam's Song of Praise",
  "artist": "Hensel, Wilhelm, 1794-1861",
  "date": "1836",
  "where": "Royal Collection of the British Royal Family, United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/miriamsong8rghm143.jpg",
  "refs": [
   "Exodus 15:1b-11, 20-21"
  ],
  "days": [
   "Year A Proper 19th Sunday"
  ],
  "essay": "https://thevcs.org/song-miriam/composer-songs",
  "act": "https://act.library.vanderbilt.edu/artworks/58471",
  "licence": "Public domain",
  "attribution": "Hensel, Wilhelm, 1794-1861. Miriam's Song of Praise, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58472,
  "title": "Dance of Miriam and Preparation for Seder",
  "artist": null,
  "date": "ca. 1320-1330",
  "where": "British Library, London, United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/dancemiriam58df01pm.jpg",
  "refs": [
   "Exodus 15:1b-11, 20-21"
  ],
  "days": [
   "Year A Proper 19th Sunday"
  ],
  "essay": "https://thevcs.org/song-miriam/frame-drum",
  "act": "https://act.library.vanderbilt.edu/artworks/58472",
  "licence": "Public domain",
  "attribution": "Dance of Miriam and Preparation for Seder, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58473,
  "title": "Bread plate 'Waste Not Want Not'",
  "artist": "Pugin, Augustus Welby Northmore, 1812-1852",
  "date": "ca. 1850",
  "where": "Cleveland Museum of Art, Cleveland, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Augustus_Northmore_Bread_plate_waste_not_want_not.jpg",
  "refs": [
   "Exodus 16:2-4, 9-15",
   "Exodus 16:2-15"
  ],
  "days": [
   "Year A Proper 20th Sunday",
   "Year B Proper 13th Sunday"
  ],
  "essay": "https://thevcs.org/manna-desert/give-us-day",
  "act": "https://act.library.vanderbilt.edu/artworks/58473",
  "licence": "Public domain",
  "attribution": "Pugin, Augustus Welby Northmore, 1812-1852. Bread plate 'Waste Not Want Not', from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58474,
  "title": "Iconoclasts and the Crucifixion",
  "artist": null,
  "date": "ca. 850",
  "where": "State Historical Museum, Moscow, Russia",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/crucifixiconoclast84gh5k1b.jpg",
  "refs": [
   "Exodus 20:1-17"
  ],
  "days": [
   "Year B Lent 3rd Sunday"
  ],
  "essay": "https://thevcs.org/second-commandment/vandalizing-byzantine-iconoclasts",
  "act": "https://act.library.vanderbilt.edu/artworks/58474",
  "licence": "Public domain",
  "attribution": "Iconoclasts and the Crucifixion, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58475,
  "title": "Icon on the Triumph of Orthodoxy",
  "artist": null,
  "date": "ca. 1400",
  "where": "British Museum, London, United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/triumphorthodoxy4912dfvc.jpg",
  "refs": [
   "Exodus 20:1-17"
  ],
  "days": [
   "Year B Lent 3rd Sunday"
  ],
  "essay": "https://thevcs.org/second-commandment/victorious-icons",
  "act": "https://act.library.vanderbilt.edu/artworks/58475",
  "licence": "Public domain",
  "attribution": "Icon on the Triumph of Orthodoxy, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58476,
  "title": "Adoration of the Golden Calf",
  "artist": "Poussin, Nicolas, 1594?-1665",
  "date": "1633-1634",
  "where": "National Gallery, London, United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/adorationcalf4t2y3h8p.jpg",
  "refs": [
   "Exodus 32:1-14"
  ],
  "days": [
   "Year A Proper 23rd Sunday"
  ],
  "essay": "https://thevcs.org/golden-calf/danger-and-therapy",
  "act": "https://act.library.vanderbilt.edu/artworks/58476",
  "licence": "Public domain",
  "attribution": "Poussin, Nicolas, 1594?-1665. Adoration of the Golden Calf, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58477,
  "title": "Israelites Worship the Golden Calf and Moses Breaks the Tablets",
  "artist": "William, de Brailes, active 13th century",
  "date": "ca. 1250",
  "where": "Walters Art Museum, Baltimore, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/israelcalf3nvwx915.jpg",
  "refs": [
   "Exodus 32:1-14"
  ],
  "days": [
   "Year A Proper 23rd Sunday"
  ],
  "essay": "https://thevcs.org/golden-calf/imaging-word",
  "act": "https://act.library.vanderbilt.edu/artworks/58477",
  "licence": "Public domain",
  "attribution": "William, de Brailes, active 13th century. Israelites Worship the Golden Calf and Moses Breaks the Tablets, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58478,
  "title": "Twilight in the Wilderness",
  "artist": "Church, Frederic Edwin, 1826-1900",
  "date": "1860",
  "where": "Cleveland Museum of Art, Cleveland, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/twilightwilderness24ga01km.jpg",
  "refs": [
   "Deuteronomy 8:7-18",
   "isaiah 43:18-25"
  ],
  "days": [
   "Year B Epiphany 7th Sunday",
   "Year A Thanksgiving Day"
  ],
  "essay": "https://thevcs.org/remember-do-not-forget/complexity-land",
  "act": "https://act.library.vanderbilt.edu/artworks/58478",
  "licence": "Public domain",
  "attribution": "Church, Frederic Edwin, 1826-1900. Twilight in the Wilderness, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58479,
  "title": "Naomi and Ruth",
  "artist": "Pynas, Jacob Symonsz (1592-1650)",
  "date": "before 1650",
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/ruth23897yhgbgtfrdery.jpg",
  "refs": [
   "Ruth 1:1-18"
  ],
  "days": [
   "Year B Proper 26th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/58479",
  "licence": "Public domain",
  "attribution": "Pynas, Jacob Symonsz (1592-1650). Naomi and Ruth, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
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
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/58493",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Koenig, Peter. Shadow of Your Wings, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Peter Winfried (Canisius) Koenig, https://www.pwkoenig.co.uk/."
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
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/58504",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Koenig, Peter. A House Built on Rock, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Peter Winfried (Canisius) Koenig, https://www.pwkoenig.co.uk/."
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
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/58508",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Koenig, Peter. A House Built on Rock (2), from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Peter Winfried (Canisius) Koenig, https://www.pwkoenig.co.uk/."
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
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/58518",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Koenig, Peter. Draft of Fishes, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Peter Winfried (Canisius) Koenig, https://www.pwkoenig.co.uk/."
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
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/58581",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Swanson, John August. Wedding Feast, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of John August Swanson, https://www.johnaugustswanson.com/."
 },
 {
  "id": 58591,
  "title": "St. Peter Healing the Crippled Beggar",
  "artist": "Gerung, Matthias, approximately 1500-approximately 1570",
  "date": "1530-1532",
  "where": "Bavarian State Library, Munich, Germany",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/otto2903ey8t87g.jpg",
  "refs": [
   "Acts 3:1-10"
  ],
  "days": [
   "Year B Easter 4th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/58591",
  "licence": "Public domain",
  "attribution": "Gerung, Matthias, approximately 1500-approximately 1570. St. Peter Healing the Crippled Beggar, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58592,
  "title": "Cornerstone, Ceres Bethel of A.M.E. Church 1870 L. Benson, Pastor",
  "artist": null,
  "date": null,
  "where": "Ceres Bethel AME Church, Jefferson, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/corner29jf438u.jpg",
  "refs": [
   "Psalm 118:1-2, 19-29"
  ],
  "days": [
   "Year B Resurrection of the Lord",
   "Year B Easter 4th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/58592",
  "licence": "CC BY-SA 2.0",
  "attribution": "Cornerstone, Ceres Bethel of A.M.E. Church 1870 L. Benson, Pastor, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58604,
  "title": "Story of David and Goliath",
  "artist": "Pesellino, approximately 1422-1457",
  "date": "ca. 1445-1455",
  "where": "National Gallery, London, United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/goli290fjn79u8tr54edrfv.jpg",
  "refs": [
   "Samuel I, 17:(1a, 4-11, 19-23), 32-49"
  ],
  "days": [
   "Year B Proper 7th Sunday"
  ],
  "essay": "https://thevcs.org/david-and-goliath/alls-fair-love-and-war",
  "act": "https://act.library.vanderbilt.edu/artworks/58604",
  "licence": "Public domain",
  "attribution": "Pesellino, approximately 1422-1457. Story of David and Goliath, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58605,
  "title": "David",
  "artist": "Bernini, Gian Lorenzo, 1598-1680",
  "date": "1623-1624",
  "where": "Galleria Borghese, Rome, Italy",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/david9348ijh970hlljn.jpg",
  "refs": [
   "Samuel I, 17:(1a, 4-11, 19-23), 32-49"
  ],
  "days": [
   "Year B Proper 7th Sunday"
  ],
  "essay": "https://thevcs.org/david-and-goliath/never-alone",
  "act": "https://act.library.vanderbilt.edu/artworks/58605",
  "licence": "CC0",
  "attribution": "Bernini, Gian Lorenzo, 1598-1680. David, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58613,
  "title": "Plate with the Battle of David and Goliath",
  "artist": null,
  "date": "629-630",
  "where": "Metropolitan Museum of Art, New York City, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/davidsamuel3729tvbx.jpg",
  "refs": [
   "Samuel I, 17:(1a, 4-11, 19-23), 32-49"
  ],
  "days": [
   "Year B Proper 7th Sunday"
  ],
  "essay": "https://thevcs.org/david-and-goliath/head-plate",
  "act": "https://act.library.vanderbilt.edu/artworks/58613",
  "licence": "CC BY-SA 3.0",
  "attribution": "Plate with the Battle of David and Goliath, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58614,
  "title": "Prophet Elijah in the Desert",
  "artist": "Bouts, Dieric, 1415-1475",
  "date": "1464-1468",
  "where": "St. Peter's Church, Leuven, Belgium",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/elijahdieric48jg92od.jpg",
  "refs": [
   "Kings I, 19:1-4, (5-7), 8-15a"
  ],
  "days": [
   "Year C Proper 7th Sunday",
   "Year B Proper 14th Sunday"
  ],
  "essay": "https://thevcs.org/prophet-elijah-wilderness/heavenly-food",
  "act": "https://act.library.vanderbilt.edu/artworks/58614",
  "licence": "Public domain",
  "attribution": "Bouts, Dieric, 1415-1475. Prophet Elijah in the Desert, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58615,
  "title": "Man in Oriental Costume (King Uzziah Stricken by Leprosy)",
  "artist": "Rembrandt Harmenszoon van Rijn, 1606-1669",
  "date": "1639",
  "where": "Chatsworth House, Bakewell, United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/uzziah12is45or.jpg",
  "refs": [
   "Kings II, 5:1-14"
  ],
  "days": [
   "Year C Proper 9th Sunday",
   "Year B Epiphany 6th Sunday"
  ],
  "essay": "https://thevcs.org/healing-naaman/gehazis-kindred",
  "act": "https://act.library.vanderbilt.edu/artworks/58615",
  "licence": "Public domain",
  "attribution": "Rembrandt Harmenszoon van Rijn, 1606-1669. Man in Oriental Costume (King Uzziah Stricken by Leprosy), from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58618,
  "title": "Solomon and the Queen of Sheba",
  "artist": "Ghiberti, Lorenzo, 1378-1455",
  "date": "1425-1452",
  "where": "Florence Baptistery, Florence, Italy",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/ghibertiSolomon38gh56ao.jpg",
  "refs": [
   "Kings I, 10:1-13",
   "Chronicles II, 9:1-12"
  ],
  "days": [],
  "essay": "https://thevcs.org/arrival-queen-sheba/match-made-heaven",
  "act": "https://act.library.vanderbilt.edu/artworks/58618",
  "licence": "CC BY-SA 3.0",
  "attribution": "Ghiberti, Lorenzo, 1378-1455. Solomon and the Queen of Sheba, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58619,
  "title": "Ezra Reads the Law",
  "artist": "Schnorr von Carolsfeld, Julius, 1794-1872",
  "date": "1860",
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/ezrapreaches043jk2i8.jpg",
  "refs": [
   "Nehemiah 8:1-3, 5-6, 8-10"
  ],
  "days": [
   "Year C Epiphany 3rd Sunday"
  ],
  "essay": "https://thevcs.org/meet-with-joy-sweet-jerusalem/words-words-words",
  "act": "https://act.library.vanderbilt.edu/artworks/58619",
  "licence": "Public domain",
  "attribution": "Schnorr von Carolsfeld, Julius, 1794-1872. Ezra Reads the Law, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58620,
  "title": "Hiker Above the Sea of Fog",
  "artist": "Friedrich, Caspar David, 1774-1840",
  "date": "ca. 1817",
  "where": "Hamburger Kunsthalle, Hamburg, Germany",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/wanderer043gil8f.jpg",
  "refs": [
   "Psalm 19"
  ],
  "days": [
   "Year B Lent 3rd Sunday"
  ],
  "essay": "https://thevcs.org/heavens-are-telling/contemplating-gods-creation",
  "act": "https://act.library.vanderbilt.edu/artworks/58620",
  "licence": "Public domain",
  "attribution": "Friedrich, Caspar David, 1774-1840. Hiker Above the Sea of Fog, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58621,
  "title": "Pass at Faido",
  "artist": "Turner, J. M. W. (Joseph Mallord William), 1775-1851",
  "date": "ca. 1800-1845",
  "where": "Morgan Library & Museum, New York City, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/gotthard1849aft5.jpg",
  "refs": [
   "Psalm 19"
  ],
  "days": [
   "Year B Lent 3rd Sunday"
  ],
  "essay": "https://thevcs.org/heavens-are-telling/all-great-art-praise",
  "act": "https://act.library.vanderbilt.edu/artworks/58621",
  "licence": "Public domain",
  "attribution": "Turner, J. M. W. (Joseph Mallord William), 1775-1851. Pass at Faido, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58622,
  "title": "What Our Lord Saw from the Cross",
  "artist": "Tissot, James, 1836-1902",
  "date": "1886-1894",
  "where": "Brooklyn Museum, Brooklyn, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/tissotCross04352jkl.jpg",
  "refs": [
   "John 18:1-19:42",
   "Psalm 22"
  ],
  "days": [
   "Year A Good Friday"
  ],
  "essay": "https://thevcs.org/great-cry/participation-suffering",
  "act": "https://act.library.vanderbilt.edu/artworks/58622",
  "licence": "Public domain",
  "attribution": "Tissot, James, 1836-1902. What Our Lord Saw from the Cross, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58623,
  "title": "Isenheim Altarpiece",
  "artist": "Grünewald, Matthias, active 16th century",
  "date": "ca. 1512-1516",
  "where": "Unterlinden Museum, Colmar, France",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/isenheim453fst89.jpg",
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
  "essay": "https://thevcs.org/great-cry/loneliness-desolation",
  "act": "https://act.library.vanderbilt.edu/artworks/58623",
  "licence": "Public domain",
  "attribution": "Grünewald, Matthias, active 16th century. Isenheim Altarpiece, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58624,
  "title": "Under the Wave off Kanagawa",
  "artist": "Katsushika, Hokusai, 1760-1849",
  "date": "ca. 1830-1832",
  "where": "Metropolitan Museum of Art, New York City, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/kanagawa0934dhko.jpg",
  "refs": [
   "Psalm 43",
   "Psalm 42"
  ],
  "days": [
   "Year C Proper 7th Sunday"
  ],
  "essay": "https://thevcs.org/thirsting-god/terror-transience-transcendence",
  "act": "https://act.library.vanderbilt.edu/artworks/58624",
  "licence": "Public domain",
  "attribution": "Katsushika, Hokusai, 1760-1849. Under the Wave off Kanagawa, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58691,
  "title": "Washing of the Feet",
  "artist": "Bondone, Giotto di, 1266?-1337",
  "date": "1303",
  "where": "Scrovegni Chapel, Padua, Italy",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/washingfeet36hrmx29.jpg",
  "refs": [
   "John 13:1-17, 31b-35"
  ],
  "days": [
   "Year A Maundy Thursday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/58691",
  "licence": "Public domain",
  "attribution": "Bondone, Giotto di, 1266?-1337. Washing of the Feet, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58822,
  "title": "Impenetrable",
  "artist": "Hatoum, Mona, 1952-",
  "date": "2009",
  "where": "Solomon R. Guggenheim Museum, New York City, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/impenetrable38gy9a1q.jpg",
  "refs": [
   "Ruth 3:1-5; 4:13-17"
  ],
  "days": [
   "Year B Proper 27th Sunday"
  ],
  "essay": "https://thevcs.org/outsider-source-new-life/borders-and-boundaries",
  "act": "https://act.library.vanderbilt.edu/artworks/58822",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Hatoum, Mona, 1952-. Impenetrable, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: https://www.flickr.com/photos/sarahseverson/6109206931."
 },
 {
  "id": 58823,
  "title": "Visit of the Queen of Sheba to Solomon",
  "artist": "Tintoretto, Jacopo, 1518-1594",
  "date": "ca. 1545-1546",
  "where": "Bob Jones University Museum and Gallery, Greenville, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/shebasolomon3gb1os98.jpg",
  "refs": [
   "Kings I, 10:1-13",
   "Chronicles II, 9:1-12"
  ],
  "days": [],
  "essay": "https://thevcs.org/arrival-queen-sheba/stage-set",
  "act": "https://act.library.vanderbilt.edu/artworks/58823",
  "licence": "CC BY-SA 4.0",
  "attribution": "Tintoretto, Jacopo, 1518-1594. Visit of the Queen of Sheba to Solomon, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58825,
  "title": "Marriage Feast at Cana",
  "artist": null,
  "date": "ca. 1310-1320",
  "where": "British Library, London, United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/marriagecana30bw4m1p.jpg",
  "refs": [
   "John 2:1-11",
   "Psalm 69:7-10, (11-15), 16-18"
  ],
  "days": [
   "Year C Epiphany 2nd Sunday",
   "Year A Proper 7th Sunday"
  ],
  "essay": "https://thevcs.org/cry-deliverance/neck",
  "act": "https://act.library.vanderbilt.edu/artworks/58825",
  "licence": "Public domain",
  "attribution": "Marriage Feast at Cana, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58826,
  "title": "Cueva de las Manos",
  "artist": null,
  "date": "11000-7000",
  "where": "Cueva de las Manos (Cave of the Hands), Santa Cruz, Argentina",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/cuevamanos85gh1tb3.jpg",
  "refs": [
   "Psalm 90:1-6, 13-17"
  ],
  "days": [
   "Year A Proper 25th Sunday"
  ],
  "essay": "https://thevcs.org/handwork/dwelling-place-all-generations",
  "act": "https://act.library.vanderbilt.edu/artworks/58826",
  "licence": "Public domain",
  "attribution": "Cueva de las Manos, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58828,
  "title": "Cottage",
  "artist": "Gogh, Vincent van, 1853-1890",
  "date": "1885",
  "where": "Van Gogh Museum, Amsterdam, Netherlands",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/cottage3nbuw928.jpg",
  "refs": [
   "Psalm 133"
  ],
  "days": [
   "Year B Proper 7th Sunday",
   "Year B Easter 2nd Sunday",
   "Year A Proper 15th Sunday"
  ],
  "essay": "https://thevcs.org/one/when-kindred-live-together?first=5091",
  "act": "https://act.library.vanderbilt.edu/artworks/58828",
  "licence": "Public domain",
  "attribution": "Gogh, Vincent van, 1853-1890. Cottage, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58829,
  "title": "Burghers of Calais",
  "artist": "Rodin, Auguste, 1840-1917",
  "date": "1884-1895",
  "where": "In front of the town hall of Calais, Calais, France",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/burgherscalais32gj94xp.jpg",
  "refs": [
   "Psalm 133"
  ],
  "days": [
   "Year B Proper 7th Sunday",
   "Year B Easter 2nd Sunday",
   "Year A Proper 15th Sunday"
  ],
  "essay": "https://thevcs.org/one/together-even-one?first=5091",
  "act": "https://act.library.vanderbilt.edu/artworks/58829",
  "licence": "CC BY-SA 3.0",
  "attribution": "Rodin, Auguste, 1840-1917. Burghers of Calais, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58847,
  "title": "St. Albans Psalter Initial S",
  "artist": null,
  "date": "ca. 1120-1130",
  "where": "Dombibliothek Hildesheim, Hildesheim, Germany",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/albanspsalter83rw25ns.jpg",
  "refs": [
   "Psalm 137"
  ],
  "days": [
   "Year C Proper 22nd Sunday"
  ],
  "essay": "https://thevcs.org/rivers-babylon/singing-and-scheming?first=2616",
  "act": "https://act.library.vanderbilt.edu/artworks/58847",
  "licence": "Public domain",
  "attribution": "St. Albans Psalter Initial S, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58848,
  "title": "Animalia Rationalia et Insecta (Ignis): Plate XII",
  "artist": "Hoefnagel, Joris, 1542-1601",
  "date": "ca. 1575-1580",
  "where": "National Gallery of Art (U.S.), Washington, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/animalia93fpgk17.jpg",
  "refs": [
   "Psalm 145"
  ],
  "days": [
   "Year A Proper 13th Sunday"
  ],
  "essay": "https://thevcs.org/joris-hoefnagels-insects/double-take?first=2341",
  "act": "https://act.library.vanderbilt.edu/artworks/58848",
  "licence": "CC0",
  "attribution": "Hoefnagel, Joris, 1542-1601. Animalia Rationalia et Insecta (Ignis): Plate XII, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58849,
  "title": "Animalia Rationalia et Insecta (Ignis): Plate XI",
  "artist": "Hoefnagel, Joris, 1542-1601",
  "date": "ca. 1575-1580",
  "where": "National Gallery of Art (U.S.), Washington, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/insecta3612vwtx.jpg",
  "refs": [
   "Psalm 145"
  ],
  "days": [
   "Year A Proper 13th Sunday"
  ],
  "essay": "https://thevcs.org/joris-hoefnagels-insects/unusual-encounter?first=2341",
  "act": "https://act.library.vanderbilt.edu/artworks/58849",
  "licence": "CC0",
  "attribution": "Hoefnagel, Joris, 1542-1601. Animalia Rationalia et Insecta (Ignis): Plate XI, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58850,
  "title": "Animalia Rationalia et Insecta (Ignis): Plate XIV",
  "artist": "Hoefnagel, Joris, 1542-1601",
  "date": "ca. 1575-1580",
  "where": "National Gallery of Art (U.S.), Washington, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/insectaxiv45tgpa19.jpg",
  "refs": [
   "Psalm 145"
  ],
  "days": [
   "Year A Proper 13th Sunday"
  ],
  "essay": "https://thevcs.org/thevcs.org/joris-hoefnagels-insects/words-and-deeds?first=2341",
  "act": "https://act.library.vanderbilt.edu/artworks/58850",
  "licence": "CC0",
  "attribution": "Hoefnagel, Joris, 1542-1601. Animalia Rationalia et Insecta (Ignis): Plate XIV, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
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
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/58852",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Koenig, Peter. Draft of Fishes, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Peter Winfried (Canisius) Koenig, https://www.pwkoenig.co.uk/."
 },
 {
  "id": 58856,
  "title": "Wisdom Window",
  "artist": "Denny, Tom, 1956-",
  "date": "2012",
  "where": "St. Catherine's College, Cambridge, United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Tom_Denny_Wisdom_Window.jpg",
  "refs": [
   "Proverbs 8:1-4, 22-31"
  ],
  "days": [
   "Year C Trinity Sunday"
  ],
  "essay": "https://thevcs.org/whoever-finds-me-finds-life/road-wisdom?first=2971",
  "act": "https://act.library.vanderbilt.edu/artworks/58856",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Denny, Tom, 1956-. Wisdom Window, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: https://www.flickr.com/photos/8767316@N08/49575706062."
 },
 {
  "id": 58857,
  "title": "Portrait of Giovanna Tornabuoni",
  "artist": "Ghirlandaio, Domenico, 1449-1494",
  "date": "1489-1490",
  "where": "Thyssen-Bornemisza Museum, Madrid, Spain",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Domenico_Ghirlandaio_Portrait_of_Giovanna_Tornabuoni.jpg",
  "refs": [
   "Proverbs 31:10-31"
  ],
  "days": [
   "Year B Proper 20th Sunday"
  ],
  "essay": "https://thevcs.org/wife-noble-character/more-precious-jewels?first=761",
  "act": "https://act.library.vanderbilt.edu/artworks/58857",
  "licence": "Public domain",
  "attribution": "Ghirlandaio, Domenico, 1449-1494. Portrait of Giovanna Tornabuoni, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58858,
  "title": "Katharina von Bora",
  "artist": "Koch, Nina",
  "date": "1999",
  "where": "Lutherhaus, Wittenberg, Germany",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Nina_Koch_Katharina_Von_Bora.jpg",
  "refs": [
   "Proverbs 31:10-31"
  ],
  "days": [
   "Year B Proper 20th Sunday"
  ],
  "essay": "https://thevcs.org/wife-noble-character/breaking-new-ground?first=771",
  "act": "https://act.library.vanderbilt.edu/artworks/58858",
  "licence": "CC BY-SA 2.0",
  "attribution": "Koch, Nina. Katharina von Bora, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58859,
  "title": "Extensive Landscape with Ruins",
  "artist": "Ruisdael, Jacob van, 1628 or 1629-1682",
  "date": "ca. 1665-1670",
  "where": "National Gallery (Great Britain), London, United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Jacob_Isaacksz_van_Ruisdael_An_Extensive_Landscape_with_a_Ruined_Castle_and_a_Village_Church.jpg",
  "refs": [
   "Ecclesiastes 1:2, 12-14; 2:18-23"
  ],
  "days": [
   "Year C Proper 13th Sunday"
  ],
  "essay": "https://thevcs.org/vanity-vanities/life-under-sun?first=2001",
  "act": "https://act.library.vanderbilt.edu/artworks/58859",
  "licence": "Public domain",
  "attribution": "Ruisdael, Jacob van, 1628 or 1629-1682. Extensive Landscape with Ruins, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58860,
  "title": "Vanitas Still Life with Self-Portrait",
  "artist": "Bailly, David, 1584-1657",
  "date": "1651",
  "where": "Museum De Lakenhal, Leiden, Netherlands",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/David_Bailly_Self_Portrait_with_Vanitas_Symbols.jpg",
  "refs": [
   "Ecclesiastes 1:2, 12-14; 2:18-23"
  ],
  "days": [
   "Year C Proper 13th Sunday"
  ],
  "essay": "https://thevcs.org/vanity-vanities/recounting-time?first=2001",
  "act": "https://act.library.vanderbilt.edu/artworks/58860",
  "licence": "Public domain",
  "attribution": "Bailly, David, 1584-1657. Vanitas Still Life with Self-Portrait, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58861,
  "title": "Self-Portrait at the Easel",
  "artist": "Rembrandt Harmenszoon van Rijn, 1606-1669",
  "date": "1660",
  "where": "Louvre, Paris, France",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Rembrandt_Self_Portrait_at_The_Easel.jpg",
  "refs": [
   "Ecclesiastes 3:1-13"
  ],
  "days": [
   "Year A New Year’s Day",
   "Year B New Year’s Day",
   "Year C New Year’s Day"
  ],
  "essay": "https://thevcs.org/everything-season/business-god-has-given?first=1471",
  "act": "https://act.library.vanderbilt.edu/artworks/58861",
  "licence": "Public domain",
  "attribution": "Rembrandt Harmenszoon van Rijn, 1606-1669. Self-Portrait at the Easel, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58862,
  "title": "Allegory of the City of Madrid",
  "artist": "Goya, Francisco, 1746-1828",
  "date": "1810",
  "where": "Museo de Historia de Madrid, Madrid, Spain",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Goya_y_Lucientes,_Francisco_de_Allegory_of_the_City_of_Madrid_1810.jpg",
  "refs": [
   "Ecclesiastes 3:1-13"
  ],
  "days": [
   "Year A New Year’s Day",
   "Year B New Year’s Day",
   "Year C New Year’s Day"
  ],
  "essay": "https://thevcs.org/everything-season/reversals-fortune?first=1466",
  "act": "https://act.library.vanderbilt.edu/artworks/58862",
  "licence": "Public domain",
  "attribution": "Goya, Francisco, 1746-1828. Allegory of the City of Madrid, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58863,
  "title": "Parable of the Labourers in the Vineyard",
  "artist": "Rembrandt Harmenszoon van Rijn, 1606-1669",
  "date": "1637",
  "where": "Hermitage Museum, Saint Petersburg, Russia",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/labourersvineyard3m8g91wo.jpg",
  "refs": [
   "Isaiah 5:1-7"
  ],
  "days": [
   "Year C Proper 15th Sunday",
   "Year A Proper 22nd Sunday"
  ],
  "essay": "https://thevcs.org/song-vineyard/just-wages?first=5131",
  "act": "https://act.library.vanderbilt.edu/artworks/58863",
  "licence": "Public domain",
  "attribution": "Rembrandt Harmenszoon van Rijn, 1606-1669. Parable of the Labourers in the Vineyard, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58864,
  "title": "Saint Francis Receiving the Stigmata",
  "artist": "Giotto, 1266?-1337",
  "date": "1337",
  "where": "Basilica of Saint Francis of Assisi, Assisi, Italy",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/legendfrancis5gj1m0a8.jpg",
  "refs": [
   "Isaiah 6:1-8"
  ],
  "days": [
   "Year B Trinity Sunday"
  ],
  "essay": "https://thevcs.org/holy-holy-holy/theatre-divine-life?first=4386",
  "act": "https://act.library.vanderbilt.edu/artworks/58864",
  "licence": "Public domain",
  "attribution": "Giotto, 1266?-1337. Saint Francis Receiving the Stigmata, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58865,
  "title": "Throne of the Third Heaven of the Nations' Millennium General Assembly",
  "artist": "Hampton, James, 1909-1964",
  "date": "1950-1964",
  "where": "Smithsonian American Art Museum, Washington, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/thirdheaven4ty8w2k.jpg",
  "refs": [
   "Isaiah 6:1-8"
  ],
  "days": [
   "Year B Trinity Sunday"
  ],
  "essay": "https://thevcs.org/holy-holy-holy/found-glory?first=4386",
  "act": "https://act.library.vanderbilt.edu/artworks/58865",
  "licence": "CC BY-SA 4.0",
  "attribution": "Hampton, James, 1909-1964. Throne of the Third Heaven of the Nations' Millennium General Assembly, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58866,
  "title": "Rue de l'Épicerie in Rouen, Effect of Sunlight",
  "artist": "Pissarro, Camille, 1830-1903",
  "date": "1898",
  "where": "Metropolitan Museum of Art, New York, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/ruelepicerie8t9g4n5b.jpg",
  "refs": [
   "Isaiah 55:1-9"
  ],
  "days": [
   "Year A Proper 13th Sunday"
  ],
  "essay": "https://thevcs.org/return-again/economy-god?first=4661",
  "act": "https://act.library.vanderbilt.edu/artworks/58866",
  "licence": "Public domain",
  "attribution": "Pissarro, Camille, 1830-1903. Rue de l'Épicerie in Rouen, Effect of Sunlight, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58867,
  "title": "Christ in the Winepress",
  "artist": "Pinaigrier, Nicholas",
  "date": "1585-1606",
  "where": "Saint-Étienne-du-Mont, Paris, France",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/christwinepress7ty4f32d.jpg",
  "refs": [
   "Isaiah 63:7-9"
  ],
  "days": [
   "Year A Christmas 1st Sunday"
  ],
  "essay": "https://thevcs.org/winepress/be-ready-pressing?first=1236",
  "act": "https://act.library.vanderbilt.edu/artworks/58867",
  "licence": "CC0",
  "attribution": "Pinaigrier, Nicholas. Christ in the Winepress, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58874,
  "title": "Altarpiece No. 1",
  "artist": "Klint, Hilma af, 1862-1944",
  "date": "1915",
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/altarpiece18ugnc36.jpg",
  "refs": [
   "Thessalonians I, 5:1-11"
  ],
  "days": [
   "Year A Proper 28th Sunday"
  ],
  "essay": "https://thevcs.org/faith-hope-and-love/behold-i-tell-you-secret",
  "act": "https://act.library.vanderbilt.edu/artworks/58874",
  "licence": "Public domain",
  "attribution": "Klint, Hilma af, 1862-1944. Altarpiece No. 1, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58894,
  "title": "Landscape with the Destruction of Sodom and Gomorrah",
  "artist": "Patinir, Joachim, approximately 1485-1524",
  "date": "c. 1520",
  "where": "Museum Boijmans Van Beuningen, Rotterdam, Netherlands",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Joachim_Patinir_Landscape_with_the_Destruction_of_Sodom_and_Gomorrah.jpg",
  "refs": [
   "Genesis 19:1-29"
  ],
  "days": [],
  "essay": "https://thevcs.org/lots-wife/lots-wife?first=4861",
  "act": "https://act.library.vanderbilt.edu/artworks/58894",
  "licence": "Public domain",
  "attribution": "Patinir, Joachim, approximately 1485-1524. Landscape with the Destruction of Sodom and Gomorrah, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58975,
  "title": "Healing Touch",
  "artist": "Holmes, Tim",
  "date": "1987",
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Tim_Holmes_The_Healing_Touch.jpg",
  "refs": [
   "Psalm 107:1-3, 17-22"
  ],
  "days": [
   "Year B Lent 4th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/58975",
  "licence": "CC BY-SA 3.0",
  "attribution": "Holmes, Tim. Healing Touch, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 58996,
  "title": "Ascension of Elijah",
  "artist": null,
  "date": null,
  "where": "Santa Sabina, Rome, Italy",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Anonymous_Ascension_of_Elijah.jpg",
  "refs": [
   "Kings II, 2:1-18"
  ],
  "days": [
   "Year B Transfiguration Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/58996",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Ascension of Elijah, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: https://www.flickr.com/photos/paullew/14428162876."
 },
 {
  "id": 59002,
  "title": "Ethiopian and Eritrean Refugees Celebrate Christmas",
  "artist": "Yumlu, Ridvan",
  "date": "2012",
  "where": "Bethlehem, Palestinian Territories",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Ridvan_Yumlu_ Ethiopian_and_Eritrean_Refugees_Celebrate_Christmas.jpg",
  "refs": [
   "Psalm 97"
  ],
  "days": [
   "Year C Easter 7th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59002",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Yumlu, Ridvan. Ethiopian and Eritrean Refugees Celebrate Christmas, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: https://www.flickr.com/photos/pal_pics/6713162773."
 },
 {
  "id": 59003,
  "title": "Oikumene",
  "artist": "Pope, Ronald R.",
  "date": null,
  "where": "Derby Museum and Art Gallery, Derby, United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Ronald_R_Pope_Oikumene.jpg",
  "refs": [
   "John 17:20-26"
  ],
  "days": [
   "Year C Easter 7th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59003",
  "licence": "CC BY-SA 3.0",
  "attribution": "Pope, Ronald R.. Oikumene, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 59009,
  "title": "Messages of Thanks and Answered Prayers",
  "artist": null,
  "date": null,
  "where": "Our Lady of Guadalupe Church, New Orleans, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Anonymous_Messages_of_Thanks_and_Answered_Prayers.jpg",
  "refs": [
   "Psalm 138"
  ],
  "days": [
   "Year C Epiphany 5th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59009",
  "licence": "CC BY 2.5",
  "attribution": "Messages of Thanks and Answered Prayers, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 59010,
  "title": "Valencian Fisherwomen",
  "artist": "Bastida, Joaquín Sorolla y, 1863-1923",
  "date": null,
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Joaquin_Sorolla_Bastida_Valencian_Fisherwomen.jpg",
  "refs": [
   "Luke 5:1-11"
  ],
  "days": [
   "Year C Epiphany 5th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59010",
  "licence": "Public domain",
  "attribution": "Bastida, Joaquín Sorolla y, 1863-1923. Valencian Fisherwomen, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 59105,
  "title": "Valley of Dry Bones, Ezekiel",
  "artist": null,
  "date": "ca. 250",
  "where": "National Museum of Damascus, Damascus, Syria",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/ezekielValley48g01pdq.jpg",
  "refs": [
   "Ezekiel 37:1-14"
  ],
  "days": [
   "Year A Easter Vigil",
   "Year B Easter Vigil",
   "Year C Easter Vigil",
   "Year A Lent 5th  Sunday",
   "Year B Day of Pentecost"
  ],
  "essay": "https://thevcs.org/dry-bones/ancient-messianic-hope?first=1796",
  "act": "https://act.library.vanderbilt.edu/artworks/59105",
  "licence": "Public domain",
  "attribution": "Valley of Dry Bones, Ezekiel, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
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
  "essay": "https://thevcs.org/daniels-four-beasts/game?first=6471",
  "act": "https://act.library.vanderbilt.edu/artworks/59106",
  "licence": "Public domain",
  "attribution": "Poulakēs, Theodōros, approximately 1622-1692. Hymn to the Virgin, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 59107,
  "title": "Slave Ship",
  "artist": "Turner, J. M. W. (Joseph Mallord William), 1775-1851",
  "date": "1840",
  "where": "Museum of Fine Arts, Boston, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/slaveship7b1p92sx.jpg",
  "refs": [
   "Amos 5:18-24"
  ],
  "days": [
   "Year A Proper 27th Sunday"
  ],
  "essay": "https://thevcs.org/dark-days/rolling-down-waters?first=4356",
  "act": "https://act.library.vanderbilt.edu/artworks/59107",
  "licence": "Public domain",
  "attribution": "Turner, J. M. W. (Joseph Mallord William), 1775-1851. Slave Ship, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 59109,
  "title": "Downtrodden",
  "artist": "Kollwitz, Käthe Schmidt, 1867-1945",
  "date": "1900",
  "where": "Honolulu Museum of Art, Honolulu, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/downtrodden6yuzk913.jpg",
  "refs": [
   "Amos 5:18-24"
  ],
  "days": [
   "Year A Proper 27th Sunday"
  ],
  "essay": "https://thevcs.org/flight-egypt/flight-night",
  "act": "https://act.library.vanderbilt.edu/artworks/59109",
  "licence": "Public domain",
  "attribution": "Kollwitz, Käthe Schmidt, 1867-1945. Downtrodden, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 59110,
  "title": "Battle of Issus between Alexander and Darius III",
  "artist": null,
  "date": "ca. 100 BCE",
  "where": "National Archaeological Museum, Naples, Italy",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/battleissus5rf29pj8.jpg",
  "refs": [
   "Zechariah 9:9-12"
  ],
  "days": [
   "Year A Proper 9th Sunday"
  ],
  "essay": "https://thevcs.org/oracle-worried-people/beware-greeks-bearing-arms?first=4991",
  "act": "https://act.library.vanderbilt.edu/artworks/59110",
  "licence": "Public domain",
  "attribution": "Battle of Issus between Alexander and Darius III, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 59112,
  "title": "Landscape with the Destruction of Sodom and Gomorrah",
  "artist": "Patinir, Joachim, approximately 1485-1524",
  "date": "ca. 1520",
  "where": "Museum Boijmans Van Beuningen, Rotterdam, Netherlands",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/sodomgomorrah37tb10km.jpg",
  "refs": [
   "Genesis 19:1-29"
  ],
  "days": [],
  "essay": "https://thevcs.org/lots-wife/lots-wife?first=4861",
  "act": "https://act.library.vanderbilt.edu/artworks/59112",
  "licence": "Public domain",
  "attribution": "Patinir, Joachim, approximately 1485-1524. Landscape with the Destruction of Sodom and Gomorrah, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 59113,
  "title": "Dresden After the Bombardment",
  "artist": "Peter, Richard, 1895-1977",
  "date": "1945",
  "where": "View from the town hall tower with the allegory of kindness (sculpture by August Schreitmüller, 1908-10) (Image archived in Deutsche Fotothek in the Saxon State Library), Dresden, Germany",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/dresdenbombardment9ce2k18s.jpg",
  "refs": [
   "Genesis 19:1-29"
  ],
  "days": [],
  "essay": "https://thevcs.org/lots-wife/lots-wife?first=4861",
  "act": "https://act.library.vanderbilt.edu/artworks/59113",
  "licence": "CC BY-SA 3.0 de",
  "attribution": "Peter, Richard, 1895-1977. Dresden After the Bombardment, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 59114,
  "title": "Moses Rescued from the Waters",
  "artist": "Poussin, Nicolas, 1594?-1665",
  "date": "1638",
  "where": "Louvre, Paris, France",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/findingmoses74rg81mx.jpg",
  "refs": [
   "Exodus 2:1-10"
  ],
  "days": [],
  "essay": "https://thevcs.org/finding-moses/tranquility-restored?first=86",
  "act": "https://act.library.vanderbilt.edu/artworks/59114",
  "licence": "Public domain",
  "attribution": "Poussin, Nicolas, 1594?-1665. Moses Rescued from the Waters, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 59115,
  "title": "Moses's Journey into Egypt and the Circumcision of His Son Eliezar",
  "artist": "Perugino, approximately 1450-1523",
  "date": "ca. 1482",
  "where": "Sistine Chapel, Vatican City",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/mosesjourney5t9d2m1k.jpg",
  "refs": [
   "Exodus 4:10-31"
  ],
  "days": [],
  "essay": "https://thevcs.org/bridegroom-blood/unpacking-narrative?first=1",
  "act": "https://act.library.vanderbilt.edu/artworks/59115",
  "licence": "Public domain",
  "attribution": "Perugino, approximately 1450-1523. Moses's Journey into Egypt and the Circumcision of His Son Eliezar, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 59116,
  "title": "Agnus-Dei: The Scapegoat",
  "artist": "Tissot, James, 1836-1902",
  "date": "ca. 1886-1894",
  "where": "Brooklyn Museum, Brooklyn, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/agnusdei6h2k1s9p.jpg",
  "refs": [
   "Leviticus 16:1-5, 20-28"
  ],
  "days": [],
  "essay": "https://thevcs.org/scaping-sin/painful-transference?first=756",
  "act": "https://act.library.vanderbilt.edu/artworks/59116",
  "licence": "Public domain",
  "attribution": "Tissot, James, 1836-1902. Agnus-Dei: The Scapegoat, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 59117,
  "title": "Solomon Making a Sacrifice to the Idols",
  "artist": "Bourdon, Sebastien, 1616-1671",
  "date": "ca. 1646-1647",
  "where": "Louvre, Paris, France",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/solomonidols3trcj917.jpg",
  "refs": [
   "Deuteronomy 11:1-17"
  ],
  "days": [],
  "essay": "https://thevcs.org/solomon-shadows/flagrante?first=2266",
  "act": "https://act.library.vanderbilt.edu/artworks/59117",
  "licence": "Public domain",
  "attribution": "Bourdon, Sebastien, 1616-1671. Solomon Making a Sacrifice to the Idols, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 59118,
  "title": "Liberation of a Beleaguered City",
  "artist": null,
  "date": "ca. 400",
  "where": "Skulpturensammlung und das Museum für Byzantinische Kunst, Berlin, Germany",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/liberationcity3t8g9v2m.jpg",
  "refs": [
   "Joshua 10:16-27"
  ],
  "days": [],
  "essay": "https://thevcs.org/longest-day/be-strong-and-good-courage?first=826",
  "act": "https://act.library.vanderbilt.edu/artworks/59118",
  "licence": "CC BY 3.0",
  "attribution": "Liberation of a Beleaguered City, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 59119,
  "title": "Samson and Delilah",
  "artist": "Van Dyck, Anthony, 1599-1641",
  "date": "ca. 1628-1630",
  "where": "Kunsthistorisches Museum, Vienna, Austria",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/samsondelilah3t8m0s1i.jpg",
  "refs": [
   "Judges 16:1-22"
  ],
  "days": [],
  "essay": "https://thevcs.org/samson-and-delilah/tragic-lovers?first=1111",
  "act": "https://act.library.vanderbilt.edu/artworks/59119",
  "licence": "Public domain",
  "attribution": "Van Dyck, Anthony, 1599-1641. Samson and Delilah, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 59120,
  "title": "Judgment of Solomon",
  "artist": "Poussin, Nicolas, 1594?-1665",
  "date": "1649",
  "where": "Louvre, Paris, France",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/judgmentsolomon5b3f9s1x.jpg",
  "refs": [
   "Kings I, 3:16-28"
  ],
  "days": [],
  "essay": "https://thevcs.org/wisdom-solomon/justice-or-compassion?first=6251",
  "act": "https://act.library.vanderbilt.edu/artworks/59120",
  "licence": "Public domain",
  "attribution": "Poussin, Nicolas, 1594?-1665. Judgment of Solomon, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 59121,
  "title": "Queen Vashti Leaving the Royal Palace",
  "artist": "Lippi, Filippino, -1504",
  "date": "ca. 1480",
  "where": "Museo Home, Florence, Italy",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/queenvashti6hb01de4.jpg",
  "refs": [
   "Esther 1:1-21"
  ],
  "days": [],
  "essay": "https://thevcs.org/banished-vashti/what-price-dignity?first=3256",
  "act": "https://act.library.vanderbilt.edu/artworks/59121",
  "licence": "Public domain",
  "attribution": "Lippi, Filippino, -1504. Queen Vashti Leaving the Royal Palace, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 59122,
  "title": "Esther",
  "artist": "Millais, John Everett, 1829-1896",
  "date": "ca. 1863-1865",
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/esthermillais5y83vm9s.jpg",
  "refs": [
   "Esther 8:1-17"
  ],
  "days": [],
  "essay": "https://thevcs.org/esther-pleads-her-people/turncoat?first=421",
  "act": "https://act.library.vanderbilt.edu/artworks/59122",
  "licence": "Public domain",
  "attribution": "Millais, John Everett, 1829-1896. Esther, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 59123,
  "title": "Nocturne: Blue and Silver - Cremorne Lights",
  "artist": "Whistler, James McNeill, 1834-1903",
  "date": "1872",
  "where": "Tate, London, United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/nocturneblue7360viwu.jpg",
  "refs": [
   "Job 28:12-28"
  ],
  "days": [],
  "essay": "https://thevcs.org/where-shall-wisdom-be-found/long-rumours-wisdom?first=1036",
  "act": "https://act.library.vanderbilt.edu/artworks/59123",
  "licence": "Public domain",
  "attribution": "Whistler, James McNeill, 1834-1903. Nocturne: Blue and Silver - Cremorne Lights, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 59124,
  "title": "Ships in Distress off a Rocky Coast",
  "artist": "Backhuysen, Ludolf, approximately 1630-1708",
  "date": "1867",
  "where": "National Gallery of Art, Washington, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/shipsdistress38yt91jv.jpg",
  "refs": [
   "Job 28:12-28"
  ],
  "days": [],
  "essay": "https://thevcs.org/where-shall-wisdom-be-found/precarity?first=1036",
  "act": "https://act.library.vanderbilt.edu/artworks/59124",
  "licence": "Public domain",
  "attribution": "Backhuysen, Ludolf, approximately 1630-1708. Ships in Distress off a Rocky Coast, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 59125,
  "title": "Study of Cirrus Clouds",
  "artist": "Constable, John, 1776-1837",
  "date": "ca. 1822",
  "where": "Victoria and Albert Museum, London, United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/cirrusclouds2j9d0w1m.jpg",
  "refs": [
   "Job 28:12-28"
  ],
  "days": [],
  "essay": "https://thevcs.org/where-shall-wisdom-be-found/stage-sun?first=1036",
  "act": "https://act.library.vanderbilt.edu/artworks/59125",
  "licence": "Public domain",
  "attribution": "Constable, John, 1776-1837. Study of Cirrus Clouds, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 59126,
  "title": "Lady with Her Maidservant Holding a Letter",
  "artist": "Vermeer, Johannes, 1632-1675",
  "date": "1666-1667",
  "where": "Frick Collection, New York, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/ladymaidservant46th19ab.jpg",
  "refs": [
   "Song of Solomon 3:1-11"
  ],
  "days": [],
  "essay": "https://thevcs.org/soul-desire/nocturnal-movements?first=2126",
  "act": "https://act.library.vanderbilt.edu/artworks/59126",
  "licence": "Public domain",
  "attribution": "Vermeer, Johannes, 1632-1675. Lady with Her Maidservant Holding a Letter, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 59127,
  "title": "Susanna and the Elders",
  "artist": "Tintoretto, 1518-1594",
  "date": "ca. 1555-1556",
  "where": "Kunsthistorisches Museum, Vienna, Austria",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/susannaelders73rf91qw.jpg",
  "refs": [
   "Song of Solomon 4:9-5:1"
  ],
  "days": [],
  "essay": "https://thevcs.org/garden-earthly-and-heavenly-delights",
  "act": "https://act.library.vanderbilt.edu/artworks/59127",
  "licence": "Public domain",
  "attribution": "Tintoretto, 1518-1594. Susanna and the Elders, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
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
  "essay": "https://thevcs.org/fiery-furnace/shelter-most-high?first=4791",
  "act": "https://act.library.vanderbilt.edu/artworks/59128",
  "licence": "Public domain",
  "attribution": "Konstantinos, Adrianoupolitis. Story of Daniel and the Three Youths in the Fiery Furnace, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 59129,
  "title": "Belshazzar's Feast",
  "artist": "Martin, John, 1789-1854",
  "date": "1820",
  "where": "Yale Center for British Art, New Haven, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/belshazzarsfeast1945gapd.jpg",
  "refs": [
   "Daniel 5:1-12",
   "Daniel 5:13-31"
  ],
  "days": [],
  "essay": "https://thevcs.org/writing-wall/writing-wall?first=4676",
  "act": "https://act.library.vanderbilt.edu/artworks/59129",
  "licence": "Public domain",
  "attribution": "Martin, John, 1789-1854. Belshazzar's Feast, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 59130,
  "title": "Belshazzar's Feast",
  "artist": "Rembrandt Harmenszoon van Rijn, 1606-1669",
  "date": "ca. 1635-1638",
  "where": "National Gallery, London, United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/belshazzarrembrandt36tghw21.jpg",
  "refs": [
   "Daniel 5:1-12"
  ],
  "days": [],
  "essay": "https://thevcs.org/writing-wall/writing-wall?first=4676",
  "act": "https://act.library.vanderbilt.edu/artworks/59130",
  "licence": "Public domain",
  "attribution": "Rembrandt Harmenszoon van Rijn, 1606-1669. Belshazzar's Feast, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 59131,
  "title": "Meat Stall with the Holy Family Giving Alms",
  "artist": "Aertsen, Pieter, 1508-1575",
  "date": "1551",
  "where": "North Carolina Museum of Art, Raleigh, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/meatstall5tyvc193.jpg",
  "refs": [
   "Hosea 4:1-19"
  ],
  "days": [],
  "essay": "https://thevcs.org/time-change/they-shall-eat-not-be-satisfied?first=2296",
  "act": "https://act.library.vanderbilt.edu/artworks/59131",
  "licence": "Public domain",
  "attribution": "Aertsen, Pieter, 1508-1575. Meat Stall with the Holy Family Giving Alms, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 59132,
  "title": "Fragment of the Alps",
  "artist": "Ruskin, John, 1819-1900",
  "date": "1854-1856",
  "where": "Harvard Art Museums, Cambridge, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/fragmentsalps38fi10ax.jpg",
  "refs": [
   "Hosea 14:1-9"
  ],
  "days": [],
  "essay": "https://thevcs.org/gardened-god/divinity-detail?first=6116",
  "act": "https://act.library.vanderbilt.edu/artworks/59132",
  "licence": "Public domain",
  "attribution": "Ruskin, John, 1819-1900. Fragment of the Alps, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 59134,
  "title": "Summer",
  "artist": "Wertinger, Hans, approximately 1465-1533",
  "date": "ca. 1525",
  "where": "National Gallery, London, United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/summerwertinger392eds1b.jpg",
  "refs": [
   "Hosea 14:1-9"
  ],
  "days": [],
  "essay": "https://thevcs.org/gardened-god/rendering-fruit?first=6111",
  "act": "https://act.library.vanderbilt.edu/artworks/59134",
  "licence": "Public domain",
  "attribution": "Wertinger, Hans, approximately 1465-1533. Summer, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 59135,
  "title": "Forest Fire",
  "artist": "Piero, di Cosimo, 1462-1521",
  "date": "ca. 1505",
  "where": "Ashmolean Museum of Art and Archaeology, Oxford, United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/forestfire35rgow19.jpg",
  "refs": [
   "Joel 1:1-20"
  ],
  "days": [],
  "essay": "https://thevcs.org/landscapes-devastation/devouring-flames?first=116",
  "act": "https://act.library.vanderbilt.edu/artworks/59135",
  "licence": "Public domain",
  "attribution": "Piero, di Cosimo, 1462-1521. Forest Fire, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 59136,
  "title": "Jonah",
  "artist": "Lorenzetto",
  "date": "ca. 1520",
  "where": "Chigi Chapel in the Basilica of Santa Maria del Popolo, Rome, Italy",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/jonahlorenzetto48fgt12d.jpg",
  "refs": [
   "Jonah 2:1-10"
  ],
  "days": [],
  "essay": "https://thevcs.org/jonah-and-whale/o-death-where-thy-sting?first=2586",
  "act": "https://act.library.vanderbilt.edu/artworks/59136",
  "licence": "CC BY 3.0",
  "attribution": "Lorenzetto. Jonah, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 59137,
  "title": "Jonah and the Whale",
  "artist": "Lastman, Pieter, 1583-1633",
  "date": "1621",
  "where": "Museum Kunstpalast, Düsseldorf, Germany",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/jonahwhale3gbtu127.jpg",
  "refs": [
   "Jonah 2:1-10"
  ],
  "days": [],
  "essay": "https://thevcs.org/jonah-and-whale/deliverance-belongs-lord?first=2586",
  "act": "https://act.library.vanderbilt.edu/artworks/59137",
  "licence": "Public domain",
  "attribution": "Lastman, Pieter, 1583-1633. Jonah and the Whale, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 59138,
  "title": "Jonah and the Whale",
  "artist": null,
  "date": "ca. 1400",
  "where": "Metropolitan Museum of Art, New York City, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/jonahwhale10ryxm72.jpg",
  "refs": [
   "Jonah 2:1-10"
  ],
  "days": [],
  "essay": "https://thevcs.org/jonah-and-whale/faithful-repentance?first=2586",
  "act": "https://act.library.vanderbilt.edu/artworks/59138",
  "licence": "Public domain",
  "attribution": "Jonah and the Whale, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 59140,
  "title": "Triptych with the Life Story of Solomon",
  "artist": null,
  "date": "ca. 1521",
  "where": "Mauritshuis, The Hague, Netherlands",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/triptychsolomon1497gyqc.jpg",
  "refs": [
   "Kings I, 11:26-40"
  ],
  "days": [],
  "essay": "https://thevcs.org/solomons-idolatry",
  "act": "https://act.library.vanderbilt.edu/artworks/59140",
  "licence": "Public domain",
  "attribution": "Triptych with the Life Story of Solomon, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 59141,
  "title": "Suicide of Saul",
  "artist": "Bruegel, Pieter, approximately 1525-1569",
  "date": "1562",
  "where": "Kunsthistorisches Museum, Vienna, Austria",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/suicidesaul35tp91sd.jpg",
  "refs": [
   "Chronicles I, 10:1-14"
  ],
  "days": [],
  "essay": "https://thevcs.org/decisions-decisions/alone-again-naturally?first=2811",
  "act": "https://act.library.vanderbilt.edu/artworks/59141",
  "licence": "Public domain",
  "attribution": "Bruegel, Pieter, approximately 1525-1569. Suicide of Saul, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 59142,
  "title": "Esther before Ahasuerus",
  "artist": "Guercino, 1591-1666",
  "date": "1639",
  "where": "University of Michigan Museum of Art, Ann Arbor, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/estherahasuerus75tg92so.jpg",
  "refs": [
   "Esther 8:1-17"
  ],
  "days": [],
  "essay": "https://thevcs.org/esther-pleads-her-people/paradoxes-power?first=416",
  "act": "https://act.library.vanderbilt.edu/artworks/59142",
  "licence": "Public domain",
  "attribution": "Guercino, 1591-1666. Esther before Ahasuerus, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 59143,
  "title": "Christ as the Man of Sorrows",
  "artist": "Cranach, Lucas, 1472-1553",
  "date": "1537",
  "where": "Ludwig Roselius Museum, Bremen, Germany",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/christmansorrows64gm1q0a.jpg",
  "refs": [
   "Psalm 88"
  ],
  "days": [],
  "essay": "https://thevcs.org/psalters-darkest-hour/opening-darkness?first=2416",
  "act": "https://act.library.vanderbilt.edu/artworks/59143",
  "licence": "Public domain",
  "attribution": "Cranach, Lucas, 1472-1553. Christ as the Man of Sorrows, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 59154,
  "title": "Prophet Zechariah",
  "artist": "Michelangelo Buonarroti, 1475-1564",
  "date": "1508-1512",
  "where": "Sistine Chapel, Vatican City",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/prophetzechariah39bu14sw.jpg",
  "refs": [
   "Zechariah 1:1-17"
  ],
  "days": [],
  "essay": "https://thevcs.org/index.php/exalted-return-jerusalem/prophet?first=3796",
  "act": "https://act.library.vanderbilt.edu/artworks/59154",
  "licence": "Public domain",
  "attribution": "Michelangelo Buonarroti, 1475-1564. Prophet Zechariah, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 59155,
  "title": "Re-building of the Temple in Jerusalem",
  "artist": "Doré, Gustave, 1832-1883",
  "date": "1886",
  "where": "Dore Bible",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/rebuildingtemple4781gtqp.jpg",
  "refs": [
   "Zechariah 1:1-17"
  ],
  "days": [],
  "essay": "https://thevcs.org/index.php/exalted-return-jerusalem/reconstruction?first=3796",
  "act": "https://act.library.vanderbilt.edu/artworks/59155",
  "licence": "Public domain",
  "attribution": "Doré, Gustave, 1832-1883. Re-building of the Temple in Jerusalem, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 59156,
  "title": "Genealogy of Christ",
  "artist": "Herrad, of Landsberg, Abbess of Hohenburg, approximately 1130-1195",
  "date": "ca. 1175-1195",
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/treejesse9012rtoc.jpg",
  "refs": [
   "Matthew 1:1-17"
  ],
  "days": [],
  "essay": "https://thevcs.org/genealogies-jesus/abraham-and-his-seed?first=6986",
  "act": "https://act.library.vanderbilt.edu/artworks/59156",
  "licence": "Public domain",
  "attribution": "Herrad, of Landsberg, Abbess of Hohenburg, approximately 1130-1195. Genealogy of Christ, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 59157,
  "title": "Saint Matthew and the Angel",
  "artist": "Caravaggio, Michelangelo Merisi da, 1573-1610",
  "date": "1602",
  "where": "Formerly part of the Kaiser Friedrich Museum, Berlin, destroyed in WWII, 1945",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/matthewangel4r9d2m0x.jpg",
  "refs": [
   "Matthew 1:1-17"
  ],
  "days": [],
  "essay": "https://thevcs.org/genealogies-jesus/caravaggios-first-inspiration?first=6996",
  "act": "https://act.library.vanderbilt.edu/artworks/59157",
  "licence": "Public domain",
  "attribution": "Caravaggio, Michelangelo Merisi da, 1573-1610. Saint Matthew and the Angel, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 59158,
  "title": "Mosaic of Jesus and his ancestors (Genealogy of Christ)",
  "artist": null,
  "date": "1315-1321",
  "where": "Chora Church, Istanbul, Turkey",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/genealogyjesus35tg06mz.jpg",
  "refs": [
   "Matthew 1:1-17"
  ],
  "days": [],
  "essay": "https://thevcs.org/genealogies-jesus/descendants-christ-pantocrator?first=6996",
  "act": "https://act.library.vanderbilt.edu/artworks/59158",
  "licence": "CC BY-SA 3.0",
  "attribution": "Mosaic of Jesus and his ancestors (Genealogy of Christ), from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
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
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59161",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Wesley, Frank, 1923-2002. Twenty-Third Psalm, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of Frank Wesley, http://www.frankwesleyart.com/main_page.htm."
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
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59173",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Wesley, Frank, 1923-2002. Stephen Feeding the Poor, Acts 6:3, 5, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of Frank Wesley, http://www.frankwesleyart.com/main_page.htm."
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
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59180",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Wesley, Frank, 1923-2002. New Wine in Old Wineskins, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of Frank Wesley, http://www.frankwesleyart.com/main_page.htm."
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
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59198",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Wesley, Frank, 1923-2002. Jonah in the Whale, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of Frank Wesley, http://www.frankwesleyart.com/main_page.htm."
 },
 {
  "id": 59210,
  "title": "Every Pot Shall be Holy Unto the Lord",
  "artist": "Wesley, Frank, 1923-2002",
  "date": null,
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Every Pot Shall be Holy unto the Lord-Frank Wesley.jpg",
  "refs": [
   "Joshua 24:1-2a, 14-18"
  ],
  "days": [
   "Year B Proper 16th Sunday",
   ""
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59210",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Wesley, Frank, 1923-2002. Every Pot Shall be Holy Unto the Lord, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of Frank Wesley, http://www.frankwesleyart.com/main_page.htm."
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
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59217",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Wesley, Frank, 1923-2002. Dedication of Paul and Barnabas, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of Frank Wesley, http://www.frankwesleyart.com/main_page.htm."
 },
 {
  "id": 59230,
  "title": "Before Abraham Was I Am",
  "artist": "Wesley, Frank, 1923-2002",
  "date": null,
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Before Abraham Was, I Am-Frank Wesley-standard-scale-2_00x.jpg",
  "refs": [
   "John 8:57-58"
  ],
  "days": [
   ""
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59230",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Wesley, Frank, 1923-2002. Before Abraham Was I Am, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of Frank Wesley, http://www.frankwesleyart.com/main_page.htm."
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
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59263",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Wesley, Frank, 1923-2002. The Healing Shadow of Peter, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of Frank Wesley, http://www.frankwesleyart.com/main_page.htm."
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
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59267",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Wesley, Frank, 1923-2002. Woman Taken in Adultery, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of Frank Wesley, http://www.frankwesleyart.com/main_page.htm."
 },
 {
  "id": 59310,
  "title": "Tree",
  "artist": "Valente, Liz",
  "date": "2021",
  "where": "Viçosa, Brazil",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Tree-Climbing-LV-standard-scale-2_00x.jpg",
  "refs": [
   "Psalm 104:1-9, 24, 35c"
  ],
  "days": [
   "Year B Proper 24th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59310",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Valente, Liz. Tree, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Liz Valente, https://www.instagram.com/donalizvalente/."
 },
 {
  "id": 59313,
  "title": "Sewing",
  "artist": "Valente, Liz",
  "date": "2021",
  "where": "Viçosa, Brazil",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Sewing-LV.jpg",
  "refs": [
   "Psalm 73"
  ],
  "days": [],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59313",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Valente, Liz. Sewing, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Liz Valente, https://www.instagram.com/donalizvalente/."
 },
 {
  "id": 59321,
  "title": "Cocoon",
  "artist": "Valente, Liz",
  "date": "2021",
  "where": "Viçosa, Brazil",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Cocoon-LV.jpg",
  "refs": [
   "Psalm 125"
  ],
  "days": [
   "Year B Proper 18th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59321",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Valente, Liz. Cocoon, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Liz Valente, https://www.instagram.com/donalizvalente/."
 },
 {
  "id": 59329,
  "title": "My Heart for the Lord",
  "artist": "Valente, Liz",
  "date": "2021",
  "where": "Viçosa, Brazil",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/My-Heart-for-the-Lord-LV.jpg",
  "refs": [
   "Psalm 111"
  ],
  "days": [
   "Year B Epiphany 4thSunday",
   "Year B Proper 15th Sunday",
   "Year C Proper 23rd Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59329",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Valente, Liz. My Heart for the Lord, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Liz Valente, https://www.instagram.com/donalizvalente/."
 },
 {
  "id": 59338,
  "title": "Flight into Egypt",
  "artist": "Carpaccio, Vittore, 1455?-1525?",
  "date": "ca. 1515",
  "where": "National Gallery of Art, Washington, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Vittore_Carpaccio_The_Flight_into_Egypt-1500.jpg",
  "refs": [
   "Matthew 2:13-18"
  ],
  "days": [],
  "essay": "https://thevcs.org/flight-egypt/reading-landscape?first=316",
  "act": "https://act.library.vanderbilt.edu/artworks/59338",
  "licence": "Public domain",
  "attribution": "Carpaccio, Vittore, 1455?-1525?. Flight into Egypt, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 59340,
  "title": "Triumph of the Innocents",
  "artist": "Hunt, William Holman, 1827-1910",
  "date": "ca. 1883",
  "where": "Tate Britain, London, United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/William_Holman_Hunt_The_Triumph_of_the_Innocents.jpg",
  "refs": [
   "Matthew 2:13-23"
  ],
  "days": [
   "Year A Christmas 1st Sunday"
  ],
  "essay": "https://thevcs.org/light-egypt/revelation-dream?first=316",
  "act": "https://act.library.vanderbilt.edu/artworks/59340",
  "licence": "Public domain",
  "attribution": "Hunt, William Holman, 1827-1910. Triumph of the Innocents, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 59341,
  "title": "Return of the Holy Family from Egypt",
  "artist": "Poussin, Nicolas, 1594?-1665",
  "date": "ca. 1628",
  "where": "Dulwich Picture Gallery, London, United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Nicolas_Poussin_The_Return_of_the_Holy_Family_from_Egypt.jpg",
  "refs": [
   "Matthew 2:13-23"
  ],
  "days": [
   "Year A Christmas 1st Sunday"
  ],
  "essay": "https://thevcs.org/return-egypt/fateful-crossing?first=141",
  "act": "https://act.library.vanderbilt.edu/artworks/59341",
  "licence": "Public domain",
  "attribution": "Poussin, Nicolas, 1594?-1665. Return of the Holy Family from Egypt, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 59343,
  "title": "Wheatfield with Crows",
  "artist": "Gogh, Vincent van, 1853-1890",
  "date": "1890",
  "where": "Van Gogh Museum, Amsterdam, Netherlands",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Vincent_van_Gogh_Wheatfield_with_crows.jpg",
  "refs": [
   "Matthew 6:19-24",
   "Luke 12:22-31"
  ],
  "days": [],
  "essay": "https://thevcs.org/seek-ye-first-kingdom-god/look-birds-air?first=6916",
  "act": "https://act.library.vanderbilt.edu/artworks/59343",
  "licence": "Public domain",
  "attribution": "Gogh, Vincent van, 1853-1890. Wheatfield with Crows, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 59344,
  "title": "Vase of Tulips",
  "artist": "Cézanne, Paul, 1839-1906",
  "date": "ca. 1890",
  "where": "Art Institute of Chicago, Chicago, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Paul_Cézanne_The_Vase_of_Tulips.jpg",
  "refs": [
   "Matthew 6:19-24",
   "Luke 12:22-31"
  ],
  "days": [],
  "essay": "https://thevcs.org/seek-ye-first-kingdom-god/consider-lilies-field?first=6916",
  "act": "https://act.library.vanderbilt.edu/artworks/59344",
  "licence": "Public domain",
  "attribution": "Cézanne, Paul, 1839-1906. Vase of Tulips, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 59345,
  "title": "Christ Asleep during the Tempest",
  "artist": "Delacroix, Eugène, 1798-1863",
  "date": "ca. 1853",
  "where": "Metropolitan Museum of Art, New York, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Eugene_Delacroix_Christ_Asleep_During_the_Tempest.jpg",
  "refs": [
   "Luke 8:22-25",
   "Matthew 8:23-27"
  ],
  "days": [],
  "essay": "https://thevcs.org/calming-storm/interior-tempest?first=7121",
  "act": "https://act.library.vanderbilt.edu/artworks/59345",
  "licence": "Public domain",
  "attribution": "Delacroix, Eugène, 1798-1863. Christ Asleep during the Tempest, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 59346,
  "title": "Healing of the Possessed Man of Gerasa",
  "artist": "Bril, Paul, 1554-1626",
  "date": "1601",
  "where": "Alte Pinakothek, Munich, Germany",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Anonymous_Christ_healing_the_possessed_of_Gerasa_Milanese_workshop_c._968_AD.jpg",
  "refs": [
   "Mark 5:1-20",
   "Luke 8:26-39",
   "Matthew 8:28-9:1"
  ],
  "days": [
   "Year C Proper 7th Sunday"
  ],
  "essay": "https://thevcs.org/gerasene-demoniac/whimsical-landscape?first=5756",
  "act": "https://act.library.vanderbilt.edu/artworks/59346",
  "licence": "Public domain",
  "attribution": "Bril, Paul, 1554-1626. Healing of the Possessed Man of Gerasa, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 59347,
  "title": "Healing of the Possessed Man of Gerasa",
  "artist": null,
  "date": "ca. 962-968",
  "where": "Hessisches Landesmuseum Darmstadt, Darmstadt, Germany",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/healingpossessed45ghix90.jpg",
  "refs": [
   "Mark 5:1-20",
   "Luke 8:26-39",
   "Matthew 8:28-9:1"
  ],
  "days": [
   "Year C Proper 7th Sunday"
  ],
  "essay": "https://thevcs.org/gerasene-demoniac/jesus-heals-gerasene-demoniac?first=5761",
  "act": "https://act.library.vanderbilt.edu/artworks/59347",
  "licence": "Public domain",
  "attribution": "Healing of the Possessed Man of Gerasa, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 59349,
  "title": "Daughters of Edward Darley Boit",
  "artist": "Sargent, John Singer, 1856-1925",
  "date": "1882",
  "where": "Museum of Fine Arts, Boston, Boston, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/John_Singer_Sargent_Daughters_of_Edward_Boit.jpg",
  "refs": [
   "Matthew 12:46-50"
  ],
  "days": [],
  "essay": "https://thevcs.org/who-are-my-mother-and-my-brothers/unrelated-relations?first=7221",
  "act": "https://act.library.vanderbilt.edu/artworks/59349",
  "licence": "Public domain",
  "attribution": "Sargent, John Singer, 1856-1925. Daughters of Edward Darley Boit, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 59350,
  "title": "Salome Dancing for Herod",
  "artist": "Horions, Hans",
  "date": "ca. 1634-1672",
  "where": "Rijksmuseum, Amsterdam, Netherlands",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Hans_Horions_Salome_danst_voor_Herodes_Rijksmuseum_SK-A-804.jpg",
  "refs": [
   "Matthew 14:1-12"
  ],
  "days": [
   "Year A Proper 24th Sunday"
  ],
  "essay": "https://thevcs.org/salomes-dance/piercing-gazes?first=6536",
  "act": "https://act.library.vanderbilt.edu/artworks/59350",
  "licence": "Public domain",
  "attribution": "Horions, Hans. Salome Dancing for Herod, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 59351,
  "title": "Christ Walking on the Water",
  "artist": "Runge, Philipp Otto, 1777-1810",
  "date": "ca. 1806-1807",
  "where": "Hamburger Kunsthalle, Hamburg, Germany",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Philipp_Otto_Runge_Petrus_auf_dem_Meer_Christ_walks_on_the_water_ca1806.jpg",
  "refs": [
   "Matthew 14:22-33"
  ],
  "days": [
   "Year A Proper 14th Sunday"
  ],
  "essay": "https://thevcs.org/walking-water/those-peril-sea?first=5546",
  "act": "https://act.library.vanderbilt.edu/artworks/59351",
  "licence": "Public domain",
  "attribution": "Runge, Philipp Otto, 1777-1810. Christ Walking on the Water, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 59352,
  "title": "Carrying of the Cross",
  "artist": "Martini, Simone, 1283-1344",
  "date": "ca. 1335",
  "where": "Louvre, Paris, France",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Simone_Martini_Carrying_of_the_Cross.jpg",
  "refs": [
   "Matthew 16:21-28",
   "Luke 9:21-27"
  ],
  "days": [
   "Year A Proper 17th Sunday"
  ],
  "essay": "https://thevcs.org/forfeit-and-gain/if-any-would-come-after-me?first=6441",
  "act": "https://act.library.vanderbilt.edu/artworks/59352",
  "licence": "Public domain",
  "attribution": "Martini, Simone, 1283-1344. Carrying of the Cross, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 59353,
  "title": "Christ Carrying the Cross",
  "artist": "Hemessen, Jan Sanders van, approximately 1500-approximately 1563",
  "date": "1553",
  "where": "Christian Museum, Esztergom, Hungary",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Jan_van_Hemessen_Christ_Carrying_the_Cross_WGA11350.jpg",
  "refs": [
   "Matthew 16:21-28",
   "Luke 9:21-27"
  ],
  "days": [
   "Year A Proper 17th Sunday"
  ],
  "essay": "https://thevcs.org/forfeit-and-gain/son-man-will-also-be-ashamed?first=6446",
  "act": "https://act.library.vanderbilt.edu/artworks/59353",
  "licence": "Public domain",
  "attribution": "Hemessen, Jan Sanders van, approximately 1500-approximately 1563. Christ Carrying the Cross, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 59354,
  "title": "Saint Peter Paying the Tribute with a Piece of Silver Found in a Fish",
  "artist": "Hayter, George Sir, 1792-1871",
  "date": "1817",
  "where": null,
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/George_Hayter_SAINT_PETER_PAYING_THE_TRIBUTE_WITH_A_PIECE_OF_SILVER_FOUND_IN_A_FISH.jpg",
  "refs": [
   "Matthew 17:22-27"
  ],
  "days": [],
  "essay": "https://thevcs.org/tribute-money/hijacking-scripture?first=6596",
  "act": "https://act.library.vanderbilt.edu/artworks/59354",
  "licence": "Public domain",
  "attribution": "Hayter, George Sir, 1792-1871. Saint Peter Paying the Tribute with a Piece of Silver Found in a Fish, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
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
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59642",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Miller, Mary Jane. Mary the Theotokos, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Mary Jane Miller, https://www.millericons.com/."
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
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59648",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Wesley, Frank, 1923-2002. Vertical Flight in the Night, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Estate of Frank Wesley, http://www.frankwesleyart.com/main_page.htm."
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
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59655",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Miller, Mary Jane. A Mother's Love Holds the World, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: https://www.millericons.com/."
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
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59658",
  "licence": "Used by permission of the artist (non-commercial, with attribution)",
  "attribution": "Miller, Mary Jane. Mary of the Burning Bush, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Mary Jane Miller, https://www.millericons.com/."
 },
 {
  "id": 59716,
  "title": "Samson",
  "artist": "Solomon Joseph Solomon",
  "date": "1886-1887",
  "where": "Walker Art Gallery, Liverpool, United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/samsonsolomon4569vtaw.jpg",
  "refs": [
   "Judges 16:1-22"
  ],
  "days": [],
  "essay": "https://thevcs.org/samson-and-delilah/exposed?first=1106",
  "act": "https://act.library.vanderbilt.edu/artworks/59716",
  "licence": "Public domain",
  "attribution": "Solomon Joseph Solomon. Samson, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 59717,
  "title": "Betrayal of Christ",
  "artist": "Van Dyck, Anthony, 1599-1641",
  "date": "1618-1620",
  "where": "Bristol City Museum and Art Gallery, Bristol, United Kingdom",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/betrayaldyck39gb10me.jpg",
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
  "essay": "https://thevcs.org/betrayal-christ/judas-must-you-betray-me-with-kiss?first=6006",
  "act": "https://act.library.vanderbilt.edu/artworks/59717",
  "licence": "Public domain",
  "attribution": "Van Dyck, Anthony, 1599-1641. Betrayal of Christ, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 59718,
  "title": "Scenes from the Passion of Christ: The Agony in the Garden, the Crucifixion, and the Descent into Limbo triptych",
  "artist": "Andrea di Vanni d'Andrea, approximately 1332-approximately 1414",
  "date": "1380-1389",
  "where": "National Gallery of Art, Washington, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/scenespassion5t9d2k3l.jpg",
  "refs": [
   "Matthew 27:11-54"
  ],
  "days": [
   "Year A Liturgy of Pass"
  ],
  "essay": "https://thevcs.org/casting-lots/drawing-straws?first=5271",
  "act": "https://act.library.vanderbilt.edu/artworks/59718",
  "licence": "CC0",
  "attribution": "Andrea di Vanni d'Andrea, approximately 1332-approximately 1414. Scenes from the Passion of Christ: The Agony in the Garden, the Crucifixion, and the Descent into Limbo triptych, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 59719,
  "title": "Lamentation of Christ",
  "artist": "Mantegna, Andrea, 1431-1506",
  "date": "ca. 1490",
  "where": "Pinacoteca di Brera, Milan, Italy",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/lamentationchrist4r9g02sp.jpg",
  "refs": [
   "Matthew 27:57-66"
  ],
  "days": [
   "Year A Holy Saturday",
   "Year B Holy Saturday",
   "Year C Holy Saturday"
  ],
  "essay": "https://thevcs.org/flight-egypt/flight-night",
  "act": "https://act.library.vanderbilt.edu/artworks/59719",
  "licence": "Public domain",
  "attribution": "Mantegna, Andrea, 1431-1506. Lamentation of Christ, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 59720,
  "title": "Ascension of Christ",
  "artist": "Mistr vyšebrodského cyklu",
  "date": "ca. 1350",
  "where": "National Gallery Prague, Prague, Czech Republic",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/ascensionmistr39ty10kx.jpg",
  "refs": [
   "Luke 24:44-53",
   "Mark 16:19-20"
  ],
  "days": [
   "Year A Lent 5th  Sunday",
   "Year B Easter 6th Sunday"
  ],
  "essay": "https://thevcs.org/ascension/feet-last?first=5831",
  "act": "https://act.library.vanderbilt.edu/artworks/59720",
  "licence": "Public domain",
  "attribution": "Mistr vyšebrodského cyklu. Ascension of Christ, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 59721,
  "title": "Transfiguration",
  "artist": "Theophanes the Greek and workshop",
  "date": "1400-1425",
  "where": "Tretyakov Gallery, Moscow, Russia",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/transfigurationtheophanes52th96sd.jpg",
  "refs": [
   "Mark 9:2-9",
   "Mark 9:2-8",
   "Luke 9:28-36"
  ],
  "days": [
   "Year B Lent 2nd Sunday",
   "Year B Transfiguration Sunday",
   "Year C Transfiguration Sunday",
   "Year C Lent 2nd Sunday"
  ],
  "essay": "https://thevcs.org/transfiguration-0/the-transfiguration",
  "act": "https://act.library.vanderbilt.edu/artworks/59721",
  "licence": "Public domain",
  "attribution": "Theophanes the Greek and workshop. Transfiguration, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 59752,
  "title": "Orphan with Balloon",
  "artist": null,
  "date": "2006-2017",
  "where": "National Orphan Train Museum, Union Pacific Railroad Depot, Concordia, United States",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/National_Orphan_Train_Museum_Statue_62897d.jpg",
  "refs": [
   "Psalm 146"
  ],
  "days": [
   "Year B Proper 27th Sunday"
  ],
  "essay": "",
  "act": "https://act.library.vanderbilt.edu/artworks/59752",
  "licence": "CC BY-SA 3.0",
  "attribution": "Orphan with Balloon, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 },
 {
  "id": 59753,
  "title": "Field with Flowers Near Arles",
  "artist": "Gogh, Vincent van, 1853-1890",
  "date": "1888",
  "where": "Van Gogh Museum, Amsterdam, Netherlands",
  "img": "https://iiif-act.library.vanderbilt.edu/jpeg/Vincent_van_Gogh_Veld_met_bloemen_bij_Arles.jpg",
  "refs": [
   "Matthew 6:25-33",
   "Matthew 6:24-34"
  ],
  "days": [
   "Year A Epiphany 8th Sunday"
  ],
  "essay": "https://thevcs.org/parable-sower/there-went-out-sower-sow",
  "act": "https://act.library.vanderbilt.edu/artworks/59753",
  "licence": "Public domain",
  "attribution": "Gogh, Vincent van, 1853-1890. Field with Flowers Near Arles, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons."
 }
];
