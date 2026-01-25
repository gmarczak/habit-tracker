"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

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
};

const MONTHS_PL = [
    "Styczeń", "Luty", "Marzec", "Kwiecień", "Maj", "Czerwiec",
    "Lipiec", "Sierpień", "Wrzesień", "Październik", "Listopad", "Grudzień"
];

const DAYS_SHORT = ["Nd", "Pn", "Wt", "Śr", "Cz", "Pt", "Sb"];

export default function YearHeatmap({ year, allLogs }: YearHeatmapProps) {
    const [selectedDay, setSelectedDay] = useState<DayData | null>(null);
    const [currentYear, setCurrentYear] = useState(year);

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
        if (count === 0) return "bg-[#2d2d2d]/50 hover:bg-[#3f3f46]/50";
        if (count === 1) return "bg-[#064e3b]/40 hover:bg-[#047857]/60";
        if (count === 2) return "bg-[#10b981]/60 hover:bg-[#059669]/80";
        if (count === 3) return "bg-[#10b981]/70 hover:bg-[#10b981]/90";
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

    const totalDays = Array.from(yearData.values()).filter(d => d.count > 0).length;
    const totalCompletions = Array.from(yearData.values()).reduce((sum, d) => sum + d.count, 0);

    return (
        <div className="w-full">
            {/* Nagłówek z wyborem roku */}
            <div className="flex items-center justify-between mb-6">
                <button
                    onClick={() => changeYear(-1)}
                    className="p-2 rounded-lg bg-[#2d2d2d] hover:bg-[#3f3f46] transition-colors"
                >
                    <ChevronLeft size={20} />
                </button>
                <h2 className="text-2xl font-bold text-[#f9fafb]">{currentYear}</h2>
                <button
                    onClick={() => changeYear(1)}
                    className="p-2 rounded-lg bg-[#2d2d2d] hover:bg-[#3f3f46] transition-colors"
                >
                    <ChevronRight size={20} />
                </button>
            </div>

            {/* Statystyki */}
            <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-[#2d2d2d]/50 rounded-lg p-4">
                    <div className="text-[#9ca3af] text-sm mb-1">Aktywne dni</div>
                    <div className="text-2xl font-bold text-[#f9fafb]">{totalDays}</div>
                </div>
                <div className="bg-[#2d2d2d]/50 rounded-lg p-4">
                    <div className="text-[#9ca3af] text-sm mb-1">Wykonane nawyki</div>
                    <div className="text-2xl font-bold text-[#f9fafb]">{totalCompletions}</div>
                </div>
            </div>

            {/* Legenda */}
            <div className="flex items-center gap-2 text-xs text-[#9ca3af] mb-4">
                <span>Mniej</span>
                <div className="flex gap-1">
                    <div className="w-3 h-3 rounded-sm bg-[#2d2d2d]/50"></div>
                    <div className="w-3 h-3 rounded-sm bg-[#064e3b]/40"></div>
                    <div className="w-3 h-3 rounded-sm bg-[#10b981]/60"></div>
                    <div className="w-3 h-3 rounded-sm bg-[#10b981]/70"></div>
                    <div className="w-3 h-3 rounded-sm bg-[#22c55e]"></div>
                </div>
                <span>Więcej</span>
            </div>

            {/* Heatmapa - siatka miesięcy */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {monthsData.map((month, monthIdx) => (
                    <div key={monthIdx} className="bg-[#2d2d2d]/30 rounded-lg p-4">
                        <h3 className="text-sm font-semibold mb-3 text-[#f9fafb]">{month.name}</h3>

                        {/* Nazwy dni tygodnia */}
                        <div className="grid grid-cols-7 gap-1 mb-1">
                            {DAYS_SHORT.map((day, idx) => (
                                <div key={idx} className="text-[10px] text-[#9ca3af] text-center">
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
                                                <span className="absolute inset-0 flex items-center justify-center text-[8px] font-bold text-[#f9fafb]/80">
                                                    {new Date(day.date).getDate()}
                                                </span>
                                            )}
                                            {day.date && day.count === 0 && (
                                                <span className="absolute inset-0 flex items-center justify-center text-[8px] text-[#9ca3af]/60">
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
                    className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
                    onClick={closeModal}
                >
                    <div
                        className="bg-[#1e1e1e] rounded-2xl p-6 max-w-md w-full border border-[#2d2d2d]"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex justify-between items-start mb-4">
                            <div>
                                <h3 className="text-xl font-bold mb-1 text-[#f9fafb]">
                                    {new Date(selectedDay.date + 'T00:00:00').toLocaleDateString('pl-PL', {
                                        weekday: 'long',
                                        day: 'numeric',
                                        month: 'long',
                                        year: 'numeric'
                                    })}
                                </h3>
                                <p className="text-[#9ca3af] text-sm">
                                    {selectedDay.count} {selectedDay.count === 1 ? 'nawyk' : 'nawyków'} wykonanych
                                </p>
                            </div>
                            <button
                                onClick={closeModal}
                                className="p-2 hover:bg-[#2d2d2d] rounded-lg transition-colors text-[#f9fafb]"
                            >
                                <span className="text-2xl">×</span>
                            </button>
                        </div>

                        {selectedDay.habits.length > 0 ? (
                            <div className="space-y-2">
                                {selectedDay.habits.map((habit, idx) => (
                                    <div
                                        key={idx}
                                        className="flex items-center gap-3 p-3 bg-[#2d2d2d]/50 rounded-lg"
                                    >
                                        <div className="w-2 h-2 rounded-full bg-[#22c55e]"></div>
                                        <span className="flex-1 text-[#f9fafb]">{habit.name}</span>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="text-center py-8 text-[#9ca3af]">
                                Brak wykonanych nawyków tego dnia
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
