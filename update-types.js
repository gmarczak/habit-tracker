const fs = require('fs');
const path = require('path');

const filesToUpdate = [
    'components/TodayView.tsx',
    'components/StatsPanel.tsx',
    'components/MobileLayout.tsx',
    'components/HabitSidebar.tsx',
    'components/HabitList.tsx',
    'components/DesktopLayout.tsx',
    'app/habits/[id]/page.tsx'
];

const targetStr = `isCompletedToday: boolean;`;
const replacementStr = `isCompletedToday: boolean;
    isRequiredToday?: boolean;
    frequency_type?: "daily" | "weekly_target" | "specific_days";
    frequency_value?: any;`;

filesToUpdate.forEach(file => {
    const filePath = path.join(__dirname, file);
    if (!fs.existsSync(filePath)) {
        console.log(`File missing: ${filePath}`);
        return;
    }
    const content = fs.readFileSync(filePath, 'utf8');
    if (content.includes('isRequiredToday?: boolean;')) {
        console.log(`Already updated: ${filePath}`);
        return;
    }
    const newContent = content.replace(targetStr, replacementStr);
    if (newContent !== content) {
        fs.writeFileSync(filePath, newContent);
        console.log(`Updated: ${filePath}`);
    } else {
        console.log(`Target string not found in: ${filePath}`);
    }
});
