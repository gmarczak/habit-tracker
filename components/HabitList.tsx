"use client";

import { useState, useMemo } from "react";
import HabitCard from "./HabitCard";
import HabitSearch from "./HabitSearch";
import HabitGroup from "./HabitGroup";

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

type HabitListProps = {
    habits: Habit[];
};

export default function HabitList({ habits }: HabitListProps) {
    const [searchQuery, setSearchQuery] = useState("");
    const [filterStatus, setFilterStatus] = useState<"all" | "completed" | "pending">("all");

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

        // Status filter
        if (filterStatus === "completed") {
            result = result.filter((h) => h.isCompletedToday);
        } else if (filterStatus === "pending") {
            result = result.filter((h) => !h.isCompletedToday);
        }

        return result;
    }, [habits, searchQuery, filterStatus]);

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

    const completedCount = habits.filter((h) => h.isCompletedToday).length;
    const shouldGroup = Object.keys(groupedHabits).length > 1;

    return (
        <div className="space-y-4">
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
                                    (h) => h.isCompletedToday
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
                                                defaultCompleted={habit.isCompletedToday}
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
                                defaultCompleted={habit.isCompletedToday}
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
