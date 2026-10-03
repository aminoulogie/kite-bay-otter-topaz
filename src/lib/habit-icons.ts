import {
  Activity, Bed, BookOpen, Brain, Droplet, Dumbbell, Footprints, Laptop, Moon, PenLine, Pill,
  Salad, Smartphone, Sparkles, Sun, Wallet, type LucideIcon,
} from "lucide-react";

/** An icon guessed from a habit's name; null means "use its first letter". */
const ICONS: [RegExp, LucideIcon][] = [
  [/water|hydrat|drink/i, Droplet],
  [/gym|train|lift|workout|push|pull|leg/i, Dumbbell],
  [/run|cardio|walk|step/i, Footprints],
  [/read|book|page/i, BookOpen],
  [/meditat|mindful|breath|pray/i, Sparkles],
  [/sleep|bed/i, Bed],
  [/night|evening/i, Moon],
  [/morning|sun|wake/i, Sun],
  [/journal|write|note/i, PenLine],
  [/creatine|vitamin|pill|supplement/i, Pill],
  [/protein|eat|food|veg|salad|meal/i, Salad],
  [/code|work|deep|focus|study/i, Laptop],
  [/learn|language|brain/i, Brain],
  [/screen|phone|social/i, Smartphone],
  [/money|spend|budget|save/i, Wallet],
  [/stretch|yoga|mobility/i, Activity],
];

export function iconFor(name: string): LucideIcon | null {
  return ICONS.find(([re]) => re.test(name))?.[1] ?? null;
}

