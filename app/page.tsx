import { supabase } from "@/utils/supabase";
import HabitCard from "@/components/HabitCard";
import AddHabitButton from "@/components/AddHabitButton";
import { CalendarDays } from "lucide-react";

const getTodayDate = () => {
  return new Intl.DateTimeFormat("pl-PL", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());
};

export default async function Home() {
  const todayISO = new Date().toISOString().split('T')[0];

  const { data: habits } = await supabase
    .from("habits")
    .select("*")
    .order("created_at", { ascending: true });

  const { data: logs } = await supabase
    .from("habit_logs")
    .select("habit_id")
    .eq("completed_date", todayISO);

  const completedHabitIds = new Set(logs?.map((log) => log.habit_id));
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

        <section className="flex flex-col gap-3 pb-24"> {/* Dodałem padding-bottom, żeby lista nie wchodziła pod przycisk */}
          {habits?.map((habit) => (
            <HabitCard
              key={habit.id}
              id={habit.id}
              name={habit.name}
              defaultCompleted={completedHabitIds.has(habit.id)}
            />
          ))}

          {habits?.length === 0 && (
            <div className="p-8 text-center border border-dashed border-gray-800 rounded-2xl text-gray-500">
              Jeszcze nic tu nie ma.
              <br />Kliknij plusa, żeby dodać!
            </div>
          )}
        </section>

        {/* Tutaj wstawiamy nasz nowy, działający przycisk */}
        <AddHabitButton />

      </div>
    </main>
  );
}