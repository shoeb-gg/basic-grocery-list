# CLAUDE.md

Guidance for working in this repository.

## What this is

**Quick List** — an offline personal grocery / to-do list app the owner uses
daily on Android. Multiple lists, each with checkable + reorderable items.
Ionic + Angular in a Capacitor WebView shell (Android is the primary target;
iOS project exists but isn't actively tested). All data is local — no backend,
no network at runtime.

- App id: `basic.grocery.list` · App name: **Quick List**
- Web output: `www/` · Persistence: IndexedDB (via `@ionic/storage`)

## Stack

| Tool | Version |
| --- | --- |
| Angular (standalone + signals) | 22 |
| Ionic | 8 |
| Capacitor (Android/iOS) | 8 |
| Angular CDK (virtual scroll) | 22 |
| TypeScript | ~6.0.3 (pinned — see gotchas) |
| Tailwind (v4, PostCSS) | 4 |
| Node.js | **≥ 22.22.3 or ≥ 24.15** (Angular 22 CLI requirement) |

## Commands

```bash
# Dev server (browser) — http://localhost:4200
npm start

# Production web build -> www/
npm run build

# Copy web build + plugins into the native projects
npx cap sync android
```

**Build + install the debug APK on a connected device.** There is no standalone
JDK installed; use the JDK bundled with Android Studio. `adb` lives in the
Android SDK platform-tools. From Git Bash:

```bash
ADB="/c/Users/Shoeb/AppData/Local/Android/Sdk/platform-tools/adb.exe"
"$ADB" devices                      # confirm the phone is attached + authorized

cd android
export JAVA_HOME="/c/Program Files/Android/Android Studio/jbr"
export ANDROID_HOME="/c/Users/Shoeb/AppData/Local/Android/Sdk"
./gradlew installDebug              # builds and installs onto the device
```

Typical loop after a code change: `npm run build && npx cap sync android` then
`./gradlew installDebug`.

## Architecture

Everything flows through a single signal store. The app is one screen —
`app.routes.ts` is empty (the router is still provided in `main.ts` but unused).

- **`ListStoreService`** (`src/app/services/list-store.service.ts`) — the single
  source of truth. Signals: `lists`, `activeListId`, `originalList` (active
  list's items), `checkedList` / `unCheckedList` (derived by `setUpLists()`),
  `maxId`. Item ids are globally unique across all lists (`setMaxId()` scans
  every list). Persistence:
  - `syncAllLists()` — immediate, awaitable write. Used by discrete actions
    (add, check, delete, reorder, list switch, blur).
  - `scheduleSave()` — ~400ms debounced write. Used **only** by per-keystroke
    item-name edits so typing doesn't rewrite the whole dataset every keystroke.
  - `active_list_id` is only rewritten when it actually changes.
- **`StorageService`** (`storage.service.ts`) — thin wrapper over
  `@ionic/storage-angular` (IndexedDB). Two keys: `grocery_lists` (all lists +
  items) and `active_list_id`. Throws (not silent no-op) if used before `init()`.
- **`AppComponent`** — the shell. Loads/normalizes data on startup, hides the
  bottom chip bar while the keyboard is up (`.selector-card.keyboard-open`), and
  flushes pending writes on background (`visibilitychange` / Capacitor `pause`).
- **`ListContainerComponent`** — the list. **CDK virtual scroll** (uniform 56px
  rows; section headers are rows too; `templateCacheSize: 0` because Ionic web
  components don't survive view recycling — recycled rows lost their checkbox /
  input / icon). It owns scrolling: `ion-content` has `[scrollY]="false"` and
  the CDK viewport is the scroller. The viewport is sized by CSS flex (hugs a
  short list, caps and scrolls a long one; CDK's `contain: strict` is relaxed so
  the spacer gives it an intrinsic height). A `ResizeObserver` on the viewport
  and its spacer calls `checkViewportSize()` (CDK only re-measures on window
  resize by itself) and then re-anchors: pin to bottom if the list was at the
  bottom before the change or the add field is focused, otherwise keep a
  focused row visible (via the viewport's own `scrollTop`, never
  `scrollIntoView`, which would also scroll the overflow-hidden ancestors).
  Scroll-to-bottom (startup / add / list switch) pins now, after render, and a
  frame later.
  Reorder is a purpose-built pointer drag (`row-drag.ts`), not CDK drag-drop
  (unsupported inside virtual scroll — its indices counted detached rows). Drag
  handle only. The drop slot is finger position ÷ row height, rows part via a
  signal-driven transform (so rows rendered mid-drag are correct), a fixed
  preview + slot indicator live on `<body>`, and holding near an edge
  auto-scrolls with acceleration so a long to-do section can be reordered end
  to end. Restricted to the to-do section.
- **`InputContainerComponent`** — the add-item field (bottom).
- **`ListSelectorComponent`** — chip bar for switching / creating / renaming /
  deleting lists.

Change detection is **OnPush everywhere** (the app is fully signal-based). Note:
`keyboardOpen` in `AppComponent` is a signal specifically so the Capacitor
keyboard callback (outside Angular's event flow) still refreshes the view.

Ionic `scrollAssist` / `scrollPadding` are **disabled** in `main.ts` — the app
owns keyboard scrolling itself and Ionic's assist fights it.

## Conventions

- Commit messages: `chore:` / `fix:` / `feat:` / `perf:` prefix (see `git log`).
- TypeScript strict; avoid `any` (the one exception is `StorageService`'s
  generic value param).
- Match the surrounding style; components are standalone with explicit `imports`.

## Gotchas

- **Don't bump TypeScript to "latest".** It must stay inside Angular's peer
  range (`>=6.0 <6.1`). `npm outdated` will show a newer major — ignore it.
- **Angular upgrades go one major at a time** via `npx ng update @angular/core@N
  @angular/cli@N` (not a single jump).
- **`npx cap migrate` has a CRLF bug on Windows** — it fails to rewrite
  `android/variables.gradle` and the gradle wrapper version. Apply those version
  bumps by hand against Capacitor's bundled `android-template`.
- **No unit tests exist.** Verify changes by building and driving the real app —
  `npm start` in a browser for logic/UI, or install on the device for anything
  touching the keyboard, scrolling, reorder, or storage.
- **UI harness:** `scripts/ui-harness.mjs` drives the dev build in headless
  Chrome over CDP (no extra deps; needs Chrome installed and `npm start`
  running). It seeds lists via Angular's dev-mode `ng` API, emulates the
  keyboard (window resize + `keyboardOpen`), and checks bottom pinning,
  focused-row visibility, blank rows, list switching, 5,000-item lists, and
  drag-to-reorder (touch + mouse, auto-scroll, cancel, section clamp). Run
  `node scripts/ui-harness.mjs`; every check prints PASS/FAIL. Re-run it after
  touching anything in `list-container/`.
- The `www/` dir and `.angular/` cache are build output (gitignored).

## Layout

```text
src/app/
  app.component.*              shell: startup, keyboard, footer-hide, flush
  services/
    list-store.service.ts      signal store (state + persistence orchestration)
    storage.service.ts         @ionic/storage (IndexedDB) wrapper
    input-handler.service.ts   add-item input value/focus signals
  component/
    list-container/            virtual-scrolled list, scroll anchoring,
                               pointer-drag reorder (row-drag.ts)
    input-container/           add-item field
    list-selector/             multi-list chip bar
  models/ListItem.ts           ListItem, GroceryList types
android/                       Capacitor Android project
ios/                           Capacitor iOS project (not actively tested)
```
