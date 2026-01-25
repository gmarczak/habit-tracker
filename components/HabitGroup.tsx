"use client";

import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";

type HabitGroupProps = {
    title: string;
    count: number;
    completedCount: number;
    children: React.ReactNode;
    defaultExpanded?: boolean;
};

export default function HabitGroup({
    title,
    count,
    completedCount,
    children,
    defaultExpanded = true,
}: HabitGroupProps) {
    const [isExpanded, setIsExpanded] = useState(defaultExpanded);
    const percentage = count > 0 ? Math.round((completedCount / count) * 100) : 0;

    return (
        <div className="space-y-2">
            {/* Header */}
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-[#2d2d2d]/50 transition-colors group"
            >
                <div className="flex items-center gap-3">
                    {isExpanded ? (
                        <ChevronDown size={16} className="text-[#9ca3af] group-hover:text-[#f9fafb] transition-colors" />
                    ) : (
                        <ChevronRight size={16} className="text-[#9ca3af] group-hover:text-[#f9fafb] transition-colors" />
                    )}
                    <h3 className="text-sm font-semibold text-[#f9fafb] uppercase tracking-wider">
                        {title}
                    </h3>
                    <span className="text-xs text-[#9ca3af]">
                        {count} {count === 1 ? "nawyk" : "nawyków"}
                    </span>
                </div>

                <div className="flex items-center gap-3">
                    {/* Progress bar */}
                    <div className="hidden sm:flex items-center gap-2">
                        <div className="w-24 h-1.5 bg-[#2d2d2d] rounded-full overflow-hidden">
                            <div
                                className="h-full bg-[#10b981] rounded-full transition-all duration-300"
                                style={{ width: `${percentage}%` }}
                            />
                        </div>
                        <span className="text-xs font-semibold text-[#9ca3af] w-10 text-right">
                            {percentage}%
                        </span>
                    </div>

                    {/* Badge */}
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-[#2d2d2d] text-[#9ca3af]">
                        {completedCount}/{count}
                    </span>
                </div>
            </button>

            {/* Content */}
            {isExpanded && (
                <div className="space-y-2 animate-in slide-in-from-top-2 duration-200">
                    {children}
                </div>
            )}
        </div>
    );
}
