"use client";

import { useMemo, useState } from "react";
import HabitCardFlat from "./HabitCardFlat";
import AddHabitButton from "./AddHabitButton";
import { ChevronLeft, ChevronRight } from "lucide-react";

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

type TodayViewProps = {
    habits: Habit[];
    todayDate: string;
};

export default function TodayView({ habits, todayDate }: TodayViewProps) {
    const [dayOffset, setDayOffset] = useState(0);

    const totalHabits = habits.length;

    // Oblicz datę na podstawie offsetu
    const currentDate = useMemo(() => {
        const d = new Date();
        d.setDate(d.getDate() - dayOffset);
        return d.toISOString().split('T')[0];
    }, [dayOffset]);

    const displayDate = useMemo(() => {
        const d = new Date();
        d.setDate(d.getDate() - dayOffset);
        return new Intl.DateTimeFormat("pl-PL", {
            weekday: "long",
            day: "numeric",
            month: "long",
        }).format(d);
    }, [dayOffset]);

    // Oblicz ile nawyków wykonano dla wybranego dnia
    const completedToday = useMemo(() => {
        return habits.filter((h) => h.completedDates.includes(currentDate)).length;
    }, [habits, currentDate]);

    const progressPercent = totalHabits > 0 ? (completedToday / totalHabits) * 100 : 0;

    return (
        <div className="h-full flex flex-col relative">
            {/* HEADER DNIA - STICKY */}
            <header className="flex-shrink-0 sticky top-0 z-20 bg-[#121212] border-b border-[#2d2d2d]/30 px-4 lg:px-8 py-4 lg:py-6">
                {/* NAVIGATION */}
                <div className="flex items-center justify-between mb-4">
                    <button
                        onClick={() => setDayOffset(d => d + 1)}
                        className="p-2 hover:bg-[#2d2d2d]/50 rounded-lg transition-colors text-[#9ca3af] hover:text-[#f9fafb]"
                        title="Poprzedni dzień"
                    >
                        <ChevronLeft size={20} />
                    </button>

                    <div className="text-center flex-1">
                        <p className="text-sm text-[#9ca3af]">
                            {dayOffset === 0 ? "Dzisiaj" : `${dayOffset} dni temu`}
                        </p>
                    </div>

                    <button
                        onClick={() => setDayOffset(d => Math.max(0, d - 1))}
                        disabled={dayOffset === 0}
                        className="p-2 hover:bg-[#2d2d2d]/50 rounded-lg transition-colors text-[#9ca3af] hover:text-[#f9fafb] disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Następny dzień"
                    >
                        <ChevronRight size={20} />
                    </button>
                </div>

                <h1 className="text-3xl font-semibold text-[#f9fafb] mb-3 tracking-tight">
                    {displayDate}
                </h1>
                <div className="flex items-center gap-4 flex-wrap">
                    <p className="text-sm lg:text-lg font-medium text-[#f9fafb]">
                        {completedToday} / {totalHabits} wykonane
                    </p>
                </div>
                {/* PROGRESS BAR */}
                <div className="mt-3 h-2 bg-[#2d2d2d]/50 rounded-full overflow-hidden">
                    <div
                        className="h-full bg-[#10b981] transition-all duration-500"
                        style={{ width: `${progressPercent}%` }}
                    />
                </div>
            </header>

            {/* LISTA NAWYKÓW - FLAT */}
            <div className="flex-1 overflow-y-auto px-4 lg:px-8 pb-4 lg:pb-8">
                <div className="divide-y divide-[#2d2d2d]/30">
                    {habits.length > 0 ? (
                        habits.map((habit) => {
                            const isCompletedOnDate = habit.completedDates.includes(currentDate);
                            return (
                                <HabitCardFlat
                                    key={habit.id}
                                    id={habit.id}
                                    name={habit.name}
                                    streak={habit.streak}
                                    completedDates={habit.completedDates}
                                    defaultCompleted={isCompletedOnDate}
                                    currentDate={currentDate}
                                />
                            );
                        })
                    ) : (
                        <div className="p-12 text-center text-[#9ca3af] text-sm">
                            Brak nawyków
                        </div>
                    )}
                </div>
            </div>

            {/* ADD BUTTON - DESKTOP */}
            <div className="hidden lg:block fixed top-8 right-8 z-40">
                <AddHabitButton />
            </div>

            {/* ADD BUTTON - MOBILE */}
            <div className="lg:hidden fixed bottom-6 right-6 z-40">
                <AddHabitButton />
            </div>
        </div>
    );
}
