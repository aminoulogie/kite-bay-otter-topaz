import { i as __toESM } from "../_runtime.mjs";
import { n as require_react } from "../_libs/@radix-ui/react-compose-refs+[...].mjs";
import { y as require_jsx_runtime } from "../_libs/@tanstack/react-router+[...].mjs";
import { S as Activity, _ as Link2, a as TrendingUp, b as ChevronLeft, c as Target, d as Scale, f as Ruler, g as Moon, h as Pill, l as Settings, m as Plus, n as Utensils, o as Trash2, p as Redo2, r as Undo2, s as Timer, t as X, u as Search, v as Dumbbell, x as Check, y as ChevronRight } from "../_libs/lucide-react.mjs";
import { n as toast, t as Toaster } from "../_libs/sonner.mjs";
import { n as clsx, t as cva } from "../_libs/class-variance-authority+clsx.mjs";
import { t as twMerge } from "../_libs/tailwind-merge.mjs";
import { t as Slot } from "../_libs/radix-ui__react-slot.mjs";
import { n as create, t as persist } from "../_libs/zustand.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/routes-D7IU4Mo4.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
function cn(...inputs) {
	return twMerge(clsx(inputs));
}
function Badge({ className, tone = "muted", ...props }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
		className: cn("inline-flex items-center rounded-full border px-2.5 py-0.5 text-[0.65rem] font-bold uppercase tracking-wide", {
			muted: "bg-surface-2 text-muted border-border",
			accent: "bg-accent-soft text-accent-text border-accent-line",
			warn: "bg-warn/15 text-warn border-warn/30",
			danger: "bg-danger/15 text-danger border-danger/30",
			good: "bg-good/15 text-good border-good/30"
		}[tone], className),
		...props
	});
}
var buttonVariants = cva("inline-flex items-center justify-center gap-2 whitespace-nowrap font-semibold transition-transform duration-150 ease-out disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-4 [&_svg]:shrink-0 active:scale-[0.98] cursor-pointer", {
	variants: {
		variant: {
			default: "bg-surface-2 text-fg border border-border hover:border-border-strong",
			primary: "bg-accent text-accent-ink border border-accent shadow-glow font-bold",
			ghost: "bg-transparent text-muted hover:text-fg hover:bg-surface-2",
			danger: "bg-danger/15 text-danger border border-danger/40",
			outline: "bg-transparent border border-border text-fg hover:border-border-strong"
		},
		size: {
			sm: "h-9 px-3 text-xs rounded-lg",
			md: "h-11 px-4 text-sm rounded-xl",
			lg: "h-12 px-5 text-sm rounded-xl",
			icon: "size-10 rounded-xl",
			pill: "h-9 px-3.5 text-xs rounded-full"
		}
	},
	defaultVariants: {
		variant: "default",
		size: "md"
	}
});
var Button = import_react.forwardRef(({ className, variant, size, asChild, ...props }, ref) => {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(asChild ? Slot : "button", {
		className: cn(buttonVariants({
			variant,
			size
		}), className),
		ref,
		...props
	});
});
Button.displayName = "Button";
function Card({ className, ...props }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: cn("rounded-2xl border border-border bg-surface p-4 shadow-card", className),
		...props
	});
}
function CardTitle({ className, ...props }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: cn("mb-3 flex items-center justify-between gap-3 font-display text-base font-bold tracking-tight text-fg", className),
		...props
	});
}
var Input = import_react.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
	ref,
	className: cn("h-11 w-full rounded-xl border border-border bg-surface-2 px-3 text-sm font-semibold text-fg outline-none transition-[border-color,box-shadow] duration-150 placeholder:font-medium placeholder:text-faint focus:border-accent focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-accent)_18%,transparent)]", className),
	...props
}));
Input.displayName = "Input";
function Progress({ value, className, barClassName }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: cn("h-2 w-full overflow-hidden rounded-full bg-surface-3", className),
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: cn("h-full rounded-full bg-accent transition-[width] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]", barClassName),
			style: { width: `${Math.max(0, Math.min(100, value))}%` }
		})
	});
}
function getLocalDateKey(dateObj = /* @__PURE__ */ new Date()) {
	return `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, "0")}-${String(dateObj.getDate()).padStart(2, "0")}`;
}
function parseLocalDateKey(dateKeyStr) {
	if (!dateKeyStr || typeof dateKeyStr !== "string") return /* @__PURE__ */ new Date();
	const parts = dateKeyStr.split("-").map(Number);
	if (parts.length < 3 || isNaN(parts[0])) return /* @__PURE__ */ new Date();
	return new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0);
}
function addDays(date, days) {
	const result = new Date(date);
	result.setDate(result.getDate() + days);
	return result;
}
var ACCENT_PRESETS = [
	{
		id: "lime",
		label: "Lime",
		color: "#d3fd50",
		ink: "#16210a"
	},
	{
		id: "mint",
		label: "Mint",
		color: "#10b981",
		ink: "#04150a"
	},
	{
		id: "cyan",
		label: "Cyan",
		color: "#22d3ee",
		ink: "#04191d"
	},
	{
		id: "blue",
		label: "Blue",
		color: "#3b82f6",
		ink: "#f8fafc"
	},
	{
		id: "violet",
		label: "Violet",
		color: "#a855f7",
		ink: "#f8fafc"
	},
	{
		id: "pink",
		label: "Pink",
		color: "#f472b6",
		ink: "#2a0a1a"
	},
	{
		id: "orange",
		label: "Orange",
		color: "#fb923c",
		ink: "#241002"
	},
	{
		id: "amber",
		label: "Amber",
		color: "#fbbf24",
		ink: "#231803"
	},
	{
		id: "red",
		label: "Red",
		color: "#f87171",
		ink: "#2a0808"
	},
	{
		id: "slate",
		label: "Slate",
		color: "#94a3b8",
		ink: "#0b1220"
	}
];
var DEFAULT_ACCENT = ACCENT_PRESETS[0].color;
function accentInk(hex) {
	const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || "").trim());
	if (!m) return "#0b0c10";
	const int = parseInt(m[1], 16);
	const toLin = (c) => {
		const s = c / 255;
		return s <= .03928 ? s / 12.92 : Math.pow((s + .055) / 1.055, 2.4);
	};
	return .2126 * toLin(int >> 16 & 255) + .7152 * toLin(int >> 8 & 255) + .0722 * toLin(int & 255) > .45 ? "#0b1207" : "#f8fafc";
}
function accentText(hex, theme) {
	const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || "").trim());
	if (!m) return theme === "light" ? "#3f6212" : "#d3fd50";
	const int = parseInt(m[1], 16);
	let r = int >> 16 & 255, g = int >> 8 & 255, b = int & 255;
	const toLin = (c) => {
		const s = c / 255;
		return s <= .03928 ? s / 12.92 : Math.pow((s + .055) / 1.055, 2.4);
	};
	const lum = (r, g, b) => .2126 * toLin(r) + .7152 * toLin(g) + .0722 * toLin(b);
	const contrast = (l1, l2) => (Math.max(l1, l2) + .05) / (Math.min(l1, l2) + .05);
	const surfaceLum = theme === "light" ? lum(255, 255, 255) : lum(20, 23, 32);
	const target = 4;
	const step = theme === "light" ? .88 : 1.12;
	for (let i = 0; i < 24; i++) {
		if (contrast(lum(r, g, b), surfaceLum) >= target) break;
		r = Math.max(0, Math.min(255, Math.round(r * step)));
		g = Math.max(0, Math.min(255, Math.round(g * step)));
		b = Math.max(0, Math.min(255, Math.round(b * step)));
		if (theme === "light" && r + g + b === 0 || theme !== "light" && r === 255 && g === 255 && b === 255) break;
	}
	const hx = (c) => c.toString(16).padStart(2, "0");
	return "#" + hx(r) + hx(g) + hx(b);
}
function normalizeAccent(value) {
	const v = String(value || "").trim();
	return /^#[0-9a-fA-F]{6}$/.test(v) ? v : DEFAULT_ACCENT;
}
function resolveTheme(pref) {
	if (pref === "light" || pref === "dark") return pref;
	try {
		if (document.body.classList.contains("theme-light")) return "light";
		if (document.body.classList.contains("theme-dark")) return "dark";
		if (window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches) return "light";
	} catch (e) {}
	return "dark";
}
var DEFAULT_GOALS = {
	cals: 2400,
	protein: 160,
	carbs: 260,
	fat: 70,
	water: 3500,
	fiber: 35,
	calcium: 1e3,
	iron: 18,
	magnesium: 400,
	potassium: 3500,
	sodium: 2300,
	zinc: 11
};
var BASE_FOOD_LIBRARY = [
	{
		name: "Whole Eggs",
		serving: 100,
		unit: "g",
		cals: 143,
		p: 13,
		c: .7,
		f: 9.9,
		fiber: 0,
		sodium: 142,
		potassium: 138,
		calcium: 56,
		iron: 1.8,
		magnesium: 12,
		zinc: 1.3,
		isBase: true,
		usageCount: 15
	},
	{
		name: "Chicken Breast (Cooked)",
		serving: 100,
		unit: "g",
		cals: 165,
		p: 31,
		c: 0,
		f: 3.6,
		fiber: 0,
		sodium: 74,
		potassium: 256,
		calcium: 15,
		iron: 1,
		magnesium: 29,
		zinc: 1,
		isBase: true,
		usageCount: 20
	},
	{
		name: "White Rice (Cooked)",
		serving: 150,
		unit: "g",
		cals: 195,
		p: 4.1,
		c: 43,
		f: .4,
		fiber: .6,
		sodium: 1,
		potassium: 55,
		calcium: 16,
		iron: 1.8,
		magnesium: 19,
		zinc: .8,
		isBase: true,
		usageCount: 18
	},
	{
		name: "Egg Whites",
		serving: 100,
		unit: "g",
		cals: 52,
		p: 11,
		c: .7,
		f: .2,
		fiber: 0,
		sodium: 166,
		potassium: 163,
		calcium: 7,
		iron: .1,
		magnesium: 11,
		zinc: 0,
		isBase: true,
		usageCount: 12
	},
	{
		name: "Oatmeal (Dry)",
		serving: 50,
		unit: "g",
		cals: 190,
		p: 6.5,
		c: 34,
		f: 3.5,
		fiber: 5,
		sodium: 2,
		potassium: 180,
		calcium: 26,
		iron: 2.1,
		magnesium: 69,
		zinc: 1.5,
		isBase: true,
		usageCount: 14
	},
	{
		name: "Whey Protein Isolate",
		serving: 30,
		unit: "g",
		cals: 120,
		p: 25,
		c: 1.5,
		f: 1,
		fiber: 0,
		sodium: 140,
		potassium: 160,
		calcium: 130,
		iron: .4,
		magnesium: 20,
		zinc: .5,
		isBase: true,
		usageCount: 16
	},
	{
		name: "Greek / Plain Yogurt",
		serving: 150,
		unit: "g",
		cals: 90,
		p: 15,
		c: 5,
		f: .5,
		fiber: 0,
		sodium: 55,
		potassium: 210,
		calcium: 165,
		iron: .1,
		magnesium: 17,
		zinc: .9,
		isBase: true,
		usageCount: 10
	},
	{
		name: "Canned Tuna (Drained)",
		serving: 120,
		unit: "g",
		cals: 130,
		p: 29,
		c: 0,
		f: 1,
		fiber: 0,
		sodium: 380,
		potassium: 280,
		calcium: 12,
		iron: 1.6,
		magnesium: 34,
		zinc: .9,
		isBase: true,
		usageCount: 11
	},
	{
		name: "Pasta (Dry)",
		serving: 80,
		unit: "g",
		cals: 280,
		p: 10,
		c: 58,
		f: 1.2,
		fiber: 2.5,
		sodium: 5,
		potassium: 180,
		calcium: 18,
		iron: 1.4,
		magnesium: 42,
		zinc: 1.1,
		isBase: true,
		usageCount: 8
	},
	{
		name: "Olive Oil",
		serving: 14,
		unit: "g",
		cals: 120,
		p: 0,
		c: 0,
		f: 14,
		fiber: 0,
		sodium: 0,
		potassium: 0,
		calcium: 0,
		iron: .1,
		magnesium: 0,
		zinc: 0,
		isBase: true,
		usageCount: 9
	},
	{
		name: "Peanut Butter",
		serving: 32,
		unit: "g",
		cals: 190,
		p: 8,
		c: 7,
		f: 16,
		fiber: 2,
		sodium: 140,
		potassium: 210,
		calcium: 14,
		iron: .6,
		magnesium: 54,
		zinc: .9,
		isBase: true,
		usageCount: 6
	},
	{
		name: "Banana",
		serving: 118,
		unit: "g",
		cals: 105,
		p: 1.3,
		c: 27,
		f: .3,
		fiber: 3.1,
		sodium: 1,
		potassium: 422,
		calcium: 6,
		iron: .3,
		magnesium: 32,
		zinc: .2,
		isBase: true,
		usageCount: 10
	}
];
var BASE_EXERCISE_DB = [
	{
		name: "Incline Dumbbell Press",
		muscle: "Chest",
		subTarget: "Upper Pec (Clavicular)",
		targetKeys: ["chest"],
		position: "Lengthened (Stretch)",
		risk: "Low 🟢",
		tier: "S-Tier",
		isAxial: false,
		isBW: false
	},
	{
		name: "Incline Barbell Bench",
		muscle: "Chest",
		subTarget: "Upper Pec (Clavicular)",
		targetKeys: ["chest"],
		position: "Mid-Range",
		risk: "Moderate 🟡",
		tier: "A-Tier",
		isAxial: false,
		isBW: false
	},
	{
		name: "Smith Machine Incline Press",
		muscle: "Chest",
		subTarget: "Upper Pec (Clavicular)",
		targetKeys: ["chest"],
		position: "Lengthened (Stretch)",
		risk: "Low 🟢",
		tier: "S-Tier",
		isAxial: false,
		isBW: false
	},
	{
		name: "Low-to-High Cable Fly",
		muscle: "Chest",
		subTarget: "Upper Pec (Clavicular)",
		targetKeys: ["chest"],
		position: "Shortened (Peak)",
		risk: "Low 🟢",
		tier: "S-Tier",
		isAxial: false,
		isBW: false
	},
	{
		name: "High-to-Low Cable Fly",
		muscle: "Chest",
		subTarget: "Lower Pec (Costal)",
		targetKeys: ["chest"],
		position: "Shortened (Peak)",
		risk: "Low 🟢",
		tier: "S-Tier",
		isAxial: false,
		isBW: false
	},
	{
		name: "Flat Barbell Bench Press",
		muscle: "Chest",
		subTarget: "Mid/Lower Pec (Sternal)",
		targetKeys: ["chest"],
		position: "Mid-Range",
		risk: "Moderate 🟡",
		tier: "A-Tier",
		isAxial: false,
		isBW: false
	},
	{
		name: "Flat Dumbbell Press",
		muscle: "Chest",
		subTarget: "Mid/Lower Pec (Sternal)",
		targetKeys: ["chest"],
		position: "Lengthened (Stretch)",
		risk: "Low 🟢",
		tier: "S-Tier",
		isAxial: false,
		isBW: false
	},
	{
		name: "Pec Deck Fly (Machine)",
		muscle: "Chest",
		subTarget: "Mid/Lower Pec (Sternal)",
		targetKeys: ["chest"],
		position: "Shortened (Peak)",
		risk: "Low 🟢",
		tier: "S-Tier",
		isAxial: false,
		isBW: false
	},
	{
		name: "Bodyweight Chest Dips",
		muscle: "Chest",
		subTarget: "Lower Pec (Costal)",
		targetKeys: [
			"chest",
			"triceps",
			"triceps_back"
		],
		position: "Lengthened (Stretch)",
		risk: "Moderate 🟡",
		tier: "S-Tier",
		isAxial: false,
		isBW: true
	},
	{
		name: "Weighted Chest Dips",
		muscle: "Chest",
		subTarget: "Lower Pec (Costal)",
		targetKeys: [
			"chest",
			"triceps",
			"triceps_back"
		],
		position: "Lengthened (Stretch)",
		risk: "Moderate 🟡",
		tier: "S-Tier",
		isAxial: false,
		isBW: false
	},
	{
		name: "Machine Chest Press",
		muscle: "Chest",
		subTarget: "Mid/Lower Pec (Sternal)",
		targetKeys: ["chest"],
		position: "Mid-Range",
		risk: "Low 🟢",
		tier: "S-Tier",
		isAxial: false,
		isBW: false
	},
	{
		name: "Bodyweight Pull-ups",
		muscle: "Back",
		subTarget: "Lats (Vertical Pull)",
		targetKeys: ["upper_back", "biceps"],
		position: "Lengthened (Stretch)",
		risk: "Moderate 🟡",
		tier: "S-Tier",
		isAxial: false,
		isBW: true
	},
	{
		name: "Weighted Pull-ups / Chin-ups",
		muscle: "Back",
		subTarget: "Lats (Vertical Pull)",
		targetKeys: ["upper_back", "biceps"],
		position: "Lengthened (Stretch)",
		risk: "Moderate 🟡",
		tier: "S-Tier",
		isAxial: false,
		isBW: false
	},
	{
		name: "Lat Pulldown (Wide/Neutral)",
		muscle: "Back",
		subTarget: "Lats (Vertical Pull)",
		targetKeys: ["upper_back"],
		position: "Shortened (Peak)",
		risk: "Low 🟢",
		tier: "S-Tier",
		isAxial: false,
		isBW: false
	},
	{
		name: "Single-Arm Lat Cable Row",
		muscle: "Back",
		subTarget: "Lats (Iliac / Lower)",
		targetKeys: ["upper_back"],
		position: "Lengthened & Shortened",
		risk: "Low 🟢",
		tier: "S-Tier",
		isAxial: false,
		isBW: false
	},
	{
		name: "Single-Arm Dumbbell Row",
		muscle: "Back",
		subTarget: "Lats & Upper Back",
		targetKeys: ["upper_back"],
		position: "Lengthened (Stretch)",
		risk: "Low 🟢",
		tier: "S-Tier",
		isAxial: false,
		isBW: false
	},
	{
		name: "Chest-Supported T-Bar Row",
		muscle: "Back",
		subTarget: "Upper Back / Rhomboids",
		targetKeys: ["trapezius_back", "upper_back"],
		position: "Lengthened (Stretch)",
		risk: "Low 🟢",
		tier: "S-Tier",
		isAxial: false,
		isBW: false
	},
	{
		name: "Meadows Row",
		muscle: "Back",
		subTarget: "Upper Lats & Teres Major",
		targetKeys: ["upper_back"],
		position: "Lengthened (Stretch)",
		risk: "Low 🟢",
		tier: "S-Tier",
		isAxial: false,
		isBW: false
	},
	{
		name: "Barbell Bent-Over Row",
		muscle: "Back",
		subTarget: "Upper Back / Lats",
		targetKeys: [
			"upper_back",
			"trapezius_back",
			"lower_back"
		],
		position: "Mid-Range",
		risk: "High (Axial) 🔴",
		tier: "A-Tier",
		isAxial: true,
		isBW: false
	},
	{
		name: "Seated Cable Row (Wide)",
		muscle: "Back",
		subTarget: "Upper Back / Mid-Traps",
		targetKeys: ["trapezius_back", "upper_back"],
		position: "Shortened (Peak)",
		risk: "Low 🟢",
		tier: "A-Tier",
		isAxial: false,
		isBW: false
	},
	{
		name: "Barbell Deadlift",
		muscle: "Back",
		subTarget: "Erectors / Posterior Chain",
		targetKeys: [
			"lower_back",
			"hamstring",
			"gluteal"
		],
		position: "Mid-Range",
		risk: "High (Axial) 🔴",
		tier: "A-Tier",
		isAxial: true,
		isBW: false
	},
	{
		name: "Standing Overhead Press (OHP)",
		muscle: "Shoulders",
		subTarget: "Front Delt (Anterior)",
		targetKeys: [
			"deltoids",
			"triceps",
			"triceps_back"
		],
		position: "Mid-Range",
		risk: "High (Axial) 🔴",
		tier: "A-Tier",
		isAxial: true,
		isBW: false
	},
	{
		name: "Seated Dumbbell Shoulder Press",
		muscle: "Shoulders",
		subTarget: "Front Delt (Anterior)",
		targetKeys: [
			"deltoids",
			"triceps",
			"triceps_back"
		],
		position: "Lengthened (Stretch)",
		risk: "Moderate 🟡",
		tier: "A-Tier",
		isAxial: false,
		isBW: false
	},
	{
		name: "Machine Shoulder Press",
		muscle: "Shoulders",
		subTarget: "Front Delt (Anterior)",
		targetKeys: ["deltoids", "triceps"],
		position: "Mid-Range",
		risk: "Low 🟢",
		tier: "S-Tier",
		isAxial: false,
		isBW: false
	},
	{
		name: "Cable Lateral Raise",
		muscle: "Shoulders",
		subTarget: "Side Delt (Lateral)",
		targetKeys: ["deltoids", "deltoids_back"],
		position: "Lengthened (Stretch)",
		risk: "Low 🟢",
		tier: "S-Tier",
		isAxial: false,
		isBW: false
	},
	{
		name: "Cable Y-Raise",
		muscle: "Shoulders",
		subTarget: "Side Delt (Lateral)",
		targetKeys: ["deltoids", "deltoids_back"],
		position: "Lengthened & Shortened",
		risk: "Low 🟢",
		tier: "S-Tier",
		isAxial: false,
		isBW: false
	},
	{
		name: "Dumbbell Lateral Raise",
		muscle: "Shoulders",
		subTarget: "Side Delt (Lateral)",
		targetKeys: ["deltoids", "deltoids_back"],
		position: "Shortened (Peak)",
		risk: "Low 🟢",
		tier: "A-Tier",
		isAxial: false,
		isBW: false
	},
	{
		name: "Face Pulls",
		muscle: "Shoulders",
		subTarget: "Rear Delt (Posterior)",
		targetKeys: ["deltoids_back", "trapezius_back"],
		position: "Shortened (Peak)",
		risk: "Low 🟢",
		tier: "S-Tier",
		isAxial: false,
		isBW: false
	},
	{
		name: "Reverse Pec Deck",
		muscle: "Shoulders",
		subTarget: "Rear Delt (Posterior)",
		targetKeys: ["deltoids_back"],
		position: "Lengthened & Shortened",
		risk: "Low 🟢",
		tier: "S-Tier",
		isAxial: false,
		isBW: false
	},
	{
		name: "Standing Barbell / EZ-Bar Curl",
		muscle: "Biceps",
		subTarget: "Overall Biceps",
		targetKeys: ["biceps"],
		position: "Mid-Range",
		risk: "Low 🟢",
		tier: "A-Tier",
		isAxial: false,
		isBW: false
	},
	{
		name: "Dumbbell Preacher Curl",
		muscle: "Biceps",
		subTarget: "Short Head (Inner)",
		targetKeys: ["biceps"],
		position: "Lengthened (Stretch)",
		risk: "Moderate 🟡",
		tier: "S-Tier",
		isAxial: false,
		isBW: false
	},
	{
		name: "One-Arm Dumbbell Preacher Curl",
		muscle: "Biceps",
		subTarget: "Short Head (Inner / Unilateral)",
		targetKeys: ["biceps"],
		position: "Lengthened (Stretch)",
		risk: "Moderate 🟡",
		tier: "S-Tier",
		isAxial: false,
		isBW: false
	},
	{
		name: "Incline Dumbbell Curl",
		muscle: "Biceps",
		subTarget: "Long Head (Peak)",
		targetKeys: ["biceps"],
		position: "Lengthened (Stretch)",
		risk: "Low 🟢",
		tier: "S-Tier",
		isAxial: false,
		isBW: false
	},
	{
		name: "Bayesian Cable Curl",
		muscle: "Biceps",
		subTarget: "Long Head (Peak)",
		targetKeys: ["biceps"],
		position: "Lengthened (Stretch)",
		risk: "Low 🟢",
		tier: "S-Tier",
		isAxial: false,
		isBW: false
	},
	{
		name: "Hammer Curl (Dumbbell/Cable)",
		muscle: "Biceps",
		subTarget: "Brachialis & Forearms",
		targetKeys: ["biceps"],
		position: "Mid-Range",
		risk: "Low 🟢",
		tier: "S-Tier",
		isAxial: false,
		isBW: false
	},
	{
		name: "EZ Bar Skullcrusher",
		muscle: "Triceps",
		subTarget: "Long & Medial Head",
		targetKeys: ["triceps", "triceps_back"],
		position: "Lengthened (Stretch)",
		risk: "Moderate 🟡",
		tier: "S-Tier",
		isAxial: false,
		isBW: false
	},
	{
		name: "Standing Low Pulley Overhead Tricep Extension",
		muscle: "Triceps",
		subTarget: "Long Head (Lengthened)",
		targetKeys: ["triceps", "triceps_back"],
		position: "Lengthened (Stretch)",
		risk: "Low 🟢",
		tier: "S-Tier",
		isAxial: false,
		isBW: false
	},
	{
		name: "Cable Triceps Pushdown (Straight/V)",
		muscle: "Triceps",
		subTarget: "Lateral & Medial Head",
		targetKeys: ["triceps", "triceps_back"],
		position: "Shortened (Peak)",
		risk: "Low 🟢",
		tier: "S-Tier",
		isAxial: false,
		isBW: false
	},
	{
		name: "Hack Squat",
		muscle: "Legs",
		subTarget: "Quads (Knee Extensors)",
		targetKeys: ["quadriceps", "gluteal"],
		position: "Lengthened (Stretch)",
		risk: "Low 🟢",
		tier: "S-Tier",
		isAxial: false,
		isBW: false
	},
	{
		name: "Barbell Back Squat",
		muscle: "Legs",
		subTarget: "Quads & Glutes",
		targetKeys: [
			"quadriceps",
			"gluteal",
			"lower_back"
		],
		position: "Lengthened (Stretch)",
		risk: "High (Axial) 🔴",
		tier: "A-Tier",
		isAxial: true,
		isBW: false
	},
	{
		name: "Leg Press",
		muscle: "Legs",
		subTarget: "Quads & Adductors",
		targetKeys: ["quadriceps", "adductors"],
		position: "Lengthened (Stretch)",
		risk: "Low 🟢",
		tier: "S-Tier",
		isAxial: false,
		isBW: false
	},
	{
		name: "Leg Extensions",
		muscle: "Legs",
		subTarget: "Rectus Femoris",
		targetKeys: ["quadriceps"],
		position: "Shortened (Peak)",
		risk: "Low 🟢",
		tier: "S-Tier",
		isAxial: false,
		isBW: false
	},
	{
		name: "Bulgarian Split Squat",
		muscle: "Legs",
		subTarget: "Glutes & Quads",
		targetKeys: [
			"gluteal",
			"quadriceps",
			"adductors"
		],
		position: "Lengthened (Stretch)",
		risk: "Moderate 🟡",
		tier: "S-Tier",
		isAxial: false,
		isBW: false
	},
	{
		name: "Romanian Deadlift (DB/Barbell)",
		muscle: "Legs",
		subTarget: "Hamstrings (Lengthened)",
		targetKeys: [
			"hamstring",
			"gluteal",
			"lower_back"
		],
		position: "Lengthened (Stretch)",
		risk: "Moderate 🟡",
		tier: "S-Tier",
		isAxial: true,
		isBW: false
	},
	{
		name: "Seated Leg Curl",
		muscle: "Legs",
		subTarget: "Hamstrings (Knee Flexion)",
		targetKeys: ["hamstring"],
		position: "Lengthened (Stretch)",
		risk: "Low 🟢",
		tier: "S-Tier",
		isAxial: false,
		isBW: false
	},
	{
		name: "Lying Leg Curl",
		muscle: "Legs",
		subTarget: "Hamstrings (Shortened)",
		targetKeys: ["hamstring"],
		position: "Shortened (Peak)",
		risk: "Low 🟢",
		tier: "A-Tier",
		isAxial: false,
		isBW: false
	},
	{
		name: "Barbell / Machine Hip Thrust",
		muscle: "Legs",
		subTarget: "Glutes (Maximus)",
		targetKeys: ["gluteal"],
		position: "Shortened (Peak)",
		risk: "Low 🟢",
		tier: "S-Tier",
		isAxial: false,
		isBW: false
	},
	{
		name: "Standing Machine Calf Raise",
		muscle: "Legs",
		subTarget: "Calves (Gastrocnemius)",
		targetKeys: ["calves", "calves_back"],
		position: "Lengthened (Stretch)",
		risk: "Low 🟢",
		tier: "S-Tier",
		isAxial: false,
		isBW: false
	},
	{
		name: "Seated Calf Raise Machine",
		muscle: "Legs",
		subTarget: "Calves (Soleus)",
		targetKeys: ["calves", "calves_back"],
		position: "Lengthened (Stretch)",
		risk: "Low 🟢",
		tier: "S-Tier",
		isAxial: false,
		isBW: false
	}
];
var ROUTINE_PRESETS = {
	"Legs A (Quad / Squat Dominant)": [
		{ name: "Hack Squat" },
		{ name: "Romanian Deadlift (DB/Barbell)" },
		{ name: "Leg Extensions" },
		{ name: "Seated Leg Curl" },
		{ name: "Standing Machine Calf Raise" }
	],
	"Push B (Hypertrophy & Long Muscle Length)": [
		{ name: "Smith Machine Incline Press" },
		{ name: "Pec Deck Fly (Machine)" },
		{ name: "Machine Shoulder Press" },
		{ name: "Cable Y-Raise" },
		{ name: "Cable Triceps Pushdown (Straight/V)" },
		{ name: "Weighted Chest Dips" }
	],
	"Pull B (Back Width & Arm Bias)": [
		{ name: "Single-Arm Lat Cable Row" },
		{ name: "Seated Cable Row (Wide)" },
		{ name: "Reverse Pec Deck" },
		{ name: "Bayesian Cable Curl" },
		{ name: "Hammer Curl (Dumbbell/Cable)" }
	],
	"Legs B (Posterior Chain & Glute Bias)": [
		{ name: "Romanian Deadlift (DB/Barbell)" },
		{ name: "Leg Press" },
		{ name: "Lying Leg Curl" },
		{ name: "Barbell / Machine Hip Thrust" },
		{ name: "Seated Calf Raise Machine" }
	],
	"Upper A (Chest/Back/Shoulder Focus)": [
		{ name: "Incline Dumbbell Press" },
		{ name: "Chest-Supported T-Bar Row" },
		{ name: "Cable Lateral Raise" },
		{ name: "Lat Pulldown (Wide/Neutral)" },
		{ name: "Standing Low Pulley Overhead Tricep Extension" },
		{ name: "One-Arm Dumbbell Preacher Curl" }
	],
	"Rest & Active Recovery": []
};
var ROTATION_SEQUENCE = [
	"Legs A (Quad / Squat Dominant)",
	"Push B (Hypertrophy & Long Muscle Length)",
	"Pull B (Back Width & Arm Bias)",
	"Legs B (Posterior Chain & Glute Bias)",
	"Upper A (Chest/Back/Shoulder Focus)",
	"Rest & Active Recovery"
];
var SomaIntelligenceEngine = class {
	static calculate1RM(weight, reps) {
		const w = parseFloat(weight) || 0;
		const r = parseInt(reps) || 0;
		if (w <= 0 || r <= 0) return 0;
		if (r === 1) return w;
		const epley = w * (1 + r / 30);
		const brzycki = r < 37 ? w * (36 / (37 - r)) : epley;
		return Math.round((epley + brzycki) / 2 * 10) / 10;
	}
	static calculateWorkVolume(weight, reps, isBW = false, userBodyweight = 75) {
		const w = parseFloat(weight) || 0;
		const r = parseInt(reps) || 0;
		if (isBW && w === 0) return Math.round(userBodyweight * .65 * r);
		return Math.round(w * r);
	}
	static calculateCaloriesBurned(minutes, totalVolumeKg, totalSets, avgIntensity = 3) {
		const baseBurnPerMin = 6;
		const intensityMultiplier = .8 + avgIntensity * .12;
		const volumeBonus = totalVolumeKg * .0055;
		return Math.max(20, Math.round(minutes * baseBurnPerMin * intensityMultiplier + volumeBonus));
	}
	static calculatePlateStack(targetWeight, barWeight = 20, unit = "kg") {
		let perSide = (parseFloat(targetWeight) - barWeight) / 2;
		if (perSide <= 0) return [];
		const plateTypes = unit === "kg" ? [
			{
				weight: 25,
				color: "var(--soma-danger)"
			},
			{
				weight: 20,
				color: "#3b82f6"
			},
			{
				weight: 15,
				color: "#eab308"
			},
			{
				weight: 10,
				color: "var(--soma-accent)"
			},
			{
				weight: 5,
				color: "var(--soma-text)"
			},
			{
				weight: 2.5,
				color: "#64748b"
			},
			{
				weight: 1.25,
				color: "var(--soma-text-dim)"
			}
		] : [
			{
				weight: 45,
				color: "#3b82f6"
			},
			{
				weight: 35,
				color: "#eab308"
			},
			{
				weight: 25,
				color: "var(--soma-accent)"
			},
			{
				weight: 10,
				color: "var(--soma-text)"
			},
			{
				weight: 5,
				color: "#64748b"
			}
		];
		const EPSILON = .001;
		const plates = [];
		for (const p of plateTypes) while (perSide - p.weight >= -.001) {
			plates.push(p);
			perSide -= p.weight;
			if (perSide < EPSILON) perSide = 0;
		}
		return plates;
	}
	static calculateWarmupRamp(targetWeight, barWeight = 20, unit = "kg") {
		const target = parseFloat(targetWeight) || 0;
		return [
			.4,
			.6,
			.8
		].map((pct) => {
			let raw = target * pct;
			const increment = unit === "kg" ? 2.5 : 5;
			let rounded = Math.round(raw / increment) * increment;
			if (rounded < barWeight) rounded = barWeight;
			return {
				pct: Math.round(pct * 100),
				weight: rounded,
				plates: this.calculatePlateStack(rounded, barWeight, unit)
			};
		});
	}
	static computeOverloadRecommendation(lastSet, isBW = false) {
		if (!lastSet) return isBW ? {
			weight: 0,
			reps: 10,
			note: "BW Baseline Start",
			diffTier: "New"
		} : {
			weight: 20,
			reps: 10,
			note: "Baseline Start (Empty Bar / Light)",
			diffTier: "New"
		};
		const lastW = parseFloat(lastSet.weight) || 0;
		const lastR = parseInt(lastSet.reps) || (isBW ? 10 : 8);
		const lastFail = parseInt(lastSet.failure) || 3;
		if (lastFail === 1) {
			if (isBW && lastW === 0) return {
				weight: 0,
				reps: lastR + 2,
				note: `+2 Reps Target (Level 1 Easy RPE • Hit ${lastR}r)`,
				diffTier: "Lvl 1 (Surge)"
			};
			return {
				weight: lastW + 5,
				reps: Math.max(8, lastR - 2),
				note: `+5.0kg Aggressive Load Surge (Level 1 RPE)`,
				diffTier: "Lvl 1 (Surge)"
			};
		} else if (lastFail === 2) {
			if (isBW && lastW === 0) return {
				weight: 0,
				reps: lastR + 1,
				note: `+1 Rep Target (Level 2 Primed RPE)`,
				diffTier: "Lvl 2 (Overload)"
			};
			return {
				weight: lastW + 2.5,
				reps: Math.max(8, lastR - 1),
				note: `+2.5kg Load Overload (Level 2 RPE • Previous: ${lastW}kg)`,
				diffTier: "Lvl 2 (Overload)"
			};
		} else if (lastFail === 3) {
			if (lastR >= 12 && !isBW) return {
				weight: lastW + 2.5,
				reps: 8,
				note: `+2.5kg Step-Up (Reached 12-Rep Ceiling)`,
				diffTier: "Lvl 3 (Target)"
			};
			return {
				weight: lastW,
				reps: lastR + 1,
				note: `+1 Rep Consolidation (Target: ${lastR + 1}r @ ${lastW > 0 ? lastW + "kg" : "BW"})`,
				diffTier: "Lvl 3 (Target)"
			};
		} else return {
			weight: lastW,
			reps: lastR,
			note: `Hold Load & Solidify Form (Consolidate @ ${lastW > 0 ? lastW + "kg" : "BW"})`,
			diffTier: "Lvl 4-5 (Hold)"
		};
	}
	static loadIncrement(unit = "kg") {
		return unit === "lb" ? 5 : 2.5;
	}
	static computeVolumeTrend(history, exerciseName, lookback = 3) {
		if (!history || !exerciseName) return {
			points: [],
			direction: "unknown",
			stalled: false
		};
		const points = [];
		for (const session of Object.values(history)) {
			if (!session || !Array.isArray(session.exercises)) continue;
			const match = session.exercises.find((e) => e.name && e.name.toLowerCase() === exerciseName.toLowerCase());
			if (!match || !Array.isArray(match.sets)) continue;
			let best = 0;
			for (const s of match.sets) {
				if (s.type === "dropset" || s.type === "warmup" || !s.done) continue;
				const raw = parseFloat(s.weight) || 0;
				const w = match.usesBar && raw > 0 ? (match.barWeight || 20) + raw : raw;
				const est = this.calculate1RM(w, s.reps);
				if (est > best) best = est;
			}
			if (best > 0) points.push({
				timestamp: session.timestamp || 0,
				est1RM: best
			});
		}
		points.sort((a, b) => a.timestamp - b.timestamp);
		const recent = points.slice(-lookback);
		if (recent.length < 2) return {
			points: recent,
			direction: "unknown",
			stalled: false
		};
		const first = recent[0].est1RM;
		const pctChange = (recent[recent.length - 1].est1RM - first) / first * 100;
		let direction = "flat";
		if (pctChange > 1.5) direction = "up";
		else if (pctChange < -1.5) direction = "down";
		return {
			points: recent,
			direction,
			pctChange: Math.round(pctChange * 10) / 10,
			stalled: recent.length >= lookback && direction !== "up"
		};
	}
	static computeAutoregulatedTarget(lastSet, opts = {}) {
		const { isBW = false, readiness = null, isDeload = false, unit = "kg", trend = null } = opts;
		const base = this.computeOverloadRecommendation(lastSet, isBW);
		const inc = this.loadIncrement(unit);
		const lastW = parseFloat(lastSet && lastSet.weight) || 0;
		const lastR = parseInt(lastSet && lastSet.reps) || (isBW ? 10 : 8);
		const out = {
			...base,
			adjusted: false,
			autoNote: null,
			readiness
		};
		if (isDeload) return {
			...out,
			weight: isBW ? 0 : Math.max(0, Math.round(lastW * .6 / inc) * inc),
			reps: Math.max(5, Math.min(10, lastR)),
			adjusted: true,
			diffTier: "Deload",
			autoNote: "Deload week — 60% load, stop well short of failure.",
			note: "Deload: shed accumulated fatigue"
		};
		if (readiness !== null && readiness < 40) return {
			...out,
			weight: isBW ? 0 : Math.max(0, Math.round(lastW * .9 / inc) * inc),
			reps: Math.max(5, lastR - 1),
			adjusted: true,
			diffTier: "Under-recovered",
			autoNote: `Target muscle at ${readiness}% readiness — backing off 10%. Consider training something else today.`,
			note: "Autoregulated down: acute fatigue"
		};
		if (readiness !== null && readiness < 70) {
			const capped = !isBW && base.weight > lastW;
			return {
				...out,
				weight: capped ? lastW : base.weight,
				reps: capped ? lastR + 1 : base.reps,
				adjusted: capped,
				diffTier: capped ? "Hold (Recovering)" : base.diffTier,
				autoNote: capped ? `Only ${readiness}% recovered — holding load, chasing a rep instead of weight.` : `${readiness}% recovered — proceed as planned.`
			};
		}
		if (trend && trend.stalled && !isDeload) return {
			...out,
			weight: base.weight,
			reps: base.reps,
			adjusted: true,
			diffTier: "Stalled",
			autoNote: `No estimated-1RM gain across the last ${trend.points.length} sessions. Hold this load for a week, add a set, or swap the variation.`
		};
		if (readiness !== null && readiness >= 90) out.autoNote = `${readiness}% recovered — cleared for full progression.`;
		return out;
	}
	static get VOLUME_LANDMARKS() {
		return {
			chest: {
				mev: 8,
				mav: 16,
				mrv: 22,
				label: "Chest"
			},
			upper_back: {
				mev: 10,
				mav: 18,
				mrv: 25,
				label: "Back"
			},
			trapezius: {
				mev: 4,
				mav: 12,
				mrv: 20,
				label: "Traps"
			},
			trapezius_back: {
				mev: 4,
				mav: 12,
				mrv: 20,
				label: "Traps"
			},
			deltoids: {
				mev: 6,
				mav: 16,
				mrv: 24,
				label: "Front Delts"
			},
			deltoids_back: {
				mev: 6,
				mav: 16,
				mrv: 24,
				label: "Rear Delts"
			},
			biceps: {
				mev: 6,
				mav: 14,
				mrv: 20,
				label: "Biceps"
			},
			triceps: {
				mev: 6,
				mav: 14,
				mrv: 20,
				label: "Triceps"
			},
			triceps_back: {
				mev: 6,
				mav: 14,
				mrv: 20,
				label: "Triceps"
			},
			forearm: {
				mev: 2,
				mav: 8,
				mrv: 15,
				label: "Forearms"
			},
			forearm_back: {
				mev: 2,
				mav: 8,
				mrv: 15,
				label: "Forearms"
			},
			quadriceps: {
				mev: 8,
				mav: 16,
				mrv: 22,
				label: "Quads"
			},
			hamstring: {
				mev: 6,
				mav: 14,
				mrv: 20,
				label: "Hamstrings"
			},
			gluteal: {
				mev: 4,
				mav: 12,
				mrv: 18,
				label: "Glutes"
			},
			adductors: {
				mev: 4,
				mav: 10,
				mrv: 16,
				label: "Adductors"
			},
			adductors_back: {
				mev: 4,
				mav: 10,
				mrv: 16,
				label: "Adductors"
			},
			calves: {
				mev: 6,
				mav: 14,
				mrv: 22,
				label: "Calves"
			},
			calves_back: {
				mev: 6,
				mav: 14,
				mrv: 22,
				label: "Calves"
			},
			abs: {
				mev: 4,
				mav: 12,
				mrv: 20,
				label: "Abs"
			},
			obliques: {
				mev: 3,
				mav: 10,
				mrv: 16,
				label: "Obliques"
			},
			lower_back: {
				mev: 3,
				mav: 8,
				mrv: 14,
				label: "Lower Back"
			},
			tibialis: {
				mev: 2,
				mav: 6,
				mrv: 12,
				label: "Tibialis"
			},
			neck: {
				mev: 2,
				mav: 6,
				mrv: 12,
				label: "Neck"
			}
		};
	}
	static volumeStatus(sets, lm) {
		if (!lm) return {
			tier: "unknown",
			note: ""
		};
		if (sets === 0) return {
			tier: "none",
			note: "Not trained this week"
		};
		if (sets < lm.mev) return {
			tier: "under",
			note: `Below MEV (${lm.mev}) — add ${lm.mev - sets} set${lm.mev - sets === 1 ? "" : "s"}`
		};
		if (sets <= lm.mav) return {
			tier: "optimal",
			note: `In the productive range (${lm.mev}-${lm.mav})`
		};
		if (sets <= lm.mrv) return {
			tier: "high",
			note: `Above MAV (${lm.mav}) — sustainable only if recovery holds`
		};
		return {
			tier: "over",
			note: `Past MRV (${lm.mrv}) — cut ${sets - lm.mrv} set${sets - lm.mrv === 1 ? "" : "s"}`
		};
	}
	static weeklyVolumeByMuscle(history, days = 7, now = Date.now()) {
		const cutoff = now - days * 864e5;
		const totals = {};
		for (const session of Object.values(history || {})) {
			if (!session || typeof session !== "object") continue;
			if ((session.timestamp || 0) < cutoff) continue;
			for (const ex of session.exercises || []) {
				const keys = Array.isArray(ex.targetKeys) ? ex.targetKeys : [];
				if (!keys.length) continue;
				const working = (ex.sets || []).filter((s) => s.done && s.type !== "warmup" && s.type !== "dropset").length;
				if (!working) continue;
				for (const k of keys) totals[k] = (totals[k] || 0) + working;
			}
		}
		return totals;
	}
	static volumeReport(history, days = 7, now = Date.now()) {
		const lms = this.VOLUME_LANDMARKS;
		const cutoff = now - days * 864e5;
		const byLabel = {};
		for (const session of Object.values(history || {})) {
			if (!session || typeof session !== "object") continue;
			if ((session.timestamp || 0) < cutoff) continue;
			for (const ex of session.exercises || []) {
				const working = (ex.sets || []).filter((s) => s.done && s.type !== "warmup" && s.type !== "dropset").length;
				if (!working) continue;
				const labels = /* @__PURE__ */ new Set();
				for (const k of Array.isArray(ex.targetKeys) ? ex.targetKeys : []) if (lms[k]) labels.add(lms[k].label);
				for (const label of labels) byLabel[label] = (byLabel[label] || 0) + working;
			}
		}
		const seen = /* @__PURE__ */ new Set();
		const rows = [];
		for (const key of Object.keys(lms)) {
			const lm = lms[key];
			if (seen.has(lm.label)) continue;
			seen.add(lm.label);
			const sets = byLabel[lm.label] || 0;
			rows.push({
				key,
				label: lm.label,
				sets,
				...lm,
				...this.volumeStatus(sets, lm)
			});
		}
		const order = {
			over: 0,
			under: 1,
			none: 2,
			high: 3,
			optimal: 4
		};
		rows.sort((a, b) => order[a.tier] - order[b.tier] || b.sets - a.sets);
		return rows;
	}
	static restForSet(ex, set, allExercises, settings) {
		const def = settings && settings.restDefault || 90;
		if (!set) return {
			seconds: def,
			reason: "Standard rest"
		};
		if (set.type === "warmup") return {
			seconds: Math.min(30, Math.round(def * .3)),
			reason: "Warm-up — brief rest"
		};
		if (set.type === "dropset") return {
			seconds: 15,
			reason: "Drop set — minimal rest, keep the burn"
		};
		const group = ex && ex.supersetGroup;
		if (group) {
			const members = (allExercises || []).filter((e) => e.supersetGroup === group);
			if (members.length > 1) {
				const idx = members.findIndex((e) => e === ex);
				if (!(idx === members.length - 1)) {
					const next = members[idx + 1];
					return {
						seconds: 0,
						reason: `Superset ${group} — go straight to ${next.name}`,
						nextExercise: next.name
					};
				}
				return {
					seconds: def,
					reason: `End of superset ${group} — full rest`
				};
			}
		}
		return {
			seconds: def,
			reason: "Standard rest"
		};
	}
	static suggestAlternatives(exercise, exerciseDB, readinessByMuscle, limit = 3) {
		if (!exercise || !Array.isArray(exerciseDB)) return [];
		const own = new Set(Array.isArray(exercise.targetKeys) ? exercise.targetKeys : []);
		const readinessOf = (keys) => {
			const vals = (keys || []).map((k) => (readinessByMuscle || {})[k]).filter((v) => typeof v === "number");
			return vals.length ? Math.min(...vals) : 100;
		};
		const mine = readinessOf([...own]);
		return exerciseDB.filter((c) => c.name !== exercise.name).map((c) => {
			const keys = Array.isArray(c.targetKeys) ? c.targetKeys : [];
			return {
				ex: c,
				overlap: keys.filter((k) => own.has(k)).length,
				readiness: readinessOf(keys),
				isAxial: !!c.isAxial
			};
		}).filter((c) => {
			if (c.overlap === 0) return false;
			if (c.readiness > mine + 10) return true;
			const keys = new Set(Array.isArray(c.ex.targetKeys) ? c.ex.targetKeys : []);
			return [...own].some((k) => {
				const r = (readinessByMuscle || {})[k];
				return typeof r === "number" && r < 60 && !keys.has(k);
			}) && c.readiness >= mine;
		}).sort((a, b) => b.readiness - a.readiness || (a.isAxial === b.isAxial ? 0 : a.isAxial ? 1 : -1) || b.overlap - a.overlap).slice(0, limit).map((c) => ({
			name: c.ex.name,
			readiness: Math.round(c.readiness),
			subTarget: c.ex.subTarget || c.ex.muscle || "",
			isAxial: c.isAxial,
			note: c.isAxial ? "still axially loaded" : "lower spinal load"
		}));
	}
	static computeSubjectiveReadiness({ sleepHours = null, sleepQuality = null, soreness = null, stress = null } = {}) {
		const parts = [];
		if (sleepHours !== null && !isNaN(parseFloat(sleepHours))) {
			const h = parseFloat(sleepHours);
			parts.push({
				w: 2,
				v: Math.max(0, Math.min(100, (h - 4) / 4 * 100))
			});
		}
		if (sleepQuality !== null && !isNaN(parseInt(sleepQuality))) parts.push({
			w: 1,
			v: (Math.min(5, Math.max(1, parseInt(sleepQuality))) - 1) / 4 * 100
		});
		if (soreness !== null && !isNaN(parseInt(soreness))) parts.push({
			w: 1.5,
			v: (5 - Math.min(5, Math.max(1, parseInt(soreness)))) / 4 * 100
		});
		if (stress !== null && !isNaN(parseInt(stress))) parts.push({
			w: 1,
			v: (5 - Math.min(5, Math.max(1, parseInt(stress)))) / 4 * 100
		});
		if (!parts.length) return null;
		const wsum = parts.reduce((a, p) => a + p.w, 0);
		const score = parts.reduce((a, p) => a + p.w * p.v, 0) / wsum;
		return Math.round(Math.max(0, Math.min(100, score)));
	}
	static blendReadiness(muscleReadiness, subjective) {
		if (muscleReadiness === null || muscleReadiness === void 0) return subjective ?? null;
		if (subjective === null || subjective === void 0) return muscleReadiness;
		if (subjective >= 70) return muscleReadiness;
		const factor = .55 + subjective / 70 * .45;
		return Math.round(Math.max(10, muscleReadiness * factor));
	}
	static KCAL_PER_KG() {
		return 7700;
	}
	static nutritionSeries(nutritionDB) {
		const out = [];
		for (const [key, day] of Object.entries(nutritionDB || {})) {
			if (!/^\d{4}-\d{2}-\d{2}$/.test(key) || !day || typeof day !== "object") continue;
			const items = Array.isArray(day.items) ? day.items : [];
			const meals = day.meals && typeof day.meals === "object" ? Object.values(day.meals).flat().filter(Boolean) : [];
			const all = items.concat(meals);
			const cals = all.reduce((a, i) => a + (parseFloat(i && i.cals) || 0), 0);
			const weight = parseFloat(day.bodyWeight);
			out.push({
				date: key,
				cals: Math.round(cals),
				loggedFood: all.length > 0,
				weight: !isNaN(weight) && weight > 0 ? weight : null
			});
		}
		out.sort((a, b) => a.date.localeCompare(b.date));
		return out;
	}
	static computeMaintenanceCalories(nutritionDB, opts = {}) {
		const { minDays = 10, minFoodDays = 5, window = 28 } = opts;
		const series = this.nutritionSeries(nutritionDB);
		if (!series.length) return null;
		const recent = series.slice(-window);
		const weighed = recent.filter((d) => d.weight !== null);
		const fed = recent.filter((d) => d.loggedFood && d.cals > 0);
		if (weighed.length < 2 || fed.length < minFoodDays) return {
			ok: false,
			reason: weighed.length < 2 ? "Log your weight on at least two different days." : `Log food on ${minFoodDays - fed.length} more day${minFoodDays - fed.length === 1 ? "" : "s"}.`,
			foodDays: fed.length,
			weighDays: weighed.length
		};
		const first = weighed[0];
		const last = weighed[weighed.length - 1];
		const days = Math.round((parseLocalDateKey(last.date) - parseLocalDateKey(first.date)) / 864e5);
		if (days < minDays) return {
			ok: false,
			reason: `Needs ${minDays} days between weigh-ins — you have ${days}.`,
			foodDays: fed.length,
			weighDays: weighed.length
		};
		const avgIntake = fed.reduce((a, d) => a + d.cals, 0) / fed.length;
		const weightDelta = last.weight - first.weight;
		const dailyImbalance = weightDelta * this.KCAL_PER_KG() / days;
		return {
			ok: true,
			maintenance: Math.round(avgIntake - dailyImbalance),
			avgIntake: Math.round(avgIntake),
			weightDelta: Math.round(weightDelta * 100) / 100,
			days,
			foodDays: fed.length,
			weighDays: weighed.length,
			startWeight: first.weight,
			endWeight: last.weight,
			confidence: fed.length >= 14 && days >= 21 ? "good" : fed.length >= 8 && days >= 14 ? "fair" : "rough"
		};
	}
	static formulaMaintenance(weightKg) {
		const w = parseFloat(weightKg);
		return !isNaN(w) && w > 0 ? Math.round(w * 32) : null;
	}
	static proteinTargetFor(weightKg, perKg = 2) {
		const w = parseFloat(weightKg);
		const p = parseFloat(perKg);
		if (isNaN(w) || w <= 0) return null;
		return Math.round(w * (isNaN(p) || p <= 0 ? 2 : p));
	}
	static weekKeyOf(dateObj) {
		const d = new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate());
		const dow = (d.getDay() + 6) % 7;
		d.setDate(d.getDate() - dow);
		return getLocalDateKey(d);
	}
	static computeConsistency(history, opts = {}) {
		const { sessionsPerWeek = 4, weeks = 8, now = Date.now() } = opts;
		const byWeek = {};
		const dates = [];
		for (const [key, session] of Object.entries(history || {})) {
			if (!session || typeof session !== "object" || !Array.isArray(session.exercises)) continue;
			const ts = session.timestamp || (/^\d{4}-\d{2}-\d{2}$/.test(key) ? parseLocalDateKey(key).getTime() : 0);
			if (!ts) continue;
			const d = new Date(ts);
			const wk = this.weekKeyOf(d);
			byWeek[wk] = (byWeek[wk] || 0) + 1;
			dates.push(getLocalDateKey(d));
		}
		const thisWeek = this.weekKeyOf(new Date(now));
		const weekList = [];
		for (let i = 0; i < weeks; i++) {
			const d = parseLocalDateKey(thisWeek);
			d.setDate(d.getDate() - i * 7);
			const k = this.weekKeyOf(d);
			weekList.push({
				week: k,
				sessions: byWeek[k] || 0,
				hit: (byWeek[k] || 0) >= sessionsPerWeek
			});
		}
		let current = 0;
		for (let i = 0; i < weekList.length; i++) {
			if (weekList[i].hit) {
				current++;
				continue;
			}
			if (i === 0) continue;
			break;
		}
		const allWeeks = Object.keys(byWeek).sort();
		let best = 0, run = 0, cursor = null;
		for (const w of allWeeks) {
			if (cursor !== null) {
				if (Math.round((parseLocalDateKey(w) - parseLocalDateKey(cursor)) / 6048e5) > 1) run = 0;
			}
			run = byWeek[w] >= sessionsPerWeek ? run + 1 : 0;
			if (run > best) best = run;
			cursor = w;
		}
		const planned = weeks * sessionsPerWeek;
		const done = weekList.reduce((a, w) => a + Math.min(w.sessions, sessionsPerWeek), 0);
		return {
			currentStreak: current,
			bestStreak: Math.max(best, current),
			thisWeek: weekList[0].sessions,
			target: sessionsPerWeek,
			adherence: planned > 0 ? Math.round(done / planned * 100) : 0,
			weeks: weekList.reverse(),
			totalSessions: dates.length,
			weekDays: (() => {
				const start = parseLocalDateKey(thisWeek);
				const set = new Set(dates);
				return Array.from({ length: 7 }, (_, i) => {
					const d = new Date(start);
					d.setDate(d.getDate() + i);
					const key = getLocalDateKey(d);
					return {
						date: key,
						done: set.has(key),
						future: d.getTime() > now
					};
				});
			})()
		};
	}
	static strengthSeries(history, exerciseName) {
		if (!history || !exerciseName) return [];
		const points = [];
		for (const session of Object.values(history)) {
			if (!session || !Array.isArray(session.exercises)) continue;
			const match = session.exercises.find((e) => e.name && e.name.toLowerCase() === exerciseName.toLowerCase());
			if (!match || !Array.isArray(match.sets)) continue;
			let best = 0, bestSet = null, bestReps = 0, repsSet = null;
			for (const s of match.sets) {
				if (!s.done || s.type === "warmup" || s.type === "dropset") continue;
				const raw = parseFloat(s.weight) || 0;
				const w = match.usesBar && raw > 0 ? (match.barWeight || 20) + raw : raw;
				const reps = parseInt(s.reps) || 0;
				const est = this.calculate1RM(w, s.reps);
				if (est > best) {
					best = est;
					bestSet = {
						weight: w,
						reps
					};
				}
				if (reps > bestReps) {
					bestReps = reps;
					repsSet = {
						weight: w,
						reps
					};
				}
			}
			const ts = session.timestamp || 0;
			const dateStr = ts ? getLocalDateKey(new Date(ts)) : "";
			if (best > 0) points.push({
				timestamp: ts,
				date: dateStr,
				metric: "est1RM",
				est1RM: Math.round(best * 10) / 10,
				weight: bestSet.weight,
				reps: bestSet.reps,
				isPR: false
			});
			else if (bestReps > 0) points.push({
				timestamp: ts,
				date: dateStr,
				metric: "reps",
				est1RM: bestReps,
				weight: repsSet.weight,
				reps: repsSet.reps,
				isPR: false
			});
		}
		points.sort((a, b) => a.timestamp - b.timestamp);
		let running = 0;
		for (const p of points) {
			p.isPR = p.est1RM > running;
			if (p.isPR) running = p.est1RM;
		}
		return points;
	}
	static loggedExerciseNames(history) {
		const seen = /* @__PURE__ */ new Map();
		for (const session of Object.values(history || {})) {
			if (!session || !Array.isArray(session.exercises)) continue;
			for (const ex of session.exercises) {
				if (!ex.name) continue;
				if (!(ex.sets || []).some((s) => s.done && s.type !== "warmup" && s.type !== "dropset")) continue;
				const ts = session.timestamp || 0;
				if (!seen.has(ex.name) || seen.get(ex.name) < ts) seen.set(ex.name, ts);
			}
		}
		return [...seen.entries()].sort((a, b) => b[1] - a[1]).map((e) => e[0]);
	}
	static mergeRoutines(builtIn, custom) {
		const out = {};
		const removed = new Set(custom && custom._removed || []);
		for (const [name, list] of Object.entries(builtIn || {})) if (!removed.has(name)) out[name] = list;
		for (const [name, list] of Object.entries(custom || {})) {
			if (name.startsWith("_")) continue;
			if (Array.isArray(list)) out[name] = list;
		}
		return out;
	}
	static normalizeRoutine(list) {
		if (!Array.isArray(list)) return [];
		return list.map((i) => typeof i === "string" ? { name: i } : i).filter((i) => i && typeof i.name === "string" && i.name.trim()).map((i) => ({ name: i.name.trim() }));
	}
	static validateRoutineName(name, existing, originalName = null) {
		const n = (name || "").trim();
		if (!n) return {
			ok: false,
			error: "Give the routine a name."
		};
		if (n.length > 60) return {
			ok: false,
			error: "Name is too long (60 characters max)."
		};
		if (n.startsWith("_")) return {
			ok: false,
			error: "Names cannot start with an underscore."
		};
		if (n !== originalName && Object.prototype.hasOwnProperty.call(existing || {}, n)) return {
			ok: false,
			error: "A routine called that already exists."
		};
		return {
			ok: true,
			name: n
		};
	}
	static getProgramProjectedDay(targetDateObj, scheduleOverrides = {}) {
		const anchorDate = new Date(2026, 7, 23, 12, 0, 0);
		const targetMidday = new Date(targetDateObj.getFullYear(), targetDateObj.getMonth(), targetDateObj.getDate(), 12, 0, 0);
		const dateKey = getLocalDateKey(targetMidday);
		if (scheduleOverrides && scheduleOverrides[dateKey]) {
			const customSplit = scheduleOverrides[dateKey];
			return {
				split: customSplit,
				phase: "Custom Schedule Alignment",
				phaseBadge: "User Overridden",
				repScheme: "8–12 Reps • 2–3 RIR",
				isDeload: false,
				isRest: customSplit.toLowerCase().includes("rest")
			};
		}
		const diffTime = targetMidday.getTime() - anchorDate.getTime();
		const diffDays = Math.round(diffTime / 864e5);
		const totalWeeks = Math.max(1, Math.floor(diffDays / 7) + 1);
		let phase = "Mesocycle 1: Hypertrophy Foundation";
		let phaseBadge = `Meso 1 (W${totalWeeks}) • Base`;
		let repScheme = "8–12 Reps • 2–3 RIR";
		let isDeload = false;
		if (totalWeeks === 9 || totalWeeks === 18) {
			phase = "Deload & Connective Recovery";
			phaseBadge = "Deload Week • 50% Sets";
			repScheme = "8–10 Reps • 4–5 RIR";
			isDeload = true;
		} else if (totalWeeks >= 10 && totalWeeks <= 17) {
			phase = "Mesocycle 2: Strength & Load Progression";
			phaseBadge = `Meso 2 (W${totalWeeks - 9}) • Strength`;
			repScheme = "5–8 Reps • 1–2 RIR";
		}
		const seqLen = ROTATION_SEQUENCE.length;
		const splitName = ROTATION_SEQUENCE[(diffDays % seqLen + seqLen) % seqLen];
		const isRest = splitName.toLowerCase().includes("rest");
		return {
			split: splitName,
			phase,
			phaseBadge,
			repScheme,
			isDeload,
			isRest,
			weekNumber: totalWeeks
		};
	}
	static detectPersonalRecords(history, currentExerciseName, newWeight, newReps) {
		const w = parseFloat(newWeight) || 0;
		const r = parseInt(newReps) || 0;
		if (w <= 0 || r <= 0) return null;
		const currentEst1RM = this.calculate1RM(w, r);
		let maxPreviousWeight = 0;
		let maxPreviousRepsAtWeight = 0;
		let maxPreviousEst1RM = 0;
		for (const session of Object.values(history || {})) for (const ex of session.exercises || []) if (ex.name && ex.name.toLowerCase() === currentExerciseName.toLowerCase()) {
			for (const s of ex.sets || []) if (s.done && s.type !== "warmup") {
				const rawW = parseFloat(s.weight) || 0;
				const prevW = ex.usesBar && rawW > 0 ? (ex.barWeight || 20) + rawW : rawW;
				const prevR = parseInt(s.reps) || 0;
				if (prevW > maxPreviousWeight) maxPreviousWeight = prevW;
				if (prevW === w && prevR > maxPreviousRepsAtWeight) maxPreviousRepsAtWeight = prevR;
				const est = this.calculate1RM(prevW, prevR);
				if (est > maxPreviousEst1RM) maxPreviousEst1RM = est;
			}
		}
		const isWeightPR = maxPreviousWeight > 0 && w > maxPreviousWeight;
		const isRepPR = maxPreviousRepsAtWeight > 0 && r > maxPreviousRepsAtWeight;
		const isEst1RMPR = maxPreviousEst1RM > 0 && currentEst1RM > maxPreviousEst1RM;
		if (isWeightPR || isRepPR || isEst1RMPR) return {
			isWeightPR,
			isRepPR,
			isEst1RMPR,
			weight: w,
			reps: r,
			est1RM: currentEst1RM,
			prev1RM: maxPreviousEst1RM
		};
		return null;
	}
};
var TODAY = /* @__PURE__ */ new Date();
function dateKeyOffset(days) {
	const d = new Date(TODAY);
	d.setDate(d.getDate() + days);
	return getLocalDateKey(d);
}
function usesBar(name) {
	const n = name.toLowerCase();
	if (n.includes("dumbbell") || n.includes("cable") || n.includes("machine") || n.includes("pec deck")) return false;
	return /barbell|ez[- ]?(curl )?bar|ez bar|trap bar|hex bar|deadlift|smith/.test(n);
}
var LIFT_BASE = {
	"Hack Squat": 90,
	"Romanian Deadlift (DB/Barbell)": 80,
	"Leg Extensions": 45,
	"Seated Leg Curl": 40,
	"Standing Machine Calf Raise": 80,
	"Smith Machine Incline Press": 60,
	"Pec Deck Fly (Machine)": 40,
	"Machine Shoulder Press": 45,
	"Cable Y-Raise": 8,
	"Cable Triceps Pushdown (Straight/V)": 25,
	"Weighted Chest Dips": 10,
	"Single-Arm Lat Cable Row": 30,
	"Seated Cable Row (Wide)": 50,
	"Reverse Pec Deck": 30,
	"Bayesian Cable Curl": 15,
	"Hammer Curl (Dumbbell/Cable)": 16,
	"Leg Press": 160,
	"Lying Leg Curl": 40,
	"Barbell / Machine Hip Thrust": 90,
	"Seated Calf Raise Machine": 50,
	"Incline Dumbbell Press": 28,
	"Chest-Supported T-Bar Row": 50,
	"Cable Lateral Raise": 8,
	"Lat Pulldown (Wide/Neutral)": 55,
	"Standing Low Pulley Overhead Tricep Extension": 22,
	"One-Arm Dumbbell Preacher Curl": 12
};
function findEx(name) {
	return BASE_EXERCISE_DB.find((e) => e.name === name);
}
function buildSession(split, daysAgo, weekIndex) {
	const list = ROUTINE_PRESETS[split];
	if (!list || list.length === 0) return null;
	const d = new Date(TODAY);
	d.setDate(d.getDate() - daysAgo);
	d.setHours(18, 10, 0, 0);
	const bump = weekIndex * 2.5;
	const exercises = list.map((item) => {
		const data = findEx(item.name);
		const isBW = !!data?.isBW;
		const bar = usesBar(item.name);
		const base = LIFT_BASE[item.name] ?? (isBW ? 0 : 40);
		const w = isBW && base === 0 ? 0 : Math.round((base + bump) * 2) / 2;
		const sets = [
			0,
			1,
			2
		].map((i) => ({
			weight: w,
			reps: i === 2 ? 8 : 10,
			failure: i === 2 ? 3 : 2,
			done: true,
			type: "normal"
		}));
		return {
			name: item.name,
			muscle: data?.muscle || "Custom",
			subTarget: data?.subTarget || "",
			targetKeys: data?.targetKeys || [],
			position: data?.position || "",
			risk: data?.risk || "Low",
			tier: data?.tier || "A-Tier",
			isAxial: !!data?.isAxial,
			isBW,
			usesBar: bar,
			barWeight: 20,
			supersetGroup: "",
			sets
		};
	});
	const muscles = {};
	let totalVol = 0;
	let axialVol = 0;
	let totalSets = 0;
	let failSum = 0;
	for (const ex of exercises) {
		const working = ex.sets.filter((s) => s.done && s.type === "normal");
		totalSets += working.length;
		for (const s of working) {
			const vol = SomaIntelligenceEngine.calculateWorkVolume(s.weight || 0, Number(s.reps) || 0, ex.isBW);
			totalVol += vol;
			if (ex.isAxial) axialVol += vol;
			failSum += s.failure;
			for (const k of ex.targetKeys) {
				if (!muscles[k]) muscles[k] = {
					sets: 0,
					avgFail: 0
				};
				muscles[k].sets += 1;
				muscles[k].avgFail += s.failure;
			}
		}
	}
	for (const k of Object.keys(muscles)) {
		const m = muscles[k];
		m.avgFail = m.sets ? m.avgFail / m.sets : 3;
	}
	const mins = 48 + weekIndex % 3 * 6;
	const avgFail = totalSets ? failSum / totalSets : 3;
	return {
		timestamp: d.getTime(),
		split,
		durationFormatted: `${mins}:12`,
		caloriesBurned: SomaIntelligenceEngine.calculateCaloriesBurned(mins, totalVol, totalSets, avgFail),
		totalVol,
		totalSets,
		axialVol,
		exercises,
		muscles
	};
}
function seedHistory() {
	const out = {};
	for (let daysAgo = 56; daysAgo >= 1; daysAgo--) {
		const d = new Date(TODAY);
		d.setDate(d.getDate() - daysAgo);
		d.setHours(12, 0, 0, 0);
		const proj = SomaIntelligenceEngine.getProgramProjectedDay(d, {});
		if (proj.isRest) continue;
		const weekIndex = Math.floor((56 - daysAgo) / 7);
		const session = buildSession(proj.split, daysAgo, weekIndex);
		if (!session) continue;
		out[getLocalDateKey(d)] = session;
	}
	return out;
}
var MEAL_TEMPLATES = [
	{
		meal: "Breakfast",
		names: [
			"Whole Eggs",
			"Oatmeal (Dry)",
			"Banana"
		],
		servings: [
			1.5,
			1,
			1
		]
	},
	{
		meal: "Lunch",
		names: [
			"Chicken Breast (Cooked)",
			"White Rice (Cooked)",
			"Olive Oil"
		],
		servings: [
			1.8,
			1.2,
			1
		]
	},
	{
		meal: "Dinner",
		names: [
			"Canned Tuna (Drained)",
			"White Rice (Cooked)",
			"Greek / Plain Yogurt"
		],
		servings: [
			1,
			1,
			1
		]
	},
	{
		meal: "Post-Workout",
		names: ["Whey Protein Isolate", "Banana"],
		servings: [1, 1]
	},
	{
		meal: "Snacks",
		names: ["Peanut Butter", "Greek / Plain Yogurt"],
		servings: [.5, 1]
	}
];
function scaleFood(name, multiplier, meal) {
	const base = BASE_FOOD_LIBRARY.find((f) => f.name === name);
	if (!base) return null;
	const m = multiplier;
	return {
		name: base.name,
		serving: Math.round(base.serving * m),
		unit: base.unit,
		cals: Math.round(base.cals * m),
		p: Math.round(base.p * m * 10) / 10,
		c: Math.round(base.c * m * 10) / 10,
		f: Math.round(base.f * m * 10) / 10,
		fiber: Math.round((base.fiber || 0) * m * 10) / 10,
		sodium: Math.round((base.sodium || 0) * m),
		potassium: Math.round((base.potassium || 0) * m),
		calcium: Math.round((base.calcium || 0) * m),
		iron: Math.round((base.iron || 0) * m * 10) / 10,
		magnesium: Math.round((base.magnesium || 0) * m),
		zinc: Math.round((base.zinc || 0) * m * 10) / 10,
		meal
	};
}
function seedNutrition() {
	const out = {};
	const goals = {
		...DEFAULT_GOALS,
		cals: 2300,
		protein: 165
	};
	for (let daysAgo = 42; daysAgo >= 0; daysAgo--) {
		const key = dateKeyOffset(-daysAgo);
		const d = parseLocalDateKey(key);
		const skipFood = daysAgo === 2 || daysAgo === 11;
		const items = [];
		if (!skipFood) for (const tpl of MEAL_TEMPLATES) tpl.names.forEach((n, i) => {
			const jitter = .9 + (d.getDate() + i) % 5 * .04;
			const item = scaleFood(n, (tpl.servings[i] || 1) * jitter, tpl.meal);
			if (item) items.push(item);
		});
		const t = daysAgo / 42;
		const weight = Math.round((79.2 - t * 1.5 + Math.sin(daysAgo) * .12) * 10) / 10;
		const sleepHours = Math.round((7.1 + Math.sin(daysAgo * .7) * .8 + (daysAgo % 6 === 0 ? -.6 : .2)) * 4) / 4;
		out[key] = {
			goals: { ...goals },
			water: skipFood ? 1800 : 2800 + daysAgo % 4 * 250,
			bodyWeight: daysAgo % 2 === 0 ? weight : void 0,
			creatine: skipFood ? 0 : 5,
			items,
			sleep: {
				hours: Math.max(5.5, Math.min(9, sleepHours)),
				quality: sleepHours >= 7.5 ? 5 : sleepHours >= 6.5 ? 4 : 3
			},
			measurements: daysAgo % 7 === 0 ? {
				neck: 38.2,
				chest: 102 - t * .4,
				waist: 84 - t * 1.6,
				hips: 98 - t * .6,
				armL: 35.4 + t * .3,
				armR: 35.6 + t * .3,
				thighL: 58 - t * .4,
				thighR: 58.2 - t * .4,
				calf: 38
			} : void 0,
			readiness: {
				soreness: 2 + (daysAgo % 3 === 0 ? 1 : 0),
				stress: 2
			}
		};
	}
	return out;
}
function seedHabits() {
	const mk = (id, name, desc, color, goal, missEvery) => {
		const history = {};
		for (let i = 48; i >= 0; i--) {
			const key = dateKeyOffset(-i);
			history[key] = i % missEvery !== 0;
		}
		return {
			id,
			name,
			desc,
			color,
			goalDaysPerWeek: goal,
			history
		};
	};
	return [
		mk("gym-movement", "Train", "Hit the day's split", "#22c55e", 5, 6),
		mk("clean-nutrition", "Hit protein", "Land the protein target", "#38bdf8", 7, 9),
		mk("hydration", "Hydrate", "2.5 L of water", "#22d3ee", 7, 8),
		mk("deep-focus", "Deep work", "90 min focused sprint", "#94a3b8", 5, 5)
	];
}
function defaultSettings() {
	return {
		unit: "kg",
		barWeight: 20,
		restDefault: 90,
		autoRest: true,
		sound: true,
		confetti: true,
		theme: "dark",
		accent: "#d3fd50",
		sessionsPerWeek: 5,
		autoProteinTarget: true,
		proteinPerKg: 2,
		creatineStashGrams: 240,
		scheduleOverrides: {},
		customRoutines: {},
		customRoutinesRemoved: []
	};
}
function defaultLive(split) {
	return {
		startTime: Date.now(),
		split,
		exercises: [],
		undoStack: [],
		redoStack: [],
		finished: null,
		restEndsAt: null,
		restTotal: 90,
		readinessDismissed: false
	};
}
function emptyDay(weight = 78) {
	return {
		goals: { ...DEFAULT_GOALS },
		water: 0,
		bodyWeight: weight,
		creatine: 0,
		items: []
	};
}
function lastWeight(nutrition) {
	const keys = Object.keys(nutrition).filter((k) => nutrition[k]?.bodyWeight).sort();
	return (keys.length ? nutrition[keys[keys.length - 1]].bodyWeight : 78) || 78;
}
function exerciseUsesBar(name = "") {
	const n = name.toLowerCase();
	if (n.includes("dumbbell") || n.includes("cable") || n.includes("machine") || n.includes("pec deck")) return false;
	return /barbell|ez[- ]?(curl )?bar|ez bar|trap bar|hex bar|deadlift|smith/.test(n);
}
var SUPERSETS = [
	"",
	"A",
	"B",
	"C",
	"D"
];
var useSoma = create()(persist((set, get) => ({
	hydrated: false,
	seeded: false,
	settings: defaultSettings(),
	history: {},
	nutrition: {},
	habits: [],
	customExercises: [],
	customFoods: [],
	live: defaultLive("Legs A (Quad / Squat Dominant)"),
	activeDate: getLocalDateKey(/* @__PURE__ */ new Date()),
	tab: "workout",
	markHydrated: () => set({ hydrated: true }),
	ensureSeed: () => {
		if (get().seeded) return;
		const hist = seedHistory();
		const nutrition = seedNutrition();
		const today = getLocalDateKey(/* @__PURE__ */ new Date());
		const proj = SomaIntelligenceEngine.getProgramProjectedDay(/* @__PURE__ */ new Date(), {});
		set({
			seeded: true,
			history: hist,
			nutrition,
			habits: seedHabits(),
			live: defaultLive(proj.split),
			activeDate: today
		});
		if (!proj.isRest) get().loadSplit(proj.split);
	},
	setTab: (tab) => set({ tab }),
	setActiveDate: (d) => set({ activeDate: d }),
	patchSettings: (p) => set({ settings: {
		...get().settings,
		...p
	} }),
	ensureDay: (key) => {
		const k = key || get().activeDate;
		const nutrition = { ...get().nutrition };
		if (!nutrition[k]) {
			const w = lastWeight(nutrition);
			const s = get().settings;
			const goals = { ...DEFAULT_GOALS };
			if (s.autoProteinTarget) goals.protein = SomaIntelligenceEngine.proteinTargetFor(w, s.proteinPerKg) || goals.protein;
			nutrition[k] = emptyDay(w);
			nutrition[k].goals = goals;
			set({ nutrition });
		}
	},
	patchDay: (key, patch) => {
		const nutrition = { ...get().nutrition };
		nutrition[key] = {
			...nutrition[key] || emptyDay(),
			...patch
		};
		set({ nutrition });
	},
	addFood: (item) => {
		const k = get().activeDate;
		get().ensureDay(k);
		const day = get().nutrition[k];
		get().patchDay(k, { items: [...day.items, item] });
	},
	removeFood: (idx) => {
		const k = get().activeDate;
		const day = get().nutrition[k];
		if (!day) return;
		get().patchDay(k, { items: day.items.filter((_, i) => i !== idx) });
	},
	addWater: (ml) => {
		const k = get().activeDate;
		get().ensureDay(k);
		const day = get().nutrition[k];
		get().patchDay(k, { water: Math.max(0, (day.water || 0) + ml) });
	},
	addCreatine: (g) => {
		const k = get().activeDate;
		get().ensureDay(k);
		const day = get().nutrition[k];
		const s = get().settings;
		get().patchDay(k, { creatine: (day.creatine || 0) + g });
		get().patchSettings({ creatineStashGrams: Math.max(0, s.creatineStashGrams - g) });
	},
	resetCreatine: () => {
		const k = get().activeDate;
		const day = get().nutrition[k];
		if (!day) return;
		const cur = day.creatine || 0;
		get().patchDay(k, { creatine: 0 });
		get().patchSettings({ creatineStashGrams: get().settings.creatineStashGrams + cur });
	},
	logSleep: (hours, quality) => {
		const k = get().activeDate;
		get().ensureDay(k);
		get().patchDay(k, { sleep: {
			hours,
			quality
		} });
	},
	logWeight: (kg) => {
		const k = get().activeDate;
		get().ensureDay(k);
		get().patchDay(k, { bodyWeight: kg });
	},
	logMeasurements: (m) => {
		const k = get().activeDate;
		get().ensureDay(k);
		get().patchDay(k, { measurements: m });
	},
	logReadiness: (soreness, stress) => {
		const k = get().activeDate;
		get().ensureDay(k);
		get().patchDay(k, { readiness: {
			soreness,
			stress
		} });
	},
	toggleHabit: (id, date) => {
		const key = date || get().activeDate;
		set({ habits: get().habits.map((h) => h.id === id ? {
			...h,
			history: {
				...h.history,
				[key]: !h.history[key]
			}
		} : h) });
	},
	addHabit: (h) => {
		set({ habits: [...get().habits, {
			...h,
			id: `habit-${Date.now()}`,
			history: {}
		}] });
	},
	removeHabit: (id) => set({ habits: get().habits.filter((h) => h.id !== id) }),
	allExercises: () => [...BASE_EXERCISE_DB, ...get().customExercises],
	routines: () => SomaIntelligenceEngine.mergeRoutines(ROUTINE_PRESETS, {
		...get().settings.customRoutines,
		_removed: get().settings.customRoutinesRemoved
	}),
	lastPerformance: (name) => {
		let latest = 0;
		let top = null;
		for (const session of Object.values(get().history)) {
			if (!session?.exercises || (session.timestamp || 0) < latest) continue;
			const match = session.exercises.find((e) => e.name.toLowerCase() === name.toLowerCase());
			if (!match) continue;
			const completed = match.sets.filter((s) => s.type !== "warmup" && s.done);
			if (!completed.length) continue;
			latest = session.timestamp;
			top = completed.reduce((max, s) => (Number(s.weight) || 0) > (Number(max.weight) || 0) ? s : max);
		}
		return top;
	},
	loadSplit: (name) => {
		get().snapshot();
		const list = get().routines()[name] || [];
		const db = get().allExercises();
		const exercises = list.map((item) => makeSessionEx(item.name, db, get()));
		set({ live: {
			...get().live,
			split: name,
			exercises,
			finished: null,
			startTime: Date.now()
		} });
	},
	addExercise: (name) => {
		get().snapshot();
		const ex = makeSessionEx(name, get().allExercises(), get());
		set({ live: {
			...get().live,
			exercises: [...get().live.exercises, ex],
			finished: null
		} });
	},
	addCustomExercise: (ex) => {
		set({ customExercises: [...get().customExercises, ex] });
		get().addExercise(ex.name);
	},
	updateSet: (exIdx, setIdx, patch) => {
		const exercises = get().live.exercises.map((ex, i) => {
			if (i !== exIdx) return ex;
			return {
				...ex,
				sets: ex.sets.map((s, j) => j === setIdx ? {
					...s,
					...patch
				} : s)
			};
		});
		set({ live: {
			...get().live,
			exercises
		} });
	},
	addSet: (exIdx, type = "normal") => {
		get().snapshot();
		const exercises = get().live.exercises.map((ex, i) => {
			if (i !== exIdx) return ex;
			const last = ex.sets[ex.sets.length - 1];
			const weight = type === "dropset" && last && Number(last.weight) > 0 ? Math.round(Number(last.weight) * .8 * 2) / 2 : last?.weight ?? "";
			return {
				...ex,
				sets: [...ex.sets, {
					weight,
					reps: type === "dropset" ? 8 : last?.reps ?? 8,
					failure: type === "dropset" ? 4 : 2,
					done: false,
					type
				}]
			};
		});
		set({ live: {
			...get().live,
			exercises
		} });
	},
	removeSet: (exIdx, setIdx) => {
		get().snapshot();
		const exercises = get().live.exercises.map((ex, i) => i === exIdx ? {
			...ex,
			sets: ex.sets.filter((_, j) => j !== setIdx)
		} : ex);
		set({ live: {
			...get().live,
			exercises
		} });
	},
	removeExercise: (exIdx) => {
		get().snapshot();
		set({ live: {
			...get().live,
			exercises: get().live.exercises.filter((_, i) => i !== exIdx)
		} });
	},
	cycleSetType: (exIdx, setIdx) => {
		get().snapshot();
		const cycle = {
			normal: "dropset",
			dropset: "warmup",
			warmup: "normal"
		};
		const exercises = get().live.exercises.map((ex, i) => {
			if (i !== exIdx) return ex;
			return {
				...ex,
				sets: ex.sets.map((s, j) => j === setIdx ? {
					...s,
					type: cycle[s.type] || "dropset"
				} : s)
			};
		});
		set({ live: {
			...get().live,
			exercises
		} });
	},
	cycleSuperset: (exIdx) => {
		get().snapshot();
		const exercises = get().live.exercises.map((ex, i) => {
			if (i !== exIdx) return ex;
			const idx = SUPERSETS.indexOf(ex.supersetGroup || "");
			return {
				...ex,
				supersetGroup: SUPERSETS[(idx + 1) % SUPERSETS.length]
			};
		});
		set({ live: {
			...get().live,
			exercises
		} });
	},
	swapExercise: (exIdx, name) => {
		get().snapshot();
		const next = makeSessionEx(name, get().allExercises(), get());
		const exercises = get().live.exercises.map((ex, i) => i === exIdx ? next : ex);
		set({ live: {
			...get().live,
			exercises
		} });
	},
	snapshot: () => {
		const live = get().live;
		const undoStack = [...live.undoStack, JSON.stringify(live.exercises)].slice(-25);
		set({ live: {
			...live,
			undoStack,
			redoStack: []
		} });
	},
	undo: () => {
		const live = get().live;
		if (!live.undoStack.length) return;
		const redoStack = [...live.redoStack, JSON.stringify(live.exercises)];
		const undoStack = [...live.undoStack];
		const prev = undoStack.pop();
		set({ live: {
			...live,
			exercises: JSON.parse(prev),
			undoStack,
			redoStack
		} });
	},
	redo: () => {
		const live = get().live;
		if (!live.redoStack.length) return;
		const undoStack = [...live.undoStack, JSON.stringify(live.exercises)];
		const redoStack = [...live.redoStack];
		const next = redoStack.pop();
		set({ live: {
			...live,
			exercises: JSON.parse(next),
			undoStack,
			redoStack
		} });
	},
	startRest: (seconds) => {
		set({ live: {
			...get().live,
			restEndsAt: Date.now() + seconds * 1e3,
			restTotal: seconds
		} });
	},
	clearRest: () => set({ live: {
		...get().live,
		restEndsAt: null
	} }),
	saveWorkout: () => {
		const live = get().live;
		get().settings;
		let totalVol = 0;
		let totalSets = 0;
		let sumIntensity = 0;
		let axialVolume = 0;
		const muscles = {};
		for (const ex of live.exercises) for (const s of ex.sets) {
			if (!s.done || s.type === "warmup") continue;
			totalSets++;
			const w = Number(s.weight) || 0;
			const r = Number(s.reps) || 0;
			const vol = SomaIntelligenceEngine.calculateWorkVolume(w, r, ex.isBW);
			totalVol += vol;
			if (ex.isAxial) axialVolume += vol;
			sumIntensity += s.failure || 3;
			if (s.type === "dropset") continue;
			for (const k of ex.targetKeys) {
				if (!muscles[k]) muscles[k] = {
					sets: 0,
					avgFail: 0
				};
				muscles[k].sets += 1;
				muscles[k].avgFail += s.failure || 3;
			}
		}
		for (const k of Object.keys(muscles)) {
			const m = muscles[k];
			m.avgFail = m.sets ? m.avgFail / m.sets : 3;
		}
		const elapsedMinutes = Math.max(1, Math.round((Date.now() - live.startTime) / 6e4));
		const avgIntensity = totalSets ? sumIntensity / totalSets : 3;
		const caloriesBurned = SomaIntelligenceEngine.calculateCaloriesBurned(elapsedMinutes, totalVol, totalSets, avgIntensity);
		const mins = Math.floor(elapsedMinutes);
		const secs = Math.round((Date.now() - live.startTime) / 1e3 % 60);
		const session = {
			timestamp: Date.now(),
			split: live.split,
			durationFormatted: `${mins}:${String(secs).padStart(2, "0")}`,
			caloriesBurned,
			totalVol,
			totalSets,
			axialVol: axialVolume,
			exercises: live.exercises,
			muscles
		};
		if (totalSets === 0) return null;
		const key = get().activeDate;
		set({
			history: {
				...get().history,
				[key]: session
			},
			live: {
				...live,
				finished: session,
				restEndsAt: null
			}
		});
		return session;
	},
	resetLive: () => {
		set({ live: defaultLive(SomaIntelligenceEngine.getProgramProjectedDay(/* @__PURE__ */ new Date(), get().settings.scheduleOverrides).split) });
	},
	resumeFinished: () => set({ live: {
		...get().live,
		finished: null
	} }),
	saveRoutine: (name, list, original) => {
		const merged = get().routines();
		const check = SomaIntelligenceEngine.validateRoutineName(name, merged, original ?? null);
		if (!check.ok) return check.error;
		const custom = { ...get().settings.customRoutines };
		const removed = [...get().settings.customRoutinesRemoved];
		if (original && original !== check.name) delete custom[original];
		custom[check.name] = SomaIntelligenceEngine.normalizeRoutine(list);
		const idx = removed.indexOf(check.name);
		if (idx >= 0) removed.splice(idx, 1);
		get().patchSettings({
			customRoutines: custom,
			customRoutinesRemoved: removed
		});
		return null;
	},
	deleteRoutine: (name) => {
		const custom = { ...get().settings.customRoutines };
		delete custom[name];
		const removed = Array.from(/* @__PURE__ */ new Set([...get().settings.customRoutinesRemoved, name]));
		get().patchSettings({
			customRoutines: custom,
			customRoutinesRemoved: removed
		});
	},
	exportJson: () => JSON.stringify({
		settings: get().settings,
		history: get().history,
		nutrition: get().nutrition,
		habits: get().habits,
		customExercises: get().customExercises,
		customFoods: get().customFoods
	}, null, 2),
	importJson: (raw) => {
		try {
			const data = JSON.parse(raw);
			if (!data || typeof data !== "object") return false;
			set({
				settings: {
					...defaultSettings(),
					...data.settings || {}
				},
				history: data.history || {},
				nutrition: data.nutrition || {},
				habits: data.habits || seedHabits(),
				customExercises: data.customExercises || [],
				customFoods: data.customFoods || [],
				seeded: true
			});
			return true;
		} catch {
			return false;
		}
	},
	resetAll: () => {
		set({
			seeded: false,
			settings: defaultSettings(),
			history: {},
			nutrition: {},
			habits: [],
			customExercises: [],
			customFoods: [],
			live: defaultLive("Legs A (Quad / Squat Dominant)")
		});
		get().ensureSeed();
	}
}), {
	name: "soma-smart-coach-v1",
	skipHydration: true,
	partialize: (s) => ({
		seeded: s.seeded,
		settings: s.settings,
		history: s.history,
		nutrition: s.nutrition,
		habits: s.habits,
		customExercises: s.customExercises,
		customFoods: s.customFoods,
		live: s.live,
		activeDate: s.activeDate
	})
}));
function makeSessionEx(name, db, store) {
	const data = db.find((e) => e.name === name) || {
		name,
		muscle: "Custom",
		subTarget: "",
		targetKeys: [],
		position: "",
		risk: "Low",
		tier: "Custom",
		isAxial: false,
		isBW: false
	};
	const last = store.lastPerformance(name);
	const target = SomaIntelligenceEngine.computeOverloadRecommendation(last, data.isBW);
	const w = target.weight > 0 ? target.weight : data.isBW ? 0 : "";
	return {
		name: data.name,
		muscle: data.muscle,
		subTarget: data.subTarget,
		targetKeys: data.targetKeys || [],
		position: data.position,
		risk: data.risk,
		tier: data.tier,
		isAxial: !!data.isAxial,
		isBW: !!data.isBW,
		usesBar: exerciseUsesBar(data.name),
		barWeight: store.settings.barWeight,
		supersetGroup: "",
		sets: [
			{
				weight: w,
				reps: target.reps,
				failure: 2,
				done: false,
				type: "normal"
			},
			{
				weight: w,
				reps: target.reps,
				failure: 2,
				done: false,
				type: "normal"
			},
			{
				weight: w,
				reps: Math.max(6, target.reps - 1),
				failure: 3,
				done: false,
				type: "normal"
			}
		]
	};
}
var SITES = [
	{
		key: "neck",
		label: "Neck"
	},
	{
		key: "chest",
		label: "Chest"
	},
	{
		key: "waist",
		label: "Waist"
	},
	{
		key: "hips",
		label: "Hips"
	},
	{
		key: "armL",
		label: "Arm L"
	},
	{
		key: "armR",
		label: "Arm R"
	},
	{
		key: "thighL",
		label: "Thigh L"
	},
	{
		key: "thighR",
		label: "Thigh R"
	},
	{
		key: "calf",
		label: "Calf"
	}
];
function BodyView() {
	const [tab, setTab] = (0, import_react.useState)("weight");
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "space-y-3 pb-4",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "flex gap-1 overflow-x-auto rounded-full border border-border bg-surface p-1",
				children: [
					{
						id: "weight",
						label: "Weight",
						icon: Scale
					},
					{
						id: "sleep",
						label: "Sleep",
						icon: Moon
					},
					{
						id: "measure",
						label: "Tape",
						icon: Ruler
					},
					{
						id: "habits",
						label: "Habits",
						icon: Target
					},
					{
						id: "creatine",
						label: "Creatine",
						icon: Pill
					}
				].map((t) => {
					const Icon = t.icon;
					const on = tab === t.id;
					return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
						type: "button",
						onClick: () => setTab(t.id),
						className: cn("flex h-10 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-bold", on ? "bg-accent text-accent-ink" : "text-muted"),
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Icon, { className: "size-3.5" }), t.label]
					}, t.id);
				})
			}),
			tab === "weight" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(WeightPanel, {}),
			tab === "sleep" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SleepPanel, {}),
			tab === "measure" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(MeasurePanel, {}),
			tab === "habits" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(HabitsPanel, {}),
			tab === "creatine" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(CreatinePanel, {})
		]
	});
}
function WeightPanel() {
	const nutrition = useSoma((s) => s.nutrition);
	const logWeight = useSoma((s) => s.logWeight);
	const activeDate = useSoma((s) => s.activeDate);
	const settings = useSoma((s) => s.settings);
	const day = nutrition[activeDate] || {};
	const [val, setVal] = (0, import_react.useState)(String(day.bodyWeight || ""));
	const series = Object.keys(nutrition).filter((k) => nutrition[k]?.bodyWeight).sort().map((k) => ({
		date: k,
		w: nutrition[k].bodyWeight
	}));
	const last = series[series.length - 1];
	const prev = series[series.length - 2];
	const delta = last && prev ? last.w - prev.w : null;
	const protein = SomaIntelligenceEngine.proteinTargetFor(Number(val) || last?.w || 0, settings.proteinPerKg);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Card, { children: [
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)(CardTitle, { children: "Body weight" }),
		/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "flex items-center gap-2",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
				type: "number",
				step: "0.1",
				className: "text-center font-display text-2xl",
				value: val,
				onChange: (e) => setVal(e.target.value)
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
				className: "text-sm font-bold text-muted",
				children: "kg"
			})]
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
			variant: "primary",
			className: "mt-3 w-full",
			onClick: () => {
				logWeight(Number(val));
				toast.success("Weight saved");
			},
			children: ["Save for ", activeDate]
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "mt-3 grid grid-cols-2 gap-2 text-sm",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "rounded-xl bg-surface-2 p-3",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "text-[0.62rem] font-bold uppercase text-faint",
					children: "Change"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "font-display text-lg font-bold tabular",
					children: delta === null ? "—" : `${delta > 0 ? "+" : ""}${delta.toFixed(1)} kg`
				})]
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "rounded-xl bg-surface-2 p-3",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "text-[0.62rem] font-bold uppercase text-faint",
					children: "Protein target"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "font-display text-lg font-bold tabular",
					children: [protein ?? "—", " g"]
				})]
			})]
		})
	] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Card, { children: [
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)(CardTitle, { children: "Trend" }),
		series.length < 2 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
			className: "text-sm text-muted",
			children: "Log a few weigh-ins and the line appears."
		}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Spark, { points: series.map((s) => s.w) }),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "mt-3 max-h-40 overflow-y-auto",
			children: series.slice(-10).reverse().map((s) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex justify-between border-b border-border py-1.5 text-sm",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "text-muted",
					children: s.date
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
					className: "font-bold tabular",
					children: [s.w.toFixed(1), " kg"]
				})]
			}, s.date))
		})
	] })] });
}
function SleepPanel() {
	const nutrition = useSoma((s) => s.nutrition);
	const logSleep = useSoma((s) => s.logSleep);
	const activeDate = useSoma((s) => s.activeDate);
	const day = nutrition[activeDate] || {};
	const [hours, setHours] = (0, import_react.useState)(day.sleep?.hours ?? 7.5);
	const [quality, setQuality] = (0, import_react.useState)(day.sleep?.quality ?? 4);
	const series = Object.keys(nutrition).filter((k) => nutrition[k]?.sleep?.hours).sort().map((k) => ({
		date: k,
		hours: nutrition[k].sleep.hours,
		quality: nutrition[k].sleep.quality
	}));
	const last7 = series.slice(-7);
	const avg = last7.length ? last7.reduce((a, p) => a + p.hours, 0) / last7.length : null;
	const debt = avg !== null ? Math.max(0, (8 - avg) * 7) : null;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Card, { children: [
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)(CardTitle, { children: "Last night" }),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
			className: "mb-3 text-xs text-muted",
			children: "Time actually asleep, not time in bed."
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "flex items-center gap-2",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
					onClick: () => setHours(Math.max(0, hours - .25)),
					children: "−"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
					type: "number",
					step: "0.25",
					className: "text-center font-display text-2xl",
					value: hours,
					onChange: (e) => setHours(Number(e.target.value))
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
					onClick: () => setHours(hours + .25),
					children: "+"
				})
			]
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "mt-3 text-xs font-bold text-muted",
			children: "Quality"
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "mt-1 flex gap-2",
			children: [
				1,
				2,
				3,
				4,
				5
			].map((n) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
				type: "button",
				onClick: () => setQuality(n),
				className: cn("h-11 flex-1 rounded-xl border font-bold", n <= quality ? "border-accent-line bg-accent-soft text-accent-text" : "border-border bg-surface-2 text-faint"),
				children: n
			}, n))
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
			variant: "primary",
			className: "mt-3 w-full",
			onClick: () => {
				logSleep(hours, quality);
				toast.success("Sleep saved");
			},
			children: ["Save for ", activeDate]
		})
	] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Card, { children: [
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)(CardTitle, { children: "7-night snapshot" }),
		/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "grid grid-cols-2 gap-2",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "rounded-xl bg-surface-2 p-3",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "text-[0.62rem] font-bold uppercase text-faint",
					children: "Average"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "font-display text-lg font-bold tabular",
					children: avg === null ? "—" : `${avg.toFixed(1)} h`
				})]
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "rounded-xl bg-surface-2 p-3",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "text-[0.62rem] font-bold uppercase text-faint",
					children: "Sleep debt"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "font-display text-lg font-bold tabular",
					children: debt === null ? "—" : `${debt.toFixed(1)} h`
				})]
			})]
		}),
		series.length >= 2 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Spark, {
			points: series.slice(-14).map((s) => s.hours),
			className: "mt-3"
		})
	] })] });
}
function MeasurePanel() {
	const nutrition = useSoma((s) => s.nutrition);
	const logMeasurements = useSoma((s) => s.logMeasurements);
	const existing = nutrition[useSoma((s) => s.activeDate)]?.measurements || {};
	const [vals, setVals] = (0, import_react.useState)(() => Object.fromEntries(SITES.map((s) => [s.key, existing[s.key] != null ? String(existing[s.key]) : ""])));
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Card, { children: [
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)(CardTitle, { children: "Circumference" }),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
			className: "mb-3 text-xs text-muted",
			children: "Measure cold, same spots. Weekly is plenty."
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "space-y-2",
			children: SITES.map((s) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "grid grid-cols-[1fr_100px] items-center gap-2",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "text-sm font-semibold text-muted",
					children: s.label
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
					type: "number",
					step: "0.1",
					className: "h-10 text-center",
					placeholder: "cm",
					value: vals[s.key] || "",
					onChange: (e) => setVals({
						...vals,
						[s.key]: e.target.value
					})
				})]
			}, s.key))
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
			variant: "primary",
			className: "mt-3 w-full",
			onClick: () => {
				const m = {};
				for (const s of SITES) {
					const n = parseFloat(vals[s.key] || "");
					if (!isNaN(n) && n > 0) m[s.key] = n;
				}
				logMeasurements(m);
				toast.success("Measurements saved");
			},
			children: "Save"
		})
	] });
}
function HabitsPanel() {
	const habits = useSoma((s) => s.habits);
	const toggleHabit = useSoma((s) => s.toggleHabit);
	const addHabit = useSoma((s) => s.addHabit);
	const removeHabit = useSoma((s) => s.removeHabit);
	const activeDate = useSoma((s) => s.activeDate);
	const [name, setName] = (0, import_react.useState)("");
	const today = parseLocalDateKey(activeDate);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [habits.map((h) => {
		const done = !!h.history[activeDate];
		const week = Array.from({ length: 7 }, (_, i) => {
			const key = getLocalDateKey(addDays(startOfWeek(today), i));
			return {
				key,
				done: !!h.history[key]
			};
		});
		const weekDone = week.filter((d) => d.done).length;
		return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Card, { children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex items-start justify-between gap-3",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "font-display text-sm font-bold",
					children: h.name
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "text-xs text-muted",
					children: h.desc
				})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					type: "button",
					onClick: () => toggleHabit(h.id),
					className: cn("flex size-11 items-center justify-center rounded-full border", done ? "border-accent bg-accent text-accent-ink" : "border-border bg-surface-2 text-faint"),
					"aria-label": done ? "Uncheck habit" : "Complete habit",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Check, { className: "size-5" })
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "mt-3 flex gap-1.5",
				children: week.map((d) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					type: "button",
					onClick: () => toggleHabit(h.id, d.key),
					className: cn("h-6 flex-1 rounded-md", d.done ? "bg-accent" : "bg-surface-3"),
					"aria-label": d.key
				}, d.key))
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "mt-2 flex items-center justify-between text-[0.7rem] text-faint",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
					weekDone,
					"/7 this week · goal ",
					h.goalDaysPerWeek
				] }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					type: "button",
					className: "text-danger",
					onClick: () => removeHabit(h.id),
					children: "Remove"
				})]
			})
		] }, h.id);
	}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Card, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(CardTitle, { children: "New habit" }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "flex gap-2",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
			value: name,
			onChange: (e) => setName(e.target.value),
			placeholder: "e.g. Walk 8k steps"
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
			variant: "primary",
			onClick: () => {
				if (!name.trim()) return;
				addHabit({
					name: name.trim(),
					desc: "",
					color: "#d3fd50",
					goalDaysPerWeek: 7
				});
				setName("");
			},
			children: "Add"
		})]
	})] })] });
}
function CreatinePanel() {
	const nutrition = useSoma((s) => s.nutrition);
	const settings = useSoma((s) => s.settings);
	const addCreatine = useSoma((s) => s.addCreatine);
	const resetCreatine = useSoma((s) => s.resetCreatine);
	const activeDate = useSoma((s) => s.activeDate);
	let streak = 0;
	const today = parseLocalDateKey(activeDate);
	for (let i = 0; i < 60; i++) if ((nutrition[getLocalDateKey(addDays(today, -i))]?.creatine || 0) > 0) streak++;
	else if (i > 0) break;
	const sat = Math.min(100, Math.round(streak / 28 * 100));
	const todayDose = nutrition[activeDate]?.creatine || 0;
	const daysLeft = Math.floor(settings.creatineStashGrams / 5);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Card, { children: [
		/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "mb-2 flex items-center justify-between",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(CardTitle, {
				className: "mb-0",
				children: "Creatine saturation"
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Badge, {
				tone: sat >= 95 ? "accent" : "warn",
				children: [sat, "%"]
			})]
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Progress, { value: sat }),
		/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "mt-3 flex justify-between text-xs text-muted",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
				"Stash ",
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("b", {
					className: "text-fg",
					children: [settings.creatineStashGrams, "g"]
				}),
				" (",
				daysLeft,
				"d)"
			] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: ["Streak ", /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("b", {
				className: "text-fg",
				children: [streak, "d"]
			})] })]
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "mt-4 flex items-center justify-between",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
				className: "text-sm font-bold",
				children: [
					"Today ",
					todayDose,
					"g"
				]
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex gap-2",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
						size: "sm",
						onClick: () => addCreatine(3),
						children: "+3g"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
						size: "sm",
						variant: "primary",
						onClick: () => addCreatine(5),
						children: "+5g"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
						size: "sm",
						onClick: resetCreatine,
						children: "Reset"
					})
				]
			})]
		})
	] });
}
function Spark({ points, className }) {
	if (points.length < 2) return null;
	const max = Math.max(...points);
	const min = Math.min(...points);
	const range = Math.max(.1, max - min);
	const w = 320;
	const h = 72;
	const step = w / (points.length - 1);
	const d = points.map((p, i) => {
		const x = i * step;
		const y = 64 - (p - min) / range * 56;
		return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
	}).join(" ");
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", {
		viewBox: `0 0 ${w} ${h}`,
		className: cn("h-20 w-full", className),
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", {
			d,
			fill: "none",
			stroke: "var(--color-accent-text)",
			strokeWidth: "2.5",
			strokeLinejoin: "round"
		})
	});
}
function startOfWeek(d) {
	const x = new Date(d);
	const dow = x.getDay();
	x.setDate(x.getDate() + (dow === 0 ? -6 : 1 - dow));
	return x;
}
var BASE_RECOVERY_HOURS = {
	calves: 24,
	calves_back: 24,
	deltoids_back: 24,
	forearm: 24,
	forearm_back: 24,
	biceps: 36,
	deltoids: 36,
	chest: 48,
	upper_back: 48,
	trapezius: 48,
	trapezius_back: 48,
	triceps: 48,
	triceps_back: 48,
	gluteal: 48,
	adductors: 48,
	adductors_back: 48,
	quadriceps: 72,
	hamstring: 72,
	lower_back: 72,
	abs: 36,
	obliques: 36
};
var MUSCLE_REGIONS = [
	{
		key: "chest",
		label: "Chest",
		view: "front"
	},
	{
		key: "deltoids",
		label: "Front Delts",
		view: "front"
	},
	{
		key: "biceps",
		label: "Biceps",
		view: "front"
	},
	{
		key: "abs",
		label: "Abs",
		view: "front"
	},
	{
		key: "quadriceps",
		label: "Quads",
		view: "front"
	},
	{
		key: "adductors",
		label: "Adductors",
		view: "front"
	},
	{
		key: "forearm",
		label: "Forearms",
		view: "front"
	},
	{
		key: "calves",
		label: "Calves",
		view: "front"
	},
	{
		key: "upper_back",
		label: "Back",
		view: "back"
	},
	{
		key: "trapezius_back",
		label: "Traps",
		view: "back"
	},
	{
		key: "deltoids_back",
		label: "Rear Delts",
		view: "back"
	},
	{
		key: "triceps",
		label: "Triceps",
		view: "back"
	},
	{
		key: "lower_back",
		label: "Lower Back",
		view: "back"
	},
	{
		key: "gluteal",
		label: "Glutes",
		view: "back"
	},
	{
		key: "hamstring",
		label: "Hamstrings",
		view: "back"
	},
	{
		key: "calves_back",
		label: "Calves",
		view: "back"
	}
];
var EFFORT_MULTIPLIER = {
	1: .35,
	2: .6,
	3: 1,
	4: 1.3,
	5: 1.6
};
function computeBiologicalReadiness(history, now = Date.now()) {
	const latest = {};
	for (const session of Object.values(history || {})) {
		const sessionTime = session.timestamp || now;
		if (!session.muscles) continue;
		for (const [mKey, stats] of Object.entries(session.muscles)) if (!latest[mKey] || sessionTime > latest[mKey].timestamp) latest[mKey] = {
			timestamp: sessionTime,
			sets: stats.sets || 3,
			avgFail: stats.avgFail || 3
		};
	}
	const out = {};
	for (const region of MUSCLE_REGIONS) {
		const baseT = BASE_RECOVERY_HOURS[region.key] || 48;
		const stim = latest[region.key];
		if (!stim) {
			out[region.key] = {
				...region,
				recovery: 100,
				hoursLeft: 0,
				lastWorkedHours: null,
				effortNote: null
			};
			continue;
		}
		const elapsedHours = (now - stim.timestamp) / 36e5;
		const volumeFactor = Math.min(1.8, Math.max(.45, stim.sets / 3));
		const lo = Math.floor(stim.avgFail);
		const hi = Math.ceil(stim.avgFail);
		const effortFactor = lo === hi ? EFFORT_MULTIPLIER[lo] || 1 : (EFFORT_MULTIPLIER[lo] || 1) + ((EFFORT_MULTIPLIER[hi] || 1) - (EFFORT_MULTIPLIER[lo] || 1)) * (stim.avgFail - lo);
		const tTarget = Math.min(baseT * 2, Math.max(baseT * .3, baseT * volumeFactor * effortFactor));
		const readiness = Math.min(100, Math.pow(Math.max(0, elapsedHours) / tTarget, .8) * 100);
		const avgFail = stim.avgFail;
		out[region.key] = {
			...region,
			recovery: Math.round(readiness),
			hoursLeft: Math.max(0, Math.round(tTarget - elapsedHours)),
			lastWorkedHours: Math.round(elapsedHours),
			effortNote: avgFail <= 1.5 ? "Very Easy" : avgFail <= 2.5 ? "Easy" : avgFail <= 3.5 ? "Target" : avgFail <= 4.5 ? "Hard" : "True Failure"
		};
	}
	return out;
}
function heatColor(recovery) {
	if (recovery >= 90) return "#22c55e";
	if (recovery >= 70) return "#eab308";
	if (recovery >= 40) return "#f97316";
	return "#ef4444";
}
function heatLabel(recovery) {
	if (recovery >= 90) return "Primed";
	if (recovery >= 70) return "Ready";
	if (recovery >= 40) return "Repairing";
	return "Fatigued";
}
function InsightsView() {
	const [tab, setTab] = (0, import_react.useState)("overview");
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "space-y-3 pb-4",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "flex gap-1 rounded-full border border-border bg-surface p-1",
				children: [
					{
						id: "overview",
						label: "Overview"
					},
					{
						id: "strength",
						label: "Strength"
					},
					{
						id: "heatmap",
						label: "Heatmap"
					},
					{
						id: "calendar",
						label: "Calendar"
					}
				].map((t) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					type: "button",
					onClick: () => setTab(t.id),
					className: cn("h-10 flex-1 rounded-full text-xs font-bold", tab === t.id ? "bg-accent text-accent-ink" : "text-muted"),
					children: t.label
				}, t.id))
			}),
			tab === "overview" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(OverviewPanel, {}),
			tab === "strength" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(StrengthPanel, {}),
			tab === "heatmap" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(HeatmapPanel, {}),
			tab === "calendar" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(CalendarPanel, {})
		]
	});
}
function OverviewPanel() {
	const history = useSoma((s) => s.history);
	const settings = useSoma((s) => s.settings);
	const c = SomaIntelligenceEngine.computeConsistency(history, {
		sessionsPerWeek: settings.sessionsPerWeek,
		now: Date.now()
	});
	const rows = SomaIntelligenceEngine.volumeReport(history, 7, Date.now());
	const attention = rows.filter((r) => r.tier === "over" || r.tier === "under" || r.tier === "high").slice(0, 8);
	const shown = attention.length ? attention : rows.filter((r) => r.sets > 0).slice(0, 8);
	let axial = 0;
	let total = 0;
	let push = 0;
	let pull = 0;
	let leg = 0;
	const cutoff = Date.now() - 12096e5;
	for (const s of Object.values(history)) {
		if ((s.timestamp || 0) < cutoff) continue;
		total += s.totalVol || 0;
		axial += s.axialVol || 0;
		const n = (s.split || "").toLowerCase();
		if (n.includes("push") || n.includes("upper")) push += s.totalVol || 0;
		else if (n.includes("pull")) pull += s.totalVol || 0;
		else if (n.includes("leg")) leg += s.totalVol || 0;
	}
	const ppl = push + pull + leg || 1;
	const axialRatio = Math.round(axial / (total || 1) * 100);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
		/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Card, {
			className: "overflow-hidden bg-[linear-gradient(135deg,color-mix(in_srgb,var(--color-accent)_16%,transparent),transparent_55%),var(--color-surface)]",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Badge, {
					tone: "accent",
					children: "Training consistency"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "mt-2 grid grid-cols-3 gap-2",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Big, {
							n: `${c.currentStreak}`,
							l: "Week streak"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Big, {
							n: `${c.bestStreak}`,
							l: "Best"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Big, {
							n: `${c.adherence}%`,
							l: "Adherence"
						})
					]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "mt-4 flex gap-1.5",
					children: c.weekDays.map((d) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "flex flex-1 flex-col items-center gap-1",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "text-[0.58rem] font-bold uppercase text-faint",
							children: parseLocalDateKey(d.date).toLocaleDateString(void 0, { weekday: "narrow" })
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: cn("h-6 w-full rounded-md", d.done ? "bg-accent" : d.future ? "bg-surface-2" : "bg-surface-3") })]
					}, d.date))
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
					className: "mt-3 text-xs text-muted",
					children: [
						c.thisWeek,
						"/",
						c.target,
						" sessions this week · ",
						c.totalSessions,
						" logged total"
					]
				})
			]
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Card, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(CardTitle, { children: "Weekly volume vs landmarks" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "space-y-3",
			children: (shown.length ? shown : rows.slice(0, 8)).map((r) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "mb-1 flex items-center justify-between text-xs",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "font-bold",
					children: r.label
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
					className: "text-muted",
					children: [
						r.sets,
						" sets · ",
						r.note
					]
				})]
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Progress, {
				value: Math.min(100, r.sets / r.mrv * 100),
				barClassName: r.tier === "over" ? "bg-danger" : r.tier === "under" || r.tier === "none" ? "bg-warn" : "bg-accent"
			})] }, r.label))
		})] }),
		/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Card, { children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(CardTitle, { children: "CNS / axial load · 14d" }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "mb-2 flex justify-between text-sm font-bold",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "Spinal stress ratio" }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
					className: axialRatio > 40 ? "text-danger" : "text-accent-text",
					children: [axialRatio, "%"]
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Progress, {
				value: Math.min(100, axialRatio * 2),
				barClassName: axialRatio > 40 ? "bg-danger" : "bg-accent"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "mt-4 flex h-3 overflow-hidden rounded-full",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "bg-fg",
						style: { width: `${push / ppl * 100}%` }
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "bg-accent",
						style: { width: `${pull / ppl * 100}%` }
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "bg-warn",
						style: { width: `${leg / ppl * 100}%` }
					})
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "mt-2 flex justify-between text-[0.7rem] font-bold",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
						"Push ",
						Math.round(push / ppl * 100),
						"%"
					] }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
						className: "text-accent-text",
						children: [
							"Pull ",
							Math.round(pull / ppl * 100),
							"%"
						]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
						className: "text-warn",
						children: [
							"Legs ",
							Math.round(leg / ppl * 100),
							"%"
						]
					})
				]
			})
		] })
	] });
}
function StrengthPanel() {
	const history = useSoma((s) => s.history);
	const names = SomaIntelligenceEngine.loggedExerciseNames(history);
	const [pick, setPick] = (0, import_react.useState)(names[0] || "");
	const series = pick ? SomaIntelligenceEngine.strengthSeries(history, pick) : [];
	const prs = series.filter((p) => p.isPR).slice(-6).reverse();
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Card, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(CardTitle, { children: "Estimated 1RM" }), names.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
		className: "text-sm text-muted",
		children: "Log working sets to chart a lift."
	}) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)("select", {
			className: "h-11 w-full rounded-xl border border-border bg-surface-2 px-3 text-sm font-semibold",
			value: pick,
			onChange: (e) => setPick(e.target.value),
			children: names.map((n) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { children: n }, n))
		}),
		series.length >= 2 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", {
			viewBox: "0 0 320 90",
			className: "mt-3 h-24 w-full",
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("polyline", {
				fill: "none",
				stroke: "var(--color-accent-text)",
				strokeWidth: "2.5",
				points: sparkPoints(series.map((p) => p.est1RM))
			})
		}),
		series.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "mt-2 flex justify-between text-sm",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
				className: "text-muted",
				children: [series.length, " sessions"]
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
				className: "font-display text-lg font-extrabold tabular",
				children: [series[series.length - 1].est1RM, /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
					className: "text-xs text-muted",
					children: [" ", series[series.length - 1].metric]
				})]
			})]
		})
	] })] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Card, { children: [
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)(CardTitle, { children: "Recent PRs" }),
		prs.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
			className: "text-sm text-muted",
			children: "No PRs on this lift yet."
		}),
		prs.map((p) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "flex justify-between border-b border-border py-2 text-sm last:border-0",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
				className: "text-muted",
				children: p.date
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
				className: "font-bold tabular",
				children: [
					p.weight,
					" × ",
					p.reps,
					" · ",
					p.est1RM
				]
			})]
		}, p.date))
	] })] });
}
function HeatmapPanel() {
	const history = useSoma((s) => s.history);
	const [view, setView] = (0, import_react.useState)("front");
	const [sel, setSel] = (0, import_react.useState)("chest");
	const map = (0, import_react.useMemo)(() => computeBiologicalReadiness(history), [history]);
	const list = MUSCLE_REGIONS.filter((m) => m.view === view);
	const active = sel ? map[sel] : null;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "flex gap-1 rounded-full border border-border bg-surface p-1",
			children: ["front", "back"].map((v) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
				type: "button",
				onClick: () => setView(v),
				className: cn("h-10 flex-1 rounded-full text-xs font-bold uppercase", view === v ? "bg-accent text-accent-ink" : "text-muted"),
				children: v
			}, v))
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Card, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(CardTitle, { children: "Readiness" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "grid grid-cols-2 gap-2",
			children: list.map((m) => {
				const rec = map[m.key]?.recovery ?? 100;
				return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
					type: "button",
					onClick: () => setSel(m.key),
					className: cn("rounded-xl border p-3 text-left", sel === m.key ? "border-accent-line bg-accent-soft" : "border-border bg-surface-2"),
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "flex items-center justify-between",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "text-sm font-bold",
							children: m.label
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
							className: "text-xs font-extrabold tabular",
							style: { color: heatColor(rec) },
							children: [rec, "%"]
						})]
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "mt-2 h-1.5 overflow-hidden rounded-full bg-surface-3",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "h-full rounded-full",
							style: {
								width: `${rec}%`,
								background: heatColor(rec)
							}
						})
					})]
				}, m.key);
			})
		})] }),
		active && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Card, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "flex items-start justify-between",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "font-display text-base font-bold",
					children: active.label
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "mt-1 text-sm text-muted",
					children: [heatLabel(active.recovery), active.hoursLeft > 0 ? ` · ${active.hoursLeft}h remaining` : " · fully recovered"]
				}),
				active.lastWorkedHours != null && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "mt-1 text-xs text-faint",
					children: [
						"Last trained ",
						active.lastWorkedHours,
						"h ago",
						active.effortNote ? ` · ${active.effortNote}` : ""
					]
				})
			] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Badge, { children: [active.recovery, "%"] })]
		}) })
	] });
}
function CalendarPanel() {
	const history = useSoma((s) => s.history);
	const settings = useSoma((s) => s.settings);
	const setActiveDate = useSoma((s) => s.setActiveDate);
	const setTab = useSoma((s) => s.setTab);
	const [cursor, setCursor] = (0, import_react.useState)(() => /* @__PURE__ */ new Date());
	const year = cursor.getFullYear();
	const month = cursor.getMonth();
	const startPad = (new Date(year, month, 1).getDay() + 6) % 7;
	const daysIn = new Date(year, month + 1, 0).getDate();
	const cells = [...Array(startPad).fill(null), ...Array.from({ length: daysIn }, (_, i) => i + 1)];
	while (cells.length % 7) cells.push(null);
	const today = getLocalDateKey();
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Card, { children: [
		/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "mb-3 flex items-center justify-between",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					type: "button",
					className: "size-10 rounded-xl border border-border",
					onClick: () => setCursor(new Date(year, month - 1, 1)),
					"aria-label": "Previous month",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ChevronLeft, { className: "mx-auto size-4" })
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "font-display font-bold",
					children: cursor.toLocaleDateString(void 0, {
						month: "long",
						year: "numeric"
					})
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					type: "button",
					className: "size-10 rounded-xl border border-border",
					onClick: () => setCursor(new Date(year, month + 1, 1)),
					"aria-label": "Next month",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ChevronRight, { className: "mx-auto size-4" })
				})
			]
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "grid grid-cols-7 gap-1 text-center text-[0.62rem] font-bold uppercase text-faint",
			children: [
				"Mon",
				"Tue",
				"Wed",
				"Thu",
				"Fri",
				"Sat",
				"Sun"
			].map((d) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { children: d }, d))
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "mt-1 grid grid-cols-7 gap-1",
			children: cells.map((day, i) => {
				if (!day) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {}, i);
				const key = getLocalDateKey(new Date(year, month, day));
				const logged = !!history[key];
				const proj = SomaIntelligenceEngine.getProgramProjectedDay(new Date(year, month, day, 12), settings.scheduleOverrides);
				return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					type: "button",
					onClick: () => {
						setActiveDate(key);
						if (logged) setTab("workout");
					},
					className: cn("flex aspect-square flex-col items-center justify-center rounded-xl text-xs font-bold", key === today && "ring-1 ring-accent", logged ? "bg-accent text-accent-ink" : proj.isRest ? "bg-surface-2 text-faint" : "bg-surface-3 text-muted"),
					children: day
				}, key);
			})
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
			className: "mt-3 text-[0.7rem] text-faint",
			children: "Accent cells are logged sessions. Tap one to jump to that date."
		})
	] });
}
function Big({ n, l }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "font-display text-2xl font-extrabold tabular tracking-tight",
		children: n
	}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "text-[0.62rem] font-bold uppercase tracking-wider text-faint",
		children: l
	})] });
}
function sparkPoints(vals) {
	const max = Math.max(...vals);
	const min = Math.min(...vals);
	const range = Math.max(1, max - min);
	const step = vals.length > 1 ? 320 / (vals.length - 1) : 0;
	return vals.map((v, i) => {
		const x = i * step;
		const y = 80 - (v - min) / range * 70;
		return `${x.toFixed(1)},${y.toFixed(1)}`;
	}).join(" ");
}
var MEALS = [
	"Breakfast",
	"Lunch",
	"Dinner",
	"Post-Workout",
	"Snacks"
];
function NutritionView() {
	const nutrition = useSoma((s) => s.nutrition);
	const history = useSoma((s) => s.history);
	const activeDate = useSoma((s) => s.activeDate);
	const customFoods = useSoma((s) => s.customFoods);
	const ensureDay = useSoma((s) => s.ensureDay);
	const addFood = useSoma((s) => s.addFood);
	const removeFood = useSoma((s) => s.removeFood);
	const addWater = useSoma((s) => s.addWater);
	const settings = useSoma((s) => s.settings);
	const [query, setQuery] = (0, import_react.useState)("");
	const [meal, setMeal] = (0, import_react.useState)("Breakfast");
	const [openMeal, setOpenMeal] = (0, import_react.useState)("Breakfast");
	const [custom, setCustom] = (0, import_react.useState)({
		name: "",
		cals: 0,
		p: 0,
		c: 0,
		f: 0,
		serving: 100
	});
	(0, import_react.useEffect)(() => {
		ensureDay(activeDate);
	}, [activeDate, ensureDay]);
	const day = nutrition[activeDate] || {
		goals: { ...DEFAULT_GOALS },
		water: 0,
		items: []
	};
	const goals = day.goals || DEFAULT_GOALS;
	const items = day.items || [];
	const burn = history[activeDate]?.caloriesBurned || 0;
	const totals = items.reduce((a, i) => ({
		cals: a.cals + (i.cals || 0),
		p: a.p + (i.p || 0),
		c: a.c + (i.c || 0),
		f: a.f + (i.f || 0),
		fiber: a.fiber + (i.fiber || 0)
	}), {
		cals: 0,
		p: 0,
		c: 0,
		f: 0,
		fiber: 0
	});
	const goalCals = goals.cals + burn;
	const tdee = SomaIntelligenceEngine.computeMaintenanceCalories(nutrition);
	const formula = SomaIntelligenceEngine.formulaMaintenance(day.bodyWeight || 78) || 2400;
	const maintenance = tdee && tdee.ok ? tdee.maintenance : formula;
	const hits = (0, import_react.useMemo)(() => [...BASE_FOOD_LIBRARY, ...customFoods], [customFoods]).filter((f) => f.name.toLowerCase().includes(query.toLowerCase())).slice(0, 8);
	const addFromLib = (f, mealName) => {
		addFood({
			name: f.name,
			serving: f.serving,
			unit: f.unit,
			cals: f.cals,
			p: f.p,
			c: f.c,
			f: f.f,
			fiber: f.fiber || 0,
			sodium: f.sodium || 0,
			potassium: f.potassium || 0,
			calcium: f.calcium || 0,
			iron: f.iron || 0,
			magnesium: f.magnesium || 0,
			zinc: f.zinc || 0,
			meal: mealName
		});
		toast.success(`Added ${f.name}`);
		setQuery("");
	};
	const waterPct = Math.min(100, Math.round((day.water || 0) / (goals.water || 3500) * 100));
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "space-y-3 pb-4",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Card, {
				className: "overflow-hidden bg-[linear-gradient(135deg,color-mix(in_srgb,var(--color-accent)_16%,transparent),transparent_55%),var(--color-surface)]",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "flex items-start justify-between",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Badge, {
							tone: "accent",
							children: ["Diary · ", activeDate]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
							className: "mt-2 font-display text-xl font-extrabold tracking-tight",
							children: "Nutrition"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
							className: "mt-1 text-xs text-muted",
							children: [tdee && tdee.ok ? `Measured maintenance ${maintenance} kcal (${tdee.confidence})` : `Formula maintenance ${maintenance} kcal`, burn ? ` · +${burn} from training` : ""]
						})
					] })
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "mt-4",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "mb-1 flex justify-between text-xs font-bold",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "text-muted",
							children: "Calories"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
							className: "tabular",
							children: [
								Math.round(totals.cals),
								" / ",
								goalCals
							]
						})]
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Progress, { value: totals.cals / goalCals * 100 })]
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "grid grid-cols-3 gap-2",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Macro, {
						label: "Protein",
						used: totals.p,
						goal: goals.protein,
						unit: "g"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Macro, {
						label: "Carbs",
						used: totals.c,
						goal: goals.carbs,
						unit: "g"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Macro, {
						label: "Fat",
						used: totals.f,
						goal: goals.fat,
						unit: "g"
					})
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Card, { children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(CardTitle, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "Water" }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
					className: "tabular text-sm font-bold text-accent-text",
					children: [
						day.water || 0,
						" / ",
						goals.water,
						" ml"
					]
				})] }),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Progress, {
					value: waterPct,
					barClassName: "bg-info"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "mt-3 flex gap-2",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
						className: "flex-1",
						onClick: () => addWater(250),
						children: "+250 ml"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
						className: "flex-1",
						onClick: () => addWater(500),
						children: "+500 ml"
					})]
				})
			] }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Card, { children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(CardTitle, { children: "Add food" }),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "mb-2 flex gap-1 overflow-x-auto",
					children: MEALS.map((m) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						type: "button",
						onClick: () => setMeal(m),
						className: `h-9 shrink-0 rounded-full px-3 text-xs font-bold ${meal === m ? "bg-accent text-accent-ink" : "bg-surface-2 text-muted"}`,
						children: m
					}, m))
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
					placeholder: "Search chicken, rice, whey…",
					value: query,
					onChange: (e) => setQuery(e.target.value)
				}),
				query && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "mt-2 overflow-hidden rounded-xl border border-border",
					children: hits.map((f) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
						type: "button",
						onClick: () => addFromLib(f, meal),
						className: "flex w-full items-center justify-between border-b border-border px-3 py-2 text-left last:border-0 hover:bg-surface-2",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "text-sm font-bold",
							children: f.name
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
							className: "text-xs text-muted",
							children: [
								f.cals,
								" kcal · ",
								f.p,
								"p"
							]
						})]
					}, f.name))
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("details", {
					className: "mt-3",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("summary", {
						className: "cursor-pointer text-xs font-bold text-muted",
						children: "Quick custom item"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "mt-2 grid grid-cols-2 gap-2",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
								placeholder: "Name",
								value: custom.name,
								onChange: (e) => setCustom({
									...custom,
									name: e.target.value
								})
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
								type: "number",
								placeholder: "kcal",
								value: custom.cals || "",
								onChange: (e) => setCustom({
									...custom,
									cals: Number(e.target.value)
								})
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
								type: "number",
								placeholder: "P",
								value: custom.p || "",
								onChange: (e) => setCustom({
									...custom,
									p: Number(e.target.value)
								})
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
								type: "number",
								placeholder: "C",
								value: custom.c || "",
								onChange: (e) => setCustom({
									...custom,
									c: Number(e.target.value)
								})
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
								type: "number",
								placeholder: "F",
								value: custom.f || "",
								onChange: (e) => setCustom({
									...custom,
									f: Number(e.target.value)
								})
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
								variant: "primary",
								onClick: () => {
									if (!custom.name) return;
									addFood({
										name: custom.name,
										serving: custom.serving,
										unit: "g",
										cals: custom.cals,
										p: custom.p,
										c: custom.c,
										f: custom.f,
										fiber: 0,
										sodium: 0,
										potassium: 0,
										calcium: 0,
										iron: 0,
										magnesium: 0,
										zinc: 0,
										meal
									});
									setCustom({
										name: "",
										cals: 0,
										p: 0,
										c: 0,
										f: 0,
										serving: 100
									});
								},
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Plus, { className: "size-4" }), " Add"]
							})
						]
					})]
				})
			] }),
			MEALS.map((m) => {
				const group = items.map((it, idx) => ({
					it,
					idx
				})).filter(({ it }) => (it.meal || "Snacks") === m);
				const cals = group.reduce((a, g) => a + g.it.cals, 0);
				const p = group.reduce((a, g) => a + g.it.p, 0);
				const open = openMeal === m;
				return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Card, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
					type: "button",
					className: "flex w-full items-center justify-between",
					onClick: () => setOpenMeal(open ? "" : m),
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "font-display text-sm font-bold",
						children: m
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
						className: "text-xs font-bold text-muted",
						children: [
							Math.round(cals),
							" kcal · ",
							Math.round(p),
							"g P"
						]
					})]
				}), open && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "mt-3 space-y-1.5",
					children: [group.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "py-2 text-center text-xs text-faint",
						children: "Nothing logged"
					}), group.map(({ it, idx }) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(FoodRow, {
						item: it,
						onDelete: () => removeFood(idx)
					}, idx))]
				})] }, m);
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
				className: "px-1 text-[0.7rem] text-faint",
				children: [
					"Goals: ",
					goals.cals,
					" kcal · P ",
					goals.protein,
					" · C ",
					goals.carbs,
					" · F ",
					goals.fat,
					". Units ",
					settings.unit,
					"."
				]
			})
		]
	});
}
function Macro({ label, used, goal, unit }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "rounded-2xl border border-border bg-surface-2 p-3",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "text-[0.62rem] font-bold uppercase tracking-wider text-faint",
				children: label
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "mt-0.5 font-display text-lg font-extrabold tabular",
				children: [Math.round(used), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
					className: "text-xs font-bold text-muted",
					children: [
						"/",
						goal,
						unit
					]
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Progress, {
				className: "mt-2",
				value: used / goal * 100
			})
		]
	});
}
function FoodRow({ item, onDelete }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "flex items-center justify-between rounded-xl border border-border bg-surface-2 px-3 py-2",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "text-sm font-bold",
			children: item.name
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "text-[0.7rem] text-faint",
			children: [
				item.serving,
				item.unit,
				" · ",
				Math.round(item.cals),
				" kcal · ",
				item.p,
				"p ",
				item.c,
				"c ",
				item.f,
				"f"
			]
		})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
			type: "button",
			onClick: onDelete,
			className: "text-danger",
			"aria-label": "Remove food",
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Trash2, { className: "size-4" })
		})]
	});
}
function SettingsView() {
	const settings = useSoma((s) => s.settings);
	const patchSettings = useSoma((s) => s.patchSettings);
	const routinesFn = useSoma((s) => s.routines);
	const allExercises = useSoma((s) => s.allExercises);
	const saveRoutine = useSoma((s) => s.saveRoutine);
	const deleteRoutine = useSoma((s) => s.deleteRoutine);
	const exportJson = useSoma((s) => s.exportJson);
	const importJson = useSoma((s) => s.importJson);
	const resetAll = useSoma((s) => s.resetAll);
	const routines = routinesFn();
	const [editing, setEditing] = (0, import_react.useState)(null);
	const [rtName, setRtName] = (0, import_react.useState)("");
	const [rtList, setRtList] = (0, import_react.useState)([]);
	const [addEx, setAddEx] = (0, import_react.useState)("");
	const openEdit = (name) => {
		setEditing(name);
		setRtName(name);
		setRtList(SomaIntelligenceEngine.normalizeRoutine(routines[name] || []));
	};
	const download = () => {
		const blob = new Blob([exportJson()], { type: "application/json" });
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = `soma-backup.json`;
		a.click();
		URL.revokeObjectURL(url);
		toast.success("Backup downloaded");
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "space-y-3 pb-4",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Card, { children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(CardTitle, { children: "Appearance" }),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "mb-2 text-xs font-bold text-muted",
					children: "Theme"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "mb-4 grid grid-cols-3 gap-2",
					children: [
						"dark",
						"light",
						"system"
					].map((t) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						type: "button",
						onClick: () => patchSettings({ theme: t }),
						className: cn("h-11 rounded-xl border text-sm font-bold capitalize", settings.theme === t ? "border-accent bg-accent text-accent-ink" : "border-border bg-surface-2"),
						children: t
					}, t))
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "mb-2 text-xs font-bold text-muted",
					children: "Accent"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "grid grid-cols-5 gap-2",
					children: ACCENT_PRESETS.map((p) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						type: "button",
						"aria-label": p.label,
						onClick: () => patchSettings({ accent: p.color }),
						className: cn("aspect-square rounded-xl border-2", normalizeAccent(settings.accent).toLowerCase() === p.color.toLowerCase() ? "border-fg" : "border-transparent"),
						style: { background: p.color }
					}, p.id))
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "mt-3 flex items-center gap-2",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
						type: "color",
						value: normalizeAccent(settings.accent),
						onChange: (e) => patchSettings({ accent: e.target.value }),
						className: "h-10 w-12 cursor-pointer rounded-lg border border-border bg-surface-2"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "text-xs text-muted",
						children: "Or pick any colour"
					})]
				})
			] }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Card, { children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(CardTitle, { children: "Training" }),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
					label: "Unit",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("select", {
						className: "h-11 w-full rounded-xl border border-border bg-surface-2 px-3 text-sm font-semibold",
						value: settings.unit,
						onChange: (e) => patchSettings({ unit: e.target.value }),
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
							value: "kg",
							children: "Kilograms"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
							value: "lb",
							children: "Pounds"
						})]
					})
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
					label: "Bar weight",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
						type: "number",
						value: settings.barWeight,
						onChange: (e) => patchSettings({ barWeight: Number(e.target.value) })
					})
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
					label: "Default rest (seconds)",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
						type: "number",
						value: settings.restDefault,
						onChange: (e) => patchSettings({ restDefault: Number(e.target.value) })
					})
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
					label: "Sessions / week (streak target)",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
						type: "number",
						value: settings.sessionsPerWeek,
						onChange: (e) => patchSettings({ sessionsPerWeek: Number(e.target.value) })
					})
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "mt-3 flex items-center justify-between",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "text-sm font-semibold",
						children: "Auto rest timer"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Toggle, {
						on: settings.autoRest,
						onChange: (v) => patchSettings({ autoRest: v })
					})]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "mt-2 flex items-center justify-between",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "text-sm font-semibold",
						children: "Sounds"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Toggle, {
						on: settings.sound,
						onChange: (v) => patchSettings({ sound: v })
					})]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "mt-2 flex items-center justify-between",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "text-sm font-semibold",
						children: "Confetti on PRs"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Toggle, {
						on: settings.confetti,
						onChange: (v) => patchSettings({ confetti: v })
					})]
				})
			] }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Card, { children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(CardTitle, { children: "Nutrition" }),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex items-center justify-between",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "text-sm font-semibold",
						children: "Auto protein from bodyweight"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Toggle, {
						on: settings.autoProteinTarget,
						onChange: (v) => patchSettings({ autoProteinTarget: v })
					})]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
					label: "Protein g / kg",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
						type: "number",
						step: "0.1",
						value: settings.proteinPerKg,
						onChange: (e) => patchSettings({ proteinPerKg: Number(e.target.value) })
					})
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
					label: "Creatine stash (g)",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
						type: "number",
						value: settings.creatineStashGrams,
						onChange: (e) => patchSettings({ creatineStashGrams: Number(e.target.value) })
					})
				})
			] }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Card, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(CardTitle, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "Routines" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
				size: "sm",
				variant: "primary",
				onClick: () => {
					setEditing("__new");
					setRtName("");
					setRtList([]);
				},
				children: "New"
			})] }), editing === null ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "space-y-1",
				children: Object.keys(routines).map((name) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex items-center justify-between border-b border-border py-2",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "text-sm font-bold",
						children: name
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "text-[0.7rem] text-faint",
						children: [routines[name]?.length || 0, " movements"]
					})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "flex gap-1",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
							size: "sm",
							onClick: () => openEdit(name),
							children: "Edit"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
							size: "sm",
							variant: "danger",
							onClick: () => deleteRoutine(name),
							children: "Del"
						})]
					})]
				}, name))
			}) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
					label: "Name",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
						value: rtName,
						onChange: (e) => setRtName(e.target.value)
					})
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "mb-2 space-y-1",
					children: rtList.map((it, i) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "flex items-center justify-between text-sm",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: it.name }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex gap-1",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
									size: "sm",
									disabled: i === 0,
									onClick: () => {
										const next = [...rtList];
										[next[i - 1], next[i]] = [next[i], next[i - 1]];
										setRtList(next);
									},
									children: "Up"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
									size: "sm",
									disabled: i === rtList.length - 1,
									onClick: () => {
										const next = [...rtList];
										[next[i + 1], next[i]] = [next[i], next[i + 1]];
										setRtList(next);
									},
									children: "Down"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
									size: "sm",
									variant: "danger",
									onClick: () => setRtList(rtList.filter((_, j) => j !== i)),
									children: "×"
								})
							]
						})]
					}, `${it.name}-${i}`))
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex gap-2",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
							list: "ex-list",
							value: addEx,
							onChange: (e) => setAddEx(e.target.value),
							placeholder: "Add exercise"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("datalist", {
							id: "ex-list",
							children: allExercises().map((e) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: e.name }, e.name))
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
							onClick: () => {
								if (!addEx.trim()) return;
								setRtList([...rtList, { name: addEx.trim() }]);
								setAddEx("");
							},
							children: "Add"
						})
					]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "mt-3 flex gap-2",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
						className: "flex-1",
						onClick: () => setEditing(null),
						children: "Back"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
						variant: "primary",
						className: "flex-1",
						onClick: () => {
							const err = saveRoutine(rtName, rtList, editing === "__new" ? void 0 : editing);
							if (err) toast.error(err);
							else {
								toast.success("Routine saved");
								setEditing(null);
							}
						},
						children: "Save"
					})]
				})
			] })] }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Card, { children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(CardTitle, { children: "Data" }),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mb-3 text-xs text-muted",
					children: "Everything lives on this device. Export a JSON backup before you wipe."
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex flex-col gap-2",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
							onClick: download,
							children: "Download backup"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
							className: "flex h-11 cursor-pointer items-center justify-center rounded-xl border border-border bg-surface-2 text-sm font-semibold",
							children: ["Restore backup", /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
								type: "file",
								accept: "application/json",
								className: "hidden",
								onChange: async (e) => {
									const file = e.target.files?.[0];
									if (!file) return;
									const text = await file.text();
									if (importJson(text)) toast.success("Restored");
									else toast.error("Invalid backup");
								}
							})]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
							variant: "danger",
							onClick: () => {
								if (confirm("Reset all SOMA data to the demo log?")) {
									resetAll();
									toast.success("Reset to demo data");
								}
							},
							children: "Reset to demo"
						})
					]
				})
			] }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "px-1 text-center text-[0.7rem] text-faint",
				children: "SOMA Smart Coach · converted from the Obsidian suite · data never leaves this device"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Badge, {
				className: "mx-auto flex w-fit",
				children: "v5.1"
			})
		]
	});
}
function Field({ label, children }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
		className: "mb-3 block",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "mb-1 text-xs font-bold text-muted",
			children: label
		}), children]
	});
}
function Toggle({ on, onChange }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
		type: "button",
		role: "switch",
		"aria-checked": on,
		onClick: () => onChange(!on),
		className: cn("relative h-7 w-12 rounded-full transition-colors", on ? "bg-accent" : "bg-surface-3"),
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: cn("absolute top-0.5 size-6 rounded-full bg-fg transition-transform", on ? "translate-x-5" : "translate-x-0.5") })
	});
}
function playChime(type = "chime") {
	try {
		const ctx = new (window.AudioContext || window.webkitAudioContext)();
		const osc = ctx.createOscillator();
		const gain = ctx.createGain();
		osc.connect(gain);
		gain.connect(ctx.destination);
		if (type === "chime") {
			osc.frequency.setValueAtTime(880, ctx.currentTime);
			gain.gain.setValueAtTime(.12, ctx.currentTime);
			gain.gain.exponentialRampToValueAtTime(1e-4, ctx.currentTime + .45);
			osc.start();
			osc.stop(ctx.currentTime + .45);
		} else {
			osc.frequency.setValueAtTime(587.33, ctx.currentTime);
			osc.frequency.setValueAtTime(880, ctx.currentTime + .15);
			gain.gain.setValueAtTime(.16, ctx.currentTime);
			gain.gain.exponentialRampToValueAtTime(1e-4, ctx.currentTime + .65);
			osc.start();
			osc.stop(ctx.currentTime + .65);
		}
	} catch {}
}
function burstConfetti(container) {
	try {
		const canvas = document.createElement("canvas");
		canvas.className = "pointer-events-none absolute inset-0 z-50";
		container.appendChild(canvas);
		const ctx = canvas.getContext("2d");
		if (!ctx) return;
		canvas.width = container.clientWidth || 400;
		canvas.height = container.clientHeight || 640;
		const colors = [
			"#d3fd50",
			"#f59e0b",
			"#f5f7fa",
			"#34d399",
			"#60a5fa"
		];
		const particles = Array.from({ length: 42 }, () => ({
			x: canvas.width / 2,
			y: canvas.height / 3,
			vx: (Math.random() - .5) * 12,
			vy: (Math.random() - .7) * 14,
			size: Math.random() * 5 + 3,
			color: colors[Math.floor(Math.random() * colors.length)],
			alpha: 1
		}));
		let frames = 0;
		const render = () => {
			ctx.clearRect(0, 0, canvas.width, canvas.height);
			for (const p of particles) {
				p.x += p.vx;
				p.y += p.vy;
				p.vy += .35;
				p.alpha -= .02;
				ctx.fillStyle = p.color;
				ctx.globalAlpha = Math.max(0, p.alpha);
				ctx.beginPath();
				ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
				ctx.fill();
			}
			frames++;
			if (frames < 50) requestAnimationFrame(render);
			else canvas.remove();
		};
		render();
	} catch {}
}
var SUPERSET_COLOR = {
	A: "var(--color-accent)",
	B: "var(--color-info)",
	C: "var(--color-good)",
	D: "var(--color-warn)"
};
function WorkoutView() {
	const live = useSoma((s) => s.live);
	const settings = useSoma((s) => s.settings);
	const history = useSoma((s) => s.history);
	const nutrition = useSoma((s) => s.nutrition);
	const activeDate = useSoma((s) => s.activeDate);
	const routinesFn = useSoma((s) => s.routines);
	const loadSplit = useSoma((s) => s.loadSplit);
	const addExercise = useSoma((s) => s.addExercise);
	const addCustomExercise = useSoma((s) => s.addCustomExercise);
	const updateSet = useSoma((s) => s.updateSet);
	const addSet = useSoma((s) => s.addSet);
	const removeSet = useSoma((s) => s.removeSet);
	const removeExercise = useSoma((s) => s.removeExercise);
	const cycleSetType = useSoma((s) => s.cycleSetType);
	const cycleSuperset = useSoma((s) => s.cycleSuperset);
	const swapExercise = useSoma((s) => s.swapExercise);
	const undo = useSoma((s) => s.undo);
	const redo = useSoma((s) => s.redo);
	const startRest = useSoma((s) => s.startRest);
	const clearRest = useSoma((s) => s.clearRest);
	const saveWorkout = useSoma((s) => s.saveWorkout);
	const resetLive = useSoma((s) => s.resetLive);
	const resumeFinished = useSoma((s) => s.resumeFinished);
	const allExercises = useSoma((s) => s.allExercises);
	const logReadiness = useSoma((s) => s.logReadiness);
	const rootRef = (0, import_react.useRef)(null);
	const routines = routinesFn();
	const [now, setNow] = (0, import_react.useState)(Date.now());
	const [showSplits, setShowSplits] = (0, import_react.useState)(false);
	const [showSearch, setShowSearch] = (0, import_react.useState)(false);
	const [query, setQuery] = (0, import_react.useState)("");
	const [customOpen, setCustomOpen] = (0, import_react.useState)(false);
	const [customName, setCustomName] = (0, import_react.useState)("");
	const [customMuscle, setCustomMuscle] = (0, import_react.useState)("chest");
	const [soreness, setSoreness] = (0, import_react.useState)(3);
	const [stress, setStress] = (0, import_react.useState)(3);
	(0, import_react.useEffect)(() => {
		const id = setInterval(() => setNow(Date.now()), 250);
		return () => clearInterval(id);
	}, []);
	const proj = SomaIntelligenceEngine.getProgramProjectedDay(/* @__PURE__ */ new Date(), settings.scheduleOverrides);
	const day = nutrition[activeDate] || {};
	const readinessMap = (0, import_react.useMemo)(() => computeBiologicalReadiness(history, now), [history, now]);
	const elapsed = Math.max(0, Math.floor((now - live.startTime) / 1e3));
	const em = Math.floor(elapsed / 60);
	const es = elapsed % 60;
	const restLeft = live.restEndsAt ? Math.max(0, Math.ceil((live.restEndsAt - now) / 1e3)) : 0;
	const restPct = live.restTotal ? restLeft / live.restTotal : 0;
	let totalVol = 0;
	let totalSets = 0;
	let failSum = 0;
	for (const ex of live.exercises) for (const s of ex.sets) if (s.done && s.type !== "warmup") {
		totalSets++;
		totalVol += SomaIntelligenceEngine.calculateWorkVolume(Number(s.weight) || 0, Number(s.reps) || 0, ex.isBW);
		failSum += s.failure || 3;
	}
	const mins = Math.max(1, Math.round(elapsed / 60));
	const cals = SomaIntelligenceEngine.calculateCaloriesBurned(mins, totalVol, totalSets, totalSets ? failSum / totalSets : 3);
	const db = allExercises();
	const filtered = db.filter((ex) => {
		const q = query.toLowerCase();
		return ex.name.toLowerCase().includes(q) || (ex.subTarget || "").toLowerCase().includes(q) || (ex.muscle || "").toLowerCase().includes(q);
	}).slice(0, 12);
	const onCheck = (ex, exIdx, setIdx, done) => {
		updateSet(exIdx, setIdx, { done });
		if (done) {
			if (settings.sound) playChime("chime");
			const set = ex.sets[setIdx];
			const rest = SomaIntelligenceEngine.restForSet(ex, set, live.exercises, settings);
			if (settings.autoRest && rest.seconds > 0) startRest(rest.seconds);
			if (rest.nextExercise) toast(`Superset — go to ${rest.nextExercise}`);
			if (SomaIntelligenceEngine.detectPersonalRecords(history, ex.name, Number(set.weight) || 0, Number(set.reps) || 0)) {
				if (settings.sound) playChime("pr");
				if (settings.confetti && rootRef.current) burstConfetti(rootRef.current);
				toast.success(`PR on ${ex.name}`);
			}
		}
	};
	if (live.finished) {
		const f = live.finished;
		return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "space-y-3 pb-4",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "py-4 text-center",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Badge, {
							tone: "accent",
							children: "Session saved"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
							className: "mt-2 font-display text-2xl font-extrabold tracking-tight",
							children: "Workout summary"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mt-1 text-sm text-muted",
							children: f.split
						})
					]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "grid grid-cols-2 gap-2",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Stat, {
							label: "Duration",
							value: f.durationFormatted
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Stat, {
							label: "Burn",
							value: `${f.caloriesBurned} kcal`
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Stat, {
							label: "Volume",
							value: f.totalVol.toLocaleString()
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Stat, {
							label: "Sets",
							value: String(f.totalSets)
						})
					]
				}),
				f.exercises.map((ex) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Card, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "mb-2 font-bold",
					children: ex.name
				}), ex.sets.map((s, i) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex justify-between border-b border-border py-1.5 text-sm last:border-0",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
						className: "text-muted",
						children: [
							s.type === "warmup" ? "Warm-up" : s.type === "dropset" ? "Drop" : `Set ${i + 1}`,
							" · ",
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", {
								className: "text-fg",
								children: s.weight || 0
							}),
							" × ",
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("b", {
								className: "text-fg",
								children: s.reps || 0
							})
						]
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: s.done ? "text-accent-text" : "text-faint",
						children: s.done ? "Done" : "Skipped"
					})]
				}, i))] }, ex.name)),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex gap-2",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
						className: "flex-1",
						onClick: resumeFinished,
						children: "Edit session"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
						variant: "danger",
						onClick: resetLive,
						children: "New session"
					})]
				})
			]
		});
	}
	const answered = day.readiness?.soreness !== void 0;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		ref: rootRef,
		className: "relative space-y-3 pb-4",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Card, {
				className: "overflow-hidden bg-[linear-gradient(135deg,color-mix(in_srgb,var(--color-accent)_18%,transparent),transparent_55%),var(--color-surface)]",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex items-start justify-between gap-3",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Badge, {
							tone: "accent",
							children: ["Scheduled · ", getLocalDateKey()]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
							className: "mt-2 font-display text-xl font-extrabold tracking-tight",
							children: live.split
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
							className: "mt-1 text-xs text-muted",
							children: [
								proj.phase,
								" · ",
								proj.repScheme
							]
						})
					] }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Badge, {
						tone: proj.isDeload ? "warn" : "muted",
						children: proj.phaseBadge
					})]
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex items-center justify-between",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex items-center gap-1.5",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
						size: "icon",
						variant: "ghost",
						onClick: undo,
						"aria-label": "Undo",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Undo2, {})
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
						size: "icon",
						variant: "ghost",
						onClick: redo,
						"aria-label": "Redo",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Redo2, {})
					})]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "tabular rounded-xl border border-border bg-surface px-3 py-1.5 text-sm font-bold text-accent-text",
					children: [
						String(em).padStart(2, "0"),
						":",
						String(es).padStart(2, "0")
					]
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "grid grid-cols-2 gap-2",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Stat, {
						label: "Est. burn",
						value: `${cals} kcal`
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Stat, {
						label: `Volume (${settings.unit})`,
						value: totalVol.toLocaleString()
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Stat, {
						label: "Sets done",
						value: String(totalSets)
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Stat, {
						label: "Movements",
						value: String(live.exercises.length)
					})
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Card, {
				className: "flex items-center justify-between gap-3",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex items-center gap-3",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "relative size-14",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("svg", {
							viewBox: "0 0 54 54",
							className: "size-14 -rotate-90",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("circle", {
								cx: "27",
								cy: "27",
								r: "22",
								fill: "none",
								stroke: "var(--color-surface-3)",
								strokeWidth: "4"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("circle", {
								cx: "27",
								cy: "27",
								r: "22",
								fill: "none",
								stroke: "var(--color-accent)",
								strokeWidth: "4",
								strokeLinecap: "round",
								strokeDasharray: "138.23",
								strokeDashoffset: 138.23 * (1 - restPct)
							})]
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "absolute inset-0 flex items-center justify-center tabular text-xs font-bold",
							children: [restLeft, "s"]
						})]
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "text-sm font-bold",
						children: "Rest"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "text-xs text-muted",
						children: "Starts when you tick a set"
					})] })]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex gap-1.5",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
							size: "pill",
							onClick: () => startRest(60),
							children: "60s"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
							size: "pill",
							onClick: () => startRest(90),
							children: "90s"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
							size: "pill",
							variant: "danger",
							onClick: clearRest,
							children: "Stop"
						})
					]
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex flex-wrap gap-2",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
						className: "flex-1",
						onClick: () => setShowSplits((v) => !v),
						children: "Load split"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
						className: "flex-1",
						onClick: () => setShowSearch((v) => !v),
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Search, { className: "size-4" }), " Add"]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
						onClick: () => setCustomOpen(true),
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Plus, { className: "size-4" })
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
						variant: "primary",
						className: "flex-1",
						onClick: () => {
							if (!saveWorkout()) toast.error("Tick at least one working set first");
							else toast.success("Session saved");
						},
						children: "Save log"
					})
				]
			}),
			showSplits && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Card, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(CardTitle, { children: "Routines" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "flex flex-col gap-1.5",
				children: Object.keys(routines).map((name) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
					type: "button",
					onClick: () => {
						loadSplit(name);
						setShowSplits(false);
					},
					className: "flex items-center justify-between rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-left text-sm font-semibold hover:border-border-strong",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: name }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "text-xs text-faint",
						children: routines[name]?.length || 0
					})]
				}, name))
			})] }),
			showSearch && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Card, { children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(CardTitle, { children: "Add movement" }),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
					autoFocus: true,
					placeholder: "Search name or muscle",
					value: query,
					onChange: (e) => setQuery(e.target.value)
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "mt-2 max-h-48 overflow-y-auto rounded-xl border border-border",
					children: filtered.map((ex) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
						type: "button",
						onClick: () => {
							addExercise(ex.name);
							setShowSearch(false);
							setQuery("");
						},
						className: "flex w-full flex-col items-start border-b border-border px-3 py-2 text-left last:border-0 hover:bg-surface-2",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "text-sm font-bold",
							children: ex.name
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
							className: "text-xs text-muted",
							children: [
								ex.subTarget,
								" · ",
								ex.tier
							]
						})]
					}, ex.name))
				})
			] }),
			!answered && !live.readinessDismissed && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Card, { children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(CardTitle, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "Before you start" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "text-[0.62rem] font-bold uppercase tracking-wide text-faint",
					children: "Optional"
				})] }),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mb-3 text-xs text-muted",
					children: day.sleep?.hours ? `${day.sleep.hours}h sleep already logged this morning.` : "No sleep logged yet — it feeds into autoregulation."
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
					className: "mb-2 block text-xs font-bold text-muted",
					children: ["Soreness ", soreness]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
					type: "range",
					min: 1,
					max: 5,
					value: soreness,
					onChange: (e) => setSoreness(Number(e.target.value)),
					className: "mb-3 w-full accent-[var(--color-accent)]"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
					className: "mb-2 block text-xs font-bold text-muted",
					children: ["Stress ", stress]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
					type: "range",
					min: 1,
					max: 5,
					value: stress,
					onChange: (e) => setStress(Number(e.target.value)),
					className: "mb-3 w-full accent-[var(--color-accent)]"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex gap-2",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
						className: "flex-[0.6]",
						onClick: () => useSoma.setState({ live: {
							...live,
							readinessDismissed: true
						} }),
						children: "Skip"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
						variant: "primary",
						className: "flex-[1.4]",
						onClick: () => {
							logReadiness(soreness, stress);
							toast.success("Readiness saved");
						},
						children: "Save"
					})]
				})
			] }),
			live.exercises.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Card, {
				className: "py-10 text-center",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Timer, { className: "mx-auto mb-2 size-8 text-faint" }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "font-display text-lg font-bold",
						children: "Empty session"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mx-auto mt-1 max-w-xs text-sm text-muted",
						children: "Load today's split or add a movement to start logging."
					})
				]
			}),
			live.exercises.map((ex, exIdx) => {
				const last = useSoma.getState().lastPerformance(ex.name);
				const keys = ex.targetKeys || [];
				const muscleR = keys.length ? Math.min(...keys.map((k) => readinessMap[k]?.recovery ?? 100)) : null;
				const subj = SomaIntelligenceEngine.computeSubjectiveReadiness({
					sleepHours: day.sleep?.hours ?? null,
					sleepQuality: day.sleep?.quality ?? null,
					soreness: day.readiness?.soreness ?? null,
					stress: day.readiness?.stress ?? null
				});
				const target = SomaIntelligenceEngine.computeAutoregulatedTarget(last, {
					isBW: ex.isBW,
					readiness: SomaIntelligenceEngine.blendReadiness(muscleR, subj),
					isDeload: !!proj.isDeload,
					unit: settings.unit,
					trend: SomaIntelligenceEngine.computeVolumeTrend(history, ex.name)
				});
				const color = SUPERSET_COLOR[ex.supersetGroup] || "";
				const alts = target.diffTier === "Under-recovered" ? SomaIntelligenceEngine.suggestAlternatives(ex, db, Object.fromEntries(Object.entries(readinessMap).map(([k, v]) => [k, v.recovery]))) : [];
				return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Card, {
					className: "space-y-2",
					style: color ? { borderLeft: `4px solid ${color}` } : void 0,
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex items-start justify-between gap-2",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "font-display text-[0.95rem] font-bold",
								children: [
									exIdx + 1,
									". ",
									ex.name
								]
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "mt-1 flex flex-wrap gap-1",
								children: [
									ex.supersetGroup && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Badge, {
										tone: "accent",
										children: ["Superset ", ex.supersetGroup]
									}),
									ex.isBW && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Badge, {
										tone: "good",
										children: "Bodyweight"
									}),
									ex.subTarget && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Badge, { children: ex.subTarget }),
									ex.isAxial && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Badge, {
										tone: "danger",
										children: "Axial"
									})
								]
							})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "flex gap-1",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
									size: "icon",
									variant: "ghost",
									onClick: () => cycleSuperset(exIdx),
									"aria-label": "Superset",
									children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Link2, {})
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
									size: "icon",
									variant: "ghost",
									onClick: () => removeExercise(exIdx),
									"aria-label": "Remove",
									children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Trash2, {})
								})]
							})]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex items-center justify-between rounded-xl border border-dashed border-border bg-surface-2 px-3 py-2 text-xs",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "font-bold text-fg",
									children: [
										"Smart target · ",
										ex.isBW && target.weight === 0 ? "Bodyweight" : `${target.weight} ${settings.unit}`,
										" × ",
										target.reps
									]
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
									className: "mt-0.5 text-muted",
									children: target.note
								}),
								target.autoNote && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
									className: "mt-1 text-info",
									children: target.autoNote
								})
							] }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Badge, {
								tone: target.diffTier === "Under-recovered" || target.diffTier === "Deload" ? "danger" : target.diffTier === "Stalled" || String(target.diffTier).startsWith("Hold") ? "warn" : "accent",
								children: target.diffTier
							})]
						}),
						alts.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "rounded-xl border border-dashed border-warn/40 bg-surface-2 p-2",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "mb-1.5 text-[0.7rem] font-bold text-warn",
								children: "Fresher options"
							}), alts.map((a) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
								type: "button",
								onClick: () => swapExercise(exIdx, a.name),
								className: "mb-1 flex w-full items-center justify-between rounded-lg border border-border bg-surface px-2.5 py-2 last:mb-0",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "text-xs font-bold",
									children: a.name
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
									className: "text-[0.65rem] font-bold text-accent-text",
									children: [
										a.readiness,
										"% · ",
										a.note
									]
								})]
							}, a.name))]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "grid grid-cols-[36px_1fr_1fr_1.3fr_36px_28px] items-center gap-1.5 text-[0.62rem] font-bold uppercase tracking-wide text-faint",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "text-center",
									children: "Set"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "text-center",
									children: settings.unit
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "text-center",
									children: "Reps"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "text-center",
									children: "RPE"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {})
							]
						}),
						ex.sets.map((s, sIdx) => {
							const workingNo = ex.sets.slice(0, sIdx + 1).filter((x) => x.type !== "warmup" && x.type !== "dropset").length;
							const label = s.type === "warmup" ? "W" : s.type === "dropset" ? "D" : String(workingNo);
							return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: cn("grid grid-cols-[36px_1fr_1fr_1.3fr_36px_28px] items-center gap-1.5 rounded-xl p-1", s.done && "bg-accent-soft", s.type === "dropset" && "bg-warn/10", s.type === "warmup" && "opacity-70"),
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
										type: "button",
										onClick: () => cycleSetType(exIdx, sIdx),
										className: cn("h-9 rounded-lg border border-border bg-surface-3 text-xs font-bold", s.type === "dropset" && "border-warn bg-warn text-accent-ink", s.type === "warmup" && "border-info text-info"),
										title: "Tap to cycle warm-up / drop / working",
										children: label
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
										type: "number",
										inputMode: "decimal",
										className: "h-9 px-1 text-center",
										value: s.weight,
										onChange: (e) => updateSet(exIdx, sIdx, { weight: e.target.value === "" ? "" : Number(e.target.value) })
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
										type: "number",
										inputMode: "numeric",
										className: "h-9 px-1 text-center",
										value: s.reps,
										onChange: (e) => updateSet(exIdx, sIdx, { reps: e.target.value === "" ? "" : Number(e.target.value) })
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("select", {
										className: "h-9 rounded-xl border border-border bg-surface-2 px-1 text-xs font-semibold",
										value: s.failure,
										onChange: (e) => updateSet(exIdx, sIdx, { failure: Number(e.target.value) }),
										children: [
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
												value: 1,
												children: "1 Easy"
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
												value: 2,
												children: "2 RIR2"
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
												value: 3,
												children: "3 Target"
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
												value: 4,
												children: "4 Grind"
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
												value: 5,
												children: "5 Fail"
											})
										]
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
										type: "button",
										"aria-label": "Mark set done",
										onClick: () => onCheck(ex, exIdx, sIdx, !s.done),
										className: cn("flex size-9 items-center justify-center rounded-lg border", s.done ? "border-accent bg-accent text-accent-ink" : "border-border bg-surface-2 text-faint"),
										children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Check, { className: "size-4" })
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
										type: "button",
										"aria-label": "Delete set",
										onClick: () => removeSet(exIdx, sIdx),
										className: "text-danger",
										children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(X, { className: "size-4" })
									})
								]
							}, sIdx);
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex gap-2",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
								className: "flex-1",
								size: "sm",
								onClick: () => addSet(exIdx),
								children: "Add set"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
								className: "flex-1",
								size: "sm",
								onClick: () => addSet(exIdx, "dropset"),
								children: "Drop set"
							})]
						})
					]
				}, `${ex.name}-${exIdx}`);
			}),
			customOpen && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "fixed inset-0 z-50 flex items-end justify-center bg-bg/80 p-4 sm:items-center",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Card, {
					className: "w-full max-w-md",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(CardTitle, { children: ["Custom movement", /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
							type: "button",
							onClick: () => setCustomOpen(false),
							"aria-label": "Close",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(X, { className: "size-4 text-muted" })
						})] }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", {
							className: "mb-1 block text-xs font-bold text-muted",
							children: "Name"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
							value: customName,
							onChange: (e) => setCustomName(e.target.value),
							placeholder: "Incline cable press"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", {
							className: "mb-1 mt-3 block text-xs font-bold text-muted",
							children: "Muscle"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("select", {
							className: "h-11 w-full rounded-xl border border-border bg-surface-2 px-3 text-sm font-semibold",
							value: customMuscle,
							onChange: (e) => setCustomMuscle(e.target.value),
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
									value: "chest",
									children: "Chest"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
									value: "upper_back",
									children: "Back"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
									value: "deltoids",
									children: "Shoulders"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
									value: "biceps",
									children: "Biceps"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
									value: "triceps",
									children: "Triceps"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
									value: "quadriceps",
									children: "Quads"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
									value: "hamstring",
									children: "Hamstrings"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
									value: "gluteal",
									children: "Glutes"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
									value: "calves",
									children: "Calves"
								})
							]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "mt-4 flex justify-end gap-2",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
								onClick: () => setCustomOpen(false),
								children: "Cancel"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
								variant: "primary",
								onClick: () => {
									if (!customName.trim()) return;
									addCustomExercise({
										name: customName.trim(),
										muscle: customMuscle,
										subTarget: customMuscle,
										targetKeys: [customMuscle],
										position: "Mid-Range",
										risk: "Low",
										tier: "Custom",
										isAxial: false,
										isBW: false
									});
									setCustomOpen(false);
									setCustomName("");
								},
								children: "Add"
							})]
						})
					]
				})
			})
		]
	});
}
function Stat({ label, value }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "rounded-2xl border border-border bg-surface-2 p-3",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "text-[0.62rem] font-bold uppercase tracking-wider text-faint",
			children: label
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "mt-0.5 font-display text-xl font-extrabold tabular tracking-tight",
			children: value
		})]
	});
}
var TABS = [
	{
		id: "workout",
		label: "Train",
		icon: Dumbbell
	},
	{
		id: "nutrition",
		label: "Fuel",
		icon: Utensils
	},
	{
		id: "body",
		label: "Body",
		icon: Activity
	},
	{
		id: "insights",
		label: "Stats",
		icon: TrendingUp
	},
	{
		id: "settings",
		label: "Setup",
		icon: Settings
	}
];
function AppShell() {
	const [ready, setReady] = (0, import_react.useState)(false);
	const hydrated = useSoma((s) => s.hydrated);
	const tab = useSoma((s) => s.tab);
	const setTab = useSoma((s) => s.setTab);
	const settings = useSoma((s) => s.settings);
	const ensureSeed = useSoma((s) => s.ensureSeed);
	const markHydrated = useSoma((s) => s.markHydrated);
	(0, import_react.useEffect)(() => {
		const result = useSoma.persist.rehydrate();
		Promise.resolve(result).then(() => {
			ensureSeed();
			markHydrated();
			setReady(true);
		});
	}, [ensureSeed, markHydrated]);
	(0, import_react.useEffect)(() => {
		if (!hydrated) return;
		const accent = normalizeAccent(settings.accent);
		const theme = resolveTheme(settings.theme);
		const root = document.documentElement;
		root.setAttribute("data-soma-theme", theme);
		root.style.setProperty("--color-accent", accent);
		root.style.setProperty("--color-accent-ink", accentInk(accent));
		root.style.setProperty("--color-accent-text", accentText(accent, theme));
		root.style.setProperty("--color-accent-soft", `color-mix(in srgb, ${accent} 16%, transparent)`);
		root.style.setProperty("--color-accent-line", `color-mix(in srgb, ${accent} 38%, transparent)`);
		const meta = document.querySelector("meta[name=\"theme-color\"]");
		if (meta) meta.setAttribute("content", theme === "light" ? "#f4f6f9" : "#0b0c10");
	}, [
		settings.accent,
		settings.theme,
		hydrated
	]);
	if (!ready) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "flex min-h-dvh items-center justify-center bg-bg text-muted",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "flex flex-col items-center gap-3",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "font-display text-2xl font-bold tracking-tight text-fg",
				children: "SOMA"
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "h-1 w-24 overflow-hidden rounded-full bg-surface-3",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "h-full w-1/2 animate-pulse bg-accent" })
			})]
		})
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "relative mx-auto min-h-dvh max-w-lg bg-bg pb-28",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", {
				className: "sticky top-0 z-30 flex items-center justify-between border-b border-border bg-bg/85 px-5 py-3 backdrop-blur-xl",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "font-display text-lg font-extrabold tracking-tight text-fg",
					children: "SOMA"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "text-[0.65rem] font-bold uppercase tracking-[0.16em] text-faint",
					children: "Smart Coach"
				})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "rounded-full border border-border bg-surface-2 px-3 py-1 text-[0.65rem] font-bold uppercase tracking-wider text-muted",
					children: "Local"
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("main", {
				className: "soma-scroll px-4 pt-4",
				children: [
					tab === "workout" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(WorkoutView, {}),
					tab === "nutrition" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(NutritionView, {}),
					tab === "body" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(BodyView, {}),
					tab === "insights" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(InsightsView, {}),
					tab === "settings" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SettingsView, {})
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("nav", {
				className: "pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-3 pb-[max(12px,env(safe-area-inset-bottom))]",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "pointer-events-auto flex w-full max-w-lg items-center justify-between gap-1 rounded-full border border-border-strong bg-dock p-1.5 shadow-[0_10px_30px_rgba(0,0,0,0.45)] backdrop-blur-xl",
					children: TABS.map((t) => {
						const Icon = t.icon;
						const active = tab === t.id;
						return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
							type: "button",
							onClick: () => setTab(t.id),
							className: cn("flex min-h-11 flex-1 flex-col items-center justify-center gap-0.5 rounded-full px-1 py-1.5 text-[0.62rem] font-bold transition-colors duration-150", active ? "bg-accent text-accent-ink shadow-glow" : "text-faint hover:text-muted"),
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Icon, {
								className: "size-4",
								strokeWidth: active ? 2.4 : 2
							}), t.label]
						}, t.id);
					})
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Toaster, {
				position: "top-center",
				theme: settings.theme === "light" ? "light" : "dark"
			})
		]
	});
}
function Home() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(AppShell, {});
}
//#endregion
export { Home as component };
