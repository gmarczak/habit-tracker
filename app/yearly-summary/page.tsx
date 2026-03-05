import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, TrendingUp, Calendar, Target, Award } from "lucide-react";
import YearHeatmap from "@/components/YearHeatmap";
import AppSidebar from "@/components/AppSidebar";
import MobileBottomNav from "@/components/MobileBottomNav";
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
        <div className="h-[100dvh] bg-main-bg text-text-primary flex overflow-hidden w-full">
            {/* DESKTOP SIDEBAR */}
            <div className="hidden lg:block h-full flex-shrink-0">
                <AppSidebar />
            </div>

            {/* MAIN CONTENT AREA */}
            <main className="flex-1 overflow-y-auto w-full pb-28 lg:pb-0 relative bg-main-bg">
                <div className="max-w-7xl mx-auto px-4 lg:px-8 py-6 lg:py-12 flex flex-col gap-4 lg:gap-8 min-h-full">

                    {/* Header */}
                    <div className="mb-0 lg:mb-4">
                        <h1 className="text-2xl lg:text-4xl font-bold bg-gradient-to-r from-[#f9fafb] to-[#9ca3af] lg:from-text-primary lg:to-text-secondary bg-clip-text text-transparent leading-tight mb-1">
                            Podsumowanie {currentYear}
                        </h1>
                        <p className="text-sm text-[#9ca3af] lg:text-text-secondary leading-tight">
                            Twoje nawyki w ujęciu całorocznym
                        </p>
                    </div>

                    {/* Główne statystyki - minimalistyczne */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 lg:gap-4">
                        <div className="bg-surface border border-border rounded-xl p-3 sm:p-4 shadow-sm flex flex-col justify-center">
                            <span className="text-text-secondary text-[10px] lg:text-xs uppercase tracking-wider font-semibold leading-none mb-1">Aktywne dni</span>
                            <div className="flex items-baseline gap-1.5 mt-0.5">
                                <span className="text-lg sm:text-2xl lg:text-3xl font-bold text-text-primary leading-none">{yearStats.totalActiveDays}</span>
                                <span className="text-[10px] text-text-secondary leading-none">/ {yearStats.daysInYear}</span>
                            </div>
                        </div>

                        <div className="bg-surface border border-border rounded-xl p-3 sm:p-4 shadow-sm flex flex-col justify-center">
                            <span className="text-text-secondary text-[10px] lg:text-xs uppercase tracking-wider font-semibold leading-none mb-1">Wykonane</span>
                            <div className="flex items-baseline gap-1.5 mt-0.5">
                                <span className="text-lg sm:text-2xl lg:text-3xl font-bold text-text-primary leading-none">{yearStats.totalCompletions}</span>
                                <span className="text-[10px] text-text-secondary leading-none">razy</span>
                            </div>
                        </div>

                        <div className="bg-surface border border-border rounded-xl p-3 sm:p-4 shadow-sm flex flex-col justify-center">
                            <span className="text-text-secondary text-[10px] lg:text-xs uppercase tracking-wider font-semibold leading-none mb-1">Max Seria</span>
                            <div className="flex items-baseline gap-1.5 mt-0.5">
                                <span className="text-lg sm:text-2xl lg:text-3xl font-bold text-text-primary leading-none">{yearStats.longestStreak}</span>
                                <span className="text-[10px] text-text-secondary leading-none">{yearStats.longestStreak === 1 ? 'dzień' : 'dni'}</span>
                            </div>
                        </div>

                        <div className="bg-surface border border-border rounded-xl p-3 sm:p-4 shadow-sm flex flex-col justify-center">
                            <span className="text-text-secondary text-[10px] lg:text-xs uppercase tracking-wider font-semibold leading-none mb-1">Najlepszy Msc</span>
                            <div className="flex items-baseline gap-1.5 mt-0.5">
                                <span className="text-lg sm:text-2xl lg:text-3xl font-bold text-text-primary leading-none">{yearStats.bestMonth.completions}</span>
                                <span className="text-[10px] text-text-secondary leading-none">{getMonthNamePL(yearStats.bestMonth.month).substring(0, 3)}</span>
                            </div>
                        </div>
                    </div>

                    {/* Heatmapa */}
                    <div className="bg-surface rounded-xl lg:rounded-2xl p-4 lg:p-6 border border-border shadow-sm">
                        <h2 className="text-lg lg:text-2xl font-bold mb-4 text-text-primary leading-tight">Mapa aktywności</h2>
                        <div className="overflow-x-auto pb-4">
                            <YearHeatmap year={currentYear} allLogs={logsWithHabitNames} habits={habits || []} />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-8">
                        {/* Statystyki poszczególnych nawyków */}
                        <div className="bg-surface rounded-xl lg:rounded-2xl p-4 lg:p-6 border border-border shadow-sm">
                            <h2 className="text-lg lg:text-2xl font-bold mb-4 text-text-primary leading-tight">Nawyki w {currentYear}</h2>
                            <div className="space-y-2 lg:space-y-3">
                                {habitStats.length > 0 ? (
                                    habitStats.map((habit) => (
                                        <Link
                                            key={habit.id}
                                            href={`/habits/${habit.id}`}
                                            className="flex items-center justify-between p-4 bg-main-bg rounded-xl border border-transparent hover:border-border transition-colors group"
                                        >
                                            <div className="flex-1">
                                                <h3 className="font-semibold group-hover:text-primary-green transition-colors text-text-primary">
                                                    {habit.name}
                                                </h3>
                                                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5 text-xs text-text-secondary font-medium">
                                                    <span>{habit.totalDays} {habit.totalDays === 1 ? 'dzień' : 'dni'}</span>
                                                    <span className="hidden sm:inline">•</span>
                                                    <span>Najdłuższa seria: {habit.longestStreak}</span>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2 pl-4 border-l border-border/50 ml-4">
                                                <div className="text-right">
                                                    <div className="text-xl font-bold text-primary-green">
                                                        {Math.round((habit.totalDays / yearStats.daysInYear) * 100)}%
                                                    </div>
                                                </div>
                                            </div>
                                        </Link>
                                    ))
                                ) : (
                                    <div className="text-center py-12 text-text-secondary">
                                        Brak nawyków do wyświetlenia
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Statystyki miesięczne */}
                        <div className="bg-surface rounded-xl lg:rounded-2xl p-4 lg:p-6 border border-border shadow-sm h-fit">
                            <h2 className="text-lg lg:text-2xl font-bold mb-4 text-text-primary leading-tight">Rozkład miesięczny</h2>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                {yearStats.monthlyStats.map((monthStat) => (
                                    <div
                                        key={monthStat.month}
                                        className="bg-main-bg rounded-xl p-4 border border-border flex flex-col items-center text-center"
                                    >
                                        <div className="text-xs text-text-secondary font-medium uppercase tracking-wider mb-2">
                                            {getMonthNamePL(monthStat.month)}
                                        </div>
                                        <div className="text-2xl font-bold text-primary-green mb-1">
                                            {monthStat.completions}
                                        </div>
                                        <div className="text-[10px] text-text-secondary font-medium bg-surface-alt px-2 py-0.5 rounded-full">
                                            {monthStat.activeDays} {monthStat.activeDays === 1 ? 'dzień' : 'dni'}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                </div>
            </main>

            {/* MOBILE BOTTOM NAV */}
            <MobileBottomNav />
        </div>
    );
}
