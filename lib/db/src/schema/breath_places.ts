import { pgTable, serial, integer, text, doublePrecision, boolean, jsonb, timestamp, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

/**
 * Designated places to breathe — a chapel, a garden, a stretch of shoreline.
 *
 * Owner: "create a location-based feature … they could choose locations we're
 * designating as specific spots. At these spots we could [show] all the
 * breaths of people who breathed there today. Only admins can make them."
 *
 * ── Why this is a curated LIST and not a map of wherever people are ──
 *
 * Phoebe removed location twice, once as an explicit App Store blocker
 * (f900693b dropped the geolocation dependency, the NSLocation usage strings
 * and the CoarseLocation privacy-manifest entry; 0377aa6a dropped the
 * residual share_location schema). Co-Breathe's old "same air" — a count of
 * people who breathed NEAR you — was built on exactly that and removed with
 * it.
 *
 * This is a different shape and deliberately so. The places are a short,
 * admin-authored list; a person CHOOSES one. Their device's coordinates are
 * compared against the place on-device to verify they're actually there, and
 * then discarded — never sent to the server, never written here or on
 * breath_sessions. The server learns "someone breathed at place 7 today, and
 * their device said they were within the radius", which is the whole feature
 * and none of the tracking.
 *
 * So `lat`/`lng` here are properties of the PLACE (a fixed public spot an
 * admin typed in), not of any person. That distinction is the reason this can
 * exist where the old surface couldn't.
 */
export const breathPlacesTable = pgTable(
  "breath_places",
  {
    id: serial("id").primaryKey(),
    /** Display name — "St. Mark's Chapel", "The Cloister Garden". */
    name: text("name").notNull(),
    /** Optional line under the name: a city, a parish, a short orientation. */
    subtitle: text("subtitle"),
    /** The place's own fixed coordinates, typed in by an admin. Never a user's. */
    lat: doublePrecision("lat").notNull(),
    lng: doublePrecision("lng").notNull(),
    /**
     * How close counts as "here", in metres. Per-place because the honest
     * radius differs enormously — a side chapel is tens of metres, a retreat
     * property or a shoreline is hundreds. Generous by default: a GPS fix
     * indoors (which is where chapels are) is routinely off by 20-50m, and
     * wrongly telling someone standing in the chapel that they aren't there
     * is a far worse failure than counting someone in the car park.
     */
    radiusMeters: integer("radius_meters").notNull().default(150),
    /**
     * This place's own backdrop photos — the imagery the breath rests on when
     * someone is breathing HERE, instead of the generic bundled landscapes.
     *
     * Owner: "a separate file library for a location."
     *
     * URLs, not files. The app's existing photo libraries are import.meta.glob'd
     * from bundled assets at BUILD time, which cannot serve a place an admin
     * creates at runtime — there is nothing to glob. So a place's library is a
     * short list of https URLs an admin supplies, and the client falls back to
     * the bundled library whenever a place has none.
     *
     * A JSONB array rather than its own table: this is a small curated set that
     * an admin replaces wholesale when they change it, so a row-per-photo table
     * would buy ordering and per-row edits nobody asked for at the cost of a
     * join and a second CRUD surface.
     */
    photoUrls: jsonb("photo_urls").$type<string[]>().notNull().default([]),
    /**
     * The glyph at the centre of the breathing rings while someone breathes
     * here — a bell for a chapel, a tree for a garden.
     *
     * Owner: "the emoji in the centre of the circles [should be] customizable
     * as well." Null keeps the globe rotation the practice ships with
     * (🌍/🌎/🌏), which is the right default: Co-Breathe is a prayer for the
     * whole earth, and a place is a vantage on it, not a replacement for it.
     */
    centerEmoji: text("center_emoji"),
    /** Soft delete — a retired place keeps its history and stops being offered. */
    active: boolean("active").notNull().default(true),
    /** Which admin created it (audit trail; admins-only creation). */
    createdByUserId: integer("created_by_user_id").references(() => usersTable.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // The only list query: the active places, by name.
    activeIdx: index("breath_places_active_idx").on(t.active, t.name),
  }),
);
