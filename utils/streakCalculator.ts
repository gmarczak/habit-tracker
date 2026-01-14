export function calculateStreak(completedDates: string[]): number {
    if (!completedDates.length) return 0;

    // 1. Sortujemy daty od najnowszej i usuwamy duplikaty
    const sortedDates = [...new Set(completedDates)].sort((a, b) =>
        new Date(b).getTime() - new Date(a).getTime()
    );

    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

    // 2. Jeśli nie zrobiono nawyku ani dziś, ani wczoraj, to seria wynosi 0
    if (sortedDates[0] !== today && sortedDates[0] !== yesterday) {
        return 0;
    }

    let streak = 0;
    let currentDate = new Date(today); // Zaczynamy sprawdzanie od dzisiaj

    // 3. Pętla sprawdzająca dni wstecz
    for (let i = 0; i < sortedDates.length; i++) {
        const logDate = sortedDates[i];

        // Konwertujemy datę sprawdzaną w pętli na string YYYY-MM-DD
        const checkDateStr = currentDate.toISOString().split('T')[0];

        if (logDate === checkDateStr) {
            streak++;
            // Cofamy się o jeden dzień
            currentDate.setDate(currentDate.getDate() - 1);
        } else if (logDate === today && i === 0) {
            // Mały fix: jeśli pierwszy log to "dziś", a pętla szukała "dziś" i znalazła, to ok.
            // Jeśli pierwszy log to "wczoraj", to też ok.
            // Ale jeśli logi są dziurawe, przerywamy.
            continue;
        } else {
            // Jeśli data się nie zgadza (dziura w nawyku), sprawdzamy czy to nie jest kwestia "dziś nie zrobione, ale wczoraj tak"
            const yesterdayStr = new Date(Date.now() - 86400000).toISOString().split('T')[0];
            if (checkDateStr === today && logDate === yesterdayStr) {
                streak++;
                currentDate.setDate(currentDate.getDate() - 2); // Cofamy o 2 dni, bo "dziś" puste, "wczoraj" zaliczone
            } else {
                break; // Przerwanie serii
            }
        }
    }

    return streak;
}