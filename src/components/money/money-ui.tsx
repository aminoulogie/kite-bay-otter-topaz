import {
  Briefcase, Car, Circle, Coffee, CreditCard, Dumbbell, Gamepad2, Gift, GraduationCap, Heart, Home,
  Landmark, Laptop, Palmtree, PiggyBank, Pill, Plane, PlusCircle, Shirt, ShoppingBag, ShoppingCart,
  Smartphone, Tag, TrendingUp, Tv, Utensils, Wallet, Zap, X, type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

/** The icons a money category, account or goal can wear, by name. */
export const MONEY_ICONS: Record<string, LucideIcon> = {
  utensils: Utensils,
  "shopping-cart": ShoppingCart,
  home: Home,
  zap: Zap,
  car: Car,
  "shopping-bag": ShoppingBag,
  gamepad: Gamepad2,
  dumbbell: Dumbbell,
  pill: Pill,
  heart: Heart,
  shirt: Shirt,
  tv: Tv,
  circle: Circle,
  wallet: Wallet,
  briefcase: Briefcase,
  "trending-up": TrendingUp,
  gift: Gift,
  "plus-circle": PlusCircle,
  tag: Tag,
  coffee: Coffee,
  plane: Plane,
  laptop: Laptop,
  palmtree: Palmtree,
  phone: Smartphone,
  school: GraduationCap,
  piggy: PiggyBank,
  bank: Landmark,
  card: CreditCard,
};

export const ICON_CHOICES = Object.keys(MONEY_ICONS);

export function iconOf(name: string | undefined): LucideIcon {
  return (name && MONEY_ICONS[name]) || Tag;
}

/** A category, account or goal as a rounded tile in its own colour. */
export function MoneyTile({
  icon, color, size = 40, className,
}: {
  icon: string;
  color: string;
  size?: number;
  className?: string;
}) {
  const Icon = iconOf(icon);
  return (
    <span
      aria-hidden
      className={cn("grid shrink-0 place-items-center rounded-2xl", className)}
      style={{
        width: size,
        height: size,
        background: `color-mix(in srgb, ${color} 18%, transparent)`,
        color,
      }}
    >
      <Icon style={{ width: size * 0.5, height: size * 0.5 }} strokeWidth={2.2} />
    </span>
  );
}

/** A bottom sheet, the same shape as the rest of the app's. */
export function MoneySheet({
  title, onClose, children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-[70] flex flex-col justify-end bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
    >
      <div
        className="soma-expand max-h-[92vh] overflow-y-auto rounded-t-3xl border-t border-border bg-bg px-4 pb-[max(20px,env(safe-area-inset-bottom))] pt-3"
        onClick={(e) => e.stopPropagation()}
        data-no-swipe-nav
      >
        <div className="mb-3 flex items-center justify-between">
          <div className="font-display text-base font-extrabold">{title}</div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid size-8 place-items-center rounded-full border border-border bg-surface-2"
          >
            <X className="size-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** A thin progress bar in a given colour. */
export function MoneyBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="h-2 overflow-hidden rounded-full bg-surface-3">
      <div
        className="h-full rounded-full transition-[width]"
        style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%`, background: color }}
      />
    </div>
  );
}

export const TONE_COLOR = { warn: "#ff9f0a", over: "#ff453a" } as const;
