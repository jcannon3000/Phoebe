/**
 * Events page — the upcoming schedule (Today / Tomorrow / This week / Upcoming)
 * that used to sit on the home screen, now its own surface reached from
 * Menu → Events. Renders the Dashboard in `eventsOnly` mode so the event
 * sections, cards, and detail modals stay pixel-identical to the home — no
 * duplicated pipeline.
 */
import Dashboard from "./dashboard";

export default function EventsPage() {
  return <Dashboard eventsOnly />;
}
