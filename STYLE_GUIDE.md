
# SlateApp Design System & Style Guide

## 1. Design Philosophy
**"Frost & Violet"**
The interface combines a deep, rich **Purple/Indigo** primary palette with modern **Glassmorphism**. Key characteristics include:
- **Translucency**: High usage of `backdrop-blur` and semi-transparent backgrounds.
- **Vibrancy**: Gradients are used over solid colors for primary actions.
- **Depth**: Colored shadows (`shadow-purple-900/20`) create a glow effect rather than just standard black shadows.
- **Rounding**: Generous border radius (`rounded-xl` to `rounded-2xl`) for a friendly, modern feel.

---

## 2. Color Palette

### Primary Brand (Purple & Indigo)
Used for primary actions, active states, and brand highlights.

| Token | Tailwind Class | Hex Code | Usage |
|-------|----------------|----------|-------|
| **Primary Base** | `bg-purple-600` | `#9333ea` | Primary buttons, active icons |
| **Primary Hover** | `bg-purple-700` | `#7e22ce` | Button hover states |
| **Primary Light** | `bg-purple-50` | `#faf5ff` | Background highlights (Light Mode) |
| **Primary Dark** | `bg-purple-900/20` | `#581c87 (20%)` | Background highlights (Dark Mode) |
| **Gradient Start** | `from-purple-600` | -- | Brand Gradients |
| **Gradient End** | `to-indigo-600` | -- | Brand Gradients |

### Neutrals (Slate & Gray)
Used for text, borders, and structural backgrounds.

| Token | Tailwind Class | Usage |
|-------|----------------|-------|
| **Canvas** | `bg-gray-50` / `dark:bg-gray-900` | Main app background |
| **Surface** | `bg-white` / `dark:bg-gray-800` | Cards, Modals, Sidebar |
| **Text Main** | `text-slate-900` / `dark:text-white` | Headings, Primary Text |
| **Text Muted** | `text-slate-500` / `dark:text-gray-400` | Subtitles, Metadata |
| **Borders** | `border-slate-200` / `dark:border-gray-700` | Dividers, Card Borders |

### Semantic Colors
Used for status indicators (Pipeline, Analysis Scores).

| Context | Color Family | Tailwind Classes (Light/Dark) | Usage |
|---------|--------------|-------------------------------|-------|
| **Success** | Emerald | `text-emerald-600` `bg-emerald-50` | High Match Score, "Offer", "Applied" |
| **Warning** | Amber | `text-amber-600` `bg-amber-50` | Medium Score, "Interviewing" |
| **Error** | Rose | `text-rose-600` `bg-rose-50` | Low Score, "Rejected", Delete Actions |
| **Info** | Indigo | `text-indigo-600` `bg-indigo-50` | General tags, Stats |

---

## 3. Typography

**Font Family**: System UI / Sans-serif (`Inter`, `San Francisco`, `Segoe UI`).

| Style | Size | Weight | Tracking | Usage |
|-------|------|--------|----------|-------|
| **H1** | `text-3xl` | `font-bold` | `tracking-tight` | Page Titles |
| **H2** | `text-xl` | `font-bold` | Normal | Section Headers |
| **H3** | `text-lg` | `font-bold` | Normal | Card Titles |
| **Body** | `text-sm` | `font-normal` | Normal | Standard text |
| **Label** | `text-xs` | `font-bold` | `tracking-wider` | Uppercase labels, badges |

---

## 4. Components

### Buttons

**Primary (Gradient)**
```html
<button class="bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-lg shadow-purple-600/20 hover:from-purple-700 hover:to-indigo-700 active:scale-95 rounded-xl">
  Primary Action
</button>
```

**Secondary (Outline/Ghost)**
```html
<button class="bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 hover:bg-slate-50 dark:hover:bg-gray-700 text-slate-700 dark:text-gray-200 rounded-xl">
  Cancel / Back
</button>
```

**Icon Button**
```html
<button class="p-2 text-slate-400 hover:text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded-lg">
  <Icon />
</button>
```

### Cards & Surfaces

**Standard Card**
```html
<div class="bg-white dark:bg-gray-800 rounded-2xl border border-slate-200 dark:border-gray-700 shadow-sm">
  <!-- Content -->
</div>
```

**Interactive Card (Hover State)**
Add: `hover:shadow-md hover:border-purple-300 dark:hover:border-purple-600 transition-all cursor-pointer group`

### Glassmorphism (Overlays & Sticky Headers)
```html
<div class="bg-white/80 dark:bg-gray-900/80 backdrop-blur-md border-b border-gray-200 dark:border-gray-800">
  <!-- Sticky Header Content -->
</div>
```

---

## 5. Effects & Animations

### Gradients
Use distinctive "Purple-to-Indigo" or "Purple-to-Pink" gradients for visual interest.
- **Brand**: `bg-gradient-to-br from-purple-600 to-indigo-600`
- **Dark Mode Surface**: `bg-gradient-to-b from-gray-800 to-gray-900`

### Shadows
We use colored shadows to create a "glow" effect.
- **Purple Glow**: `shadow-lg shadow-purple-900/20`
- **Subtle**: `shadow-sm`

### Transitions
- **Hover**: `transition-colors duration-200`
- **Movement**: `transition-transform active:scale-95`
- **Page Load**: `animate-fade-in` (Defined in global CSS)

---

## 6. Spacing & Layout

- **Container**: `max-w-7xl mx-auto p-8` (Standard Page)
- **Grid Gap**: `gap-4` (Tight), `gap-6` (Standard), `gap-8` (Sectional)
- **Border Radius**:
  - `rounded-xl` (Buttons, Inputs, Small Cards)
  - `rounded-2xl` (Main Cards, Modals)
  - `rounded-full` (Avatars, Tags, Toggles)
