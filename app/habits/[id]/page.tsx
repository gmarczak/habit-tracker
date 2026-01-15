import { createClient } from "@/utils/supabase/server";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Flame, Percent } from "lucide-react";
import HabitHistoryGrid from "@/components/HabitHistoryGrid";
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

    const currentStreak = calculateStreakFromLogs(habitLogs);
    const bestStreak = calculateBestStreakFromLogs(habitLogs);
    const completion7 = calculateCompletionRateFromLogs(habitLogs, 7);
    const completion30 = calculateCompletionRateFromLogs(habitLogs, 30);

    return (
        <main className="min-h-screen bg-[#0a0a0a] text-white flex justify-center overflow-hidden">
            <div className="w-full max-w-4xl px-4 sm:px-6 py-8 sm:py-12 flex flex-col gap-6 sm:gap-8 relative">
                <header className="flex flex-col gap-3">
                    <Link
                        href="/"
                        className="inline-flex items-center gap-2 text-gray-400 hover:text-white transition-colors w-fit text-sm"
                    >
                        <ArrowLeft size={16} className="sm:w-[18px] sm:h-[18px]" />
                        <span>Wróć</span>
                    </Link>

                    <div>
                        <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-white to-gray-500 bg-clip-text text-transparent">
                            {(habit as Habit).name}
                        </h1>
                        <p className="text-gray-500 text-xs sm:text-sm mt-1">Szczegóły nawyku</p>
                    </div>
                </header>

                <section className="grid grid-cols-2 gap-2 sm:gap-3">
                    <div className="p-3 sm:p-4 rounded-xl sm:rounded-2xl border border-gray-800 bg-gray-900">
                        <div className="text-[10px] sm:text-xs text-gray-500 uppercase tracking-wider font-semibold">
                            Aktualny streak
                        </div>
                        <div className="mt-2 flex items-center gap-2">
                            <Flame size={16} className={`sm:w-[18px] sm:h-[18px] ${currentStreak > 0 ? "text-orange-400 fill-orange-400" : "text-gray-700"}`} />
                            <div className="text-xl sm:text-2xl font-bold">{currentStreak}</div>
                        </div>
                    </div>

                    <div className="p-3 sm:p-4 rounded-xl sm:rounded-2xl border border-gray-800 bg-gray-900">
                        <div className="text-[10px] sm:text-xs text-gray-500 uppercase tracking-wider font-semibold">
                            Najlepszy streak
                        </div>
                        <div className="mt-2 flex items-center gap-2">
                            <Flame size={16} className={`sm:w-[18px] sm:h-[18px] ${bestStreak > 0 ? "text-orange-400 fill-orange-400" : "text-gray-700"}`} />
                            <div className="text-xl sm:text-2xl font-bold">{bestStreak}</div>
                        </div>
                    </div>

                    <div className="p-3 sm:p-4 rounded-xl sm:rounded-2xl border border-gray-800 bg-gray-900">
                        <div className="text-[10px] sm:text-xs text-gray-500 uppercase tracking-wider font-semibold">
                            Wykonanie 7 dni
                        </div>
                        <div className="mt-2 flex items-center gap-2">
                            <Percent size={16} className="sm:w-[18px] sm:h-[18px] text-gray-400" />
                            <div className="text-xl sm:text-2xl font-bold">{completion7}%</div>
                        </div>
                    </div>

                    <div className="p-3 sm:p-4 rounded-xl sm:rounded-2xl border border-gray-800 bg-gray-900">
                        <div className="text-[10px] sm:text-xs text-gray-500 uppercase tracking-wider font-semibold">
                            Wykonanie 30 dni
                        </div>
                        <div className="mt-2 flex items-center gap-2">
                            <Percent size={16} className="sm:w-[18px] sm:h-[18px] text-gray-400" />
                            <div className="text-xl sm:text-2xl font-bold">{completion30}%</div>
                        </div>
                    </div>
                </section>

                <section className="p-4 sm:p-6 rounded-xl sm:rounded-2xl border border-gray-800 bg-gray-900">
                    <HabitHistoryGrid habitId={id} initialLogs={habitLogs} days={30} />
                </section>
            </div>
        </main>
    );
}
