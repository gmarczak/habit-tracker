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