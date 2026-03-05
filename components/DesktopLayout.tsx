"use client";

import TodayView from "./TodayView";
import StatsPanel from "./StatsPanel";
import AppSidebar from "./AppSidebar";

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

type DesktopLayoutProps = {
    habits: Habit[];
    todayDate: string;
};

export default function DesktopLayout({ habits, todayDate }: DesktopLayoutProps) {
    const completedToday = habits.filter((h) => h.isCompletedToday).length;
    const totalStreak = Math.max(...habits.map((h) => h.streak), 0);
    const totalCompletions = habits.reduce((sum, h) => sum + h.completedDates.length, 0);

    return (
        <div className="h-screen bg-main-bg text-text-primary flex overflow-hidden">
            {/* SIDEBAR - 250px (w-64) */}
            <AppSidebar />

            /* MAIN CONTENT AREA */
            <main className="flex-1 flex flex-col overflow-y-auto w-full">
                <div className="p-6 lg:p-8 space-y-6 lg:space-y-8 flex-1 flex flex-col max-w-7xl mx-auto w-full">
                    {/* STATS TOP BAR */}
                    <section className="flex-shrink-0">
                        <StatsPanel
                            totalStreak={totalStreak}
                            completedToday={completedToday}
                            totalHabits={habits.length}
                            habits={habits}
                            totalCompletions={totalCompletions}
                        />
                    </section>

                    {/* HABITS LIST AREA */}
                    <section className="flex-1 min-h-[500px] bg-surface border border-border rounded-2xl shadow-sm overflow-hidden flex flex-col relative">
                        <TodayView habits={habits} todayDate={todayDate} />
                    </section>
                </div>
            </main>
        </div>
    );
}
