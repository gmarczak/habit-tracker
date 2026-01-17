"use client";

import { useState } from "react";
import { Calendar, Home, BarChart3 } from "lucide-react";
import TodayView from "./TodayView";
import StatsPanel from "./StatsPanel";
import HabitCalendar from "./HabitCalendar";

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

type MobileLayoutProps = {
    habits: Habit[];
    todayDate: string;
};

type Tab = "home" | "calendar" | "stats";

export default function MobileLayout({ habits, todayDate }: MobileLayoutProps) {
    const [activeTab, setActiveTab] = useState<Tab>("home");
    
    const completedToday = habits.filter((h) => h.isCompletedToday).length;
    const totalCompletions = habits.reduce((sum, h) => sum + h.completedDates.length, 0);
    const totalStreak = Math.max(...habits.map((h) => h.streak), 0);

    const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
        { id: "home", label: "Dzisiaj", icon: <Home size={20} /> },
        { id: "calendar", label: "Kalendarz", icon: <Calendar size={20} /> },
        { id: "stats", label: "Statystyki", icon: <BarChart3 size={20} /> },
    ];

    return (
        <div 
            className="h-screen bg-[#0d0d0d] text-gray-100 flex flex-col overflow-hidden"
        >
            {/* QUICK HEADER */}
            <header className="flex-shrink-0 bg-[#0d0d0d] border-b border-gray-800/30 px-4 py-3">
                <div className="flex items-center justify-between mb-3">
                    <div>
                        <p className="text-xs text-gray-500 uppercase tracking-wider">Dzisiaj</p>
                        <p className="text-2xl font-bold text-gray-100">
                            {completedToday}<span className="text-sm text-gray-500 ml-1">/{habits.length}</span>
                        </p>
                    </div>
                    <div className="text-right">
                        <p className="text-xs text-gray-500 uppercase tracking-wider">Streak</p>
                        <p className="text-2xl font-bold text-orange-400">
                            {Math.max(...habits.map(h => {
                                let streak = 0;
                                const today = new Date();
                                for (let i = 0; i < 365; i++) {
                                    const checkDate = new Date(today);
                                    checkDate.setDate(today.getDate() - i);
                                    const dateStr = checkDate.toISOString().split('T')[0];
                                    if (h.completedDates.includes(dateStr)) {
                                        streak++;
                                    } else {
                                        break;
                                    }
                                }
                                return streak;
                            }), 0)} 🔥
                        </p>
                    </div>
                </div>
            </header>

            {/* TAB NAVIGATION */}
            <div className="flex-shrink-0 bg-gray-900/50 border-b border-gray-800/30 px-0">
                <div className="flex">
                    {tabs.map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex-1 flex items-center justify-center gap-2 py-3 px-2 text-xs font-medium transition-colors border-b-2 ${
                                activeTab === tab.id
                                    ? "text-emerald-400 border-emerald-400"
                                    : "text-gray-500 border-transparent hover:text-gray-400"
                            }`}
                        >
                            {tab.icon}
                            <span className="hidden xs:inline">{tab.label}</span>
                        </button>
                    ))}
                </div>
            </div>

            {/* CONTENT */}
            <div className="flex-1 overflow-hidden">
                {activeTab === "home" && (
                    <TodayView habits={habits} todayDate={todayDate} />
                )}
                
                {activeTab === "calendar" && (
                    <div className="h-full overflow-y-auto px-4 py-6">
                        <HabitCalendar 
                            completedDates={habits.flatMap(h => h.completedDates)}
                        />
                    </div>
                )}
                
                {activeTab === "stats" && (
                    <div className="h-full overflow-y-auto">
                        <StatsPanel
                            totalStreak={totalStreak}
                            completedToday={completedToday}
                            totalHabits={habits.length}
                            habits={habits}
                            totalCompletions={totalCompletions}
                        />
                    </div>
                )}
            </div>
        </div>
    );
}
