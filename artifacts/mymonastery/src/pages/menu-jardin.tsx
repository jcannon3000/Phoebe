import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { MenuHub } from "@/components/MenuHub";

export default function MenuJardinPage() {
  const [, setLocation] = useLocation();
  const { t } = useTranslation();
  const go = (p: string) => setLocation(p);
  return (
    <MenuHub
      title={t("jardin.title")}
      emoji="🌿"
      subtitle={t("jardin.subtitle")}
      backLabel={t("header.menu")}
      backHref="/menu"
      groups={[
        {
          header: t("jardin.study"),
          items: [
            { emoji: "📖", label: t("jardin.bible_study"), sub: t("jardin.bible_study_sub"), onClick: () => go("/jardin/bible-study") },
            { emoji: "👤", label: t("jardin.character_study"), sub: t("jardin.character_study_sub"), onClick: () => go("/jardin/character-study") },
            { emoji: "🎤", label: t("jardin.sermon_notes"), sub: t("jardin.sermon_notes_sub"), onClick: () => go("/jardin/sermon-notes") },
            { emoji: "📅", label: t("jardin.next_sunday"), sub: t("jardin.next_sunday_sub"), onClick: () => go("/jardin/next-sunday") },
          ],
        },
        {
          header: t("jardin.community"),
          items: [
            { emoji: "👥", label: t("jardin.groups"), sub: t("jardin.groups_sub"), onClick: () => go("/communities") },
          ],
        },
        {
          header: t("jardin.scripture_accountability"),
          items: [
            { emoji: "🔍", label: t("jardin.bible_lookup"), sub: t("jardin.bible_lookup_sub"), onClick: () => go("/jardin/bible") },
            { emoji: "🏆", label: t("jardin.leaderboard"), sub: t("jardin.leaderboard_sub"), onClick: () => go("/jardin/leaderboard") },
          ],
        },
      ]}
    />
  );
}
