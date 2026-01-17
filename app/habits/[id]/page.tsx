import { createClient } from "@/utils/supabase/server";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Flame, Percent } from "lucide-react";
import HabitCalendar from "@/components/HabitCalendar";
import HabitChart from "@/components/HabitChart";
import {
    calculateBestStreakFromLogs,
    calculateCompletionRateFromLogs,
    calculateStreakFromLogs,
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
    status?: "done" | "skip" | null;
    note?: string | null;
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
        .select("habit_id, completed_date, status, note")
        .eq("habit_id", id);

    if (logsError) throw logsError;

    const habitLogs = (logs as HabitLog[] | null | undefined) ?? [];
    const completedDates = habitLogs
        .filter(log => log.status === "done")
        .map(log => log.completed_date);

    const currentStreak = calculateStreakFromLogs(habitLogs);
    const bestStreak = calculateBestStreakFromLogs(habitLogs);
    const completion7 = calculateCompletionRateFromLogs(habitLogs, 7);
    const completion30 = calculateCompletionRateFromLogs(habitLogs, 30);
    const totalCompletions = habitLogs.filter(log => log.status === "done").length;

    return (
        <>
            {/* DESKTOP - 70%/30% */}
            <main className="hidden lg:flex h-screen bg-[#0d0d0d] text-white overflow-hidden">
                {/* MAIN - 70% */}
                <div className="flex-1 lg:w-[70%] flex flex-col overflow-hidden">
                    <header className="flex-shrink-0 sticky top-0 z-10 bg-[#0d0d0d] border-b border-gray-800/30 px-8 py-6">
                        <Link
                            href="/"
                            className="inline-flex items-center gap-2 text-gray-400 hover:text-gray-300 transition-colors text-sm mb-4"
                        >
                            <ArrowLeft size={16} />
                            <span>Wróć na główną</span>
                        </Link>
                        <h1 className="text-3xl font-semibold text-gray-100 tracking-tight">
                            {(habit as Habit).name}
                        </h1>
                    </header>

                    <div className="flex-1 overflow-y-auto px-8 pb-8">
                        {/* KALENDARZ */}
                        <div className="mt-8">
                            <h2 className="text-lg font-semibold text-gray-300 mb-4">Kalendarz</h2>
                            <section className="p-6 rounded-lg border border-gray-800/30 bg-gray-900/20">
                                <HabitCalendar completedDates={completedDates} />
                            </section>
                        </div>

                        {/* WYKRES POSTĘPÓW */}
                        <div className="mt-8">
                            <h2 className="text-lg font-semibold text-gray-300 mb-4">Postępy (30 dni)</h2>
                            <section className="p-6 rounded-lg border border-gray-800/30 bg-gray-900/20">
                                <HabitChart completedDates={completedDates} days={30} />
                            </section>
                        </div>

                        {/* WYKRES POSTĘPÓW (90 DNI) */}
                        <div className="mt-8">
                            <h2 className="text-lg font-semibold text-gray-300 mb-4">Postępy (90 dni)</h2>
                            <section className="p-6 rounded-lg border border-gray-800/30 bg-gray-900/20">
                                <HabitChart completedDates={completedDates} days={90} />
                            </section>
                        </div>
                    </div>
                </div>

                {/* ASIDE - 30% */}
                <aside className="hidden lg:flex lg:w-[30%] border-l border-gray-800/30 bg-[#0d0d0d] flex-col h-full px-8 py-8 overflow-y-auto">
                    <h2 className="text-lg font-semibold text-gray-300 mb-6">Statystyki</h2>

                    <div className="space-y-6">
                        <div>
                            <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Aktualny streak</p>
                            <div className="flex items-center gap-3">
                                <Flame size={28} className={currentStreak > 0 ? "text-orange-400 fill-orange-400" : "text-gray-700"} />
                                <p className="text-4xl font-semibold text-gray-100">{currentStreak}</p>
                            </div>
                        </div>

                        <div>
                            <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Najlepszy streak</p>
                            <div className="flex items-center gap-3">
                                <Flame size={28} className={bestStreak > 0 ? "text-orange-400 fill-orange-400" : "text-gray-700"} />
                                <p className="text-4xl font-semibold text-gray-100">{bestStreak}</p>
                            </div>
                        </div>


                        <div className="border-t border-gray-800/30 pt-6">
                            <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Łącznie wykonań</p>
                            <p className="text-3xl font-semibold text-gray-100">{totalCompletions}</p>
                        </div>
                        <div className="border-t border-gray-800/30 pt-6">
                            <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Wykonanie 7 dni</p>
                            <p className="text-3xl font-semibold text-gray-100">{completion7}%</p>
                            <div className="mt-3 h-2 bg-gray-800/50 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-gray-600 transition-all"
                                    style={{ width: `${completion7}%` }}
                                />
                            </div>
                        </div>

                        <div>
                            <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Wykonanie 30 dni</p>
                            <p className="text-3xl font-semibold text-gray-100">{completion30}%</p>
                            <div className="mt-3 h-2 bg-gray-800/50 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-gray-600 transition-all"
                                    style={{ width: `${completion30}%` }}
                                />
                            </div>
                        </div>
                    </div>

                    <div className="mt-auto pt-8 border-t border-gray-800/30">
                        <Link
                            href="/"
                            className="block text-center px-4 py-2 bg-gray-800/50 hover:bg-gray-800 rounded-lg text-sm text-gray-400 hover:text-gray-300 transition-colors"
                        >
                            Powrót
                        </Link>
                    </div>
                </aside>
            </main>

            {/* MOBILE - FULL WIDTH */}
            <main className="lg:hidden h-screen bg-[#0d0d0d] text-white overflow-hidden flex flex-col">
                <header className="flex-shrink-0 sticky top-0 z-10 bg-[#0d0d0d] border-b border-gray-800/30 px-4 py-4">
                    <Link
                        href="/"
                        className="inline-flex items-center gap-2 text-gray-400 hover:text-gray-300 transition-colors text-sm mb-3"
                    >
                        <ArrowLeft size={16} />
                        <span>Wróć</span>
                    </Link>
                    <h1 className="text-2xl font-semibold text-gray-100 tracking-tight">
                        {(habit as Habit).name}
                    </h1>
                </header>

                <div className="flex-1 overflow-y-auto px-4 pb-6">
                    {/* STATSYSTYKI - MOBILE COMPACT */}
                    <div className="mt-6 grid grid-cols-2 gap-4">
                        <div className="bg-gray-900/50 rounded-lg p-4">
                            <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Aktualny streak</p>
                            <div className="flex items-center gap-2">
                                <Flame size={20} className={currentStreak > 0 ? "text-orange-400 fill-orange-400" : "text-gray-700"} />
                                <p className="text-2xl font-semibold text-gray-100">{currentStreak}</p>
                            </div>
                        </div>

                        <div className="bg-gray-900/50 rounded-lg p-4">
                            <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Best Streak</p>
                            <div className="flex items-center gap-2">
                                <Flame size={20} className={bestStreak > 0 ? "text-orange-400 fill-orange-400" : "text-gray-700"} />
                                <p className="text-2xl font-semibold text-gray-100">{bestStreak}</p>
                            </div>
                        </div>

                        <div className="bg-gray-900/50 rounded-lg p-4">
                            <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">7 dni</p>
                            <p className="text-2xl font-semibold text-gray-100">{completion7}%</p>
                        </div>

                        <div className="bg-gray-900/50 rounded-lg p-4">
                            <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">30 dni</p>
                            <p className="text-2xl font-semibold text-gray-100">{completion30}%</p>
                        </div>

                        <div className="bg-gray-900/50 rounded-lg p-4">
                            <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Razem</p>
                            <p className="text-2xl font-semibold text-gray-100">{totalCompletions}</p>
                        </div>
                    </div>

                    {/* KALENDARZ */}
                    <div className="mt-6">
                        <h2 className="text-lg font-semibold text-gray-300 mb-4">Kalendarz</h2>
                        <div className="bg-gray-900/20 rounded-lg border border-gray-800/30 p-4">
                            <HabitCalendar completedDates={completedDates} />
                        </div>
                    </div>

                    {/* WYKRESY */}
                    <div className="mt-6">
                        <h2 className="text-lg font-semibold text-gray-300 mb-4">Postępy (30 dni)</h2>
                        <div className="bg-gray-900/20 rounded-lg border border-gray-800/30 p-4">
                            <HabitChart completedDates={completedDates} days={30} />
                        </div>
                    </div>
                </div>
            </main>
        </>
    );
}
