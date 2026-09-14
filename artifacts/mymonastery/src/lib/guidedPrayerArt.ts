/**
 * THE PICTURE AFTER EACH MOVEMENT OF SIMPLE GUIDED PRAYER.
 *
 * Owner (2026-09-14): "after every slide in simple guided, we have a picture
 * that goes with it" — "a little different then rosary, just a slide with the
 * picture and the stage such as praise under it", "after the current slide
 * with text", "just so people can visualize".
 *
 * So these are not pictures that merely share a reading with the movement.
 * Every one SHOWS the movement being done — people singing, dancing and
 * adoring; a publican at the back of the temple, a son come home, Peter
 * weeping; a healed man turning back to give thanks, bread blessed at table;
 * Christ praying in the garden, a woman reaching for his hem, Job praying for
 * his friends. Each was looked at before it went in.
 *
 * All from the ACT library Visio and the Rosary already pray with: the same
 * rights (a free licence, or the artist's non-commercial grant with
 * attribution) and the same credit line on the closing slide. `ratio` is the
 * measured width ÷ height (2026-09-14, over the wire). Every one sits inside
 * 3:5–16:9, the bound the owner set for the Rosary's pictures, and the page
 * sizes the picture's box from it, so a late arrival fades into place instead
 * of pushing the movement's name down. Adding one: fetch the JPEG header for
 * the ratio, LOOK at the picture, then run
 * scripts/checks/guided-prayer-pictures.mjs.
 *
 * Neighbours in a list are by different hands, so the daily walk never shows
 * one artist two days running in the same movement.
 */

export type GuidedPrayerArt = { id: number; ratio: number };

/** Movement (1 Praise · 2 Confession · 3 Thanksgiving · 4 Supplication) → its pictures. */
export const GUIDED_PRAYER_ART: Record<1 | 2 | 3 | 4, GuidedPrayerArt[]> = {
  // Praise
  1: [
    { id: 56558, ratio: 0.671 }, // Swanson, The Procession — singers and players
    { id: 58471, ratio: 1.009 }, // Hensel, Miriam's Song of Praise
    { id: 56538, ratio: 1.379 }, // Swanson, Celebration — the circle dance
    { id: 49955, ratio: 1.379 }, // Catacomb of Priscilla, Three Youths in the Fiery Furnace — arms raised, singing in the fire
    { id: 58368, ratio: 0.768 }, // Maíno, Adoration of the Shepherds
    { id: 56544, ratio: 1.331 }, // Swanson, Entry into the City — hosanna
    { id: 57120, ratio: 1.342 }, // Latimore, Roebuck "Pops" Staples — gospel music as praise
    { id: 58329, ratio: 0.717 }, // T'oros Roslin, Entry into Jerusalem
  ],
  // Confession
  2: [
    { id: 48268, ratio: 1.512 }, // JESUS MAFA, The Pharisee and the Publican
    { id: 59181, ratio: 0.766 }, // Wesley, Peter's Denial — Peter weeping
    { id: 54666, ratio: 0.891 }, // Rembrandt, Prodigal Son
    { id: 54662, ratio: 1.501 }, // JESUS MAFA, Prodigal Son
    { id: 59187, ratio: 1.556 }, // Wesley, Mary Magdalene Washing the Feet of Jesus
    { id: 55695, ratio: 0.787 }, // Rembrandt, Jeremiah Lamenting the Destruction of Jerusalem
    { id: 48384, ratio: 1.502 }, // JESUS MAFA, Jesus Speaks about Forgiveness — the woman at his feet
    { id: 59165, ratio: 0.781 }, // Wesley, The Publican and the Pharisee
  ],
  // Thanksgiving
  3: [
    // Reid's Loaves and Fishes and Latimore's Presentation went (owner,
    // 2026-09-14: "not sure how the thanksgiving one … is relevant") — neither
    // shows thanks being given at a glance. What stays does.
    // Order matters: five days line up with Supplication's ten, so a MAFA
    // opening here would bump its MAFA Gethsemane every single time it came
    // round (the check caught it never being shown).
    { id: 56885, ratio: 1.406 }, // Caravaggio, Supper at Emmaus — the bread blessed
    { id: 48295, ratio: 1.532 }, // JESUS MAFA, Healing of the Ten Lepers — the one who turns back
    { id: 56568, ratio: 1.026 }, // Swanson, Rainbow — Noah's household, hands raised at the altar
    { id: 48272, ratio: 1.48 }, // JESUS MAFA, The Lord's Supper — the cup lifted
    { id: 58334, ratio: 0.717 }, // Roberti, Institution of the Eucharist
  ],
  // Supplication
  4: [
    { id: 48391, ratio: 1.476 }, // JESUS MAFA, Christ on Gethsemane
    { id: 58468, ratio: 1.268 }, // Gauguin, Vision of the Sermon — women at prayer, Jacob wrestling for a blessing
    { id: 59649, ratio: 0.985 }, // Wesley, Woman with the Flow of Blood (detail) — hands reaching for him
    { id: 57953, ratio: 0.804 }, // Rembrandt, Storm on the Sea of Galilee
    { id: 48306, ratio: 1.515 }, // JESUS MAFA, Jesus Heals a Paralyzed Man — lowered by his friends
    { id: 57729, ratio: 0.794 }, // Blake, Sacrifice of Job — "my servant Job shall pray for you"
    { id: 59237, ratio: 1.146 }, // Wesley, Abigail Begging David
    { id: 59677, ratio: 0.741 }, // Miller, Peter Walking on Water — "Lord, save me"
    { id: 57962, ratio: 1.501 }, // Sant'Apollinare Nuovo, Heals the Woman with a Hemorrhage
    { id: 59351, ratio: 1.375 }, // Runge, Christ Walking on the Water
  ],
};

/** What choosing needs to know of a work — null when it's missing, or deleted at /admin/art-library. */
export type ArtLookup = (id: number) => { artist: string | null } | null;

/**
 * THE FOUR PICTURES FOR ONE SITTING, FROM FOUR DIFFERENT HANDS.
 *
 * Each movement walks its own list one picture a day — the WHOLE list for
 * someone who only ever prays in the morning. (A stride of two, one step per
 * side, would have shown a morning-only person half of every even-length list
 * and never the rest: the same dead weight the Rosary's first cut carried.)
 * The evening starts halfway round the same list, so the two ends of one day
 * open on different pictures.
 *
 * Chosen together, the Rosary's way (lib/rosary.ts artIdsForDay): walking the
 * movements in order, one whose artist is already on the wall moves on
 * through its OWN list to a hand not yet seen. A work the owner has deleted is
 * dropped from its list first, so a deletion never costs a movement its
 * picture.
 */
export function guidedPrayerArtIds(
  side: "morning" | "evening",
  artOf: ArtLookup,
  d: Date = new Date(),
): Array<number | null> {
  // Counted from the LOCAL calendar date, so the picture turns over at local
  // midnight and never between two renders of one sitting.
  const day = Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000);
  const used = new Set<string>();
  // The evening never repeats the morning: its pictures are chosen with that
  // day's morning four set aside (the halfway start alone isn't enough once
  // the one-hand-a-sitting nudge moves a pick along its list).
  const morning = side === "evening"
    ? new Set(guidedPrayerArtIds("morning", artOf, d).filter((id): id is number => id !== null))
    : new Set<number>();
  return ([1, 2, 3, 4] as const).map((n) => {
    const ids = GUIDED_PRAYER_ART[n].map((a) => a.id).filter((id) => artOf(id) !== null);
    if (ids.length === 0) return null;
    const start = (day + (side === "evening" ? Math.floor(ids.length / 2) : 0)) % ids.length;
    for (let k = 0; k < ids.length; k++) {
      const id = ids[(start + k) % ids.length]!;
      if (morning.has(id)) continue;
      const who = (artOf(id)?.artist ?? "").trim().toLowerCase();
      if (who && used.has(who)) continue;
      if (who) used.add(who);
      return id;
    }
    // Every picture this movement has is by a hand already shown. Keep the
    // picture — a repeated hand beats a movement with none.
    return ids[start]!;
  });
}

/** One of these works' measured shape, width ÷ height. */
export function guidedPrayerArtRatio(id: number): number {
  for (const list of Object.values(GUIDED_PRAYER_ART)) {
    const hit = list.find((a) => a.id === id);
    if (hit) return hit.ratio;
  }
  return 1;
}
