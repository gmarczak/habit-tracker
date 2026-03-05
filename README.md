# Habit Tracker

A modern, responsive habit tracking application to help you build and maintain positive daily routines. Built with Next.js 15, React 19, Tailwind CSS v4, and Supabase.

## Features

- **User Authentication:** Secure login and session management powered by Supabase Auth.
- **Habit Management:** Create, track, and manage your daily habits easily.
- **Streak Calculation:** Automatically calculates and displays your current streaks based on your logged progress.
- **Responsive Design:** Optimized layouts providing a unified experience on both desktop and mobile devices.
- **Data Visualization:** View your accomplishments with yearly summaries.
- **Animations:** Engaging visual feedback (like confetti) when completing goals, using `canvas-confetti`.
- **Polish Localization:** Date formatting and UI copy tailored for Polish users.

## Tech Stack

- **Framework:** [Next.js 15](https://nextjs.org/) (App Router)
- **UI Library:** [React 19](https://react.dev/)
- **Styling:** [Tailwind CSS v4](https://tailwindcss.com/)
- **Database & Auth:** [Supabase](https://supabase.com/)
- **Icons:** [Lucide React](https://lucide.dev/)
- **Language:** TypeScript

## Getting Started

### Prerequisites

- Node.js (version 20 or higher recommended)
- A Supabase account and a newly created project

### Installation

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd habit-tracker
   ```

2. Install dependencies:
   ```bash
   npm install
   # or
   yarn install
   # or
   pnpm install
   ```

3. Configure Environment Variables:
   Create a `.env.local` file in the root directory and add your Supabase credentials:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
   ```

4. Run the development server:
   ```bash
   npm run dev
   # or
   yarn dev
   # or
   pnpm dev
   ```

5. Open [http://localhost:3000](http://localhost:3000) with your browser to see the application.

## Project Structure

- `app/`: Next.js App Router containing all routes, layouts, and middleware (e.g., dashboard, login).
- `components/`: Reusable React components (`HabitList`, `AddHabitButton`, `DesktopLayout`, etc.).
- `utils/`: Helper functions such as `streakCalculator` and Supabase server and client client configuration.
- `public/`: Static assets.

## Deployment

The easiest way to deploy this Next.js app is to use the [Vercel Platform](https://vercel.com/new). Make sure to add your Supabase environment variables to your corresponding deployment settings.
