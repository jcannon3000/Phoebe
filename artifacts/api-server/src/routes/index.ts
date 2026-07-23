import { Router, type IRouter, type RequestHandler } from "express";
import healthRouter from "./health";
import emailRouter from "./email";
import statsRouter from "./stats";
import usersRouter from "./users";
import ritualsRouter from "./rituals";
import authRouter from "./auth";
import peopleRouter from "./people";
import contactsRouter from "./contacts";
import scheduleRouter from "./schedule";
import inviteRouter from "./invite";
import prayerRouter from "./prayer";
import momentsRouter from "./moments";
import officeRouter from "./office";
import gatheringsRouter from "./gatherings";
import groupsRouter from "./groups";
import weeklyPlanContentRouter from "./weekly-plan-content";
import bellRouter from "./bell";
import fellowPlansRouter from "./fellow-plans";
import prayerFeedsRouter from "./prayer-feeds";
import prayerStreakRouter from "./prayer-streak";
import pushRouter from "./push";
import authAppleRouter from "./auth-apple";
import reportsRouter from "./reports";
import climateRouter from "./climate";
import prayerSessionsRouter from "./prayer-sessions";
import actionsRouter from "./actions";
import newsletterRouter from "./newsletter";
import adminMetricsRouter from "./admin-metrics";
import ministriesRouter from "./ministries";
import cacRouter from "./cac";
import appleMusicRouter from "./apple-music";
import lectionaryRouter from "./lectionary";
import ncmpRouter from "./ncmp";
import podcastRouter from "./podcast";
import podcastSocialRouter from "./podcast-social";
import newsRouter from "./news";
import blessRouter from "./bless";
import gatherRouter from "./gather";
import officeAlignmentRouter from "./office-alignment";
import practiceCompletionRouter from "./practice-completion";
import breathRouter from "./breath";
import listeningRouter from "./listening";
import practiceLogRouter from "./practice-log";
import reflectionsRouter from "./reflections";
import ruleOfLifeRouter from "./ruleOfLife";
import buildfaithRouter from "./buildfaith";
import prescribedRoutinesRouter from "./prescribed-routines";
import creatorSeasonsRouter from "./creator-seasons";

const router: IRouter = Router();

// ─── Offices-only account gate ───────────────────────────────────────────────
// Accounts created from the public /pray page (users.offices_only = true,
// accessTier "offices-only") are limited to the Daily Office / Daily
// Devotion, public prayer feeds, AND Letters. Letters is the other
// "monk-like" rhythm Phoebe offers — slow, 1:1, contemplative — so it
// composes naturally with the offices experience without dragging in
// the social / community surfaces those accounts opted out of. The
// menu already surfaces Letters to every signed-in user; this gate
// just makes sure the API doesn't 403 them.
//
// This middleware is the server-side enforcement of the limit: it
// rejects every remaining community surface for these accounts, so
// the limit holds even against a hand-crafted API call. Anything NOT
// listed (auth, office, devotion, parish, users, me, prayer-sessions,
// push, bell, health, feedback, letters, and prayer-feeds — which
// enforces public/private access itself) stays reachable.
const OFFICES_ONLY_BLOCKED_PREFIXES = [
  "/groups",
  "/prayer-requests",
  "/gatherings",
  // "/moments" (the social practices dashboard) is blocked, but the
  // singular "/moment/:token/*" routes are NOT — an offices-only member
  // logs an Amen on a public-feed intercession via /moment/:token/amen,
  // and those routes are already scoped to moments the caller holds a
  // token for.
  "/moments",
  // "/letters" and "/letter" intentionally OMITTED — Letters is open to
  // offices-only accounts. (Earlier versions of this list blocked them;
  // we opened the gate when Letters became a first-class entry point.)
  "/rituals",
  "/actions",
  "/people",
  "/contacts",
  "/invite",
  "/mutes",
  "/reports",
  "/climate",
];

// Paths that LOOK blocked (their prefix is in the list above) but
// are intentionally reachable for offices-only viewers. Public
// share-link endpoints land here — an offices-only user tapping a
// /p/:token link should be able to amen + auto-Fellow with the
// requester, which is the whole point of the share feature.
// Check is "startsWith" so subroutes inherit the carve-out.
const OFFICES_ONLY_CARVE_OUTS = [
  "/prayer-requests/share",
];

const blockOfficesOnly: RequestHandler = (req, res, next) => {
  const user = req.user as { officesOnly?: boolean } | undefined;
  if (user?.officesOnly) {
    const p = req.path;
    const carved = OFFICES_ONLY_CARVE_OUTS.some(
      (prefix) => p === prefix || p.startsWith(prefix + "/"),
    );
    if (carved) { next(); return; }
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
router.use(emailRouter);
router.use(statsRouter);
router.use(usersRouter);
router.use(ritualsRouter);
router.use(peopleRouter);
router.use(contactsRouter);
router.use(scheduleRouter);
router.use(inviteRouter);
router.use(prayerRouter);
router.use(momentsRouter);
router.use(officeRouter);
router.use(gatheringsRouter);
router.use(groupsRouter);
router.use(weeklyPlanContentRouter);
router.use(bellRouter);
router.use(fellowPlansRouter);
router.use(prayerFeedsRouter);
router.use(prayerStreakRouter);
router.use(pushRouter);
router.use(authAppleRouter);
router.use(reportsRouter);
router.use(climateRouter);
router.use(prayerSessionsRouter);
router.use(actionsRouter);
router.use(newsletterRouter);
router.use(adminMetricsRouter);
router.use(ministriesRouter);
router.use(cacRouter);
router.use(appleMusicRouter);
router.use(lectionaryRouter);
router.use(ncmpRouter);
router.use(podcastRouter);
router.use(podcastSocialRouter);
router.use(newsRouter);
router.use(blessRouter);
router.use(gatherRouter);
router.use(officeAlignmentRouter);
router.use(practiceCompletionRouter);
router.use(breathRouter);
router.use(listeningRouter);
router.use(practiceLogRouter);
router.use(reflectionsRouter);
router.use(buildfaithRouter);
router.use("/rule-of-life", ruleOfLifeRouter);
router.use(prescribedRoutinesRouter);
router.use(creatorSeasonsRouter);

export default router;
