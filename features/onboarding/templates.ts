import type { HabitPreset } from "@/features/habits/HabitEditor";

/**
 * Szablony do szybkiego startu. Każdy da się potem dowolnie edytować.
 * Wszystkie odhacza się ręcznie (z przypomnieniami); Apple Zdrowie można włączyć w edycji nawyku.
 */
export const TEMPLATES: (HabitPreset & { id: string; summary: string })[] = [
  { id: "steps", timeOfDay: "day", name: "Spacer", kind: "check", icon: "footprints", color: "green", frequency: "daily", summary: "codziennie" },
  { id: "move", timeOfDay: "day", name: "Ruch", kind: "duration", targetValue: 30, icon: "heart-pulse", color: "rose", frequency: "daily", summary: "30 minut dziennie" },
  { id: "read", timeOfDay: "evening", name: "Czytanie", kind: "count", unit: "stron", targetValue: 10, icon: "book-open", color: "amber", frequency: "daily", summary: "10 stron dziennie" },
  { id: "meditate", timeOfDay: "morning", name: "Medytacja", kind: "duration", targetValue: 10, icon: "wind", color: "violet", frequency: "daily", summary: "10 minut dziennie" },
  { id: "gym", name: "Trening", kind: "check", icon: "dumbbell", color: "amber", frequency: "weekly_count", timesPerWeek: 3, summary: "3 razy w tygodniu" },
  { id: "phone", timeOfDay: "evening", name: "Bez telefonu po 22", kind: "check", icon: "phone-off", color: "teal", frequency: "daily", summary: "codziennie" },
  { id: "sleep", timeOfDay: "evening", name: "Sen przed 23", kind: "check", icon: "bed-double", color: "violet", frequency: "daily", summary: "codziennie" },
  { id: "sweets", name: "Bez słodyczy", kind: "check", goal: "quit", icon: "apple", color: "rose", frequency: "daily", summary: "rzucam — liczą się dni bez wpadki" },
  { id: "lang", name: "Nauka języka", kind: "duration", targetValue: 15, icon: "languages", color: "blue", frequency: "weekdays", weekdays: [1, 2, 3, 4, 5], summary: "15 minut w dni robocze" },
];
