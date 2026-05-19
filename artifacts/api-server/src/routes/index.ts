import { Router, type IRouter, type RequestHandler } from "express";
import healthRouter from "./health";
import usersRouter from "./users";
import ritualsRouter from "./rituals";
import authRouter from "./auth";
import peopleRouter from "./people";
import contactsRouter from "./contacts";
import scheduleRouter from "./schedule";
import inviteRouter from "./invite";
import prayerRouter from "./prayer";
import lettersRouter from "./letters";
import phoebeRouter from "./phoebe";
import momentsRouter from "./moments";
import officeRouter from "./office";
import lectioRouter from "./lectio";
import gatheringsRouter from "./gatherings";
import groupsRouter from "./groups";
import bellRouter from "./bell";
import feedbackRouter from "./feedback";
import mutesRouter from "./mutes";
import gratitudeRouter from "./gratitude";
import prayersForRouter from "./prayers-for";
import waitlistRouter from "./waitlist";
import prayerFeedsRouter from "./prayer-feeds";
import prayerStreakRouter from "./prayer-streak";
import pushRouter from "./push";
import authAppleRouter from "./auth-apple";
import reportsRouter from "./reports";
import climateRouter from "./climate";
import prayerSessionsRouter from "./prayer-sessions";
import parishRouter from "./parish";
import actionsRouter from "./actions";
import newsletterRouter from "./newsletter";

const router: IRouter = Router();

// ─── Offices-only account gate ───────────────────────────────────────────────
// Accounts created from the public /pray page (users.offices_only = true,
// accessTier "offices-only") are limited to the Daily Office / Daily
// Devotion. This middleware is the server-side enforcement of that
// limit: it rejects every social / community surface for those
// accounts, so the limit holds even against a hand-crafted API call —
// the frontend ParishGate only hides the routes. Anything NOT listed
// (auth, office, devotion, parish, users, me, prayer-sessions, push,
// bell, health, feedback) stays reachable so the office experience and
// settings keep working.
const OFFICES_ONLY_BLOCKED_PREFIXES = [
  "/groups",
  "/prayer-requests",
  "/prayers-for",
  "/gatherings",
  "/moments",
  "/moment",
  "/letters",
  "/letter",
  "/rituals",
  "/actions",
  "/people",
  "/contacts",
  "/invite",
  "/prayer-feeds",
  "/mutes",
  "/reports",
  "/climate",
];

const blockOfficesOnly: RequestHandler = (req, res, next) => {
  const user = req.user as { officesOnly?: boolean } | undefined;
  if (user?.officesOnly) {
    const p = req.path;
    const blocked = OFFICES_ONLY_BLOCKED_PREFIXES.some(
      (prefix) => p === prefix || p.startsWith(prefix + "/"),
    );
    if (blocked) {
      res.status(403).json({ error: "This account is limited to the daily offices." });
      return;
    }
  }
  next();
};

router.use(blockOfficesOnly);

router.use(authRouter);
router.use(healthRouter);
router.use(usersRouter);
router.use(ritualsRouter);
router.use(peopleRouter);
router.use(contactsRouter);
router.use(scheduleRouter);
router.use(inviteRouter);
router.use(prayerRouter);
router.use(lettersRouter);
router.use(phoebeRouter);
router.use(momentsRouter);
router.use(officeRouter);
router.use(lectioRouter);
router.use(gatheringsRouter);
router.use(groupsRouter);
router.use(bellRouter);
router.use(feedbackRouter);
router.use(mutesRouter);
router.use(gratitudeRouter);
router.use(prayersForRouter);
router.use(waitlistRouter);
router.use(prayerFeedsRouter);
router.use(prayerStreakRouter);
router.use(pushRouter);
router.use(authAppleRouter);
router.use(reportsRouter);
router.use(climateRouter);
router.use(prayerSessionsRouter);
router.use(parishRouter);
router.use(actionsRouter);
router.use(newsletterRouter);

export default router;
