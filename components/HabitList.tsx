"use client";

import { useState, useMemo } from "react";
import HabitCard from "./HabitCard";
import HabitSearch from "./HabitSearch";
import HabitGroup from "./HabitGroup";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";

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

type HabitListProps = {
    habits: Habit[];
};

export default function HabitList({ habits }: HabitListProps) {
    const [searchQuery, setSearchQuery] = useState("");
    const [filterStatus, setFilterStatus] = useState<"all" | "completed" | "pending">("all");
    const [dayOffset, setDayOffset] = useState(0);

    // Calculate currently viewed date based on offset
    const activeDate = useMemo(() => {
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

    // Filtrowanie
    const filteredHabits = useMemo(() => {
        let result = habits;

        // Wyszukiwanie
        if (searchQuery) {
            result = result.filter((h) =>
                h.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                h.tags.some((t) => t.toLowerCase().includes(searchQuery.toLowerCase()))
            );
        }

        // Status filter with respect to the activeDate
        if (filterStatus === "completed") {
            result = result.filter((h) => h.completedDates.includes(activeDate));
        } else if (filterStatus === "pending") {
            result = result.filter((h) => !h.completedDates.includes(activeDate));
        }

        return result;
    }, [habits, searchQuery, filterStatus, activeDate]);

    // Grupowanie według tagów
    const groupedHabits = useMemo(() => {
        const groups: Record<string, Habit[]> = {
            "Bez kategorii": [],
        };

        filteredHabits.forEach((habit) => {
            if (habit.tags.length === 0) {
                groups["Bez kategorii"].push(habit);
            } else {
                // Używamy pierwszego tagu jako kategorii
                const category = habit.tags[0];
                if (!groups[category]) {
                    groups[category] = [];
                }
                groups[category].push(habit);
            }
        });

        // Usuń puste grupy
        Object.keys(groups).forEach((key) => {
            if (groups[key].length === 0) {
                delete groups[key];
            }
        });

        return groups;
    }, [filteredHabits]);

    const completedCount = habits.filter((h) => h.completedDates.includes(activeDate)).length;
    const shouldGroup = Object.keys(groupedHabits).length > 1;

    return (
        <div className="space-y-4">
            {/* Day Navigation Header (Visible only on mobile because DesktopLayout uses TodayView) */}
            <header className="mb-2 lg:hidden">
                <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-1.5 text-text-secondary text-[11px] sm:text-xs uppercase tracking-wider font-semibold">
                        <CalendarDays size={14} className="sm:w-4 sm:h-4" />
                        <span>{dayOffset === 0 ? "Dzisiaj" : `${dayOffset} dni temu`}</span>
                    </div>

                    <div className="flex items-center gap-1">
                        <button
                            onClick={() => setDayOffset(d => d + 1)}
                            className="p-1.5 hover:bg-surface-alt rounded-lg transition-colors text-text-secondary hover:text-text-primary"
                        >
                            <ChevronLeft size={20} />
                        </button>
                        <button
                            onClick={() => setDayOffset(d => Math.max(0, d - 1))}
                            disabled={dayOffset === 0}
                            className="p-1.5 hover:bg-surface-alt rounded-lg transition-colors text-text-secondary hover:text-text-primary disabled:opacity-30"
                        >
                            <ChevronRight size={20} />
                        </button>
                    </div>
                </div>
                <h1 className="text-2xl sm:text-3xl font-bold capitalize text-text-primary leading-tight">
                    {displayDate}
                </h1>
            </header>

            {/* Search and filters */}
            <HabitSearch
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                filterStatus={filterStatus}
                onFilterChange={setFilterStatus}
                totalCount={habits.length}
                completedCount={completedCount}
            />

            {/* Habits */}
            {filteredHabits.length > 0 ? (
                shouldGroup ? (
                    // Grupowane według kategorii
                    <div className="space-y-4">
                        {Object.entries(groupedHabits)
                            .sort(([a], [b]) => {
                                if (a === "Bez kategorii") return 1;
                                if (b === "Bez kategorii") return -1;
                                return a.localeCompare(b);
                            })
                            .map(([category, categoryHabits]) => {
                                const completedInCategory = categoryHabits.filter(
                                    (h) => h.completedDates.includes(activeDate)
                                ).length;

                                return (
                                    <HabitGroup
                                        key={category}
                                        title={category}
                                        count={categoryHabits.length}
                                        completedCount={completedInCategory}
                                        defaultExpanded={category !== "Bez kategorii"}
                                    >
                                        {categoryHabits.map((habit) => (
                                            <HabitCard
                                                key={habit.id}
                                                id={habit.id}
                                                name={habit.name}
                                                streak={habit.streak}
                                                completedDates={habit.completedDates}
                                                skippedDates={habit.skippedDates}
                                                tags={habit.tags}
                                                archived={habit.archived}
                                                defaultCompleted={habit.completedDates.includes(activeDate)}
                                                currentDate={activeDate}
                                            />
                                        ))}
                                    </HabitGroup>
                                );
                            })}
                    </div>
                ) : (
                    // Prosta lista bez grupowania
                    <div className="space-y-2">
                        {filteredHabits.map((habit) => (
                            <HabitCard
                                key={habit.id}
                                id={habit.id}
                                name={habit.name}
                                streak={habit.streak}
                                completedDates={habit.completedDates}
                                skippedDates={habit.skippedDates}
                                tags={habit.tags}
                                archived={habit.archived}
                                defaultCompleted={habit.completedDates.includes(activeDate)}
                                currentDate={activeDate}
                            />
                        ))}
                    </div>
                )
            ) : (
                <div className="p-8 text-center border border-dashed border-gray-800 rounded-2xl text-gray-500 mt-4">
                    <p className="text-lg mb-2">Brak nawyków</p>
                    {searchQuery ? (
                        <p className="text-sm">
                            Nie znaleziono nawyków pasujących do "{searchQuery}"
                        </p>
                    ) : (
                        <p className="text-sm">Zmień filtry lub dodaj nowe nawyki</p>
                    )}
                </div>
            )}
        </div>
    );
}
