"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

type HabitCalendarProps = {
    completedDates: string[];
    onDateClick?: (date: string) => void;
};

const DAYS = ["Pn", "Wt", "Śr", "Cz", "Pt", "Sb", "Nd"];
const MONTHS = [
    "Styczeń", "Luty", "Marzec", "Kwiecień", "Maj", "Czerwiec",
    "Lipiec", "Sierpień", "Wrzesień", "Październik", "Listopad", "Grudzień"
];

export default function HabitCalendar({ completedDates, onDateClick }: HabitCalendarProps) {
    const [currentMonth, setCurrentMonth] = useState(new Date());

    const completedSet = useMemo(() => new Set(completedDates), [completedDates]);

    const calendarDays = useMemo(() => {
        const year = currentMonth.getFullYear();
        const month = currentMonth.getMonth();

        // Pierwszy dzień miesiąca
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);

        // Dzień tygodnia pierwszego dnia (0 = niedziela, dostosuj do poniedziałku = 0)
        let firstDayOfWeek = firstDay.getDay() - 1;
        if (firstDayOfWeek === -1) firstDayOfWeek = 6; // Niedziela na końcu

        const daysInMonth = lastDay.getDate();

        // Dni z poprzedniego miesiąca
        const prevMonthDays: (Date | null)[] = [];
        for (let i = 0; i < firstDayOfWeek; i++) {
            prevMonthDays.push(null);
        }

        // Dni bieżącego miesiąca
        const currentMonthDays: Date[] = [];
        for (let day = 1; day <= daysInMonth; day++) {
            currentMonthDays.push(new Date(year, month, day));
        }

        return [...prevMonthDays, ...currentMonthDays];
    }, [currentMonth]);

    const goToPrevMonth = () => {
        setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
    };

    const goToNextMonth = () => {
        setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
    };

    const isToday = (date: Date) => {
        const today = new Date();
        return date.toISOString().split('T')[0] === today.toISOString().split('T')[0];
    };

    const isFuture = (date: Date) => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return date > today;
    };

    return (
        <div className="w-full">
            {/* HEADER */}
            <div className="flex items-center justify-between mb-4 gap-2">
                <button
                    onClick={goToPrevMonth}
                    className="p-1 lg:p-2 hover:bg-gray-800/50 rounded-lg transition-colors text-gray-400 hover:text-gray-200"
                >
                    <ChevronLeft size={16} className="lg:w-5 lg:h-5" />
                </button>

                <h3 className="text-base lg:text-lg font-semibold text-gray-100 text-center flex-1">
                    {MONTHS[currentMonth.getMonth()]} {currentMonth.getFullYear()}
                </h3>

                <button
                    onClick={goToNextMonth}
                    className="p-1 lg:p-2 hover:bg-gray-800/50 rounded-lg transition-colors text-gray-400 hover:text-gray-200"
                >
                    <ChevronRight size={16} className="lg:w-5 lg:h-5" />
                </button>
            </div>

            {/* DNI TYGODNIA */}
            <div className="grid grid-cols-7 gap-1 lg:gap-2 mb-1 lg:mb-2">
                {DAYS.map((day) => (
                    <div key={day} className="text-center text-xs font-medium text-gray-500 py-1 lg:py-2">
                        {day}
                    </div>
                ))}
            </div>

            {/* KALENDARZ */}
            <div className="grid grid-cols-7 gap-1 lg:gap-2">
                {calendarDays.map((date, idx) => {
                    if (!date) {
                        return <div key={`empty-${idx}`} className="aspect-square" />;
                    }

                    const dateStr = date.toISOString().split('T')[0];
                    const isCompleted = completedSet.has(dateStr);
                    const isTodayDate = isToday(date);
                    const isFutureDate = isFuture(date);

                    return (
                        <button
                            key={dateStr}
                            onClick={() => !isFutureDate && onDateClick?.(dateStr)}
                            disabled={isFutureDate}
                            className={`
                                aspect-square rounded text-xs lg:text-sm font-medium transition-all flex items-center justify-center
                                ${isFutureDate
                                    ? 'text-gray-700 cursor-not-allowed'
                                    : 'hover:scale-105 cursor-pointer'
                                }
                                ${isCompleted
                                    ? 'bg-emerald-500 text-white'
                                    : 'bg-gray-800/30 text-gray-400 hover:bg-gray-800/50'
                                }
                                ${isTodayDate
                                    ? 'ring-2 ring-blue-500 ring-offset-2 ring-offset-[#0d0d0d]'
                                    : ''
                                }
                            `}
                        >
                            {date.getDate()}
                        </button>
                    );
                })}
            </div>

            {/* LEGENDA */}
            <div className="flex items-center gap-3 lg:gap-6 mt-4 text-xs text-gray-500 flex-wrap">
                <div className="flex items-center gap-1 lg:gap-2">
                    <div className="w-2 lg:w-3 h-2 lg:h-3 rounded bg-emerald-500" />
                    <span>Wykonane</span>
                </div>
                <div className="flex items-center gap-1 lg:gap-2">
                    <div className="w-2 lg:w-3 h-2 lg:h-3 rounded bg-gray-800/30" />
                    <span>Nie</span>
                </div>
                <div className="flex items-center gap-1 lg:gap-2">
                    <div className="w-2 lg:w-3 h-2 lg:h-3 rounded ring-2 ring-blue-500 bg-gray-800/30" />
                    <span>Dzisiaj</span>
                </div>
            </div>
        </div>
    );
}
