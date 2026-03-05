"use client";

import { createClient } from "@/utils/supabase/client";
import { useRouter } from "next/navigation";
import { Plus, BookOpen, Droplet, Dumbbell, Brain, Loader2 } from "lucide-react";
import { useState } from "react";

const SUGGESTIONS = [
    { name: "Czytanie 15 min", icon: BookOpen },
    { name: "Picie 2L wody", icon: Droplet },
    { name: "Trening z samego rana", icon: Dumbbell },
    { name: "Medytacja przed snem", icon: Brain },
];

export default function QuickStartHabits() {
    const supabase = createClient();
    const router = useRouter();
    const [loadingId, setLoadingId] = useState<number | null>(null);

    const addHabit = async (name: string, index: number) => {
        setLoadingId(index);
        await supabase.from("habits").insert({
            name,
            archived: false,
            tags: [],
            schedule_type: "daily",
        });
        setLoadingId(null);
        router.refresh();
    };

    return (
        <div className="p-6 md:p-8 lg:p-12 border border-dashed border-border rounded-2xl bg-surface/40 text-center mt-2 w-full flex flex-col items-center justify-center min-h-[300px]">
            <h3 className="text-xl font-bold text-text-primary mb-2">Jeszcze nic tu nie ma.</h3>
            <p className="text-sm text-text-secondary mb-8 max-w-sm">Wybierz jeden z polecanych nawyków na start, żeby zacząć śledzić swoje postępy.</p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-lg">
                {SUGGESTIONS.map((s, idx) => {
                    const isAdding = loadingId === idx;
                    return (
                        <button
                            key={idx}
                            onClick={() => addHabit(s.name, idx)}
                            disabled={loadingId !== null}
                            className="flex items-center gap-3 p-3 rounded-xl border border-border bg-surface hover:border-primary-green hover:shadow-[0_2px_10px_rgba(16,185,129,0.1)] transition-all text-left group disabled:opacity-50"
                        >
                            <div className="w-10 h-10 rounded-lg bg-main-bg flex items-center justify-center group-hover:bg-primary-green/10 group-hover:text-primary-green transition-colors text-text-secondary flex-shrink-0">
                                <s.icon size={20} />
                            </div>
                            <span className="font-medium text-text-primary text-sm flex-1 truncate">{s.name}</span>
                            {isAdding ? (
                                <Loader2 size={16} className="text-text-secondary animate-spin flex-shrink-0" />
                            ) : (
                                <Plus size={16} className="text-text-secondary group-hover:text-primary-green transition-colors flex-shrink-0" />
                            )}
                        </button>
                    );
                })}
            </div>

            <p className="text-xs text-text-secondary mt-8">...lub kliknij "+" żeby dodać własny nawyk</p>
        </div>
    );
}
