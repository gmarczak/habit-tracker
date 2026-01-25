"use client";

import { Search, X, Filter, Check } from "lucide-react";
import { useState } from "react";

type HabitSearchProps = {
    searchQuery: string;
    onSearchChange: (query: string) => void;
    filterStatus: "all" | "completed" | "pending";
    onFilterChange: (status: "all" | "completed" | "pending") => void;
    totalCount: number;
    completedCount: number;
};

export default function HabitSearch({
    searchQuery,
    onSearchChange,
    filterStatus,
    onFilterChange,
    totalCount,
    completedCount,
}: HabitSearchProps) {
    const [showFilters, setShowFilters] = useState(false);

    return (
        <div className="space-y-3">
            {/* Search bar */}
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9ca3af]" size={18} />
                <input
                    type="text"
                    placeholder="Szukaj nawyków..."
                    value={searchQuery}
                    onChange={(e) => onSearchChange(e.target.value)}
                    className="w-full pl-10 pr-20 py-2.5 bg-[#1e1e1e]/50 border border-[#2d2d2d] rounded-xl text-[#f9fafb] placeholder-[#9ca3af] focus:outline-none focus:border-[#10b981] transition-colors"
                />
                {searchQuery && (
                    <button
                        onClick={() => onSearchChange("")}
                        className="absolute right-12 top-1/2 -translate-y-1/2 text-[#9ca3af] hover:text-[#f9fafb] transition-colors"
                    >
                        <X size={16} />
                    </button>
                )}
                <button
                    onClick={() => setShowFilters(!showFilters)}
                    className={`absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg transition-colors ${showFilters ? "bg-[#10b981] text-white" : "text-[#9ca3af] hover:text-[#f9fafb] hover:bg-[#2d2d2d]"
                        }`}
                >
                    <Filter size={16} />
                </button>
            </div>

            {/* Filters */}
            {showFilters && (
                <div className="flex gap-2 animate-in slide-in-from-top-2 duration-200">
                    <button
                        onClick={() => onFilterChange("all")}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${filterStatus === "all"
                            ? "bg-[#10b981] text-white"
                            : "bg-[#2d2d2d] text-[#9ca3af] hover:bg-[#3f3f46]"
                            }`}
                    >
                        Wszystkie ({totalCount})
                    </button>
                    <button
                        onClick={() => onFilterChange("completed")}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${filterStatus === "completed"
                            ? "bg-[#10b981] text-white"
                            : "bg-[#2d2d2d] text-[#9ca3af] hover:bg-[#3f3f46]"
                            }`}
                    >
                        <Check size={14} />
                        Wykonane ({completedCount})
                    </button>
                    <button
                        onClick={() => onFilterChange("pending")}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${filterStatus === "pending"
                            ? "bg-orange-600 text-white"
                            : "bg-gray-800 text-gray-400 hover:bg-gray-700"
                            }`}
                    >
                        Pozostałe ({totalCount - completedCount})
                    </button>
                </div>
            )}

            {/* Stats */}
            <div className="flex items-center justify-between text-xs text-gray-500">
                <span>
                    {completedCount} / {totalCount} wykonanych dzisiaj
                </span>
                {searchQuery && (
                    <span className="text-blue-400">
                        Filtrowanie: "{searchQuery}"
                    </span>
                )}
            </div>
        </div>
    );
}
