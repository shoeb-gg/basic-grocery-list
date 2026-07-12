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
| Angular CDK (virtual scroll + drag-drop) | 22 |
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
  rows; section headers are rows too). It owns scrolling: `ion-content` has
  `[scrollY]="false"` and the CDK viewport is the scroller. Keyboard clearance
  (`scrollIntoView` against the viewport) and scroll-to-bottom live here.
  Reorder is **CDK drag-drop** (drag handle only, so it doesn't conflict with
  swipe-to-delete or tap-to-edit), restricted to the to-do section via a sort
  predicate, with rendered-range-offset index math mapped back to the unchecked
  array.
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
    list-container/            virtual-scrolled list + CDK drag reorder
    input-container/           add-item field
    list-selector/             multi-list chip bar
  models/ListItem.ts           ListItem, GroceryList types
android/                       Capacitor Android project
ios/                           Capacitor iOS project (not actively tested)
```
