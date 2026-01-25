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
        <main className="min-h-screen bg-[#121212] text-[#f9fafb]">
            <div className="max-w-7xl mx-auto px-6 py-12">
                {/* Header */}
                <div className="mb-8">
                    <Link
                        href="/"
                        className="inline-flex items-center gap-2 text-[#9ca3af] hover:text-[#f9fafb] transition-colors mb-4"
                    >
                        <ArrowLeft size={20} />
                        <span>Powrót do głównej</span>
                    </Link>
                    <h1 className="text-4xl font-bold bg-gradient-to-r from-[#f9fafb] to-[#9ca3af] bg-clip-text text-transparent">
                        Podsumowanie Roczne {currentYear}
                    </h1>
                    <p className="text-[#9ca3af] mt-2">
                        Twoje nawyki w ujęciu całorocznym
                    </p>
                </div>

                {/* Główne statystyki */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                    <div className="bg-gradient-to-br from-[#064e3b]/40 to-[#0d3d2d]/40 rounded-xl p-6 border border-[#10b981]/30">
                        <div className="flex items-center gap-3 mb-2">
                            <Calendar className="text-[#10b981]" size={24} />
                            <span className="text-[#9ca3af] text-sm">Aktywne dni</span>
                        </div>
                        <div className="text-3xl font-bold text-[#f9fafb]">{yearStats.totalActiveDays}</div>
                        <div className="text-sm text-[#9ca3af] mt-1">
                            z {yearStats.daysInYear} dni ({yearStats.completionRate}%)
                        </div>
                    </div>

                    <div className="bg-gradient-to-br from-[#1e40af]/40 to-[#1e3a8a]/40 rounded-xl p-6 border border-[#3b82f6]/30">
                        <div className="flex items-center gap-3 mb-2">
                            <Target className="text-[#3b82f6]" size={24} />
                            <span className="text-[#9ca3af] text-sm">Wykonane nawyki</span>
                        </div>
                        <div className="text-3xl font-bold text-[#f9fafb]">{yearStats.totalCompletions}</div>
                        <div className="text-sm text-[#9ca3af] mt-1">
                            w ciągu roku
                        </div>
                    </div>

                    <div className="bg-gradient-to-br from-[#6b21a8]/40 to-[#581c87]/40 rounded-xl p-6 border border-[#d946ef]/30">
                        <div className="flex items-center gap-3 mb-2">
                            <TrendingUp className="text-[#d946ef]" size={24} />
                            <span className="text-[#9ca3af] text-sm">Najdłuższa seria</span>
                        </div>
                        <div className="text-3xl font-bold text-[#f9fafb]">{yearStats.longestStreak}</div>
                        <div className="text-sm text-[#9ca3af] mt-1">
                            {yearStats.longestStreak === 1 ? 'dzień' : 'dni'}
                        </div>
                    </div>

                    <div className="bg-gradient-to-br from-[#a16207]/40 to-[#78350f]/40 rounded-xl p-6 border border-[#f59e0b]/30">
                        <div className="flex items-center gap-3 mb-2">
                            <Award className="text-[#f59e0b]" size={24} />
                            <span className="text-[#9ca3af] text-sm">Najlepszy miesiąc</span>
                        </div>
                        <div className="text-3xl font-bold text-[#f9fafb]">{yearStats.bestMonth.completions}</div>
                        <div className="text-sm text-[#9ca3af] mt-1">
                            {getMonthNamePL(yearStats.bestMonth.month)}
                        </div>
                    </div>
                </div>

                {/* Heatmapa */}
                <div className="bg-[#1e1e1e]/50 rounded-2xl p-6 mb-8 border border-[#2d2d2d]">
                    <h2 className="text-2xl font-bold mb-6 text-[#f9fafb]">Mapa aktywności</h2>
                    <YearHeatmap year={currentYear} allLogs={logsWithHabitNames} />
                </div>

                {/* Statystyki poszczególnych nawyków */}
                <div className="bg-[#1e1e1e]/50 rounded-2xl p-6 border border-[#2d2d2d]">
                    <h2 className="text-2xl font-bold mb-6 text-[#f9fafb]">Nawyki w {currentYear}</h2>
                    <div className="space-y-3">
                        {habitStats.length > 0 ? (
                            habitStats.map((habit) => (
                                <Link
                                    key={habit.id}
                                    href={`/habits/${habit.id}`}
                                    className="flex items-center justify-between p-4 bg-[#2d2d2d]/50 rounded-xl hover:bg-[#2d2d2d] transition-all group"
                                >
                                    <div className="flex-1">
                                        <h3 className="font-semibold group-hover:text-[#10b981] transition-colors text-[#f9fafb]">
                                            {habit.name}
                                        </h3>
                                        <div className="flex gap-4 mt-2 text-sm text-[#9ca3af]">
                                            <span>{habit.totalDays} {habit.totalDays === 1 ? 'dzień' : 'dni'}</span>
                                            <span>•</span>
                                            <span>Najdłuższa seria: {habit.longestStreak}</span>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <div className="text-right">
                                            <div className="text-2xl font-bold text-[#10b981]">
                                                {Math.round((habit.totalDays / yearStats.daysInYear) * 100)}%
                                            </div>
                                            <div className="text-xs text-[#9ca3af]">wypełnienia</div>
                                        </div>
                                    </div>
                                </Link>
                            ))
                        ) : (
                            <div className="text-center py-12 text-[#9ca3af]">
                                Brak nawyków do wyświetlenia
                            </div>
                        )}
                    </div>
                </div>

                {/* Statystyki miesięczne */}
                <div className="bg-[#1e1e1e]/50 rounded-2xl p-6 mt-8 border border-[#2d2d2d]">
                    <h2 className="text-2xl font-bold mb-6 text-[#f9fafb]">Rozkład miesięczny</h2>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                        {yearStats.monthlyStats.map((monthStat) => (
                            <div
                                key={monthStat.month}
                                className="bg-[#2d2d2d]/50 rounded-lg p-4 border border-[#3f3f46]/50"
                            >
                                <div className="text-sm text-[#9ca3af] mb-1">
                                    {getMonthNamePL(monthStat.month)}
                                </div>
                                <div className="text-2xl font-bold text-[#10b981]">
                                    {monthStat.completions}
                                </div>
                                <div className="text-xs text-[#9ca3af] mt-1">
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

