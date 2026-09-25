# Looks tab — roadmap

Decisions from a 45-question planning session (2026-09-25). Each answer below
is the owner's; notes in *italics* are technical constraints that shape it.

Device: **iPhone 14 Pro Max** — TrueDepth front camera, LiDAR, 1×/2×/3× lenses.
Test as a PWA, ship as the native iOS build.

---

## Phase 1 — fix the analyser ✅ (shipped)

- [x] **Head-angle bug.** `eulerFromMatrix4` read MediaPipe's matrix on the
      wrong axes: a head turn landed in *pitch*, a tilt in *yaw*. The 45° and
      profile steps could not go green, and a turned head could pass the front
      gate and be scored. Fixed in `src/lib/aether/pose-angles.ts`, with tests.
- [x] **Chin coaching was inverted** — a lowered chin was told to drop further.
- [x] **Posture was never measured.** `analyzePosture.ts` existed but nothing
      called it. Profile shots (captured or imported) now run the body-pose
      model and store a neck angle (CVA estimate), shown on the Profile tile
      and in the scan list.
- [x] **Angles were bent by the photo's shape** (x normalised by width, y by
      height). Posture now rescales before measuring.
- [x] **Guessed landmarks no longer count** — a posture reading needs a
      visible ear and shoulder, or nothing is claimed.
- [x] **Neck in the muscle map** — 4 neck exercises in the catalogue; neck work
      now counts in the heatmap, weekly volume (MEV 2 / MAV 6 / MRV 12) and
      strength trends. Custom names containing "neck" are no longer filed as
      biceps curls or triceps extensions.
- [x] **Re-analyse old scans** — scans carry an `analyzer` version; anything
      measured before `aether-face-1.3.0` is flagged "pre-fix" and can be
      re-measured from its saved photo in one tap.
- [x] One shared measurement pipeline (`measure.ts`) for live capture,
      camera-roll import and re-analysis.

## Phase 2 — capture assist

### 2a ✅ (shipped)

- [x] Front / back camera switch; the preview mirrors only for the front camera.
- [x] Zoom 1× / 2× / 3×, remembered on the device. Back 3× asks for the
      telephoto lens by name; elsewhere the camera zooms itself where the
      browser allows (Android) or the frame is centre-cropped (iOS Safari).
      Preview, guides, landmarks and the saved photo all use the same crop.
- [x] Warm screen flash, with a "too dark" prompt; front camera only.
- [x] Parking-sensor beeps (rate = distance to the target pose), panned to the
      side to turn toward, higher pitch for "chin up" / lower for "chin down",
      a steady hold tone when on target, and capture / done sounds.
- [x] English voice coach, throttled so it never talks over itself; each new
      step is announced. Sound follows the silent switch.
- [x] Native haptics through the Capacitor plugin (the PWA on iPhone has none).
- [x] 8-frame burst ranked by quality then sharpness; symmetry is the median
      of every frame that passed its gates.

### 2b ✅ (shipped, except the posture step)

- [x] Tap to override the auto-picked frame.
- [x] Both profile sides as separate steps.
- [x] Camera-roll import: auto-align to the guides, then drag / pinch / rotate.
- [x] Iris-based distance and baseline lock (match the first scan's distance).
- [x] Ghost overlay of the last scan; pre-scan checklist.
- [ ] A full-body side step for posture (shoulder and hip in frame).

## TrueDepth 3D face scan (native build)

- [x] Swift plugin `FaceDepth` (ios/App/App/FaceDepthPlugin.swift), registered
      in `MainViewController`: live wireframe, neutral-pose gating, 30-frame
      averaged ARKit mesh in mm, blend shapes, eye centres, pose, distance,
      camera intrinsics, one upright colour frame.
- [x] Pose streamed to the web app, driving the same beeps and voice.
- [x] 3D metrics: mirror asymmetry (RMS, 95th percentile, by third) with the
      midline found rather than assumed, IPD, face width, lower/face width.
- [x] Mesh stored in IndexedDB (`mesh:<id>`), summary on the scan.
- [x] Raw TrueDepth depth (`ARFrame.capturedDepthData`): every depth pixel
      of each gated frame is unprojected, moved into the face's axes and
      averaged onto a 1.5 mm grid (≥15 depth frames). Symmetry is measured on
      that measured surface — midline searched, residual head turn removed —
      per third, with which side sits further forward.
- [x] **Face ID-style sweep** (most accurate): a still front burst, then a
      slow head circle; every depth pixel is fused onto a cylinder round the
      head (θ × height, 1° × 1.5 mm), median of up to 12 readings per cell,
      only near-square-on readings, 26–38 cm. Frames alternate into two
      independent cylinders, so every figure carries the scan's own ± and a
      change smaller than the noise is reported as noise. Symmetry (midline
      and off-centre axis removed, noise removed in quadrature), cheek and
      jaw width, chin behind nose tip, change vs the FIRST sweep after
      alignment. The best ~40° frames fill the 45° slot in the same pass.
- [ ] Verify on device: photo orientation; ring direction; sweep noise level.
- [ ] Landmark-level metrics (gonial angle, canthal tilt, cheekbone projection)
      from vertex indices identified on a real exported mesh.

## LiDAR body scan (native build)

- [x] Swift plugin `BodyDepth` (ios/App/App/BodyDepthPlugin.swift): ARKit body
      tracking on the back camera with LiDAR scene depth. Gates: whole body in
      view, 1.5–4.5 m, square to the phone (front) or side-on (side), holding
      still. 60 frames averaged; ARKit's fitted skeleton plus every image joint
      placed in 3D by the LiDAR depth (5×5 median), both in metres in the
      body's own space. Status streamed to the web app for beeps and voice.
- [x] Metrics (`body3d.ts`): shoulder / hip-joint width, torso, upper arm,
      forearm, thigh, shin (left vs right), knee in/out angle per leg, knee and
      ankle gap, shoulder and hip level; side-on: neck–ear angle, ear ahead of
      shoulders, shoulders ahead of hips, knee locked back. LiDAR joints
      preferred, fitted model as fallback, labelled.
- [x] Skeletons stored in IndexedDB (`body:<id>`) for re-reading later.
- [ ] Verify on device: person's left/right naming, sign of knee angles.
- Not measurable from joints: pelvic tilt, upper-back rounding.

### All decisions

| Feature | Decision |
|---|---|
| Camera | Front **and** back camera. Back camera mounted on a wall with a suction mount. |
| Zoom | **2× default, changeable** (1×/2×/3×). *Safari exposes little lens control; the native build can pick the telephoto directly.* |
| Screen flash | **Warm white, auto-suggested** when the frame is dark, manual toggle. |
| Audio | **Beeps + English voice.** Parking-sensor beeps: rate = how close to target; **left/right panned in AirPods** for direction, pitch for up/down. Distinct sounds: *on target → hold still*, *capturing*, *done*. |
| Silent switch | **Respect it** — no sound on silent. |
| Haptics | **Yes** (native build): tap on target, stronger on capture. |
| Trigger | **Auto-capture when aligned** — no timer. |
| Burst | ~8 frames, **auto-pick the best, tap to override**. |
| Merge | **Average the measurements** across good frames; keep one photo. |
| Profile | **Both left and right** sides. |
| Camera-roll import | **Auto-align to the guides, then nudge** (drag / pinch / rotate). |
| Recommended extras | Iris-based distance in cm; baseline lock (same camera/zoom/distance/light as the first scan); ghost overlay of the last scan; pre-scan checklist. |

## Phase 3 — measurements

**Framing:** norms **and scores, blunt.** Benchmarked against **"ideal"
ratios**, with **every ratio tagged by evidence level** (e.g. golden ratio =
weak). Wording: **blunt facts, no insults.** Every weak area is split into
**trainable / grooming / medical / can't change**.

- **3D face — TrueDepth (native):** real-millimetre face mesh.
- **Face metrics:** jaw & chin (width, gonial angle, projection), profile
  angles (neck–chin, nasofrontal), facial thirds & ratios, eye area (canthal
  tilt, eyelid exposure).
- **Under-eyes:** dark circles, puffiness/bags, hollows/tear trough.
- **Skin:** acne/spot count, redness, texture/pores.
- **Hair (minoxidil tracking):** hairline with hair **pulled back**, top /
  mid-scalp, **crown** (back camera on the wall + audio), temples L & R.
  Photos **wet**. Thinning is at the crown and top as well as the hairline.
- **Body — LiDAR (native):** shoulder width & shoulder-to-waist, torso / back
  length, arm & leg lengths (left vs right).
- **Posture:** forward head, rounded shoulders, pelvic tilt, upper-back
  rounding. *The pose model gives ear, shoulder and hip joints only; pelvic
  tilt and back rounding need LiDAR depth or a body contour, not joints.*
- **Knock knees:** ankle gap standing (knees touching) and hip-knee-ankle
  angle from a front photo; **corrective exercises added to the programme**
  (glute med / hip abductors, foot work; physio if painful).

## Phase 4 — tracking

- Reminders: **face weekly, body/hair every 2 weeks.**
- Visuals: **before/after slider**, **time-lapse video**, **charts per
  measurement.**
- Links: neck cm ↔ profile score; posture ↔ neck/back volume; body ratios ↔
  bodyweight; skin ↔ sleep/diet.

## Storage

- Photos stay **on the device, in the app's own storage**.
- **Backups hold file paths only**, not image data, so they stay small
  (currently ~17 MB because images are embedded).
- Restoring a backup with a missing photo **keeps the data and shows "photo
  missing"**.

## Native build

- No Mac. **GitHub Actions macOS runner** builds the IPA.
- **Free Apple account.** *A free account cannot sign from CI and its builds
  expire after 7 days. Practical path: CI produces an unsigned IPA, then
  re-sign and install from a PC with Sideloadly or AltStore every 7 days. A
  paid account ($99/yr) would allow TestFlight and proper CI signing.*
- Delivery: **push straight to `main`**, with tests, typecheck, lint and a
  build run before every push.
