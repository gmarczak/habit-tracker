import { HabitDetail } from "@/features/habits/HabitDetail";

export default async function HabitPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <HabitDetail id={id} />;
}
