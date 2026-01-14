"use client";

import { Check, Trash2, Flame } from "lucide-react";
import { useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { useRouter } from "next/navigation";

type HabitCardProps = {

    id: string;
    name: string;
    streak: number;
    defaultCompleted?: boolean;
};

export default function HabitCard({ id, name, streak, defaultCompleted = false }: HabitCardProps) {
    const supabase = createClient();
    const router = useRouter();
    const [isCompleted, setIsCompleted] = useState(defaultCompleted);
    const [isLoading, setIsLoading] = useState(false);


    const currentStreak = isCompleted ? streak : streak;

    const toggleHabit = async () => {
        if (isLoading) return;
        setIsLoading(true);

        const newState = !isCompleted;
        setIsCompleted(newState);

        const today = new Date().toISOString().split('T')[0];

        try {
            if (newState) {
                await supabase.from("habit_logs").insert({ habit_id: id, completed_date: today });
            } else {
                await supabase
                    .from("habit_logs")
                    .delete()
                    .eq("habit_id", id)
                    .eq("completed_date", today);
            }
            router.refresh();
        } catch (error) {
            console.error("Błąd zapisu:", error);
            setIsCompleted(!newState);
        } finally {
            setIsLoading(false);
        }
    };

    const deleteHabit = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!window.confirm("Czy na pewno chcesz usunąć ten nawyk?")) return;
        const { error } = await supabase.from("habits").delete().eq("id", id);
        if (!error) router.refresh();
    };

    return (
        <div
            onClick={toggleHabit}
            className={`
        group flex items-center justify-between p-4 rounded-2xl border transition-all duration-200 cursor-pointer select-none relative overflow-hidden
        ${isCompleted
                    ? "bg-green-900/20 border-green-500/50 shadow-[0_0_20px_rgba(34,197,94,0.2)]"
                    : "bg-gray-900 border-gray-800 hover:border-gray-600 hover:bg-gray-800/80"
                }
      `}
        >
            <div className="flex items-center gap-4 z-10 overflow-hidden">
                <div
                    className={`
            flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-full border-2 transition-all duration-300
            ${isCompleted
                            ? "bg-green-500 border-green-500 scale-110"
                            : "border-gray-600 group-hover:border-gray-400"
                        }
          `}
                >
                    {isCompleted && <Check size={18} className="text-black stroke-[3]" />}
                </div>

                <div className="flex flex-col">
                    <span className={`text-lg font-medium transition-colors truncate ${isCompleted ? "text-green-100 line-through decoration-green-500/50" : "text-gray-200"}`}>
                        {name}
                    </span>


                    <div className={`text-xs font-mono flex items-center gap-1 ${currentStreak > 0 ? "text-orange-400" : "text-gray-600"}`}>
                        <Flame size={12} className={currentStreak > 0 ? "fill-orange-400" : ""} />
                        {currentStreak} dni serii
                    </div>
                </div>
            </div>

            <button
                onClick={deleteHabit}
                className="p-2 text-gray-500 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all opacity-0 group-hover:opacity-100 focus:opacity-100 z-20"
            >
                <Trash2 size={20} />
            </button>
        </div>
    );
}