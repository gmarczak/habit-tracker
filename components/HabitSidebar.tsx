"use client";

import { useState } from "react";
import HabitSearch from "./HabitSearch";
import HabitCard from "./HabitCard";
import HabitGroup from "./HabitGroup";
import { Plus, Home } from "lucide-react";
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

type HabitSidebarProps = {
    habits: Habit[];
    onSelectHabit: (id: string | null) => void;
    selectedHabit: string | null;
};

export default function HabitSidebar({ habits, onSelectHabit, selectedHabit }: HabitSidebarProps) {
    const [searchQuery, setSearchQuery] = useState("");
    const [filterStatus, setFilterStatus] = useState<"all" | "completed" | "pending">("all");

    const filteredHabits = habits.filter((h) => {
        let matches = true;

        if (searchQuery) {
            matches = h.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                h.tags.some((t) => t.toLowerCase().includes(searchQuery.toLowerCase()));
        }

        if (filterStatus === "completed") {
            matches = matches && h.isCompletedToday;
        } else if (filterStatus === "pending") {
            matches = matches && !h.isCompletedToday;
        }

        return matches;
    });

    const groupedHabits = filteredHabits.reduce((groups: Record<string, Habit[]>, habit) => {
        const category = habit.tags.length > 0 ? habit.tags[0] : "Bez kategorii";
        if (!groups[category]) groups[category] = [];
        groups[category].push(habit);
        return groups;
    }, {});

    return (
        <div className="h-full flex flex-col p-3 gap-3 overflow-hidden">
            {/* HEADER */}
            <div className="flex items-center gap-2 pb-3 border-b border-[#2d2d2d]/50 flex-shrink-0">
                <div className="w-7 h-7 bg-gradient-to-br from-[#10b981] to-[#8b5cf6] rounded-lg flex items-center justify-center">
                    <Home size={14} className="text-white" />
                </div>
                <div>
                    <h2 className="text-xs font-bold">Nawyki</h2>
                    <p className="text-[10px] text-[#9ca3af]">{filteredHabits.length} aktywnych</p>
                </div>
            </div>

            {/* SEARCH */}
            <div className="flex-shrink-0">
                <HabitSearch
                    searchQuery={searchQuery}
                    onSearchChange={setSearchQuery}
                    filterStatus={filterStatus}
                    onFilterChange={setFilterStatus}
                    totalCount={filteredHabits.length}
                    completedCount={habits.filter((h) => h.isCompletedToday).length}
                />
            </div>

            {/* HABIT LIST */}
            <div className="flex-1 overflow-y-auto space-y-2">
                {Object.keys(groupedHabits).length > 0 ? (
                    Object.entries(groupedHabits).map(([category, groupHabits]) => (
                        <div key={category}>
                            {Object.keys(groupedHabits).length > 1 && (
                                <h3 className="text-[10px] font-semibold text-[#9ca3af] uppercase tracking-wider px-2 py-1 mb-1">
                                    {category}
                                </h3>
                            )}
                            <div className="space-y-1.5">
                                {groupHabits.map((habit) => (
                                    <button
                                        key={habit.id}
                                        onClick={() => onSelectHabit(habit.id)}
                                        className={`w-full text-left p-2 rounded-lg transition-all border text-xs ${selectedHabit === habit.id
                                            ? "bg-[#10b981]/20 border-[#10b981]/50 text-[#f9fafb]"
                                            : "bg-[#2d2d2d]/30 border-[#2d2d2d]/50 hover:bg-[#2d2d2d]/50 text-[#9ca3af]"
                                            }`}
                                    >
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="flex-1 min-w-0">
                                                <p className="font-medium truncate text-xs">{habit.name}</p>
                                                <div className="flex items-center gap-1.5 mt-0.5">
                                                    <span
                                                        className={`text-[10px] px-1.5 py-0.5 rounded-full ${habit.isCompletedToday
                                                            ? "bg-[#10b981]/20 text-[#10b981]"
                                                            : "bg-[#2d2d2d]/50 text-[#9ca3af]"
                                                            }`}
                                                    >
                                                        🔥 {habit.streak}
                                                    </span>
                                                </div>
                                            </div>
                                            <div
                                                className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 ${habit.isCompletedToday
                                                    ? "bg-[#10b981] border-[#10b981]"
                                                    : "border-[#3f3f46]"
                                                    }`}
                                            >
                                                {habit.isCompletedToday && <span className="text-white text-[10px]">✓</span>}
                                            </div>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>
                    ))
                ) : (
                    <div className="text-center py-6 text-[#9ca3af] text-[10px]">
                        <p>Brak nawyków</p>
                    </div>
                )}
            </div>

            {/* FOOTER */}
            <div className="flex-shrink-0 pt-3 border-t border-[#2d2d2d]/50">
                <Link
                    href="/yearly-summary"
                    className="w-full block px-2 py-1.5 bg-[#2d2d2d]/50 hover:bg-[#2d2d2d] rounded-lg text-[10px] font-medium text-[#9ca3af] hover:text-[#f9fafb] transition-colors text-center"
                >
                    📊 Roczne podsumowanie
                </Link>
            </div>
        </div>
    );
}
