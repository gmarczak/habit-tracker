import { createClient } from "@/utils/supabase/server";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Flame, Percent } from "lucide-react";
import HabitHistoryGrid from "@/components/HabitHistoryGrid";
import {
  calculateBestStreak,
  calculateCompletionRate,
  calculateStreak,
} from "@/utils/streakCalculator";

export const revalidate = 0;

type PageProps = {
  params: Promise<{ id: string }>;
};

type Habit = {
  id: string;
  name: string;
};

type HabitLog = {
  habit_id: string;
  completed_date: string;
};

export default async function HabitDetailsPage({ params }: PageProps) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: habit, error: habitError } = await supabase
    .from("habits")
    .select("id, name")
    .eq("id", id)
    .maybeSingle();

  if (habitError) throw habitError;
  if (!habit) notFound();

  const { data: logs, error: logsError } = await supabase
    .from("habit_logs")
    .select("habit_id, completed_date")
    .eq("habit_id", id);

  if (logsError) throw logsError;

  const completedDates = (logs as HabitLog[] | null | undefined)?.map(
    (l) => l.completed_date
  ) ?? [];

  const currentStreak = calculateStreak(completedDates);
  const bestStreak = calculateBestStreak(completedDates);
  const completion7 = calculateCompletionRate(completedDates, 7);
  const completion30 = calculateCompletionRate(completedDates, 30);

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-white flex justify-center overflow-hidden">
      <div className="w-full max-w-md px-6 py-12 flex flex-col gap-8 relative">
        <header className="flex flex-col gap-3">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-gray-400 hover:text-white transition-colors w-fit"
          >
            <ArrowLeft size={18} />
            <span>Wróć</span>
          </Link>

          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-white to-gray-500 bg-clip-text text-transparent">
              {(habit as Habit).name}
            </h1>
            <p className="text-gray-500 text-sm mt-1">Szczegóły nawyku</p>
          </div>
        </header>

        <section className="grid grid-cols-2 gap-3">
          <div className="p-4 rounded-2xl border border-gray-800 bg-gray-900">
            <div className="text-xs text-gray-500 uppercase tracking-wider font-semibold">
              Aktualny streak
            </div>
            <div className="mt-2 flex items-center gap-2">
              <Flame size={18} className={currentStreak > 0 ? "text-orange-400 fill-orange-400" : "text-gray-700"} />
              <div className="text-2xl font-bold">{currentStreak}</div>
            </div>
          </div>

          <div className="p-4 rounded-2xl border border-gray-800 bg-gray-900">
            <div className="text-xs text-gray-500 uppercase tracking-wider font-semibold">
              Najlepszy streak
            </div>
            <div className="mt-2 flex items-center gap-2">
              <Flame size={18} className={bestStreak > 0 ? "text-orange-400 fill-orange-400" : "text-gray-700"} />
              <div className="text-2xl font-bold">{bestStreak}</div>
            </div>
          </div>

          <div className="p-4 rounded-2xl border border-gray-800 bg-gray-900">
            <div className="text-xs text-gray-500 uppercase tracking-wider font-semibold">
              Wykonanie 7 dni
            </div>
            <div className="mt-2 flex items-center gap-2">
              <Percent size={18} className="text-gray-400" />
              <div className="text-2xl font-bold">{completion7}%</div>
            </div>
          </div>

          <div className="p-4 rounded-2xl border border-gray-800 bg-gray-900">
            <div className="text-xs text-gray-500 uppercase tracking-wider font-semibold">
              Wykonanie 30 dni
            </div>
            <div className="mt-2 flex items-center gap-2">
              <Percent size={18} className="text-gray-400" />
              <div className="text-2xl font-bold">{completion30}%</div>
            </div>
          </div>
        </section>

        <section className="p-4 rounded-2xl border border-gray-800 bg-gray-900">
          <HabitHistoryGrid habitId={id} initialCompletedDates={completedDates} days={30} />
        </section>
      </div>
    </main>
  );
}
