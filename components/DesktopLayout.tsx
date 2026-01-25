"use client";

import { useState } from "react";
import TodayView from "./TodayView";
import StatsPanel from "./StatsPanel";

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

type DesktopLayoutProps = {
    habits: Habit[];
    todayDate: string;
};

export default function DesktopLayout({ habits, todayDate }: DesktopLayoutProps) {
    const completedToday = habits.filter((h) => h.isCompletedToday).length;
    const totalStreak = Math.max(...habits.map((h) => h.streak), 0);
    const totalCompletions = habits.reduce((sum, h) => sum + h.completedDates.length, 0);

    return (
        <div className="h-screen bg-[#121212] text-[#f9fafb] flex overflow-hidden">
            {/* MAIN CONTENT - 70% */}
            <main className="flex-1 lg:w-[70%] flex flex-col overflow-hidden h-full">
                <TodayView habits={habits} todayDate={todayDate} />
            </main>

            {/* ASIDE - 30% */}
            <aside className="hidden lg:flex lg:w-[30%] border-l border-[#2d2d2d]/30 bg-[#121212] flex-col h-full">
                <StatsPanel
                    totalStreak={totalStreak}
                    completedToday={completedToday}
                    totalHabits={habits.length}
                    habits={habits}
                    totalCompletions={totalCompletions}
                />
            </aside>
        </div>
    );
}
