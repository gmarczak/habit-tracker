import type { HabitPreset } from "@/features/habits/HabitEditor";

/** Szablony do szybkiego startu. Każdy da się potem dowolnie edytować. */
export const TEMPLATES: (HabitPreset & { id: string; summary: string })[] = [
  { id: "water", name: "Woda", kind: "count", unit: "szklanek", targetValue: 8, icon: "droplet", color: "blue", frequency: "daily", summary: "8 szklanek dziennie" },
  { id: "read", name: "Czytanie", kind: "count", unit: "stron", targetValue: 10, icon: "book-open", color: "amber", frequency: "daily", summary: "10 stron dziennie" },
  { id: "walk", name: "Spacer", kind: "check", icon: "footprints", color: "green", frequency: "daily", summary: "codziennie" },
  { id: "meditate", name: "Medytacja", kind: "duration", targetValue: 10, icon: "wind", color: "violet", frequency: "daily", summary: "10 minut dziennie" },
  { id: "gym", name: "Siłownia", kind: "check", icon: "dumbbell", color: "rose", frequency: "weekly_count", timesPerWeek: 3, summary: "3 razy w tygodniu" },
  { id: "phone", name: "Bez telefonu po 22", kind: "check", icon: "phone-off", color: "teal", frequency: "daily", summary: "codziennie" },
  { id: "sleep", name: "Sen przed 23", kind: "check", icon: "bed-double", color: "violet", frequency: "daily", summary: "codziennie" },
  { id: "lang", name: "Nauka języka", kind: "duration", targetValue: 15, icon: "languages", color: "blue", frequency: "weekdays", weekdays: [1, 2, 3, 4, 5], summary: "15 minut w dni robocze" },
];
