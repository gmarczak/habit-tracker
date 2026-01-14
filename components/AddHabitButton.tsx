"use client";

import { useState } from "react";
import { supabase } from "@/utils/supabase";
import { useRouter } from "next/navigation";
import { Plus, X, Loader2 } from "lucide-react";

export default function AddHabitButton() {
    const [isOpen, setIsOpen] = useState(false); // Czy okno jest otwarte?
    const [name, setName] = useState("");        // Treść nowego nawyku
    const [isLoading, setIsLoading] = useState(false);
    const router = useRouter(); // Pozwoli nam odświeżyć stronę po dodaniu

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) return;

        setIsLoading(true);

        // 1. Zapisz do bazy
        const { error } = await supabase
            .from("habits")
            .insert({ name });

        setIsLoading(false);

        if (error) {
            alert("Wystąpił błąd podczas dodawania.");
            console.error(error);
        } else {
            // 2. Sukces: wyczyść formularz, zamknij okno i odśwież dane w tle
            setName("");
            setIsOpen(false);
            router.refresh();
        }
    };

    return (
        <>
            {/* 1. Pływający Przycisk (FAB) */}
            <button
                onClick={() => setIsOpen(true)}
                className="fixed bottom-8 right-8 md:absolute md:bottom-8 md:right-0 bg-blue-600 hover:bg-blue-500 text-white w-14 h-14 rounded-full shadow-lg shadow-blue-900/40 flex items-center justify-center transition-transform hover:scale-105 active:scale-95 z-40"
            >
                <Plus size={28} />
            </button>

            {/* 2. Modal (Okienko) - pojawia się tylko gdy isOpen === true */}
            {isOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">

                    <div className="bg-gray-900 border border-gray-800 w-full max-w-sm rounded-2xl shadow-2xl p-6 relative animate-in zoom-in-95 duration-200">

                        {/* Przycisk zamknięcia X */}
                        <button
                            onClick={() => setIsOpen(false)}
                            className="absolute top-4 right-4 text-gray-500 hover:text-white transition-colors"
                        >
                            <X size={20} />
                        </button>

                        <h2 className="text-xl font-bold text-white mb-1">Nowy nawyk</h2>
                        <p className="text-gray-400 text-sm mb-6">Co chcesz robić codziennie?</p>

                        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                            <input
                                autoFocus
                                type="text"
                                placeholder="Np. Czytanie 10 minut..."
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                            />

                            <div className="flex gap-3 mt-2">
                                <button
                                    type="button"
                                    onClick={() => setIsOpen(false)}
                                    className="flex-1 py-3 px-4 rounded-lg bg-gray-800 text-gray-300 font-medium hover:bg-gray-700 transition-colors"
                                >
                                    Anuluj
                                </button>
                                <button
                                    type="submit"
                                    disabled={isLoading || !name.trim()}
                                    className="flex-1 py-3 px-4 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                                >
                                    {isLoading ? <Loader2 className="animate-spin" /> : "Dodaj"}
                                </button>
                            </div>
                        </form>

                    </div>
                </div>
            )}
        </>
    );
}