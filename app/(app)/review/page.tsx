import { DayReview } from "@/features/review/DayReview";

/** /review?date=RRRR-MM-DD — przegląd dnia (link z wieczornego i porannego powiadomienia). */
export default async function ReviewPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const { date } = await searchParams;
  return <DayReview dateParam={date ?? null} />;
}
