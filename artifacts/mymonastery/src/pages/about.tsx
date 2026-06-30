import { Layout } from "@/components/layout";
import { useAuth } from "@/hooks/useAuth";
import { useLocation } from "wouter";
import { useEffect } from "react";

// The About page — Phoebe's foundational articulation, in the founder's voice:
// the "technology of holding" frame, the sanctuary/closet/house diagnosis, the
// "in the meantime" posture, and depth-vs-delivery as the guardrail. English
// only (a personal essay); not run through i18n by design.

const FONT = "'Space Grotesk', system-ui, sans-serif";
const SERIF = "Georgia, 'Times New Roman', serif";

const SECTIONS: Array<{ label: string; paras: string[] }> = [
  {
    label: "Tools that hold",
    paras: [
      `We tend to assume the first human tools were weapons — the spear, the blade, tools for hunting and winning. But the oldest may have been the ones that held: the basket, the sling, the pouch that let a person carry more than two hands could. They rotted and returned to the earth, the way things that hold tend to do.`,
      `One of the oldest technologies of holding is ritual. A daily rite doesn’t only mark time; it holds you inside it. Take enough of them away and the day loses its edges — it becomes a flow, one thing running into the next, and you’re carried along without being carried by anything. The philosopher Byung-Chul Han writes that ritual is to time what a home is to space. Without it, we aren’t made free. We’re made homeless in time.`,
    ],
  },
  {
    label: "A hunger I kept noticing",
    paras: [
      `In the time since I left the monastery, something quiet kept rising, and it took me a while to name it as a hunger for ritual. Inside the monastery the day had a shape you didn’t have to manage — the bell rang and you went to chapel. Outside those walls the shape is yours to keep or lose, and it’s so easily lost. I’d pray morning and evening, hold it a while, watch it slip, stop, begin again. Building Phoebe, I learned I wasn’t the only one: again and again, people asked for the same thing — help building a daily habit of prayer.`,
    ],
  },
  {
    label: "What’s actually broken",
    paras: [
      `A rector of mine once said the Episcopal Church does the sanctuary well — Sundays, the sacraments, the gathered liturgy — and the closet well — private devotion — but it doesn’t do the house: the relational middle, the few who actually know and hold one another. And the house is exactly the level the modern world has dissolved. Not through anyone’s ill will, but through the sheer speeding-up of life — dispersed work, the commute, fragmented schedules, the screen.`,
      `Our inherited way of forming people quietly assumed the house would be there — that you’d build a prayer life by walking to morning prayer with others. For a great many people, that’s simply no longer possible. And when a system keeps asking for something the world has made inaccessible, the people who fall away get blamed for it — read as less committed, less faithful — when really their life and the only door on offer no longer fit.`,
    ],
  },
  {
    label: "In the meantime",
    paras: [
      `For a long time I tried to rebuild the house — to organize the gatherings, to will the community back into being. It didn’t work, and I’ve come to believe it isn’t ours to fix; the forces that dissolved it are larger than any app, or any person. The frame I keep returning to is Jeremiah 29: in exile, aching to go home, the people are told instead to build houses and plant gardens — to be fruitful in the place they didn’t choose. So the honest question isn’t how to get back to the village. It’s what we do for the person who longs to pray and be held, in the world as it actually is.`,
      `Phoebe doesn’t pretend to rebuild the relational fabric that’s been lost. It does something humbler: it takes the closet — your daily practice — and tethers it to the sanctuary — the tradition, the office, the gathered church — so that praying alone is no longer praying disconnected. A way of being held in the gap where the house used to be.`,
    ],
  },
  {
    label: "Keep the depth, change the form",
    paras: [
      `The one thing we must never do is make prayer easier by making it thinner. A daily rule of prayer isn’t a watering-down of formation — it’s more demanding than showing up once a week. It’s daily, interior, a discipline of return. The depth of the tradition is non-negotiable. What’s negotiable is the delivery: the assumption that the depth can only be reached by gathering, at fixed times, in one place.`,
      `The Book of Common Prayer once carried the monastic hours out of the cloister and into ordinary hands — and it wasn’t only the translation, it was the medium. Phoebe is the next step in that same logic: the full office, carried into a dispersed life. The phone is the basket, not the thing carried. It borrows the gentle nudge of a reminders app — not to manufacture a streak you’d feel guilty breaking, but to carry you through the fragile early stretch before a practice ages into meaning. The measure is never whether it’s “sticky,” but whether it serves what makes us human.`,
      `That’s the whole of it, and the whole guardrail: Phoebe changes the delivery so the depth can survive. The day it changes the depth to make the delivery easier, it has become the thing it was built to resist.`,
    ],
  },
  {
    label: "What that looks like",
    paras: [
      `A short questionnaire shapes a daily practice across a wide range — from simply praying the Psalms to the full monastic offices, with several steps between. Pray Morning and Evening Prayer from your own Book of Common Prayer, with the lectionary and psalms filled in for you; or on the app; or listen to it; or watch Morning Prayer from the Washington National Cathedral — the same prayer, met however it meets you that day. And whatever scattered pieces your practice already has — the Psalms, a daily reflection, a few minutes of silence — Phoebe gathers them into one place.`,
    ],
  },
  {
    label: "The name",
    paras: [
      `The first Christian communities were small house churches — held together and pointed in the same direction, learning together how to become people of love. The deacon Phoebe, whom Paul names at the close of his letter to the Romans, was one of those who held such a community together. That’s where this project takes its name, and what it hopes, in its small way, to do: to help you be held through the seasons of a life — alongside a few others walking the same direction, trying together to become people of love.`,
    ],
  },
];

export default function AboutPage() {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && !user) setLocation("/");
  }, [user, isLoading, setLocation]);

  if (isLoading || !user) return null;

  return (
    <Layout>
      <div className="flex flex-col w-full max-w-2xl mx-auto pb-24">
        <header className="mb-9">
          <p style={{ fontFamily: FONT, fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase", color: "#7E9A85", margin: 0 }}>
            About
          </p>
          <h1 className="mt-1.5" style={{ fontFamily: FONT, fontSize: 28, fontWeight: 700, letterSpacing: "-0.01em", color: "#F0EDE6", lineHeight: 1.15 }}>
            A technology of holding
          </h1>
          <p className="mt-3" style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 16, lineHeight: 1.6, color: "#A8C5A0" }}>
            A way to keep a daily practice — and to be held through the seasons of a life — when the world has made that hard to do alone.
          </p>
        </header>

        <div className="space-y-9">
          {SECTIONS.map((s) => (
            <section key={s.label}>
              <h2 style={{ fontFamily: FONT, fontSize: 12, fontWeight: 600, letterSpacing: "0.14em", textTransform: "uppercase", color: "#8FAF96", margin: "0 0 10px" }}>
                {s.label}
              </h2>
              {s.paras.map((p, i) => (
                <p
                  key={i}
                  style={{ fontFamily: SERIF, fontSize: 16, lineHeight: 1.72, color: "#D5DECD", margin: i === 0 ? 0 : "13px 0 0" }}
                >
                  {p}
                </p>
              ))}
            </section>
          ))}
        </div>

        <p className="mt-10" style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 15, color: "#8FAF96", margin: "40px 0 0" }}>
          — Jeremy
        </p>
      </div>
    </Layout>
  );
}
