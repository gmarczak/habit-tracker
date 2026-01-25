import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import DesktopLayout from "@/components/DesktopLayout";
import HabitList from "@/components/HabitList";
import AddHabitButton from "@/components/AddHabitButton";
import { CalendarDays, BarChart3 } from "lucide-react";
import { calculateStreakFromLogs } from "@/utils/streakCalculator";
import Link from "next/link";

// To wyłącza cache, żebyś zawsze widział aktualne dane po odświeżeniu
export const revalidate = 0;

const getTodayDate = () => {
  return new Intl.DateTimeFormat("pl-PL", {
    weekday: "long",
    day: "numeric",
    month: "long",
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

  const todayISO = new Date().toISOString().split('T')[0];

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

  const today = getTodayDate();

  // Przygotuj dane dla HabitList
  const habitsData = habits?.filter((h: any) => !h?.archived)?.map((habit: any) => {
    const habitDoneDates = doneDatesByHabit[habit.id] || [];
    const habitSkipDates = skipDatesByHabit[habit.id] || [];
    const habitLogs = logsByHabit[habit.id] || [];
    const streak = calculateStreakFromLogs(habitLogs);
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
    };
  }) || [];

  // Desktop layout (3 kolumny) widoczny na lg i wyższych
  // Mobile layout (single column) widoczny poniżej lg

  return (
    <>
      {/* DESKTOP - 3 KOLUMNY (lg i wyżej) */}
      <div className="hidden lg:block">
        <DesktopLayout habits={habitsData} todayDate={today} />
      </div>

      {/* MOBILE - SINGLE COLUMN (poniżej lg) */}
      <main className="lg:hidden min-h-screen bg-[#121212] text-[#f9fafb] flex justify-center overflow-hidden">
        <div className="w-full max-w-4xl px-4 sm:px-6 py-8 sm:py-12 flex flex-col gap-6 sm:gap-8 relative">
          {/* HEADER Z DATĄ */}
          <header>
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2 text-[#9ca3af] text-xs sm:text-sm uppercase tracking-wider font-semibold">
                <CalendarDays size={14} className="sm:w-4 sm:h-4" />
                <span className="hidden xs:inline">Dzisiaj</span>
              </div>
              <Link
                href="/yearly-summary"
                className="flex items-center gap-2 px-3 py-1.5 bg-[#1e1e1e] hover:bg-[#2d2d2d] rounded-lg transition-colors text-xs sm:text-sm text-[#9ca3af] hover:text-[#f9fafb]"
              >
                <BarChart3 size={14} className="sm:w-4 sm:h-4" />
                <span>Rok</span>
              </Link>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold capitalize bg-gradient-to-r from-[#f9fafb] to-[#9ca3af] bg-clip-text text-transparent">
              {today}
            </h1>
          </header>

          {/* LISTA NAWYKÓW Z WYSZUKIWANIEM I GRUPOWANIEM */}
          <section className="pb-24 sm:pb-28">
            {habitsData.length > 0 ? (
              <HabitList habits={habitsData} />
            ) : (
              <div className="p-8 text-center border border-dashed border-gray-800 rounded-2xl text-gray-500 mt-4">
                <p>Jeszcze nic tu nie ma.</p>
                <p className="text-sm mt-2">Kliknij plusa na dole, żeby dodać swój pierwszy nawyk!</p>
              </div>
            )}
          </section>

          {/* FAB BUTTON - MOBILE */}
          <div className="lg:hidden fixed bottom-6 right-6 z-40">
            <AddHabitButton />
          </div>
        </div>
      </main>
    </>
  );
}