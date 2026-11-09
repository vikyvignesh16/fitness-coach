import { Activity, Dumbbell, Footprints, House, MessageCircle, Utensils, type LucideIcon } from "lucide-react";
import type { TABS } from "@/lib/nav";

/** One icon per tab, shared by the bottom bar (phone) and the sidebar (laptop). */
export const TAB_ICONS: Record<(typeof TABS)[number]["icon"], LucideIcon> = {
  home: House,
  runs: Footprints,
  gym: Dumbbell,
  food: Utensils,
  insights: Activity,
  chat: MessageCircle,
};
