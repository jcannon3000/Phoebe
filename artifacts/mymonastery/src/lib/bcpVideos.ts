// ─── The Book of Common Prayer, with Gospel Simplicity ───────────────────────
//
// Owner, 2026-10-21, with three links: "On the learn page i want to create a
// list of videos about the Book of Common Prayer by Gospel Simplicity".
//
// Austin Suggs's channel (youtube.com/@GospelSimplicity) talks to Anglicans
// about the prayer book: where it came from, what it is to love it, and what
// praying it daily does to a life. Three videos, so one unit and no parts —
// the course shell (components/CoursePage) is how every YouTube teaching in
// Phoebe is watched (inline on Android, through the in-app reader on iOS), and
// it brings the resume position, the lesson ticks and the home-screen Continue
// card with it. A fourth video is one entry below.
//
// NOTHING OF THEIRS IS COPIED. Each lesson is a video id played in YouTube's
// own player, exactly as Fr. Keating's series is, so the channel keeps its
// views and its ads. Titles are lightly cleaned for a card — the all-caps
// emphasis down, the "|" before a guest's name turned into the same "·" the
// rest of the app uses — the way the Taizé and Mary Lou's Mass catalogues
// clean theirs. The order is the owner's, as the links arrived.
//
// Titles and channel confirmed 2026-10-21 through YouTube's own oEmbed
// endpoint (youtube.com/oembed?url=…), not by scraping a watch page.

import { buildCourseIndex, type JourneyCourse } from "@/lib/spiritualJourney";

export const BCP_VIDEOS: JourneyCourse = {
  id: "bcp-videos",
  title: "The Book of Common Prayer",
  author: "Gospel Simplicity",
  tagline:
    "Three conversations about the prayer book — where it came from, why it is loved, and what praying it every day does to a life.",
  // No playlist: these are three uploads chosen from the channel, so the link
  // under the course is the channel itself.
  playlistUrl: "https://www.youtube.com/@GospelSimplicity",
  videoCredit: "Gospel Simplicity",
  units: [
    {
      id: "prayer-book",
      title: "The Prayer Book",
      blurb:
        "Austin Suggs in conversation with Anglican liturgists, writers and readers of the Book of Common Prayer.",
      lessons: [
        {
          title: "Anglican Liturgists Explain the History of the BCP",
          parts: [{ id: "Bcq_1l-fXaM", label: "Part 1" }],
        },
        {
          title: "Why I Love the Book of Common Prayer",
          parts: [{ id: "6LlBeEWX-BE", label: "Part 1" }],
        },
        {
          // "…is LIFE CHANGING | Julie Lane-Gay" on YouTube.
          title: "Praying with the Book of Common Prayer is Life Changing · Julie Lane-Gay",
          parts: [{ id: "xCIQXs6TObE", label: "Part 1" }],
        },
      ],
    },
  ],
};

export const BCP_VIDEOS_INDEX = buildCourseIndex(BCP_VIDEOS);
