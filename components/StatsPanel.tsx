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
    isRequiredToday?: boolean;
    frequency_type?: "daily" | "weekly_target" | "specific_days";
    frequency_value?: any;
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
        <div className="w-full">
            <div className="grid grid-cols-2 gap-2">
                {/* DZISIAJ */}
                <div className="bg-surface border border-border rounded-xl p-2 sm:p-3 lg:p-4 flex flex-col justify-center shadow-sm">
                    <p className="text-[10px] text-text-secondary uppercase tracking-wider font-semibold truncate leading-none mb-1">Dzisiaj</p>
                    <p className="text-xl lg:text-2xl font-bold text-text-primary leading-none">
                        {completedToday} <span className="text-[11px] text-text-secondary font-medium uppercase tracking-wider">/ {totalHabits}</span>
                    </p>
                </div>

                {/* CURRENT STREAK */}
                <div className="bg-surface border border-border rounded-xl p-2 sm:p-3 lg:p-4 flex flex-col justify-center shadow-sm">
                    <p className="text-[10px] text-text-secondary uppercase tracking-wider font-semibold truncate leading-none mb-1">Streak</p>
                    <div className="flex items-baseline gap-1 leading-none">
                        <p className="text-xl lg:text-2xl font-bold text-text-primary leading-none">{actualStreak}</p>
                        <p className="text-[11px] text-text-secondary font-medium uppercase tracking-wider">dni</p>
                    </div>
                </div>

                {/* TEN TYDZIEŃ */}
                <div className="bg-surface border border-border rounded-xl p-2 sm:p-3 lg:p-4 flex flex-col justify-center shadow-sm">
                    <div className="flex items-end justify-between mb-1.5">
                        <p className="text-[10px] text-text-secondary uppercase tracking-wider font-semibold truncate leading-none">Tydzień</p>
                        <p className="text-sm lg:text-lg font-bold text-text-primary leading-none">{weeklyStats.weeklyPercent}%</p>
                    </div>
                    <div className="h-1.5 bg-main-bg border border-border/50 rounded-full overflow-hidden w-full">
                        <div
                            className="h-full bg-primary-green transition-all duration-500 rounded-full"
                            style={{ width: `${weeklyStats.weeklyPercent}%` }}
                        />
                    </div>
                </div>

                {/* TEN MIESIĄC */}
                <div className="bg-surface border border-border rounded-xl p-2 sm:p-3 lg:p-4 flex flex-col justify-center shadow-sm">
                    <div className="flex items-end justify-between mb-1.5">
                        <p className="text-[10px] text-text-secondary uppercase tracking-wider font-semibold truncate leading-none">Miesiąc</p>
                        <p className="text-sm lg:text-lg font-bold text-text-primary leading-none">{monthlyStats.monthlyPercent}%</p>
                    </div>
                    <div className="h-1.5 bg-main-bg border border-border/50 rounded-full overflow-hidden w-full">
                        <div
                            className="h-full bg-primary-green transition-all duration-500 rounded-full"
                            style={{ width: `${monthlyStats.monthlyPercent}%` }}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}
