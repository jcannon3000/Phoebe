// Passage lookup by reference — "Luke 10:38-42" → the verses.
//
// The office already renders lessons from the bundled World English Bible
// (public domain, zero external calls — see lib/scriptureService.ts), but it
// only ever does so for readings the lectionary handed it. Visio Divina needs
// the same text for an ARBITRARY reference: its artworks are tagged to
// passages by Vanderbilt's catalogue, not by today's office.
//
// Public and unauthenticated, like /lectionary/today: it returns nothing but
// public-domain scripture, and the practice it serves is guest-allowed. The
// lookup is a local map read, so there is no upstream to protect — the CDN
// cache below is just to keep repeat opens off the origin.

import { Router, type IRouter, type Request, type Response } from "express";
import { lookupLessonVerses, translationName } from "../lib/scriptureService";

const router: IRouter = Router();

// A reference is short. Anything longer is not a reference, and parseReference
// would only reject it after doing the work.
const MAX_REF = 120;

router.get("/scripture/passage", (req: Request, res: Response): void => {
  const ref = typeof req.query.ref === "string" ? req.query.ref.trim() : "";
  if (!ref || ref.length > MAX_REF) {
    res.status(400).json({ error: "bad_reference" });
    return;
  }

  const verses = lookupLessonVerses(ref);
  // null = a book we don't carry (the deuterocanon) or an unparseable
  // reference. Not an error: the caller shows the reference alone and invites
  // the reader to open their own bible, exactly as the office slides do.
  if (!verses?.length) {
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.json({ reference: ref, verses: [], text: null, translation: translationName() });
    return;
  }

  res.setHeader("Cache-Control", "public, max-age=86400");
  // The slide names its translation — it's public-domain scripture, and a
  // reader is entitled to know which words they're reading.
  res.json({
    reference: ref,
    verses,
    text: verses.map((v) => v.text.trim()).join(" "),
    translation: translationName(),
  });
});

export default router;
