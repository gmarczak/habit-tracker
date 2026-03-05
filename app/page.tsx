import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import DesktopLayout from "@/components/DesktopLayout";
import HabitList from "@/components/HabitList";
import AddHabitButton from "@/components/AddHabitButton";
import StatsPanel from "@/components/StatsPanel";
import MobileBottomNav from "@/components/MobileBottomNav";
import QuickStartHabits from "@/components/QuickStartHabits";
import { CalendarDays, BarChart3 } from "lucide-react";
import { calculateStreakFromLogs } from "@/utils/streakCalculator";
import Link from "next/link";
import { formatInTimeZone } from "date-fns-tz";

// To wyłącza cache, żebyś zawsze widział aktualne dane po odświeżeniu
export const revalidate = 0;

const getTodayDate = (tz: string) => {
  return new Intl.DateTimeFormat("pl-PL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: tz,
  }).format(new Date());
};

export default async function Home() {
  // -----------------------------------------------------------------
  // POPRAWKA: Dodaliśmy 'await', co naprawia błąd ze screena
  // W Next.js 15 ciasteczka są asynchroniczne, więc klient też musi być czekany.
  // -----------------------------------------------------------------
  const supabase = await createClient();

  // 1. Sprawdzamy, czy użytkownik jest zalogowany
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Safely get timezone
  let timezone = "UTC";
  try {
    const { data: profile } = await supabase.from("profiles").select("timezone").eq("id", user.id).maybeSingle();
    if (profile?.timezone) timezone = profile.timezone;
  } catch (e) {
    // Fallback quietly if table is missing
  }

  const todayISO = formatInTimeZone(new Date(), timezone, "yyyy-MM-dd");

  // 2. Pobieramy nawyki użytkownika
  const { data: habits } = await supabase
    .from("habits")
    .select("*")
    .order("created_at", { ascending: true });

  // 3. Pobieramy historię logów (do heatmapy i streaka)
  const { data: allLogs } = await supabase
    .from("habit_logs")
    .select("habit_id, completed_date, status, note");

  // 4. Grupujemy logi według nawyków
  const doneDatesByHabit: Record<string, string[]> = {};
  const skipDatesByHabit: Record<string, string[]> = {};
  const logsByHabit: Record<string, Array<{ completed_date: string; status?: "done" | "skip" | null }>> = {};

  allLogs?.forEach((log: any) => {
    if (!logsByHabit[log.habit_id]) logsByHabit[log.habit_id] = [];
    logsByHabit[log.habit_id].push({ completed_date: log.completed_date, status: log.status ?? "done" });

    if ((log.status ?? "done") === "skip") {
      if (!skipDatesByHabit[log.habit_id]) skipDatesByHabit[log.habit_id] = [];
      skipDatesByHabit[log.habit_id].push(log.completed_date);
    } else {
      if (!doneDatesByHabit[log.habit_id]) doneDatesByHabit[log.habit_id] = [];
      doneDatesByHabit[log.habit_id].push(log.completed_date);
    }
  });

  const today = getTodayDate(timezone);

  // Przygotuj dane dla HabitList
  const habitsData = habits?.filter((h: any) => !h?.archived)?.map((habit: any) => {
    const habitDoneDates = doneDatesByHabit[habit.id] || [];
    const habitSkipDates = skipDatesByHabit[habit.id] || [];
    const habitLogs = logsByHabit[habit.id] || [];
    const streak = calculateStreakFromLogs(habitLogs, habit.frequency_type, habit.frequency_value, todayISO);

    // Check if habit is required today
    let isRequiredToday = true;
    if (habit.frequency_type === 'specific_days') {
      const requiredDays = Array.isArray(habit.frequency_value) ? habit.frequency_value : [];
      const d = new Date(todayISO + 'T12:00:00Z').getDay();
      isRequiredToday = requiredDays.includes(d);
    }

    // For specific_days, if it's not required today, maybe we shouldn't show it as "missed" by default
    // But isCompletedToday strictly means if they did it today
    const isCompletedToday = habitDoneDates.includes(todayISO);

    return {
      id: habit.id,
      name: habit.name,
      streak,
      completedDates: habitDoneDates,
      skippedDates: habitSkipDates,
      tags: habit.tags ?? [],
      archived: habit.archived ?? false,
      isCompletedToday,
      isRequiredToday,
      frequency_type: habit.frequency_type || 'daily',
      frequency_value: habit.frequency_value,
    };
  }) || [];

  const completedToday = habitsData.filter((h: any) => h.isCompletedToday).length;
  const totalStreak = Math.max(...habitsData.map((h: any) => h.streak), 0);
  const totalCompletions = habitsData.reduce((sum: number, h: any) => sum + h.completedDates.length, 0);

  return (
    <>
      {/* DESKTOP - 3 KOLUMNY (lg i wyżej) */}
      <div className="hidden lg:block">
        <DesktopLayout habits={habitsData} todayDate={today} />
      </div>

      {/* MOBILE - SINGLE COLUMN (poniżej lg) */}
      <main className="lg:hidden min-h-[100dvh] bg-main-bg text-text-primary flex flex-col overflow-y-auto pb-28">
        <div className="w-full px-4 sm:px-6 py-4 sm:py-6 flex flex-col gap-4 relative max-w-lg mx-auto">
          {/* NAGŁÓWEK znajduje się teraz wewnątrz HabitList, by obsłużyć Day Navigation on Mobile */}

          {/* STATYSTYKI MOBILNE (Horyzontalnie przewijane) */}
          <section className="overflow-x-auto pb-1 -mx-4 px-4 snap-x">
            <div className="w-full">
              <StatsPanel
                totalStreak={totalStreak}
                completedToday={completedToday}
                totalHabits={habitsData.length}
                habits={habitsData}
                totalCompletions={totalCompletions}
              />
            </div>
          </section>

          {/* LISTA NAWYKÓW Z WYSZUKIWANIEM I GRUPOWANIEM */}
          <section className="flex-1">
            {habitsData.length > 0 ? (
              <HabitList habits={habitsData} />
            ) : (
              <QuickStartHabits />
            )}
          </section>
        </div>
      </main>

      {/* MOBILE BOTTOM NAV */}
      <MobileBottomNav />
    </>
  );
}