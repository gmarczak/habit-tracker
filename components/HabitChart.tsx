"use client";

import { useMemo } from "react";

type HabitChartProps = {
    completedDates: string[];
    days?: number;
};

export default function HabitChart({ completedDates, days = 30 }: HabitChartProps) {
    const chartData = useMemo(() => {
        const today = new Date();
        const data: { date: string; label: string; completed: boolean }[] = [];

        for (let i = days - 1; i >= 0; i--) {
            const d = new Date(today);
            d.setDate(today.getDate() - i);
            const dateStr = d.toISOString().split('T')[0];
            const dayLabel = d.getDate().toString();

            data.push({
                date: dateStr,
                label: dayLabel,
                completed: completedDates.includes(dateStr)
            });
        }

        return data;
    }, [completedDates, days]);

    const stats = useMemo(() => {
        const completed = chartData.filter(d => d.completed).length;
        const total = chartData.length;
        const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

        return { completed, total, percentage };
    }, [chartData]);

    return (
        <div className="w-full">
            <div className="flex items-center justify-between mb-3 lg:mb-4 flex-wrap gap-2">
                <h3 className="text-xs lg:text-sm font-medium text-text-secondary">
                    Ostatnie {days} dni
                </h3>
                <div className="text-xs text-text-secondary">
                    <span className="text-primary-green font-semibold">{stats.completed}</span>
                    <span className="mx-1">/</span>
                    <span>{stats.total}</span>
                    <span className="ml-2 text-text-secondary">({stats.percentage}%)</span>
                </div>
            </div>

            {/* WYKRES SŁUPKOWY */}
            <div className="flex items-end gap-[2px] lg:gap-1 h-24 lg:h-32 mb-2">
                {chartData.map((item, idx) => {
                    const height = item.completed ? 100 : 20;
                    const showLabel = idx % Math.ceil(days / 5) === 0; // Co ~5-6 dni dla 30 dni

                    return (
                        <div key={item.date} className="flex-1 flex flex-col items-center gap-0.5 lg:gap-1">
                            <div className="flex-1 flex items-end w-full">
                                <div
                                    className={`w-full rounded-t transition-all ${item.completed
                                        ? 'bg-primary-green'
                                        : 'bg-surface-alt border border-border border-b-0'
                                        }`}
                                    style={{ height: `${height}%` }}
                                />
                            </div>
                            {showLabel && (
                                <span className="text-[8px] lg:text-[10px] text-text-secondary font-mono">
                                    {item.label}
                                </span>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* PROGRESS BAR */}
            <div className="mt-4 lg:mt-6">
                <div className="h-2 lg:h-3 bg-surface-alt border border-border rounded-full overflow-hidden">
                    <div
                        className="h-full bg-primary-green transition-all duration-500"
                        style={{ width: `${stats.percentage}%` }}
                    />
                </div>
            </div>
        </div>
    );
}
