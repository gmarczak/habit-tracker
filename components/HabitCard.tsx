"use client";

import { Check, Trash2 } from "lucide-react";
import { useState } from "react";
import { supabase } from "@/utils/supabase";
import { useRouter } from "next/navigation";

type HabitCardProps = {
    id: string;
    name: string;
    defaultCompleted?: boolean;
};

export default function HabitCard({ id, name, defaultCompleted = false }: HabitCardProps) {
    const router = useRouter(); // Potrzebne do odświeżenia listy po usunięciu
    const [isCompleted, setIsCompleted] = useState(defaultCompleted);
    const [isLoading, setIsLoading] = useState(false);

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
        } catch (error) {
            console.error("Błąd zapisu:", error);
            setIsCompleted(!newState);
        } finally {
            setIsLoading(false);
        }
    };

    const deleteHabit = async (e: React.MouseEvent) => {
        // 🛑 STOP PROPAGATION - To jest kluczowe!
        // Dzięki temu kliknięcie w kosz nie uruchamia funkcji toggleHabit (nie odhacza nawyku)
        e.stopPropagation();

        // Proste zabezpieczenie
        if (!window.confirm("Czy na pewno chcesz usunąć ten nawyk?")) return;

        try {
            // Usuwamy nawyk (kaskada w bazie usunie też logi, jeśli tak ustawiłeś, 
            // ale Supabase domyślnie może wymagać ręcznego usunięcia logów. 
            // Spróbujmy usunąć nawyk - jeśli baza ma relację 'ON DELETE CASCADE', to zadziała).
            const { error } = await supabase.from("habits").delete().eq("id", id);

            if (error) throw error;

            // Odśwież widok, żeby nawyk zniknął
            router.refresh();

        } catch (error) {
            alert("Błąd usuwania. Upewnij się, że usunąłeś logi lub baza ma ustawione kaskadowanie.");
            console.error(error);
        }
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
            <div className="flex items-center gap-4 z-10">
                {/* Checkbox */}
                <div
                    className={`
            flex items-center justify-center w-8 h-8 rounded-full border-2 transition-all duration-300
            ${isCompleted
                            ? "bg-green-500 border-green-500 scale-110"
                            : "border-gray-600 group-hover:border-gray-400"
                        }
          `}
                >
                    {isCompleted && <Check size={18} className="text-black stroke-[3]" />}
                </div>

                {/* Nazwa */}
                <span
                    className={`
            text-lg font-medium transition-colors
            ${isCompleted ? "text-green-100 line-through decoration-green-500/50" : "text-gray-200"}
          `}
                >
                    {name}
                </span>
            </div>

            {/* Przycisk usuwania - pojawia się po najechaniu (group-hover) */}
            <button
                onClick={deleteHabit}
                className="
          p-2 text-gray-500 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all
          opacity-0 group-hover:opacity-100 focus:opacity-100
          z-20
        "
                title="Usuń nawyk"
            >
                <Trash2 size={20} />
            </button>
        </div>
    );
}