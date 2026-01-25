"use client";

import { useState, useMemo } from "react";
import { ChevronDown } from "lucide-react";
import Link from "next/link";

type Habit = {
    id: string;
    name: string;
    streak: number;
    completedDates: string[];
    skippedDates: string[];
    tags: string[];
    archived: boolean;
    isCompletedToday: boolean;
};

type StatsPanelProps = {
    totalStreak: number;
    completedToday: number;
    totalHabits: number;
    habits: Habit[];
    totalCompletions: number;
};

export default function StatsPanel({
    totalStreak,
    completedToday,
    totalHabits,
    habits,
    totalCompletions,
}: StatsPanelProps) {
    // Oblicz rzeczywisty streak wypełniania nawyków (dni z rzędu z przynajmniej 1 nawykiem)
    const actualStreak = useMemo(() => {
        if (habits.length === 0) return 0;

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        let streak = 0;

        for (let i = 0; i < 365; i++) {
            const checkDate = new Date(today);
            checkDate.setDate(today.getDate() - i);
            const dateStr = checkDate.toISOString().split('T')[0];

            // Sprawdź czy w tym dniu wykonano przynajmniej 1 nawyk
            const hasAnyCompletion = habits.some(h => h.completedDates.includes(dateStr));

            if (hasAnyCompletion) {
                streak++;
            } else {
                break;
            }
        }

        return streak;
    }, [habits]);

    // Obliczenia
    const weeklyStats = useMemo(() => {
        const today = new Date();
        const weekAgo = new Date(today);
        weekAgo.setDate(weekAgo.getDate() - 7);

        const weekAgoDates = new Set<string>();
        for (let d = new Date(weekAgo); d <= today; d.setDate(d.getDate() + 1)) {
            weekAgoDates.add(d.toISOString().split("T")[0]);
        }

        let weeklyCompletions = 0;
        habits.forEach((habit) => {
            habit.completedDates.forEach((date) => {
                if (weekAgoDates.has(date)) weeklyCompletions++;
            });
        });

        const maxWeeklyPossible = 7 * totalHabits;
        const weeklyPercent = maxWeeklyPossible > 0 ? Math.round((weeklyCompletions / maxWeeklyPossible) * 100) : 0;

        return { weeklyCompletions, weeklyPercent };
    }, [habits, totalHabits]);

    const monthlyStats = useMemo(() => {
        const today = new Date();
        const monthAgo = new Date(today);
        monthAgo.setDate(1);

        const monthDates = new Set<string>();
        for (let d = new Date(monthAgo); d <= today; d.setDate(d.getDate() + 1)) {
            monthDates.add(d.toISOString().split("T")[0]);
        }

        let monthlyCompletions = 0;
        habits.forEach((habit) => {
            habit.completedDates.forEach((date) => {
                if (monthDates.has(date)) monthlyCompletions++;
            });
        });

        const daysInMonth = Math.floor((today.getTime() - monthAgo.getTime()) / (1000 * 60 * 60 * 24)) + 1;
        const maxMonthlyPossible = daysInMonth * totalHabits;
        const monthlyPercent = maxMonthlyPossible > 0 ? Math.round((monthlyCompletions / maxMonthlyPossible) * 100) : 0;

        return { monthlyPercent };
    }, [habits, totalHabits]);

    return (
        <div className="h-full flex flex-col px-4 lg:px-6 py-4 lg:py-8">
            {/* DZISIAJ */}
            <div className="mb-4 lg:mb-8">
                <p className="text-xs text-[#9ca3af] uppercase tracking-wider mb-2">Dzisiaj</p>
                <p className="text-3xl lg:text-4xl font-semibold text-[#f9fafb]">
                    {completedToday} <span className="text-lg lg:text-2xl text-[#9ca3af]">/ {totalHabits}</span>
                </p>
            </div>

            {/* CURRENT STREAK */}
            <div className="mb-4 lg:mb-8">
                <p className="text-xs text-[#9ca3af] uppercase tracking-wider mb-2">Current Streak</p>
                <p className="text-4xl lg:text-5xl font-semibold text-[#f9fafb]">{actualStreak}</p>
                <p className="text-sm text-[#9ca3af] mt-1">dni z rzędu</p>
            </div>

            {/* WIĘCEJ STATYSTYK - ZAWSZE WIDOCZNE */}
            <div className="space-y-4 lg:space-y-6">
                <div>
                    <p className="text-xs text-[#9ca3af] uppercase tracking-wider mb-2">Ten tydzień</p>
                    <p className="text-2xl lg:text-3xl font-semibold text-[#f9fafb]">{weeklyStats.weeklyPercent}%</p>
                    <div className="mt-2 h-1 bg-[#2d2d2d]/50 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-[#10b981] transition-all"
                            style={{ width: `${weeklyStats.weeklyPercent}%` }}
                        />
                    </div>
                </div>

                <div>
                    <p className="text-xs text-[#9ca3af] uppercase tracking-wider mb-2">Ten miesiąc</p>
                    <p className="text-3xl font-semibold text-[#f9fafb]">{monthlyStats.monthlyPercent}%</p>
                    <div className="mt-2 h-1 bg-[#2d2d2d]/50 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-[#10b981] transition-all"
                            style={{ width: `${monthlyStats.monthlyPercent}%` }}
                        />
                    </div>
                </div>

                <div>
                    <p className="text-xs text-[#9ca3af] uppercase tracking-wider mb-2">Wszystkie czasy</p>
                    <p className="text-2xl lg:text-3xl font-semibold text-[#f9fafb]">{totalCompletions}</p>
                </div>
            </div>

            {/* FOOTER LINK */}
            <div className="mt-auto pt-4 lg:pt-8 border-t border-gray-800/30">
                <Link
                    href="/yearly-summary"
                    className="block text-center px-4 py-2 bg-gray-800/50 hover:bg-gray-800 rounded-lg text-xs text-gray-400 hover:text-gray-300 transition-colors"
                >
                    Roczne podsumowanie
                </Link>
            </div>
        </div>
    );
}
