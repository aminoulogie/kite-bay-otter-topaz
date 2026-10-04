import { Capacitor, registerPlugin } from "@capacitor/core";
import type { Reminder } from "@/lib/meal-pace";

/** Meal notifications, in Swift (ios/App/App/MainViewController.swift). */
const MealReminders = registerPlugin<{
  schedule(o: { items: Reminder[] }): Promise<{ ok: boolean; booked?: number; error?: string }>;
  clear(): Promise<{ ok: boolean }>;
}>("MealReminders");

const native = () => Capacitor.getPlatform() === "ios";

export async function scheduleMealReminders(items: Reminder[]): Promise<boolean> {
  if (!native()) return false;
  try {
    return (await MealReminders.schedule({ items })).ok;
  } catch {
    return false;
  }
}

export async function clearMealReminders(): Promise<void> {
  if (!native()) return;
  try {
    await MealReminders.clear();
  } catch {
    /* not in this build */
  }
}
