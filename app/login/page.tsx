"use client";

import { useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { useRouter } from "next/navigation";
import { Lock, User, Loader2 } from "lucide-react";

export default function LoginPage() {
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const router = useRouter();
    const supabase = createClient();

    const getFakeEmail = (user: string) => `${user.toLowerCase().trim()}@tracker.com`;

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        const { error } = await supabase.auth.signInWithPassword({
            email: getFakeEmail(username),
            password,
        });

        if (error) {
            alert("Błędne hasło lub login!");
            setLoading(false);
        } else {
            router.push("/");
            router.refresh();
        }
    };

    const handleRegister = async () => {
        if (password.length < 6) {
            alert("Hasło musi mieć minimum 6 znaków!");
            return;
        }
        setLoading(true);

        const { error } = await supabase.auth.signUp({
            email: getFakeEmail(username),
            password,
        });

        if (error) {
            alert("Błąd: " + error.message);
        } else {
            alert("Konto założone! Teraz kliknij 'Zaloguj'.");
        }
        setLoading(false);
    };

    return (
        <main className="min-h-screen flex items-center justify-center bg-[#121212] text-[#f9fafb] p-4">
            <div className="w-full max-w-sm bg-[#1e1e1e] border border-[#2d2d2d] p-8 rounded-2xl shadow-xl">
                <h1 className="text-2xl font-bold mb-2 text-center">Witaj 👋</h1>
                <p className="text-[#9ca3af] text-center mb-6 text-sm">Zaloguj się swoją ksywką</p>

                <form onSubmit={handleLogin} className="flex flex-col gap-4">
                    <div className="relative">
                        <User className="absolute left-3 top-3 text-[#9ca3af]" size={20} />
                        <input
                            type="text"
                            placeholder="Twój Login (np. marcin)"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            className="w-full bg-[#121212] border border-[#2d2d2d] rounded-lg pl-10 pr-4 py-3 text-[#f9fafb] focus:border-[#10b981] focus:outline-none"
                            required
                        />
                    </div>

                    <div className="relative">
                        <Lock className="absolute left-3 top-3 text-[#9ca3af]" size={20} />
                        <input
                            type="password"
                            placeholder="Hasło"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full bg-[#121212] border border-[#2d2d2d] rounded-lg pl-10 pr-4 py-3 text-[#f9fafb] focus:border-[#10b981] focus:outline-none"
                            required
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="bg-[#10b981] hover:bg-[#059669] text-white font-bold py-3 rounded-lg transition-all mt-2 flex justify-center"
                    >
                        {loading ? <Loader2 className="animate-spin" /> : "Zaloguj się"}
                    </button>

                    <button
                        type="button"
                        onClick={handleRegister}
                        disabled={loading}
                        className="text-[#9ca3af] text-xs hover:text-[#f9fafb] transition-colors mt-2"
                    >
                        Nie masz konta? Wpisz dane powyżej i kliknij tutaj, aby założyć.
                    </button>
                </form>
            </div>
        </main>
    );
}