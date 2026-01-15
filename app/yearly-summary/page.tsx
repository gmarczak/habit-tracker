import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, TrendingUp, Calendar, Target, Award } from "lucide-react";
import YearHeatmap from "@/components/YearHeatmap";
import { calculateYearlyStats, getMonthNamePL, calculateHabitYearlyStats } from "@/utils/yearlyStats";

export const revalidate = 0;

export default async function YearlySummaryPage() {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect("/login");

    const currentYear = new Date().getFullYear();

    // Pobierz wszystkie nawyki użytkownika
    const { data: habits } = await supabase
        .from("habits")
        .select("id, name")
        .order("name");

    // Pobierz wszystkie logi
    const { data: allLogs } = await supabase
        .from("habit_logs")
        .select("habit_id, completed_date, status");

    // Przygotuj dane dla heatmapy (dodaj nazwę nawyku)
    const logsWithHabitNames = allLogs?.map(log => {
        const habit = habits?.find(h => h.id === log.habit_id);
        return {
            ...log,
            habit_name: habit?.name || "Nieznany nawyk"
        };
    }) || [];

    // Oblicz statystyki roczne
    const yearStats = calculateYearlyStats(allLogs || [], currentYear);

    // Oblicz statystyki dla każdego nawyku
    const habitStats = habits?.map(habit => {
        const habitLogs = allLogs?.filter(log => log.habit_id === habit.id) || [];
        const stats = calculateHabitYearlyStats(habitLogs, currentYear);
        return {
            ...habit,
            ...stats
        };
    }).sort((a, b) => b.totalDays - a.totalDays) || [];

    return (
        <main className="min-h-screen bg-[#0a0a0a] text-white">
            <div className="max-w-7xl mx-auto px-6 py-12">
                {/* Header */}
                <div className="mb-8">
                    <Link
                        href="/"
                        className="inline-flex items-center gap-2 text-gray-400 hover:text-white transition-colors mb-4"
                    >
                        <ArrowLeft size={20} />
                        <span>Powrót do głównej</span>
                    </Link>
                    <h1 className="text-4xl font-bold bg-gradient-to-r from-white to-gray-500 bg-clip-text text-transparent">
                        Podsumowanie Roczne {currentYear}
                    </h1>
                    <p className="text-gray-400 mt-2">
                        Twoje nawyki w ujęciu całorocznym
                    </p>
                </div>

                {/* Główne statystyki */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                    <div className="bg-gradient-to-br from-emerald-900/40 to-emerald-950/40 rounded-xl p-6 border border-emerald-800/30">
                        <div className="flex items-center gap-3 mb-2">
                            <Calendar className="text-emerald-400" size={24} />
                            <span className="text-gray-400 text-sm">Aktywne dni</span>
                        </div>
                        <div className="text-3xl font-bold">{yearStats.totalActiveDays}</div>
                        <div className="text-sm text-gray-500 mt-1">
                            z {yearStats.daysInYear} dni ({yearStats.completionRate}%)
                        </div>
                    </div>

                    <div className="bg-gradient-to-br from-blue-900/40 to-blue-950/40 rounded-xl p-6 border border-blue-800/30">
                        <div className="flex items-center gap-3 mb-2">
                            <Target className="text-blue-400" size={24} />
                            <span className="text-gray-400 text-sm">Wykonane nawyki</span>
                        </div>
                        <div className="text-3xl font-bold">{yearStats.totalCompletions}</div>
                        <div className="text-sm text-gray-500 mt-1">
                            w ciągu roku
                        </div>
                    </div>

                    <div className="bg-gradient-to-br from-purple-900/40 to-purple-950/40 rounded-xl p-6 border border-purple-800/30">
                        <div className="flex items-center gap-3 mb-2">
                            <TrendingUp className="text-purple-400" size={24} />
                            <span className="text-gray-400 text-sm">Najdłuższa seria</span>
                        </div>
                        <div className="text-3xl font-bold">{yearStats.longestStreak}</div>
                        <div className="text-sm text-gray-500 mt-1">
                            {yearStats.longestStreak === 1 ? 'dzień' : 'dni'}
                        </div>
                    </div>

                    <div className="bg-gradient-to-br from-amber-900/40 to-amber-950/40 rounded-xl p-6 border border-amber-800/30">
                        <div className="flex items-center gap-3 mb-2">
                            <Award className="text-amber-400" size={24} />
                            <span className="text-gray-400 text-sm">Najlepszy miesiąc</span>
                        </div>
                        <div className="text-3xl font-bold">{yearStats.bestMonth.completions}</div>
                        <div className="text-sm text-gray-500 mt-1">
                            {getMonthNamePL(yearStats.bestMonth.month)}
                        </div>
                    </div>
                </div>

                {/* Heatmapa */}
                <div className="bg-gray-900/50 rounded-2xl p-6 mb-8 border border-gray-800">
                    <h2 className="text-2xl font-bold mb-6">Mapa aktywności</h2>
                    <YearHeatmap year={currentYear} allLogs={logsWithHabitNames} />
                </div>

                {/* Statystyki poszczególnych nawyków */}
                <div className="bg-gray-900/50 rounded-2xl p-6 border border-gray-800">
                    <h2 className="text-2xl font-bold mb-6">Nawyki w {currentYear}</h2>
                    <div className="space-y-3">
                        {habitStats.length > 0 ? (
                            habitStats.map((habit) => (
                                <Link
                                    key={habit.id}
                                    href={`/habits/${habit.id}`}
                                    className="flex items-center justify-between p-4 bg-gray-800/50 rounded-xl hover:bg-gray-800 transition-all group"
                                >
                                    <div className="flex-1">
                                        <h3 className="font-semibold group-hover:text-emerald-400 transition-colors">
                                            {habit.name}
                                        </h3>
                                        <div className="flex gap-4 mt-2 text-sm text-gray-400">
                                            <span>{habit.totalDays} {habit.totalDays === 1 ? 'dzień' : 'dni'}</span>
                                            <span>•</span>
                                            <span>Najdłuższa seria: {habit.longestStreak}</span>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <div className="text-right">
                                            <div className="text-2xl font-bold text-emerald-400">
                                                {Math.round((habit.totalDays / yearStats.daysInYear) * 100)}%
                                            </div>
                                            <div className="text-xs text-gray-500">wypełnienia</div>
                                        </div>
                                    </div>
                                </Link>
                            ))
                        ) : (
                            <div className="text-center py-12 text-gray-500">
                                Brak nawyków do wyświetlenia
                            </div>
                        )}
                    </div>
                </div>

                {/* Statystyki miesięczne */}
                <div className="bg-gray-900/50 rounded-2xl p-6 mt-8 border border-gray-800">
                    <h2 className="text-2xl font-bold mb-6">Rozkład miesięczny</h2>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                        {yearStats.monthlyStats.map((monthStat) => (
                            <div
                                key={monthStat.month}
                                className="bg-gray-800/50 rounded-lg p-4 border border-gray-700/50"
                            >
                                <div className="text-sm text-gray-400 mb-1">
                                    {getMonthNamePL(monthStat.month)}
                                </div>
                                <div className="text-2xl font-bold text-emerald-400">
                                    {monthStat.completions}
                                </div>
                                <div className="text-xs text-gray-500 mt-1">
                                    {monthStat.activeDays} {monthStat.activeDays === 1 ? 'dzień' : 'dni'}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </main>
    );
}
