import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Layout } from "@/components/layout";
import { useAuth } from "@/hooks/useAuth";

type BcpPrayer = { category: string; title: string; text: string };

const BCP_PRAYERS: BcpPrayer[] = [
  // FOR THE CHURCH
  { category: "For the Church", title: "For the Universal Church",
    text: "O God of unchangeable power and eternal light: Look favorably on your whole Church, that wonderful and sacred mystery; by the effectual working of your providence, carry out in tranquillity the plan of salvation; let the whole world see and know that things which were cast down are being raised up, and things which had grown old are being made new, and that all things are being brought to their perfection by him through whom all things were made, your Son Jesus Christ our Lord. Amen." },
  { category: "For the Church", title: "For a Church Convention or Meeting",
    text: "Almighty and everlasting God, who by the Holy Spirit presided over the council of the blessed Apostles, and has promised, through your Son Jesus Christ, to be present wherever two or three are gathered together in his Name: Grant that as we meet together in your Name, so we may be bound together by your Spirit, and find our decisions to be the expression of your will; through Jesus Christ our Lord. Amen." },
  { category: "For the Church", title: "For the Unity of the Church",
    text: "O God the Father of our Lord Jesus Christ, our only Savior, the Prince of Peace: Give us grace seriously to lay to heart the great dangers we are in by our unhappy divisions; take away all hatred and prejudice, and whatever else may hinder us from godly union and concord; that, as there is but one Body and one Spirit, one hope of our calling, one Lord, one Faith, one Baptism, one God and Father of us all, so we may be all of one heart and of one soul, united in one holy bond of truth and peace, of faith and charity, and may with one mind and one mouth glorify thee; through Jesus Christ our Lord. Amen." },
  { category: "For the Church", title: "For the Church's Ministry",
    text: "O God, you led your holy apostles to ordain ministers in every place: Grant that your Church, under the guidance of the Holy Spirit, may choose suitable persons for the ministry of Word and Sacrament, and may uphold them in their work for the extension of your kingdom; through him who is the Shepherd and Bishop of our souls, Jesus Christ our Lord, who lives and reigns with you and the Holy Spirit, one God, for ever and ever. Amen." },
  { category: "For the Church", title: "For the Election of a Bishop or other Minister",
    text: "Almighty God, giver of every good gift: Look graciously on your Church, and so guide the minds of those who shall choose a bishop for this diocese (or, a rector for this parish), that we may receive a faithful pastor, who will care for your people and equip us for our ministries; through Jesus Christ our Lord. Amen." },
  { category: "For the Church", title: "For the Consecration of a Church",
    text: "O Eternal God, mighty in power and of incomprehensible majesty, whom the heaven of heavens cannot contain, much less the walls of temples made with hands; graciously accept the dedication of this place to your honor and glory, through Jesus Christ our Lord. Amen." },
  { category: "For the Church", title: "For a Church or Mission",
    text: "Everliving God, whose will it is that all should come to you through your Son Jesus Christ: Inspire our witness to him, that all may know the power of his forgiveness and the hope of his resurrection; who lives and reigns with you and the Holy Spirit, one God, now and for ever. Amen." },
  { category: "For the Church", title: "For a Vestry or other Governing Body",
    text: "O Eternal God, the fountain of all wisdom: Enlighten with your grace the vestry of this parish, and all who bear authority in your Church, that they may seek above all things your honor and glory; strengthen them to bear their burdens well; and grant that with willing hearts they may devote their powers to your service, and to the welfare of your people; through Jesus Christ our Lord. Amen." },

  // FOR THE MISSION OF THE CHURCH
  { category: "For the Mission of the Church", title: "For the Spread of the Gospel",
    text: "O God of all nations of the earth: Remember the multitudes who have been created in your image but have not known the redeeming work of our Savior Jesus Christ; and grant that, by the prayers and labors of your holy Church, they may be brought to know and worship you as you have been revealed in your Son; who lives and reigns with you and the Holy Spirit, one God, for ever and ever. Amen." },
  { category: "For the Mission of the Church", title: "For the Mission of the Church",
    text: "Everliving God, whose will it is that all people should come to you through your Son Jesus Christ: Inspire our witness to him, that all may know the power of his forgiveness and the hope of his resurrection; who lives and reigns with you and the Holy Spirit, one God, now and for ever. Amen." },
  { category: "For the Mission of the Church", title: "For Missionaries",
    text: "Almighty and everlasting God, who alone works great marvels: Send down upon all missionaries and the congregations committed to their care the healthful Spirit of your grace; and, that they may truly please you, pour upon them the continual dew of your blessing. Grant this, O Lord, for the honor of our Advocate and Mediator, Jesus Christ. Amen." },
  { category: "For the Mission of the Church", title: "For our Enemies",
    text: "O God, the Father of all, whose Son commanded us to love our enemies: Lead them and us from prejudice to truth; deliver them and us from hatred, cruelty, and revenge; and in your good time enable us all to stand reconciled before you; through Jesus Christ our Lord. Amen." },
  { category: "For the Mission of the Church", title: "For Those Who Suffer for the Faith",
    text: "O God of all the prophets, you have always sent messengers who were rejected and persecuted: Grant to all who suffer for the sake of the gospel the grace to persevere, endurance for the trial, and hope in the resurrection; through Jesus Christ our Lord, who suffered and was glorified. Amen." },

  // FOR THE NATION
  { category: "For the Nation", title: "For Our Country",
    text: "Almighty God, who has given us this good land as our heritage: We humbly ask that we may always prove ourselves a people mindful of your favor and glad to do your will. Bless our land with honorable industry, sound learning, and pure manners. Save us from violence, discord, and confusion; from pride and arrogance, and from every evil way. In the time of prosperity, fill our hearts with thankfulness, and in the day of trouble, suffer not our trust in you to fail. Amen." },
  { category: "For the Nation", title: "For the President and all in Civil Authority",
    text: "O Lord our Governor, whose glory is in all the world: We commend this nation to your merciful care, that, being guided by your Providence, we may dwell secure in your peace. Grant to the President of the United States, the Governor of this State, and to all in authority, wisdom and strength to know and to do your will. Fill them with the love of truth and righteousness, and make them ever mindful of their calling to serve this people in your fear; through Jesus Christ our Lord, who lives and reigns with you and the Holy Spirit, one God, world without end. Amen." },
  { category: "For the Nation", title: "For Congress or a State Legislature",
    text: "O God, the fountain of wisdom, whose will is good and gracious, and whose law is truth: We beseech you so to guide and bless our Legislature (or the Congress of the United States), that it may ordain for our governance only such things as please you, to the glory of your Name and the welfare of this people; through Jesus Christ our Lord. Amen." },
  { category: "For the Nation", title: "For Courts of Justice",
    text: "Almighty God, who sittest in the throne judging right: We humbly beseech you to bless the courts of justice and the magistrates in all this land; and give unto them the spirit of wisdom and understanding, that they may discern the truth, and impartially administer the law in the fear of you alone; through him who shall come to be our Judge, your Son our Savior Jesus Christ. Amen." },
  { category: "For the Nation", title: "For Sound Government",
    text: "O Lord our Governor, bless the leaders of our land, that we may be a people at peace among ourselves and a blessing to other nations of the earth. Lord, keep this nation under your care. To all who have executive authority and to all who have administrative authority, grant wisdom and grace in the exercise of their duties. Give grace to your servants to put away all envy, hatred, and malice; and grant that they lead us in ways of justice, peace, and love; through Jesus Christ our Lord. Amen." },
  { category: "For the Nation", title: "For an Election",
    text: "Almighty God, to whom we must account for all our powers and privileges: Guide the people of the United States in the election of officials and representatives; that, by faithful administration and wise laws, the rights of all may be protected and our nation be enabled to fulfill your purposes; through Jesus Christ our Lord. Amen." },
  { category: "For the Nation", title: "For those in the Armed Forces",
    text: "Almighty God, we commend to your gracious care and keeping all the men and women of our armed forces at home and abroad. Defend them day by day with your heavenly grace; strengthen them in their trials and temptations; give them courage to face the perils which beset them; and grant them a sense of your abiding presence wherever they may be; through Jesus Christ our Lord. Amen." },

  // FOR THE WORLD
  { category: "For the World", title: "For Peace Among Nations",
    text: "Almighty God, our heavenly Father, guide the nations of the world into the way of justice and truth, and establish among them that peace which is the fruit of righteousness, that they may become the kingdom of our Lord and Savior Jesus Christ. Amen." },
  { category: "For the World", title: "For Peace",
    text: "Eternal God, in whose perfect kingdom no sword is drawn but the sword of righteousness, no strength known but the strength of love: So mightily spread abroad your Spirit, that all peoples may be gathered under the banner of the Prince of Peace, as children of one Father; to whom be dominion and glory, now and for ever. Amen." },
  { category: "For the World", title: "For the Human Family",
    text: "O God, you made us in your own image and redeemed us through Jesus your Son: Look with compassion on the whole human family; take away the arrogance and hatred which infect our hearts; break down the walls that separate us; unite us in bonds of love; and work through our struggle and confusion to accomplish your purposes on earth; that, in your good time, all nations and races may serve you in harmony around your heavenly throne; through Jesus Christ our Lord. Amen." },
  { category: "For the World", title: "In Times of Conflict",
    text: "O God, you have bound us together in a common life. Help us, in the midst of our struggles for justice and truth, to confront one another without hatred or bitterness, and to work together with mutual forbearance and respect; through Jesus Christ our Lord. Amen." },

  // FOR THE NATURAL ORDER
  { category: "For the Natural Order", title: "For the Conservation of Natural Resources",
    text: "Almighty God, in giving us dominion over things on earth, you made us fellow workers in your creation: Give us wisdom and reverence so to use the resources of nature, that no one may suffer from our abuse of them, and that generations yet to come may continue to praise you for your bounty; through Jesus Christ our Lord. Amen." },
  { category: "For the Natural Order", title: "For the Harvest of Lands and Waters",
    text: "O gracious Father, who opens your hand and fills all living things: Bless the lands and waters, and multiply the harvests of the world; let your Spirit go forth, that it may renew the face of the earth; show your loving-kindness, that our land may give her increase; and save us from selfish use of what you give, that men and women everywhere may give you thanks; through Christ our Lord. Amen." },
  { category: "For the Natural Order", title: "For the Future of the Human Race",
    text: "O God our heavenly Father, you have blessed us and given us dominion over all the earth: Increase our reverence before the mystery of life; and give us new insight into your purposes for the human race, and for the world you have made, that we may preserve what you have entrusted to us; through Jesus Christ our Lord. Amen." },

  // FOR THE POOR AND NEGLECTED
  { category: "For the Poor and Neglected", title: "For the Poor and Neglected",
    text: "Almighty and most merciful God, we remember before you all poor and neglected persons whom it would be easy for us to forget: the homeless and the destitute, the old and the sick, and all who have none to care for them. Help us to heal those who are broken in body or spirit, and to turn their sorrow into joy. Grant this, Father, for the love of your Son, who for our sake became poor, Jesus Christ our Lord. Amen." },
  { category: "For the Poor and Neglected", title: "For the Unemployed",
    text: "Heavenly Father, we remember before you those who suffer want and anxiety from lack of work. Guide the people of this land so to use our public and private wealth that all may find suitable and fulfilling employment, and receive just payment for their labor; through Jesus Christ our Lord. Amen." },
  { category: "For the Poor and Neglected", title: "For Schools and Colleges",
    text: "O Eternal God: Bless all schools, colleges, and universities, that they may be lively centers for sound learning, new discovery, and the pursuit of wisdom; and grant that those who teach and those who learn may find you to be the source of all truth; through Jesus Christ our Lord. Amen." },
  { category: "For the Poor and Neglected", title: "For those who Influence Public Opinion",
    text: "Almighty God, you proclaim your truth in every age by many voices: Direct, in our time, we pray, those who speak where many listen and write what many read; that they may do their part in making the heart of this people wise, its mind sound, and its will righteous; to the honor of Jesus Christ our Lord. Amen." },

  // FOR THE SICK
  { category: "For the Sick", title: "For the Sick (general)",
    text: "Heavenly Father, giver of life and health: Comfort and relieve your sick servants, and give your power of healing to those who minister to their needs, that those for whom our prayers are offered may be strengthened in their weakness and have confidence in your loving care; through Jesus Christ our Lord, who lives and reigns with you and the Holy Spirit, one God, now and for ever. Amen." },
  { category: "For the Sick", title: "For a Sick Person",
    text: "O Father of mercies and God of all comfort, our only help in time of need: We humbly beseech you to behold, visit, and relieve your sick servant for whom our prayers are desired. Look upon them with the eyes of your mercy; comfort them with a sense of your goodness; preserve them from the temptations of the enemy; and give them patience under their affliction. In your good time, restore them to health, and enable them to lead the residue of their life in your fear, and to your glory; and grant that finally they may dwell with you in life everlasting; through Jesus Christ our Lord. Amen." },
  { category: "For the Sick", title: "For Recovery from Sickness",
    text: "O God, the strength of the weak and the comfort of sufferers: Mercifully accept our prayers, and grant to your servant the help of your power, that their sickness may be turned into health, and our sorrow into joy; through Jesus Christ our Lord. Amen." },
  { category: "For the Sick", title: "For Health of Body and Soul",
    text: "May God the Father bless you, God the Son heal you, God the Holy Spirit give you strength. May God the holy and undivided Trinity guard your body, save your soul, and bring you safely to his heavenly country; where he lives and reigns for ever and ever. Amen." },
  { category: "For the Sick", title: "For Strength and Confidence",
    text: "Heavenly Father, giver of life and health: Grant to all the sick and suffering such a sense of your presence, that their minds may be made easy, and their hearts at rest; through Jesus Christ our Lord. Amen." },

  // FOR THE SORROWING
  { category: "For the Sorrowing", title: "Comfort and Relief",
    text: "O merciful Father, who has taught us in your holy Word that you do not willingly afflict or grieve the children of men: Look with pity upon the sorrows of your servants for whom our prayers are offered. Remember them, O Lord, in mercy; nourish their souls with patience; comfort them with a sense of your goodness; lift up your countenance upon them; and give them peace; through Jesus Christ our Lord. Amen." },
  { category: "For the Sorrowing", title: "For the Bereaved",
    text: "Almighty God, Father of mercies and giver of comfort: Deal graciously, we pray, with all who mourn; that, casting every care on you, they may know the consolation of your love; through Jesus Christ our Lord. Amen." },
  { category: "For the Sorrowing", title: "For the Victims of Addiction",
    text: "O blessed Lord, you ministered to all who came to you: Look with compassion upon all who through addiction have lost their health and freedom. Restore to them the assurance of your unfailing mercy; remove from them the fears that beset them; strengthen them in the work of their recovery; and to those who care for them, give patient understanding and persevering love; through Jesus Christ our Lord. Amen." },
  { category: "For the Sorrowing", title: "For those who Mourn",
    text: "O Lord, you are the comforter of those who weep: Be close to all whose hearts are heavy with grief. Grant that, finding in you a present help in trouble, they may have strength for this day, hope for tomorrow, and peace within; through Jesus Christ our Lord. Amen." },

  // FOR THOSE IN NEED
  { category: "For Those in Need", title: "For an Anxious Person",
    text: "O God of peace, who has taught us that in returning and rest we shall be saved, in quietness and in confidence shall be our strength: By the might of your Spirit lift us, we pray, to your presence, where we may be still and know that you are God; through Jesus Christ our Lord. Amen." },
  { category: "For Those in Need", title: "For those who are Homeless",
    text: "Almighty and most merciful God, we remember before you all poor and neglected persons: the homeless and the destitute, the old and the sick, and all who have none to care for them. Help us to heal those who are broken in body or spirit, and to turn their sorrow into joy. Grant this, Father, for the love of your Son, who for our sake became poor, Jesus Christ our Lord. Amen." },
  { category: "For Those in Need", title: "For those in Prison",
    text: "Lord Jesus, for our sake you were condemned as a criminal: Visit our jails and prisons with your pity and judgment. Remember all prisoners, and bring the guilty to repentance and amendment of life according to your will, and give them hope for their future. When any are held unjustly, bring them release; forgive us, and teach us to improve our justice. Remember those who work in these institutions; keep them humane and compassionate; and save them from becoming brutal or callous. And since what we do for those in prison, O Lord, we do for you, constrain us to improve their lot. All this we ask for your mercy's sake. Amen." },
  { category: "For Those in Need", title: "For those we Love",
    text: "O gracious Father, we humbly ask for your gentle care for the person we pray for now. Keep them ever in your love; teach them to love you with all their heart, with all their soul, with all their mind, and with all their strength; and, loving you, to love also all whom you love; through Jesus Christ our Lord. Amen." },

  // FOR SOCIAL JUSTICE
  { category: "For Social Justice", title: "For Social Justice",
    text: "Grant, O God, that your holy and life-giving Spirit may so move every human heart, and especially the hearts of the people of this land, that barriers which divide us may crumble, suspicions disappear, and hatreds cease; that our divisions being healed, we may live in justice and peace; through Jesus Christ our Lord. Amen." },
  { category: "For Social Justice", title: "For the Poor and Oppressed",
    text: "O God, who created all peoples in your image, we thank you for the wonderful diversity of races and cultures in this world. Take away all things which make us afraid of one another; help us to know that we are all your children; and enable us to grow in brotherhood and sisterhood; through your Son, Jesus Christ our Lord. Amen." },
  { category: "For Social Justice", title: "For Young Persons",
    text: "God our Father, you see your children growing up in an unsteady and confusing world: Show them that your ways give more life than the ways of the world, and that following you is better than chasing after selfish goals. Help them to take failure, not as a measure of their worth, but as a chance for a new start. Give them strength to hold their faith in you, and to keep alive their joy in your creation; through Jesus Christ our Lord. Amen." },
  { category: "For Social Justice", title: "For the Aged",
    text: "Look with mercy, O God our Father, on all whose increasing years bring them weakness, distress, or isolation. Provide for them homes of dignity and peace; give them understanding helpers, and the willingness to accept help; and, as their strength diminishes, increase their faith and their assurance of your love. This we ask in the name of Jesus Christ our Lord. Amen." },

  // FOR THE ENVIRONMENT
  { category: "For the Environment", title: "For the Care of Creation",
    text: "We call on you, O God, for our home the earth, that we may be worthy of it. We call on you, O God, for the health of the earth so that we may live with gratitude in it. We call on you, O God, for those who share the earth, that we may live with reverence for it. We call on you, O God, for those who will inherit the earth, that we may leave it to them as a gift. Through Christ who came that we might have life. Amen." },
  { category: "For the Environment", title: "For Conservation of Natural Resources",
    text: "Almighty God, in giving us dominion over things on earth, you made us fellow workers in your creation: Give us wisdom and reverence so to use the resources of nature, that no one may suffer from our abuse of them, and that generations yet to come may continue to praise you for your bounty; through Jesus Christ our Lord. Amen." },

  // FOR FAMILIES
  { category: "For Families", title: "For Families",
    text: "Almighty God, our heavenly Father, who sets the solitary in families: We commend to your continual care the homes in which your people dwell. Put far from them, we beseech you, every root of bitterness, the desire of vainglory, and the pride of life. Fill them with faith, virtue, knowledge, temperance, patience, godliness. Knit together in constant affection those who, in holy wedlock, have been made one flesh. Turn the hearts of the parents to the children, and the hearts of the children to the parents; and so enkindle fervent charity among us all, that we may evermore be kindly affectioned one to another; through Jesus Christ our Lord. Amen." },
  { category: "For Families", title: "For the Care of Children",
    text: "Almighty God, heavenly Father, you have blessed us with the joy and care of children: Give us calm strength and patient wisdom as we bring them up, that we may teach them to love whatever is just and true and good, following the example of our Savior Jesus Christ. Amen." },
  { category: "For Families", title: "For those who are Alone",
    text: "Almighty God, whose Son had nowhere to lay his head: Grant that those who live alone may not be lonely in their solitude, but that, following in his steps, they may find fulfillment in loving you and their neighbors; through Jesus Christ our Lord. Amen." },
];

// Group prayers by category
const CATEGORIES = (() => {
  const map = new Map<string, BcpPrayer[]>();
  for (const p of BCP_PRAYERS) {
    const arr = map.get(p.category) ?? [];
    arr.push(p);
    map.set(p.category, arr);
  }
  return Array.from(map.entries()).map(([category, prayers]) => ({ category, prayers }));
})();

const CATEGORY_EMOJI: Record<string, string> = {
  "For the Church": "⛪",
  "For the Mission of the Church": "✝️",
  "For the Nation": "🏛️",
  "For the World": "🌍",
  "For the Natural Order": "🌿",
  "For the Poor and Neglected": "🤲",
  "For the Sick": "💊",
  "For the Sorrowing": "💔",
  "For Those in Need": "🕊️",
  "For Social Justice": "⚖️",
  "For the Environment": "🌎",
  "For Families": "👨‍👩‍👧‍👦",
};

export default function BcpIntercessionsPage() {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();
  const [openCategory, setOpenCategory] = useState<string | null>(null);
  const [openPrayer, setOpenPrayer] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading && !user) setLocation("/");
  }, [user, isLoading, setLocation]);

  if (isLoading || !user) return null;

  return (
    <Layout>
      <div className="flex flex-col w-full max-w-2xl mx-auto pb-24">
        {/* Header */}
        <div className="mb-6">
          <Link href="/bcp" className="text-sm mb-3 inline-block" style={{ color: "#8FAF96" }}>
            ← Book of Common Prayer
          </Link>
          <h1
            className="text-2xl font-bold mb-1"
            style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}
          >
            Intercessions 🙏
          </h1>
          <p className="text-sm" style={{ color: "#8FAF96" }}>
            Prayers of the People from the Book of Common Prayer
          </p>
        </div>

        {/* Category accordion */}
        <div className="space-y-2">
          {CATEGORIES.map(({ category, prayers }) => {
            const isOpen = openCategory === category;
            const emoji = CATEGORY_EMOJI[category] ?? "🙏";

            return (
              <div key={category}>
                <button
                  onClick={() => {
                    setOpenCategory(isOpen ? null : category);
                    setOpenPrayer(null);
                  }}
                  className="w-full text-left p-4 rounded-xl transition-all"
                  style={{
                    background: isOpen ? "rgba(46,107,64,0.18)" : "rgba(46,107,64,0.08)",
                    border: `1px solid ${isOpen ? "rgba(200,212,192,0.25)" : "rgba(200,212,192,0.1)"}`,
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-xl">{emoji}</span>
                      <div>
                        <p className="font-semibold text-sm" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>
                          {category}
                        </p>
                        <p className="text-xs mt-0.5" style={{ color: "rgba(143,175,150,0.6)" }}>
                          {prayers.length} {prayers.length === 1 ? "prayer" : "prayers"}
                        </p>
                      </div>
                    </div>
                    <span className="text-sm" style={{ color: "#8FAF96", transform: isOpen ? "rotate(90deg)" : "none", transition: "transform 0.2s" }}>
                      ›
                    </span>
                  </div>
                </button>

                {/* Prayers list */}
                {isOpen && (
                  <div className="mt-1 ml-4 space-y-1">
                    {prayers.map((prayer) => {
                      const prayerOpen = openPrayer === prayer.title;
                      return (
                        <div key={prayer.title}>
                          <button
                            onClick={() => setOpenPrayer(prayerOpen ? null : prayer.title)}
                            className="w-full text-left px-4 py-3 rounded-lg transition-all"
                            style={{
                              background: prayerOpen ? "rgba(46,107,64,0.15)" : "transparent",
                            }}
                          >
                            <div className="flex items-center justify-between">
                              <p className="text-sm font-medium" style={{ color: prayerOpen ? "#F0EDE6" : "#C8D4C0" }}>
                                {prayer.title}
                              </p>
                              <span className="text-xs" style={{ color: "#8FAF96", transform: prayerOpen ? "rotate(90deg)" : "none", transition: "transform 0.2s" }}>
                                ›
                              </span>
                            </div>
                          </button>

                          {prayerOpen && (
                            <div
                              className="mx-4 mb-3 p-5 rounded-xl"
                              style={{
                                background: "rgba(255,255,255,0.04)",
                                border: "1px solid rgba(200,212,192,0.1)",
                              }}
                            >
                              <p
                                className="text-sm leading-[1.85] italic"
                                style={{
                                  color: "#C8D4C0",
                                  fontFamily: "Playfair Display, Georgia, serif",
                                }}
                              >
                                {prayer.text}
                              </p>
                              <p className="text-[11px] mt-4 pt-3 italic" style={{ color: "rgba(143,175,150,0.4)", borderTop: "1px solid rgba(200,212,192,0.08)" }}>
                                From the Book of Common Prayer
                              </p>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </Layout>
  );
}
