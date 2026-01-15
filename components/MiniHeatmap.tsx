"use client";

import { useMemo } from "react";

type MiniHeatmapProps = {
    completedDates: string[];
    skippedDates?: string[];
    days?: number;
    className?: string;
};

export default function MiniHeatmap({
    completedDates,
    skippedDates = [],
    days = 30,
    className = ""
}: MiniHeatmapProps) {
    // Generuj tablicę ostatnich X dni
    const recentDays = useMemo(() => {
        return Array.from({ length: days }, (_, i) => {
            const d = new Date();
            d.setDate(d.getDate() - (days - 1 - i));
            return d.toISOString().split('T')[0];
        });
    }, [days]);

    return (
        <div className={`flex ${className}`}>
            {recentDays.map((date) => {
                const isDone = completedDates.includes(date);
                const isSkip = skippedDates.includes(date);
                const isToday = date === new Date().toISOString().split('T')[0];

                return (
                    <div
                        key={date}
                        className={`
                            w-2.5 h-2.5 md:w-3 md:h-3 rounded-[3px] transition-all flex-shrink-0
                            ${isDone
                                ? "bg-emerald-500/90 shadow-[0_0_4px_rgba(16,185,129,0.35)]"
                                : isSkip
                                    ? "bg-yellow-500/70"
                                    : "bg-gray-800/60"
                            }
                            ${isToday ? "ring-1 ring-gray-500/60" : ""}
                        `}
                        title={`${date}${isDone ? ' - wykonane' : isSkip ? ' - pominięte' : ''}`}
                    />
                );
            })}
        </div>
    );
}
