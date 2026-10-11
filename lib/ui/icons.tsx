import {
  Apple,
  Bath,
  BedDouble,
  Bike,
  Book,
  BookOpen,
  Brain,
  Briefcase,
  Camera,
  CigaretteOff,
  Code,
  Coffee,
  Droplet,
  Dumbbell,
  Flame,
  Footprints,
  Gamepad2,
  GlassWater,
  Guitar,
  Heart,
  HeartPulse,
  Languages,
  Leaf,
  Moon,
  Mountain,
  Music,
  Palette,
  PawPrint,
  PenLine,
  PhoneOff,
  PiggyBank,
  Pill,
  Salad,
  ShowerHead,
  Smile,
  Sparkles,
  Sprout,
  Star,
  Sun,
  Sunrise,
  Target,
  Timer,
  Tv,
  Users,
  Utensils,
  Waves,
  Wind,
  type LucideIcon,
} from "lucide-react";
import type { HabitColor } from "@/lib/domain/model";

/** Klucz zapisany w habits.icon -> ikona i podpis dla czytnika ekranu. */
export const ICONS: Record<string, { Icon: LucideIcon; label: string }> = {
  droplet: { Icon: Droplet, label: "kropla" },
  "glass-water": { Icon: GlassWater, label: "szklanka" },
  "book-open": { Icon: BookOpen, label: "książka" },
  book: { Icon: Book, label: "zeszyt" },
  "pen-line": { Icon: PenLine, label: "pisanie" },
  languages: { Icon: Languages, label: "języki" },
  brain: { Icon: Brain, label: "mózg" },
  code: { Icon: Code, label: "kod" },
  briefcase: { Icon: Briefcase, label: "praca" },
  dumbbell: { Icon: Dumbbell, label: "hantla" },
  footprints: { Icon: Footprints, label: "spacer" },
  bike: { Icon: Bike, label: "rower" },
  waves: { Icon: Waves, label: "pływanie" },
  mountain: { Icon: Mountain, label: "góry" },
  "heart-pulse": { Icon: HeartPulse, label: "kardio" },
  wind: { Icon: Wind, label: "oddech" },
  moon: { Icon: Moon, label: "noc" },
  "bed-double": { Icon: BedDouble, label: "sen" },
  sunrise: { Icon: Sunrise, label: "poranek" },
  sun: { Icon: Sun, label: "słońce" },
  timer: { Icon: Timer, label: "czas" },
  apple: { Icon: Apple, label: "owoc" },
  salad: { Icon: Salad, label: "warzywa" },
  utensils: { Icon: Utensils, label: "posiłek" },
  coffee: { Icon: Coffee, label: "kawa" },
  pill: { Icon: Pill, label: "lek" },
  "cigarette-off": { Icon: CigaretteOff, label: "bez papierosów" },
  "phone-off": { Icon: PhoneOff, label: "bez telefonu" },
  tv: { Icon: Tv, label: "ekran" },
  "gamepad-2": { Icon: Gamepad2, label: "gry" },
  "shower-head": { Icon: ShowerHead, label: "prysznic" },
  bath: { Icon: Bath, label: "kąpiel" },
  smile: { Icon: Smile, label: "nastrój" },
  heart: { Icon: Heart, label: "serce" },
  users: { Icon: Users, label: "ludzie" },
  "paw-print": { Icon: PawPrint, label: "zwierzak" },
  leaf: { Icon: Leaf, label: "liść" },
  sprout: { Icon: Sprout, label: "roślina" },
  guitar: { Icon: Guitar, label: "gitara" },
  music: { Icon: Music, label: "muzyka" },
  palette: { Icon: Palette, label: "sztuka" },
  camera: { Icon: Camera, label: "zdjęcia" },
  "piggy-bank": { Icon: PiggyBank, label: "oszczędzanie" },
  sparkles: { Icon: Sparkles, label: "porządek" },
  target: { Icon: Target, label: "cel" },
  flame: { Icon: Flame, label: "płomień" },
  star: { Icon: Star, label: "gwiazda" },
};

export const ICON_KEYS = Object.keys(ICONS);

export const COLOR_LABELS: Record<HabitColor, string> = {
  green: "zielony",
  blue: "niebieski",
  violet: "fioletowy",
  amber: "bursztynowy",
  rose: "różowy",
  teal: "morski",
  slate: "szary",
};

type Props = { icon: string | null; color: HabitColor; name: string; size?: "sm" | "md" | "lg" };

/** Kółko z ikoną w kolorze nawyku; bez ikony pierwsza litera nazwy. */
export function HabitBadge({ icon, color, name, size = "md" }: Props) {
  const entry = icon ? ICONS[icon] : undefined;
  const box = size === "lg" ? "h-14 w-14" : size === "sm" ? "h-8 w-8" : "h-10 w-10";
  const px = size === "lg" ? 26 : size === "sm" ? 16 : 20;
  return (
    <span
      aria-hidden="true"
      className={`flex ${box} shrink-0 items-center justify-center rounded-full font-semibold`}
      style={{ background: `var(--c-${color}-bg)`, color: `var(--c-${color}-fg)` }}
    >
      {entry ? <entry.Icon size={px} strokeWidth={2} /> : name.trim().charAt(0).toUpperCase()}
    </span>
  );
}
