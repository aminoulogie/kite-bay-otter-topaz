// ==========================================================================
// Seed databases: nutrition goals, the food and exercise libraries, and the
// built-in routines.
// ==========================================================================

const DEFAULT_GOALS = {
  cals: 2400,
  protein: 160,
  carbs: 260,
  fat: 70,
  water: 3500,
  fiber: 35,
  calcium: 1000,
  iron: 18,
  magnesium: 400,
  potassium: 3500,
  sodium: 2300,
  zinc: 11
};

const BASE_FOOD_LIBRARY = [
  { name: "Whole Eggs", serving: 100, unit: "g", cals: 143, p: 13.0, c: 0.7, f: 9.9, fiber: 0, sodium: 142, potassium: 138, calcium: 56, iron: 1.8, magnesium: 12, zinc: 1.3, isBase: true, usageCount: 15 },
  { name: "Chicken Breast (Cooked)", serving: 100, unit: "g", cals: 165, p: 31.0, c: 0.0, f: 3.6, fiber: 0, sodium: 74, potassium: 256, calcium: 15, iron: 1.0, magnesium: 29, zinc: 1.0, isBase: true, usageCount: 20 },
  { name: "White Rice (Cooked)", serving: 150, unit: "g", cals: 195, p: 4.1, c: 43.0, f: 0.4, fiber: 0.6, sodium: 1, potassium: 55, calcium: 16, iron: 1.8, magnesium: 19, zinc: 0.8, isBase: true, usageCount: 18 },
  { name: "Egg Whites", serving: 100, unit: "g", cals: 52, p: 11.0, c: 0.7, f: 0.2, fiber: 0, sodium: 166, potassium: 163, calcium: 7, iron: 0.1, magnesium: 11, zinc: 0.0, isBase: true, usageCount: 12 },
  { name: "Oatmeal (Dry)", serving: 50, unit: "g", cals: 190, p: 6.5, c: 34.0, f: 3.5, fiber: 5.0, sodium: 2, potassium: 180, calcium: 26, iron: 2.1, magnesium: 69, zinc: 1.5, isBase: true, usageCount: 14 },
  { name: "Whey Protein Isolate", serving: 30, unit: "g", cals: 120, p: 25.0, c: 1.5, f: 1.0, fiber: 0, sodium: 140, potassium: 160, calcium: 130, iron: 0.4, magnesium: 20, zinc: 0.5, isBase: true, usageCount: 16 },
  { name: "Greek / Plain Yogurt", serving: 150, unit: "g", cals: 90, p: 15.0, c: 5.0, f: 0.5, fiber: 0, sodium: 55, potassium: 210, calcium: 165, iron: 0.1, magnesium: 17, zinc: 0.9, isBase: true, usageCount: 10 },
  { name: "Canned Tuna (Drained)", serving: 120, unit: "g", cals: 130, p: 29.0, c: 0.0, f: 1.0, fiber: 0, sodium: 380, potassium: 280, calcium: 12, iron: 1.6, magnesium: 34, zinc: 0.9, isBase: true, usageCount: 11 },
  { name: "Pasta (Dry)", serving: 80, unit: "g", cals: 280, p: 10.0, c: 58.0, f: 1.2, fiber: 2.5, sodium: 5, potassium: 180, calcium: 18, iron: 1.4, magnesium: 42, zinc: 1.1, isBase: true, usageCount: 8 },
  { name: "Olive Oil", serving: 14, unit: "g", cals: 120, p: 0.0, c: 0.0, f: 14.0, fiber: 0, sodium: 0, potassium: 0, calcium: 0, iron: 0.1, magnesium: 0, zinc: 0.0, isBase: true, usageCount: 9 },
  { name: "Peanut Butter", serving: 32, unit: "g", cals: 190, p: 8.0, c: 7.0, f: 16.0, fiber: 2.0, sodium: 140, potassium: 210, calcium: 14, iron: 0.6, magnesium: 54, zinc: 0.9, isBase: true, usageCount: 6 },
  { name: "Banana", serving: 118, unit: "g", cals: 105, p: 1.3, c: 27.0, f: 0.3, fiber: 3.1, sodium: 1, potassium: 422, calcium: 6, iron: 0.3, magnesium: 32, zinc: 0.2, isBase: true, usageCount: 10 }
];

const BASE_EXERCISE_DB = [
  // CHEST
  { name: "Incline Dumbbell Press", muscle: "Chest", subTarget: "Upper Pec (Clavicular)", targetKeys: ["chest"], position: "Lengthened (Stretch)", risk: "Low 🟢", tier: "S-Tier", isAxial: false, isBW: false },
  { name: "Incline Barbell Bench", muscle: "Chest", subTarget: "Upper Pec (Clavicular)", targetKeys: ["chest"], position: "Mid-Range", risk: "Moderate 🟡", tier: "A-Tier", isAxial: false, isBW: false },
  { name: "Smith Machine Incline Press", muscle: "Chest", subTarget: "Upper Pec (Clavicular)", targetKeys: ["chest"], position: "Lengthened (Stretch)", risk: "Low 🟢", tier: "S-Tier", isAxial: false, isBW: false },
  { name: "Low-to-High Cable Fly", muscle: "Chest", subTarget: "Upper Pec (Clavicular)", targetKeys: ["chest"], position: "Shortened (Peak)", risk: "Low 🟢", tier: "S-Tier", isAxial: false, isBW: false },
  { name: "High-to-Low Cable Fly", muscle: "Chest", subTarget: "Lower Pec (Costal)", targetKeys: ["chest"], position: "Shortened (Peak)", risk: "Low 🟢", tier: "S-Tier", isAxial: false, isBW: false },
  { name: "Flat Barbell Bench Press", muscle: "Chest", subTarget: "Mid/Lower Pec (Sternal)", targetKeys: ["chest"], position: "Mid-Range", risk: "Moderate 🟡", tier: "A-Tier", isAxial: false, isBW: false },
  { name: "Flat Dumbbell Press", muscle: "Chest", subTarget: "Mid/Lower Pec (Sternal)", targetKeys: ["chest"], position: "Lengthened (Stretch)", risk: "Low 🟢", tier: "S-Tier", isAxial: false, isBW: false },
  { name: "Pec Deck Fly (Machine)", muscle: "Chest", subTarget: "Mid/Lower Pec (Sternal)", targetKeys: ["chest"], position: "Shortened (Peak)", risk: "Low 🟢", tier: "S-Tier", isAxial: false, isBW: false },
  { name: "Bodyweight Chest Dips", muscle: "Chest", subTarget: "Lower Pec (Costal)", targetKeys: ["chest", "triceps", "triceps_back"], position: "Lengthened (Stretch)", risk: "Moderate 🟡", tier: "S-Tier", isAxial: false, isBW: true },
  { name: "Weighted Chest Dips", muscle: "Chest", subTarget: "Lower Pec (Costal)", targetKeys: ["chest", "triceps", "triceps_back"], position: "Lengthened (Stretch)", risk: "Moderate 🟡", tier: "S-Tier", isAxial: false, isBW: false },
  { name: "Machine Chest Press", muscle: "Chest", subTarget: "Mid/Lower Pec (Sternal)", targetKeys: ["chest"], position: "Mid-Range", risk: "Low 🟢", tier: "S-Tier", isAxial: false, isBW: false },

  // BACK
  { name: "Bodyweight Pull-ups", muscle: "Back", subTarget: "Lats (Vertical Pull)", targetKeys: ["upper_back", "biceps"], position: "Lengthened (Stretch)", risk: "Moderate 🟡", tier: "S-Tier", isAxial: false, isBW: true },
  { name: "Weighted Pull-ups / Chin-ups", muscle: "Back", subTarget: "Lats (Vertical Pull)", targetKeys: ["upper_back", "biceps"], position: "Lengthened (Stretch)", risk: "Moderate 🟡", tier: "S-Tier", isAxial: false, isBW: false },
  { name: "Lat Pulldown (Wide/Neutral)", muscle: "Back", subTarget: "Lats (Vertical Pull)", targetKeys: ["upper_back"], position: "Shortened (Peak)", risk: "Low 🟢", tier: "S-Tier", isAxial: false, isBW: false },
  { name: "Single-Arm Lat Cable Row", muscle: "Back", subTarget: "Lats (Iliac / Lower)", targetKeys: ["upper_back"], position: "Lengthened & Shortened", risk: "Low 🟢", tier: "S-Tier", isAxial: false, isBW: false },
  { name: "Single-Arm Dumbbell Row", muscle: "Back", subTarget: "Lats & Upper Back", targetKeys: ["upper_back"], position: "Lengthened (Stretch)", risk: "Low 🟢", tier: "S-Tier", isAxial: false, isBW: false },
  { name: "Chest-Supported T-Bar Row", muscle: "Back", subTarget: "Upper Back / Rhomboids", targetKeys: ["trapezius_back", "upper_back"], position: "Lengthened (Stretch)", risk: "Low 🟢", tier: "S-Tier", isAxial: false, isBW: false },
  { name: "Meadows Row", muscle: "Back", subTarget: "Upper Lats & Teres Major", targetKeys: ["upper_back"], position: "Lengthened (Stretch)", risk: "Low 🟢", tier: "S-Tier", isAxial: false, isBW: false },
  { name: "Barbell Bent-Over Row", muscle: "Back", subTarget: "Upper Back / Lats", targetKeys: ["upper_back", "trapezius_back", "lower_back"], position: "Mid-Range", risk: "High (Axial) 🔴", tier: "A-Tier", isAxial: true, isBW: false },
  { name: "Seated Cable Row (Wide)", muscle: "Back", subTarget: "Upper Back / Mid-Traps", targetKeys: ["trapezius_back", "upper_back"], position: "Shortened (Peak)", risk: "Low 🟢", tier: "A-Tier", isAxial: false, isBW: false },
  { name: "Barbell Deadlift", muscle: "Back", subTarget: "Erectors / Posterior Chain", targetKeys: ["lower_back", "hamstring", "gluteal"], position: "Mid-Range", risk: "High (Axial) 🔴", tier: "A-Tier", isAxial: true, isBW: false },

  // SHOULDERS
  { name: "Standing Overhead Press (OHP)", muscle: "Shoulders", subTarget: "Front Delt (Anterior)", targetKeys: ["deltoids", "triceps", "triceps_back"], position: "Mid-Range", risk: "High (Axial) 🔴", tier: "A-Tier", isAxial: true, isBW: false },
  { name: "Seated Dumbbell Shoulder Press", muscle: "Shoulders", subTarget: "Front Delt (Anterior)", targetKeys: ["deltoids", "triceps", "triceps_back"], position: "Lengthened (Stretch)", risk: "Moderate 🟡", tier: "A-Tier", isAxial: false, isBW: false },
  { name: "Machine Shoulder Press", muscle: "Shoulders", subTarget: "Front Delt (Anterior)", targetKeys: ["deltoids", "triceps"], position: "Mid-Range", risk: "Low 🟢", tier: "S-Tier", isAxial: false, isBW: false },
  { name: "Cable Lateral Raise", muscle: "Shoulders", subTarget: "Side Delt (Lateral)", targetKeys: ["deltoids", "deltoids_back"], position: "Lengthened (Stretch)", risk: "Low 🟢", tier: "S-Tier", isAxial: false, isBW: false },
  { name: "Cable Y-Raise", muscle: "Shoulders", subTarget: "Side Delt (Lateral)", targetKeys: ["deltoids", "deltoids_back"], position: "Lengthened & Shortened", risk: "Low 🟢", tier: "S-Tier", isAxial: false, isBW: false },
  { name: "Dumbbell Lateral Raise", muscle: "Shoulders", subTarget: "Side Delt (Lateral)", targetKeys: ["deltoids", "deltoids_back"], position: "Shortened (Peak)", risk: "Low 🟢", tier: "A-Tier", isAxial: false, isBW: false },
  { name: "Face Pulls", muscle: "Shoulders", subTarget: "Rear Delt (Posterior)", targetKeys: ["deltoids_back", "trapezius_back"], position: "Shortened (Peak)", risk: "Low 🟢", tier: "S-Tier", isAxial: false, isBW: false },
  { name: "Reverse Pec Deck", muscle: "Shoulders", subTarget: "Rear Delt (Posterior)", targetKeys: ["deltoids_back"], position: "Lengthened & Shortened", risk: "Low 🟢", tier: "S-Tier", isAxial: false, isBW: false },

  // ARMS
  { name: "Standing Barbell / EZ-Bar Curl", muscle: "Biceps", subTarget: "Overall Biceps", targetKeys: ["biceps"], position: "Mid-Range", risk: "Low 🟢", tier: "A-Tier", isAxial: false, isBW: false },
  { name: "Dumbbell Preacher Curl", muscle: "Biceps", subTarget: "Short Head (Inner)", targetKeys: ["biceps"], position: "Lengthened (Stretch)", risk: "Moderate 🟡", tier: "S-Tier", isAxial: false, isBW: false },
  { name: "One-Arm Dumbbell Preacher Curl", muscle: "Biceps", subTarget: "Short Head (Inner / Unilateral)", targetKeys: ["biceps"], position: "Lengthened (Stretch)", risk: "Moderate 🟡", tier: "S-Tier", isAxial: false, isBW: false },
  { name: "Incline Dumbbell Curl", muscle: "Biceps", subTarget: "Long Head (Peak)", targetKeys: ["biceps"], position: "Lengthened (Stretch)", risk: "Low 🟢", tier: "S-Tier", isAxial: false, isBW: false },
  { name: "Bayesian Cable Curl", muscle: "Biceps", subTarget: "Long Head (Peak)", targetKeys: ["biceps"], position: "Lengthened (Stretch)", risk: "Low 🟢", tier: "S-Tier", isAxial: false, isBW: false },
  { name: "Hammer Curl (Dumbbell/Cable)", muscle: "Biceps", subTarget: "Brachialis & Forearms", targetKeys: ["biceps"], position: "Mid-Range", risk: "Low 🟢", tier: "S-Tier", isAxial: false, isBW: false },
  { name: "EZ Bar Skullcrusher", muscle: "Triceps", subTarget: "Long & Medial Head", targetKeys: ["triceps", "triceps_back"], position: "Lengthened (Stretch)", risk: "Moderate 🟡", tier: "S-Tier", isAxial: false, isBW: false },
  { name: "Standing Low Pulley Overhead Tricep Extension", muscle: "Triceps", subTarget: "Long Head (Lengthened)", targetKeys: ["triceps", "triceps_back"], position: "Lengthened (Stretch)", risk: "Low 🟢", tier: "S-Tier", isAxial: false, isBW: false },
  { name: "Cable Triceps Pushdown (Straight/V)", muscle: "Triceps", subTarget: "Lateral & Medial Head", targetKeys: ["triceps", "triceps_back"], position: "Shortened (Peak)", risk: "Low 🟢", tier: "S-Tier", isAxial: false, isBW: false },

  // LEGS & CALVES
  { name: "Hack Squat", muscle: "Legs", subTarget: "Quads (Knee Extensors)", targetKeys: ["quadriceps", "gluteal"], position: "Lengthened (Stretch)", risk: "Low 🟢", tier: "S-Tier", isAxial: false, isBW: false },
  { name: "Barbell Back Squat", muscle: "Legs", subTarget: "Quads & Glutes", targetKeys: ["quadriceps", "gluteal", "lower_back"], position: "Lengthened (Stretch)", risk: "High (Axial) 🔴", tier: "A-Tier", isAxial: true, isBW: false },
  { name: "Leg Press", muscle: "Legs", subTarget: "Quads & Adductors", targetKeys: ["quadriceps", "adductors"], position: "Lengthened (Stretch)", risk: "Low 🟢", tier: "S-Tier", isAxial: false, isBW: false },
  { name: "Leg Extensions", muscle: "Legs", subTarget: "Rectus Femoris", targetKeys: ["quadriceps"], position: "Shortened (Peak)", risk: "Low 🟢", tier: "S-Tier", isAxial: false, isBW: false },
  { name: "Bulgarian Split Squat", muscle: "Legs", subTarget: "Glutes & Quads", targetKeys: ["gluteal", "quadriceps", "adductors"], position: "Lengthened (Stretch)", risk: "Moderate 🟡", tier: "S-Tier", isAxial: false, isBW: false },
  { name: "Romanian Deadlift (DB/Barbell)", muscle: "Legs", subTarget: "Hamstrings (Lengthened)", targetKeys: ["hamstring", "gluteal", "lower_back"], position: "Lengthened (Stretch)", risk: "Moderate 🟡", tier: "S-Tier", isAxial: true, isBW: false },
  { name: "Seated Leg Curl", muscle: "Legs", subTarget: "Hamstrings (Knee Flexion)", targetKeys: ["hamstring"], position: "Lengthened (Stretch)", risk: "Low 🟢", tier: "S-Tier", isAxial: false, isBW: false },
  { name: "Lying Leg Curl", muscle: "Legs", subTarget: "Hamstrings (Shortened)", targetKeys: ["hamstring"], position: "Shortened (Peak)", risk: "Low 🟢", tier: "A-Tier", isAxial: false, isBW: false },
  { name: "Barbell / Machine Hip Thrust", muscle: "Legs", subTarget: "Glutes (Maximus)", targetKeys: ["gluteal"], position: "Shortened (Peak)", risk: "Low 🟢", tier: "S-Tier", isAxial: false, isBW: false },
  { name: "Standing Machine Calf Raise", muscle: "Legs", subTarget: "Calves (Gastrocnemius)", targetKeys: ["calves", "calves_back"], position: "Lengthened (Stretch)", risk: "Low 🟢", tier: "S-Tier", isAxial: false, isBW: false },
  { name: "Seated Calf Raise Machine", muscle: "Legs", subTarget: "Calves (Soleus)", targetKeys: ["calves", "calves_back"], position: "Lengthened (Stretch)", risk: "Low 🟢", tier: "S-Tier", isAxial: false, isBW: false }
];

const ROUTINE_PRESETS = {
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

const ROTATION_SEQUENCE = [
  "Legs A (Quad / Squat Dominant)",
  "Push B (Hypertrophy & Long Muscle Length)",
  "Pull B (Back Width & Arm Bias)",
  "Legs B (Posterior Chain & Glute Bias)",
  "Upper A (Chest/Back/Shoulder Focus)",
  "Rest & Active Recovery"
];

// ============================================================
// SECTION 2: PROGRESSIVE OVERLOAD & PERIODIZATION ENGINES
// ============================================================

module.exports = { DEFAULT_GOALS, BASE_FOOD_LIBRARY, BASE_EXERCISE_DB, ROUTINE_PRESETS, ROTATION_SEQUENCE };
