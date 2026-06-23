/**
 * Fellows — feature flag.
 *
 * When false (the current default), every Fellow surface is turned OFF: the
 * People menu row, the opening-splash "fellows today" variant, the People-page
 * accountability extras (Walking Together, 🙌 encouragements, share-progress
 * onboarding), and the dashboard's Fellow Plans. The routes/components still
 * exist but nothing surfaces them, so the feature is dormant — flip this back to
 * true to bring Fellows back wholesale.
 *
 * This is the single switch so Fellows can't drift back on one surface at a
 * time (it had repeatedly): gate every Fellow surface on FELLOWS_ENABLED.
 */
export const FELLOWS_ENABLED = false;
