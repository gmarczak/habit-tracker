"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Check, Loader2 } from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { useRouter } from "next/navigation";

type DayData = {
    date: string;
    count: number;
    habits: Array<{ name: string; status: "done" | "skip" }>;
};

type YearHeatmapProps = {
    year: number;
    allLogs: Array<{
        habit_id: string;
        habit_name: string;
        completed_date: string;
        status?: "done" | "skip" | null;
    }>;
    habits: Array<{ id: string; name: string }>;
};

const MONTHS_PL = [
    "Styczeń", "Luty", "Marzec", "Kwiecień", "Maj", "Czerwiec",
    "Lipiec", "Sierpień", "Wrzesień", "Październik", "Listopad", "Grudzień"
];

const DAYS_SHORT = ["Nd", "Pn", "Wt", "Śr", "Cz", "Pt", "Sb"];

export default function YearHeatmap({ year, allLogs, habits }: YearHeatmapProps) {
    const supabase = createClient();
    const router = useRouter();
    const [selectedDay, setSelectedDay] = useState<DayData | null>(null);
    const [currentYear, setCurrentYear] = useState(year);
    const [loadingHabitId, setLoadingHabitId] = useState<string | null>(null);

    // Generuj dane dla całego roku
    const yearData = useMemo(() => {
        const dataByDate = new Map<string, DayData>();

        // Przygotuj wszystkie dni roku
        for (let month = 0; month < 12; month++) {
            const daysInMonth = new Date(currentYear, month + 1, 0).getDate();
            for (let day = 1; day <= daysInMonth; day++) {
                const date = new Date(currentYear, month, day);
                const dateStr = date.toISOString().split('T')[0];
                dataByDate.set(dateStr, {
                    date: dateStr,
                    count: 0,
                    habits: []
                });
            }
        }

        // Dodaj dane z logów
        allLogs
            .filter(log => {
                const logYear = new Date(log.completed_date).getFullYear();
                return logYear === currentYear && log.status !== "skip";
            })
            .forEach(log => {
                const existing = dataByDate.get(log.completed_date);
                if (existing) {
                    existing.count++;
                    existing.habits.push({
                        name: log.habit_name,
                        status: (log.status ?? "done") as "done" | "skip"
                    });
                }
            });

        return dataByDate;
    }, [allLogs, currentYear]);

    // Organizuj dane według miesięcy i tygodni
    const monthsData = useMemo(() => {
        const months = [];
        for (let month = 0; month < 12; month++) {
            const firstDay = new Date(currentYear, month, 1);
            const lastDay = new Date(currentYear, month + 1, 0);
            const daysInMonth = lastDay.getDate();

            const weeks: DayData[][] = [];
            let currentWeek: DayData[] = [];

            // Dodaj puste dni na początku (żeby zacząć od właściwego dnia tygodnia)
            const startDayOfWeek = firstDay.getDay();
            for (let i = 0; i < startDayOfWeek; i++) {
                currentWeek.push({ date: "", count: 0, habits: [] });
            }

            // Dodaj wszystkie dni miesiąca
            for (let day = 1; day <= daysInMonth; day++) {
                const date = new Date(currentYear, month, day);
                const dateStr = date.toISOString().split('T')[0];
                const dayData = yearData.get(dateStr) || { date: dateStr, count: 0, habits: [] };

                currentWeek.push(dayData);

                if (currentWeek.length === 7) {
                    weeks.push(currentWeek);
                    currentWeek = [];
                }
            }

            // Dopełnij ostatni tydzień
            while (currentWeek.length > 0 && currentWeek.length < 7) {
                currentWeek.push({ date: "", count: 0, habits: [] });
            }
            if (currentWeek.length > 0) {
                weeks.push(currentWeek);
            }

            months.push({
                name: MONTHS_PL[month],
                weeks
            });
        }
        return months;
    }, [yearData, currentYear]);

    const getIntensityClass = (count: number) => {
        if (count === 0) return "bg-border hover:bg-border-alt";
        if (count === 1) return "bg-[#bbf7d0] hover:bg-[#86efac]";
        if (count === 2) return "bg-[#86efac] hover:bg-[#4ade80]";
        if (count === 3) return "bg-[#4ade80] hover:bg-[#22c55e]";
        return "bg-[#22c55e] hover:bg-[#16a34a]";
    };

    const handleDayClick = (dayData: DayData) => {
        if (dayData.date) {
            setSelectedDay(dayData);
        }
    };

    const closeModal = () => {
        setSelectedDay(null);
    };

    const changeYear = (delta: number) => {
        setCurrentYear(prev => prev + delta);
    };

    const toggleHabitInModal = async (habitId: string, isCompleted: boolean) => {
        if (!selectedDay || !selectedDay.date) return;
        setLoadingHabitId(habitId);

        try {
            if (isCompleted) {
                // Był zrobiony -> usuń
                await supabase
                    .from("habit_logs")
                    .delete()
                    .eq("habit_id", habitId)
                    .eq("completed_date", selectedDay.date);

                // Update lokalnego stanu selectedDay by działał bez odświeżania okna
                setSelectedDay((prev) => {
                    if (!prev) return prev;
                    const hName = habits.find(h => h.id === habitId)?.name;
                    return {
                        ...prev,
                        count: Math.max(0, prev.count - 1),
                        habits: prev.habits.filter(h => h.name !== hName)
                    };
                });
            } else {
                // Nie był zrobiony -> dodaj
                // Na wszelki wypadek najpierw delete z tego dnia
                await supabase
                    .from("habit_logs")
                    .delete()
                    .eq("habit_id", habitId)
                    .eq("completed_date", selectedDay.date);
                await supabase.from("habit_logs").insert({
                    habit_id: habitId,
                    completed_date: selectedDay.date,
                    status: "done"
                });

                setSelectedDay((prev) => {
                    if (!prev) return prev;
                    const hName = habits.find(h => h.id === habitId)?.name || "";
                    return {
                        ...prev,
                        count: prev.count + 1,
                        habits: [...prev.habits, { name: hName, status: "done" }]
                    };
                });
            }
            router.refresh(); // Aktualizacja logów w tle 
        } catch (error) {
            console.error(error);
        } finally {
            setLoadingHabitId(null);
        }
    };

    const totalDays = Array.from(yearData.values()).filter(d => d.count > 0).length;
    const totalCompletions = Array.from(yearData.values()).reduce((sum, d) => sum + d.count, 0);

    return (
        <div className="w-full">
            {/* Nagłówek z wyborem roku */}
            <div className="flex items-center justify-between mb-6">
                <button
                    onClick={() => changeYear(-1)}
                    className="p-2 rounded-lg bg-surface-alt text-text-secondary hover:bg-border hover:text-text-primary transition-colors"
                >
                    <ChevronLeft size={20} />
                </button>
                <h2 className="text-2xl font-bold text-text-primary">{currentYear}</h2>
                <button
                    onClick={() => changeYear(1)}
                    className="p-2 rounded-lg bg-surface-alt text-text-secondary hover:bg-border hover:text-text-primary transition-colors"
                >
                    <ChevronRight size={20} />
                </button>
            </div>

            {/* Statystyki */}
            <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-surface-alt border border-border rounded-lg p-4">
                    <div className="text-text-secondary text-sm mb-1">Aktywne dni</div>
                    <div className="text-2xl font-bold text-text-primary">{totalDays}</div>
                </div>
                <div className="bg-surface-alt border border-border rounded-lg p-4">
                    <div className="text-text-secondary text-sm mb-1">Wykonane nawyki</div>
                    <div className="text-2xl font-bold text-text-primary">{totalCompletions}</div>
                </div>
            </div>

            {/* Legenda */}
            <div className="flex items-center gap-2 text-xs text-text-secondary mb-4">
                <span>Mniej</span>
                <div className="flex gap-1">
                    <div className="w-3 h-3 rounded-sm bg-border"></div>
                    <div className="w-3 h-3 rounded-sm bg-[#bbf7d0]"></div>
                    <div className="w-3 h-3 rounded-sm bg-[#86efac]"></div>
                    <div className="w-3 h-3 rounded-sm bg-[#4ade80]"></div>
                    <div className="w-3 h-3 rounded-sm bg-[#22c55e]"></div>
                </div>
                <span>Więcej</span>
            </div>

            {/* Heatmapa - siatka miesięcy */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {monthsData.map((month, monthIdx) => (
                    <div key={monthIdx} className="bg-surface border border-border rounded-lg p-4">
                        <h3 className="text-sm font-semibold mb-3 text-text-primary">{month.name}</h3>

                        {/* Nazwy dni tygodnia */}
                        <div className="grid grid-cols-7 gap-1 mb-1">
                            {DAYS_SHORT.map((day, idx) => (
                                <div key={idx} className="text-[10px] text-text-secondary text-center">
                                    {day}
                                </div>
                            ))}
                        </div>

                        {/* Dni miesiąca */}
                        <div className="space-y-1">
                            {month.weeks.map((week, weekIdx) => (
                                <div key={weekIdx} className="grid grid-cols-7 gap-1">
                                    {week.map((day, dayIdx) => (
                                        <button
                                            key={dayIdx}
                                            onClick={() => handleDayClick(day)}
                                            disabled={!day.date}
                                            className={`
                                                aspect-square rounded-sm transition-all
                                                ${day.date ? getIntensityClass(day.count) : 'bg-transparent'}
                                                ${day.date ? 'cursor-pointer' : 'cursor-default'}
                                                relative group
                                            `}
                                            title={day.date ? `${day.date}: ${day.count} nawyków` : ''}
                                        >
                                            {day.date && day.count > 0 && (
                                                <span className="absolute inset-0 flex items-center justify-center text-[8px] font-bold text-zinc-950">
                                                    {new Date(day.date).getDate()}
                                                </span>
                                            )}
                                            {day.date && day.count === 0 && (
                                                <span className="absolute inset-0 flex items-center justify-center text-[8px] text-zinc-500">
                                                    {new Date(day.date).getDate()}
                                                </span>
                                            )}
                                        </button>
                                    ))}
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>

            {/* Modal z detalami dnia */}
            {selectedDay && (
                <div
                    className="fixed inset-0 bg-text-primary/40 flex items-center justify-center z-50 p-4 backdrop-blur-sm"
                    onClick={closeModal}
                >
                    <div
                        className="bg-surface rounded-2xl p-6 max-w-md w-full border border-border shadow-xl"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex justify-between items-start mb-4">
                            <div>
                                <h3 className="text-xl font-bold mb-1 text-text-primary">
                                    {new Date(selectedDay.date + 'T00:00:00').toLocaleDateString('pl-PL', {
                                        weekday: 'long',
                                        day: 'numeric',
                                        month: 'long',
                                        year: 'numeric'
                                    })}
                                </h3>
                                <p className="text-text-secondary text-sm">
                                    {selectedDay.count} {selectedDay.count === 1 ? 'nawyk' : 'nawyków'} wykonanych
                                </p>
                            </div>
                            <button
                                onClick={closeModal}
                                className="p-2 hover:bg-surface-alt rounded-lg transition-colors text-text-primary"
                            >
                                <span className="text-2xl">×</span>
                            </button>
                        </div>

                        <div className="space-y-2">
                            {habits.length > 0 ? (
                                habits.map((habit) => {
                                    const isCompleted = selectedDay.habits.some(h => h.name === habit.name && h.status !== 'skip');
                                    const isL = loadingHabitId === habit.id;
                                    return (
                                        <div
                                            key={habit.id}
                                            className="flex items-center gap-3 p-3 bg-main-bg border border-border hover:bg-surface-alt transition-colors rounded-xl cursor-pointer"
                                            onClick={() => toggleHabitInModal(habit.id, isCompleted)}
                                        >
                                            <div
                                                className={`flex-shrink-0 flex items-center justify-center w-6 h-6 rounded border transition-all
                                                    ${isCompleted ? 'bg-primary-green border-primary-green' : 'bg-surface border-border-alt'}`}
                                            >
                                                {isL ? (
                                                    <Loader2 size={12} className="animate-spin text-text-secondary" />
                                                ) : (
                                                    isCompleted && <Check size={14} className="text-white outline-none stroke-[3]" />
                                                )}
                                            </div>
                                            <span className={`text-sm ${isCompleted ? 'text-text-secondary line-through' : 'text-text-primary'}`}>
                                                {habit.name}
                                            </span>
                                        </div>
                                    );
                                })
                            ) : (
                                <div className="text-center py-8 text-text-secondary">
                                    Brak nawyków na koncie
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
