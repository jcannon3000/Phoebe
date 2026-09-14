/**
 * THE SAME STORY IN ANOTHER GOSPEL — synoptic parallels, for Visio's weekly
 * picture.
 *
 * Owner, 2026-09-14: "if its nothing, can you guess as to an image that would
 * be relevant", then "the same book is not really helpful for us". Every week
 * that had fallen to a same-book picture was a MARK week — Mark is the least
 * painted gospel in the art library — and each of those stories is also told
 * in Matthew or Luke, which are painted far more often. Mark 8:31-38 ("take up
 * your cross") is Matthew 16:21-28 and Luke 9:22-27, and the library has two
 * paintings of exactly that.
 *
 * One row per story, as the gospels that tell it number it. Hand-written from
 * the standard synopsis (Aland), because the library's own tags can't supply
 * this: no work mentions the Mark passages that needed it. Ranges are kept to
 * one contiguous span per gospel so a painting's verse tags can match them.
 * Used ONLY when no reading of the week is painted at verse or chapter level
 * (see PASS 3 in build-visio-week-schedule.mjs), and a picture chosen this way
 * never claims to be the week's own reading.
 */
export const GOSPEL_PARALLELS: string[][] = [
  // ── The beginning ─────────────────────────────────────────────────────────
  ["Mark 1:1-8", "Matthew 3:1-12", "Luke 3:1-18", "John 1:19-28"],
  ["Mark 1:9-11", "Matthew 3:13-17", "Luke 3:21-22", "John 1:29-34"],
  ["Mark 1:12-13", "Matthew 4:1-11", "Luke 4:1-13"],
  ["Mark 1:14-15", "Matthew 4:12-17", "Luke 4:14-15"],
  ["Mark 1:16-20", "Matthew 4:18-22", "Luke 5:1-11"],
  ["Mark 1:21-28", "Luke 4:31-37"],
  ["Mark 1:29-34", "Matthew 8:14-17", "Luke 4:38-41"],
  ["Mark 1:35-39", "Luke 4:42-44"],
  ["Mark 1:40-45", "Matthew 8:1-4", "Luke 5:12-16"],
  ["Mark 2:1-12", "Matthew 9:1-8", "Luke 5:17-26"],
  ["Mark 2:13-17", "Matthew 9:9-13", "Luke 5:27-32"],
  ["Mark 2:18-22", "Matthew 9:14-17", "Luke 5:33-39"],
  ["Mark 2:23-28", "Matthew 12:1-8", "Luke 6:1-5"],
  ["Mark 3:1-6", "Matthew 12:9-14", "Luke 6:6-11"],
  ["Mark 3:7-12", "Matthew 12:15-21", "Luke 6:17-19"],
  ["Mark 3:13-19", "Matthew 10:1-4", "Luke 6:12-16"],
  ["Mark 3:20-30", "Matthew 12:22-32", "Luke 11:14-23"],
  ["Mark 3:31-35", "Matthew 12:46-50", "Luke 8:19-21"],
  // ── Parables and the lake ─────────────────────────────────────────────────
  ["Mark 4:1-9", "Matthew 13:1-9", "Luke 8:4-8"],
  ["Mark 4:10-20", "Matthew 13:10-23", "Luke 8:9-15"],
  ["Mark 4:21-25", "Luke 8:16-18"],
  ["Mark 4:30-32", "Matthew 13:31-32", "Luke 13:18-19"],
  ["Mark 4:35-41", "Matthew 8:23-27", "Luke 8:22-25"],
  ["Mark 5:1-20", "Matthew 8:28-34", "Luke 8:26-39"],
  ["Mark 5:21-43", "Matthew 9:18-26", "Luke 8:40-56"],
  ["Mark 6:1-6", "Matthew 13:53-58", "Luke 4:16-30"],
  ["Mark 6:7-13", "Matthew 10:5-15", "Luke 9:1-6"],
  ["Mark 6:14-29", "Matthew 14:1-12", "Luke 9:7-9"],
  ["Mark 6:30-44", "Matthew 14:13-21", "Luke 9:10-17", "John 6:1-15"],
  ["Mark 6:45-52", "Matthew 14:22-33", "John 6:16-21"],
  ["Mark 6:53-56", "Matthew 14:34-36"],
  ["Mark 7:1-23", "Matthew 15:1-20"],
  ["Mark 7:24-30", "Matthew 15:21-28"],
  ["Mark 7:31-37", "Matthew 15:29-31"],
  ["Mark 8:1-10", "Matthew 15:32-39"],
  ["Mark 8:11-13", "Matthew 16:1-4"],
  ["Mark 8:14-21", "Matthew 16:5-12"],
  // ── The way to Jerusalem ──────────────────────────────────────────────────
  ["Mark 8:27-30", "Matthew 16:13-20", "Luke 9:18-21"],
  ["Mark 8:31-9:1", "Matthew 16:21-28", "Luke 9:22-27"],
  ["Mark 9:2-8", "Matthew 17:1-8", "Luke 9:28-36"],
  ["Mark 9:9-13", "Matthew 17:9-13"],
  ["Mark 9:14-29", "Matthew 17:14-21", "Luke 9:37-43"],
  ["Mark 9:30-32", "Matthew 17:22-23", "Luke 9:43-45"],
  ["Mark 9:33-37", "Matthew 18:1-5", "Luke 9:46-48"],
  ["Mark 9:38-41", "Luke 9:49-50"],
  ["Mark 9:42-50", "Matthew 18:6-9", "Luke 17:1-2"],
  ["Mark 10:1-12", "Matthew 19:1-12"],
  ["Mark 10:13-16", "Matthew 19:13-15", "Luke 18:15-17"],
  ["Mark 10:17-31", "Matthew 19:16-30", "Luke 18:18-30"],
  ["Mark 10:32-34", "Matthew 20:17-19", "Luke 18:31-34"],
  ["Mark 10:35-45", "Matthew 20:20-28"],
  ["Mark 10:46-52", "Matthew 20:29-34", "Luke 18:35-43"],
  // ── Jerusalem ─────────────────────────────────────────────────────────────
  ["Mark 11:1-11", "Matthew 21:1-11", "Luke 19:28-40", "John 12:12-19"],
  ["Mark 11:15-19", "Matthew 21:12-17", "Luke 19:45-48", "John 2:13-22"],
  ["Mark 11:20-25", "Matthew 21:18-22"],
  ["Mark 11:27-33", "Matthew 21:23-27", "Luke 20:1-8"],
  ["Mark 12:1-12", "Matthew 21:33-46", "Luke 20:9-19"],
  ["Mark 12:13-17", "Matthew 22:15-22", "Luke 20:20-26"],
  ["Mark 12:18-27", "Matthew 22:23-33", "Luke 20:27-40"],
  ["Mark 12:28-34", "Matthew 22:34-40", "Luke 10:25-28"],
  ["Mark 12:35-37", "Matthew 22:41-46", "Luke 20:41-44"],
  ["Mark 12:38-40", "Matthew 23:1-12", "Luke 20:45-47"],
  ["Mark 12:41-44", "Luke 21:1-4"],
  ["Mark 13:1-8", "Matthew 24:1-8", "Luke 21:5-11"],
  ["Mark 13:9-13", "Matthew 24:9-14", "Luke 21:12-19"],
  ["Mark 13:14-23", "Matthew 24:15-28", "Luke 21:20-24"],
  ["Mark 13:24-27", "Matthew 24:29-31", "Luke 21:25-28"],
  ["Mark 13:28-31", "Matthew 24:32-35", "Luke 21:29-33"],
  ["Mark 13:32-37", "Matthew 24:36-44", "Luke 21:34-36"],
  // ── The Passion and the empty tomb ────────────────────────────────────────
  ["Mark 14:1-2", "Matthew 26:1-5", "Luke 22:1-2"],
  ["Mark 14:3-9", "Matthew 26:6-13", "John 12:1-8"],
  ["Mark 14:10-11", "Matthew 26:14-16", "Luke 22:3-6"],
  ["Mark 14:12-16", "Matthew 26:17-19", "Luke 22:7-13"],
  ["Mark 14:17-21", "Matthew 26:20-25", "Luke 22:21-23"],
  ["Mark 14:22-25", "Matthew 26:26-29", "Luke 22:14-20"],
  ["Mark 14:26-31", "Matthew 26:30-35", "Luke 22:31-34"],
  ["Mark 14:32-42", "Matthew 26:36-46", "Luke 22:39-46"],
  ["Mark 14:43-52", "Matthew 26:47-56", "Luke 22:47-53", "John 18:1-11"],
  ["Mark 14:53-65", "Matthew 26:57-68", "Luke 22:54-71"],
  ["Mark 14:66-72", "Matthew 26:69-75", "Luke 22:56-62"],
  ["Mark 15:1-15", "Matthew 27:11-26", "Luke 23:1-25", "John 18:28-19:16"],
  ["Mark 15:16-20", "Matthew 27:27-31"],
  ["Mark 15:21-32", "Matthew 27:32-44", "Luke 23:26-43", "John 19:17-27"],
  ["Mark 15:33-41", "Matthew 27:45-56", "Luke 23:44-49", "John 19:28-30"],
  ["Mark 15:42-47", "Matthew 27:57-61", "Luke 23:50-56", "John 19:38-42"],
  ["Mark 16:1-8", "Matthew 28:1-10", "Luke 24:1-12", "John 20:1-10"],
  // ── Told in Matthew and Luke only ─────────────────────────────────────────
  ["Matthew 5:1-12", "Luke 6:20-26"],
  ["Matthew 6:9-13", "Luke 11:2-4"],
  ["Matthew 7:24-27", "Luke 6:46-49"],
  ["Matthew 8:5-13", "Luke 7:1-10"],
  ["Matthew 11:2-19", "Luke 7:18-35"],
  ["Matthew 18:10-14", "Luke 15:3-7"],
  ["Matthew 22:1-14", "Luke 14:15-24"],
  ["Matthew 23:37-39", "Luke 13:34-35"],
  ["Matthew 25:14-30", "Luke 19:11-27"],
];
