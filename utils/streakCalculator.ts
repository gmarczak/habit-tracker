export function calculateStreak(completedDates: string[]): number {
    if (!completedDates.length) return 0;


    const sortedDates = [...new Set(completedDates)].sort((a, b) =>
        new Date(b).getTime() - new Date(a).getTime()
    );

    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];


    if (sortedDates[0] !== today && sortedDates[0] !== yesterday) {
        return 0;
    }

    let streak = 0;
    let currentDate = new Date(today);


    for (let i = 0; i < sortedDates.length; i++) {
        const logDate = sortedDates[i];


        const checkDateStr = currentDate.toISOString().split('T')[0];

        if (logDate === checkDateStr) {
            streak++;

            currentDate.setDate(currentDate.getDate() - 1);
        } else if (logDate === today && i === 0) {

            continue;
        } else {

            const yesterdayStr = new Date(Date.now() - 86400000).toISOString().split('T')[0];
            if (checkDateStr === today && logDate === yesterdayStr) {
                streak++;
                currentDate.setDate(currentDate.getDate() - 2);
            } else {
                break;
            }
        }
    }

    return streak;
}

export function calculateBestStreak(completedDates: string[]): number {
    if (!completedDates.length) return 0;

    const uniqueSorted = [...new Set(completedDates)].sort((a, b) =>
        new Date(a).getTime() - new Date(b).getTime()
    );

    let best = 1;
    let current = 1;

    for (let i = 1; i < uniqueSorted.length; i++) {
        const prev = new Date(uniqueSorted[i - 1]);
        const cur = new Date(uniqueSorted[i]);
        const diffDays = Math.round((cur.getTime() - prev.getTime()) / 86400000);

        if (diffDays === 1) {
            current++;
            best = Math.max(best, current);
        } else {
            current = 1;
        }
    }

    return best;
}

export function calculateCompletionRate(completedDates: string[], days: number): number {
    if (days <= 0) return 0;

    const set = new Set(completedDates);
    const today = new Date();
    let done = 0;

    for (let i = 0; i < days; i++) {
        const d = new Date(today);
        d.setDate(today.getDate() - i);
        const iso = d.toISOString().split('T')[0];
        if (set.has(iso)) done++;
    }

    return Math.round((done / days) * 100);
}