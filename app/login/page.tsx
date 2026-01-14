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

    const getFakeEmail = (user: string) => `${user.toLowerCase().trim()}@example.com`;

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
        <main className="min-h-screen flex items-center justify-center bg-[#0a0a0a] text-white p-4">
            <div className="w-full max-w-sm bg-gray-900 border border-gray-800 p-8 rounded-2xl shadow-xl">
                <h1 className="text-2xl font-bold mb-2 text-center">Witaj 👋</h1>
                <p className="text-gray-500 text-center mb-6 text-sm">Zaloguj się swoją ksywką</p>

                <form onSubmit={handleLogin} className="flex flex-col gap-4">
                    <div className="relative">
                        <User className="absolute left-3 top-3 text-gray-500" size={20} />
                        <input
                            type="text"
                            placeholder="Twój Login (np. marcin)"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            className="w-full bg-gray-950 border border-gray-800 rounded-lg pl-10 pr-4 py-3 text-white focus:border-blue-500 focus:outline-none"
                            required
                        />
                    </div>

                    <div className="relative">
                        <Lock className="absolute left-3 top-3 text-gray-500" size={20} />
                        <input
                            type="password"
                            placeholder="Hasło"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full bg-gray-950 border border-gray-800 rounded-lg pl-10 pr-4 py-3 text-white focus:border-blue-500 focus:outline-none"
                            required
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-lg transition-all mt-2 flex justify-center"
                    >
                        {loading ? <Loader2 className="animate-spin" /> : "Zaloguj się"}
                    </button>

                    <button
                        type="button"
                        onClick={handleRegister}
                        disabled={loading}
                        className="text-gray-500 text-xs hover:text-white transition-colors mt-2"
                    >
                        Nie masz konta? Wpisz dane powyżej i kliknij tutaj, aby założyć.
                    </button>
                </form>
            </div>
        </main>
    );
}