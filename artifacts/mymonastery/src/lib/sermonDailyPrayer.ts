import type { ImprintSlide } from "@/components/ImprintSlideshow";

/**
 * "THE POWER OF DAILY PRAYER" — a sermon, read a slide at a time.
 *
 * Preached for Year A, Pentecost 14 (30 August 2026) on the day's appointed
 * readings: Exodus 3, Romans 12 and Matthew 16. Brought into the app at the
 * owner's request; the title is his ("it should be called the power of daily
 * prayer").
 *
 * NOT TRANSLATED, deliberately, unlike the other Learn topics: this is one
 * preacher's own words in English, and running a sermon through t() would
 * either strand it (an untranslated key rendering a fallback) or invite
 * someone to translate a text that isn't the app's to rewrite. If it is ever
 * offered in Spanish it should be because the preacher wrote it in Spanish.
 *
 * WHAT WAS TRIMMED, and why it matters that it was: the sermon's third and
 * fourth paragraphs are about Phoebe itself. Inside Phoebe they would read as
 * self-promotion rather than preaching — and they would date. The spine is
 * kept whole: the gospel's call, Bonhoeffer's two graces, Moses at the bush,
 * Romans 12 as the concrete answer, Mary Oliver's question, and the closing
 * turn that these reminders are meant to gladden rather than shame.
 *
 * ADMIN ONLY for now (see pages/learn.tsx). It is the preacher's work, not
 * ours, so it sits behind that gate until he has said yes to it being here.
 */
export const DAILY_PRAYER_SERMON: ImprintSlide[] = [
  {
    headline: "Take up your cross",
    body:
      "Jesus said in today's gospel that “If any want to become [his] followers, let them deny "
      + "themselves and take up their cross and follow [him]. For those who want to save their life "
      + "will lose it, and those who lose their life for [his] sake will find it.”",
  },
  {
    headline: "So much of our day is outward directed",
    body:
      "Focused on work, on school, on families and social lives, on pleasures, and joys, and "
      + "challenges. Yet how often do we actually deny ourselves and instead turn to God throughout "
      + "our busy day? Hopefully at least during our Sunday worship — but even then it can be "
      + "tempting to plan out our week in our mind, thinking over all the tasks needing completing, "
      + "or recalling something funny or stressful that happened at work.\n\n"
      + "With a world that is so demanding, and has so much noise and distraction, we can easily "
      + "forget the commitment we made in our baptismal covenant to live a Christ-centered life.",
  },
  {
    headline: "Cheap grace",
    body:
      "When we are fully present and attentive to God, we can become aware of how God is acting in "
      + "our lives. We put the world on pause and attune ourselves to the will of God. This is the "
      + "cost of discipleship — what Dietrich Bonhoeffer, the Lutheran theologian and pastor who "
      + "gave his life aiding the Jewish people against the Nazi regime, meant by the difference "
      + "between cheap grace and costly grace.\n\n"
      + "Cheap grace is receiving God's mercy without ever doing anything to really change your "
      + "life. It is forgiveness without repentance. It is grace without discipleship. Grace "
      + "without the cross.",
  },
  {
    headline: "Costly grace",
    body:
      "Costly grace, however, is, as Bonhoeffer refers to it, “the treasure hidden in the field… "
      + "Costly grace is the gospel which must be sought again and again, the gift which must be "
      + "asked for, the door at which [one] must knock.”",
  },
  {
    headline: "Who am I that I should go?",
    body:
      "Costly grace is surrendering to God's will, just as Moses did on Mount Horeb. God, knowing "
      + "the suffering of those in Egypt, called Moses to deliver the Israelites from Pharaoh's "
      + "oppressive tyranny.\n\n"
      + "And Moses asked the same question that almost all of us would ask: “Who am I that I should "
      + "go?” But God's will and presence were with Moses, and as we know, led the Israelites out of "
      + "Egypt. When God's grace is with us and we are attentive to it, miracles can happen.",
  },
  {
    headline: "Let your love be genuine",
    body:
      "And if we're wondering how God is calling us to act in the world, start with the verses "
      + "shared today in Paul's letter to the Romans:\n\n"
      + "“Let [your] love be genuine; hate what is evil, hold fast to what is good; love one another "
      + "with mutual affection; outdo one another in showing honor. Do not lag in zeal, be ardent in "
      + "spirit, serve the Lord. Rejoice in hope, be patient in suffering, persevere in prayer. "
      + "Contribute to the needs of the saints; extend hospitality to strangers.”",
  },
  {
    headline: "One wild and precious life",
    body:
      "Mary Oliver asks, in her poem The Summer Day, “What is it you plan to do with your one wild "
      + "and precious life?”\n\n"
      + "Let us sit with that profound question. What is the vocation God is calling us to, which "
      + "may be different than your career or work? Where is God leading you, and what do you need "
      + "to become more aware of God's presence?\n\n"
      + "These questions need to be revisited throughout our lives, as we change and find God's love "
      + "engaging with us in new ways. That is why it is so important to have prayer rituals, "
      + "practices, spiritual routines and habits that we can return to daily.",
  },
  {
    headline: "Let these reminders bring gladness",
    body:
      "Let these reminders of God's presence not be reminders that evoke shame, guilt, or "
      + "burdening. Let them uplift your heart with joy and peace. Let these opportunities to turn "
      + "towards God bring you gladness and comfort and heavenly praise.\n\n"
      + "“Give thanks to the Lord and call upon his Name… Search for the Lord and his strength; "
      + "continually seek his face.” For our God is a righteous God, full of wonder and compassion. "
      + "He seeks us in all moments, knowing that we contain the treasures of Heaven.",
  },
];
