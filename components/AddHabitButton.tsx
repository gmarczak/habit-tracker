"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/utils/supabase/client";
import { useRouter } from "next/navigation";
import { Plus, X, Loader2, Zap } from "lucide-react";

export default function AddHabitButton() {
    const supabase = createClient();
    const [isOpen, setIsOpen] = useState(false);
    const [name, setName] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const router = useRouter();

    // Skrót klawiszowy Ctrl/Cmd + N
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
                e.preventDefault();
                setIsOpen(true);
            }
            // ESC zamyka modal
            if (e.key === 'Escape' && isOpen) {
                setIsOpen(false);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen]);

    const handleSubmit = async (e?: React.FormEvent, keepOpen = false) => {
        e?.preventDefault();
        if (!name.trim()) return;

        setIsLoading(true);

        const { error } = await supabase
            .from("habits")
            .insert({
                name: name.trim(),
                archived: false,
                tags: [],
                schedule_type: "daily",
            });

        setIsLoading(false);

        if (error) {
            alert("Wystąpił błąd podczas dodawania.");
            console.error(error);
        } else {
            setName("");
            if (!keepOpen) {
                setIsOpen(false);
            }
            router.refresh();
        }
    };

    const quickAdd = async () => {
        if (!name.trim()) return;
        await handleSubmit(undefined, true);
    };

    return (
        <>
            <button
                onClick={() => setIsOpen(true)}
                className="bg-[#10b981] hover:bg-[#059669] text-[#f9fafb] lg:w-12 lg:h-12 w-14 h-14 rounded-full shadow-lg lg:shadow-lg shadow-2xl flex items-center justify-center transition-all hover:scale-105 lg:hover:scale-110 active:scale-95 z-40 border-2 lg:border-0 border-[#10b981]/50"
                title="Dodaj nawyk (Ctrl+N)"
            >
                <Plus size={20} className="hidden lg:block" />
                <Plus size={24} strokeWidth={2.5} className="lg:hidden" />
            </button>


            {isOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#000000]/60 backdrop-blur-sm animate-in fade-in duration-200">

                    <div className="bg-[#1e1e1e] border border-[#2d2d2d] w-full max-w-sm rounded-2xl shadow-2xl p-6 relative animate-in zoom-in-95 duration-200">


                        <button
                            onClick={() => setIsOpen(false)}
                            className="absolute top-4 right-4 text-[#9ca3af] hover:text-[#f9fafb] transition-colors"
                            title="Zamknij (ESC)"
                            aria-label="Zamknij"
                        >
                            <X size={20} />
                        </button>

                        <div className="flex items-center gap-2 mb-1">
                            <Zap size={20} className="text-blue-500" />
                            <h2 className="text-xl font-bold text-[#f9fafb]">Szybkie dodawanie</h2>
                        </div>
                        <p className="text-[#9ca3af] text-sm mb-6">Co chcesz robić codziennie?</p>

                        <form onSubmit={(e) => handleSubmit(e, false)} className="flex flex-col gap-4">
                            <div className="relative">
                                <input
                                    autoFocus
                                    type="text"
                                    placeholder="Np. Czytanie 10 minut..."
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && e.shiftKey) {
                                            e.preventDefault();
                                            quickAdd();
                                        }
                                    }}
                                    className="w-full bg-[#121212] border border-[#2d2d2d] rounded-lg px-4 py-3 text-[#f9fafb] placeholder-[#9ca3af] focus:outline-none focus:border-[#10b981] focus:ring-1 focus:ring-[#10b981] transition-all"
                                />
                                <div className="text-xs text-[#9ca3af] mt-1.5 flex items-center gap-1">
                                    <kbd className="px-1.5 py-0.5 bg-[#2d2d2d] rounded text-[10px]">Enter</kbd>
                                    <span>dodaj</span>
                                    <span className="mx-1">•</span>
                                    <kbd className="px-1.5 py-0.5 bg-[#2d2d2d] rounded text-[10px]">Shift+Enter</kbd>
                                    <span>dodaj kolejny</span>
                                </div>
                            </div>

                            <div className="flex gap-2 mt-2">
                                <button
                                    type="button"
                                    onClick={() => setIsOpen(false)}
                                    className="px-4 py-3 rounded-lg bg-[#2d2d2d] text-[#9ca3af] font-medium hover:bg-[#3f3f46] transition-colors"
                                >
                                    Anuluj
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleSubmit(undefined, true)}
                                    disabled={isLoading || !name.trim()}
                                    className="flex-1 py-3 px-4 rounded-lg bg-[#2d2d2d] text-[#f9fafb] font-medium hover:bg-[#3f3f46] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                    title="Shift+Enter"
                                >
                                    {isLoading ? <Loader2 className="animate-spin" size={16} /> : <Plus size={16} />}
                                    <span>Dodaj kolejny</span>
                                </button>
                                <button
                                    type="submit"
                                    disabled={isLoading || !name.trim()}
                                    className="flex-1 py-3 px-4 rounded-lg bg-[#10b981] text-[#f9fafb] font-medium hover:bg-[#059669] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
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