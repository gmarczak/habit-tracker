import { supabase } from "@/utils/supabase";
import HabitCard from "@/components/HabitCard";
import AddHabitButton from "@/components/AddHabitButton";
import { CalendarDays } from "lucide-react";
import { calculateStreak } from "@/utils/streakCalculator";

export const revalidate = 0; // Wyłącza cache, żeby dane były zawsze świeże

const getTodayDate = () => {
  return new Intl.DateTimeFormat("pl-PL", {
    weekday: "long", day: "numeric", month: "long",
  }).format(new Date());
};

export default async function Home() {
  const todayISO = new Date().toISOString().split('T')[0];

  // 1. Pobieramy nawyki
  const { data: habits } = await supabase
    .from("habits")
    .select("*")
    .order("created_at", { ascending: true });

  // 2. Pobieramy WSZYSTKIE logi (żeby policzyć streak)
  const { data: allLogs } = await supabase
    .from("habit_logs")
    .select("habit_id, completed_date");

  // 3. Grupujemy logi po ID nawyku (żeby wiedzieć, które daty należą do którego nawyku)
  // Wynik to np: { "id_nawyku_1": ["2023-10-01", "2023-10-02"], ... }
  const logsByHabit: Record<string, string[]> = {};

  allLogs?.forEach((log) => {
    if (!logsByHabit[log.habit_id]) {
      logsByHabit[log.habit_id] = [];
    }
    logsByHabit[log.habit_id].push(log.completed_date);
  });

  const today = getTodayDate();

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-white flex justify-center overflow-hidden">
      <div className="w-full max-w-md px-6 py-12 flex flex-col gap-8 relative">

        <header>
          <div className="flex items-center gap-2 text-gray-400 text-sm uppercase tracking-wider font-semibold mb-1">
            <CalendarDays size={16} />
            <span>Dzisiaj</span>
          </div>
          <h1 className="text-3xl font-bold capitalize bg-gradient-to-r from-white to-gray-500 bg-clip-text text-transparent">
            {today}
          </h1>
        </header>

        <section className="flex flex-col gap-3 pb-24">
          {habits?.map((habit) => {
            // Dla każdego nawyku wyciągamy jego daty i liczymy streak
            const habitDates = logsByHabit[habit.id] || [];
            const streak = calculateStreak(habitDates);
            const isCompletedToday = habitDates.includes(todayISO);

            return (
              <HabitCard
                key={habit.id}
                id={habit.id}
                name={habit.name}
                streak={streak} // <--- Przekazujemy wynik
                defaultCompleted={isCompletedToday}
              />
            );
          })}

          {habits?.length === 0 && (
            <div className="p-8 text-center border border-dashed border-gray-800 rounded-2xl text-gray-500">
              Jeszcze nic tu nie ma.<br />Kliknij plusa, żeby dodać!
            </div>
          )}
        </section>

        <AddHabitButton />
      </div>
    </main>
  );
}