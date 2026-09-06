// Drives the *installed debug build* (basic.grocery.list.debug) on the attached
// Android phone through the WebView's DevTools socket: real keyboard, real
// Capacitor resize path, real touch pipeline. Companion to ui-harness.mjs.
//
//   prerequisites: `adb devices` shows the phone; the dev app is installed
//   run:           node scripts/device-harness.mjs
//
// Screenshots land in scripts/device-shots/ for eyeballing the drag visuals.
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const ADB = 'C:/Users/Shoeb/AppData/Local/Android/Sdk/platform-tools/adb.exe';
const PKG = 'basic.grocery.list.debug';
const ACTIVITY = `${PKG}/basic.grocery.list.MainActivity`;
const PORT = 9444;
const ROW = 56;
const SHOTS = path.join(import.meta.dirname, 'device-shots');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -- ' + detail : ''}`);
}

function adb(...args) {
  const r = spawnSync(ADB, args, { encoding: 'utf8' });
  return ((r.stdout || '') + (r.stderr || '')).trim();
}

function screenshot(name) {
  mkdirSync(SHOTS, { recursive: true });
  const r = spawnSync(ADB, ['exec-out', 'screencap', '-p'], { maxBuffer: 64 * 1024 * 1024 });
  writeFileSync(path.join(SHOTS, `${name}.png`), r.stdout);
}

async function restartApp() {
  adb('shell', 'am', 'force-stop', PKG);
  await sleep(500);
  adb('shell', 'am', 'start', '-W', '-n', ACTIVITY);
  await sleep(2500);
  const pid = adb('shell', 'pidof', PKG).split(/\s+/)[0];
  if (!pid) throw new Error('dev app is not running');
  adb('forward', '--remove-all');
  adb('forward', `tcp:${PORT}`, `localabstract:webview_devtools_remote_${pid}`);
  for (let i = 0; i < 40; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
      const page = list.find((t) => t.type === 'page' && /localhost/.test(t.url));
      if (page) return page.webSocketDebuggerUrl;
    } catch {}
    await sleep(500);
  }
  throw new Error('WebView DevTools target not found');
}

class CDP {
  constructor(ws) {
    this.ws = ws;
    this.nextId = 0;
    this.pending = new Map();
    ws.onmessage = (m) => {
      const msg = JSON.parse(m.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { res, rej } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? rej(new Error(msg.error.message)) : res(msg.result);
      }
    };
  }
  static async connect(url) {
    const ws = new WebSocket(url);
    await new Promise((res, rej) => {
      ws.onopen = res;
      ws.onerror = rej;
    });
    return new CDP(ws);
  }
  send(method, params = {}) {
    const id = ++this.nextId;
    return new Promise((res, rej) => {
      this.pending.set(id, { res, rej });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  close() {
    this.ws.close();
  }
}

class Page {
  constructor(cdp) {
    this.cdp = cdp;
  }
  async eval(expression) {
    const r = await this.cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) {
      throw new Error(r.exceptionDetails.exception?.description || JSON.stringify(r.exceptionDetails));
    }
    return r.result.value;
  }
  touch(type, touchPoints) {
    return this.cdp.send('Input.dispatchTouchEvent', { type, touchPoints });
  }
  async tap(pt) {
    await this.touch('touchStart', [{ x: pt.x, y: pt.y }]);
    await sleep(60);
    await this.touch('touchEnd', []);
  }
  async type(text) {
    await this.cdp.send('Input.insertText', { text });
  }
  async enter() {
    const base = { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 };
    await this.cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', text: '\r', ...base });
    await this.cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
  }
}

// Page-side helpers. Production bundle: no `ng` debug API, so everything is
// DOM + IndexedDB (@ionic/storage's localforage db/store names).
const HELPERS = `
window.__h = {
  ROW: ${ROW},
  vp() { return document.querySelector('cdk-virtual-scroll-viewport'); },
  state() {
    const el = this.vp();
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return {
      sh: el.scrollHeight, ch: el.clientHeight, st: el.scrollTop,
      deficit: el.scrollHeight - el.clientHeight - el.scrollTop,
      top: r.top, bottom: r.bottom, height: r.height,
      rendered: document.querySelectorAll('.v-row').length,
      innerHeight: window.innerHeight,
      kbdClass: !!document.querySelector('.selector-card.keyboard-open'),
    };
  },
  textInput(r) { return r.querySelector('ion-input input:not([type="hidden"])'); },
  row(name) {
    for (const r of document.querySelectorAll('.v-row')) {
      const inp = this.textInput(r);
      if (inp && inp.value === name) return r;
    }
    return null;
  },
  rowRect(name) { const r = this.row(name); if (!r) return null; const b = r.getBoundingClientRect(); return { top: b.top, bottom: b.bottom }; },
  visible(name) {
    const rr = this.rowRect(name); if (!rr) return false;
    const vr = this.vp().getBoundingClientRect();
    return rr.top >= vr.top - 1 && rr.bottom <= vr.bottom + 1;
  },
  handleCenter(name) {
    const r = this.row(name); if (!r) return null;
    const h = r.querySelector('.drag-handle'); if (!h) return null;
    const b = h.getBoundingClientRect();
    return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
  },
  rowInputCenter(name) {
    const r = this.row(name); if (!r) return null;
    const b = this.textInput(r).getBoundingClientRect();
    return { x: b.left + Math.min(40, b.width / 2), y: b.top + b.height / 2 };
  },
  addInputCenter() {
    const b = document.querySelector('app-input-container input').getBoundingClientRect();
    return { x: b.left + Math.min(40, b.width / 2), y: b.top + b.height / 2 };
  },
  chipCenter(text) {
    for (const c of document.querySelectorAll('.chip')) {
      if (c.textContent.trim() === text) { const b = c.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; }
    }
    return null;
  },
  safeTodo(travelPx) {
    const vr = this.vp().getBoundingClientRect();
    const lo = vr.top + this.ROW + 12, hi = vr.bottom - this.ROW - 12;
    const needAbove = travelPx < 0 ? Math.ceil(-travelPx / this.ROW) : 0;
    const todos = [...document.querySelectorAll('.v-row')].filter(r => r.querySelector('.drag-handle'));
    for (let k = needAbove; k < todos.length; k++) {
      const b = todos[k].querySelector('.drag-handle').getBoundingClientRect();
      const y = b.top + b.height / 2;
      if (y > lo && y < hi && y + travelPx > lo && y + travelPx < hi) return this.textInput(todos[k]).value;
    }
    return null;
  },
  // A row whose input sits in the middle third of the viewport.
  midRow() {
    const vr = this.vp().getBoundingClientRect();
    for (const r of document.querySelectorAll('.v-row')) {
      const inp = this.textInput(r); if (!inp) continue;
      const b = r.getBoundingClientRect();
      if (b.top > vr.top + vr.height / 3 && b.bottom < vr.bottom - vr.height / 3) return inp.value;
    }
    return null;
  },
  blank() {
    const el = this.vp(); const vr = el.getBoundingClientRect();
    const rows = [...document.querySelectorAll('.v-row')].map(r => r.getBoundingClientRect());
    const missing = [];
    for (let y = vr.top + 2; y < vr.bottom - 2; y += this.ROW) {
      const contentY = y - vr.top + el.scrollTop;
      if (contentY >= el.scrollHeight) break;
      if (!rows.some(r => r.top <= y && r.bottom >= y)) missing.push(Math.round(y - vr.top));
    }
    return missing;
  },
  integrity() {
    const bad = [];
    for (const r of document.querySelectorAll('.v-row')) {
      if (!r.querySelector('ion-item')) continue;
      const cb = r.querySelector('ion-checkbox');
      const inp = this.textInput(r);
      const icon = r.querySelector('ion-icon.drag-handle');
      const cbOk = !!cb && !!cb.shadowRoot && cb.shadowRoot.childElementCount > 0 && cb.getBoundingClientRect().width > 0;
      const inpOk = !!inp && inp.getBoundingClientRect().width > 0;
      const iconOk = !icon || (!!icon.shadowRoot && !!icon.shadowRoot.querySelector('svg') && icon.getBoundingClientRect().width > 0);
      if (!cbOk || !inpOk || !iconOk) bad.push({ text: inp && inp.value, cbOk, inpOk, iconOk });
    }
    return bad;
  },
  overlays() { return document.querySelectorAll('.row-drag-preview, .row-drag-slot').length; },
  hidden() { return document.querySelectorAll('.v-row.drag-hidden').length; },
  shifted() { return [...document.querySelectorAll('.v-row')].filter(r => r.style.transform).length; },
  focused() { const a = document.activeElement; if (!a || a === document.body) return 'none'; if (a.closest('app-input-container')) return 'add'; if (a.closest('.v-row')) return 'row'; return a.tagName; },
  blur() { document.activeElement && document.activeElement.blur(); },
  hideKeyboard() { return window.Capacitor.Plugins.Keyboard.hide(); },
  idb(mode, fn) {
    return new Promise((res, rej) => {
      const req = indexedDB.open('_ionicstorage');
      req.onerror = () => rej(req.error);
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction('_ionickv', mode);
        const store = tx.objectStore('_ionickv');
        const r = fn(store);
        tx.oncomplete = () => { db.close(); res(r.result); };
        tx.onerror = () => rej(tx.error);
      };
    });
  },
  idbGet(key) { return this.idb('readonly', s => s.get(key)); },
  idbSet(key, value) { return this.idb('readwrite', s => s.put(value, key)); },
  async persistedTodo() {
    const lists = await this.idbGet('grocery_lists');
    const active = await this.idbGet('active_list_id');
    const l = lists.find(x => x.id === active) || lists[0];
    return l.items.filter(i => !i.checked).map(i => i.itemName);
  },
  domTodo() { return [...document.querySelectorAll('.v-row')].filter(r => r.querySelector('.drag-handle')).map(r => this.textInput(r).value); },
};
true;
`;

function items(n, checked, prefix = 'Item ') {
  const out = [];
  for (let i = 1; i <= n; i++) out.push({ id: i, itemName: prefix + i, checked: i <= checked });
  return out;
}

async function connect() {
  const ws = await restartApp();
  const cdp = await CDP.connect(ws);
  await cdp.send('Runtime.enable');
  const p = new Page(cdp);
  for (let i = 0; i < 60; i++) {
    const ready = await p.eval(`!!document.querySelector('app-list-container') && (!!document.querySelector('cdk-virtual-scroll-viewport') || !!document.querySelector('.empty-state'))`);
    if (ready) break;
    await sleep(300);
  }
  await p.eval(HELPERS);
  await sleep(800);
  return { cdp, p };
}

async function seedAndRestart(cdp, p, lists, activeId) {
  await p.eval(`__h.idbSet('grocery_lists', ${JSON.stringify(lists)})`);
  await p.eval(`__h.idbSet('active_list_id', ${activeId})`);
  cdp.close();
  return connect();
}

async function touchDrag(p, from, to, { steps = 12, holdMs = 0, cancel = false, shot = null } = {}) {
  await p.touch('touchStart', [{ x: from.x, y: from.y }]);
  await sleep(60);
  for (let i = 1; i <= steps; i++) {
    const y = from.y + ((to.y - from.y) * i) / steps;
    await p.touch('touchMove', [{ x: from.x, y }]);
    await sleep(20);
  }
  if (shot) {
    await sleep(250);
    screenshot(shot);
  }
  if (holdMs) {
    const t0 = Date.now();
    let wiggle = 0;
    while (Date.now() - t0 < holdMs) {
      wiggle = wiggle ? 0 : 0.5;
      await p.touch('touchMove', [{ x: from.x, y: to.y + wiggle }]);
      await sleep(50);
    }
  }
  await sleep(80);
  await p.touch(cancel ? 'touchCancel' : 'touchEnd', []);
}

const idx = (arr, name) => arr.indexOf(name);

async function keyboardOpen(p, baseline) {
  const s = await p.eval(`__h.state()`);
  return s.innerHeight < baseline - 100 && s.kbdClass;
}
async function keyboardClosed(p, baseline) {
  const s = await p.eval(`__h.state()`);
  return Math.abs(s.innerHeight - baseline) <= 2 && !s.kbdClass;
}

async function run() {
  let { cdp, p } = await connect();

  // ---------- seed: 60 items (5 done) + a short second list ----------
  ({ cdp, p } = await seedAndRestart(cdp, p, [
    { id: 1, name: 'Default', items: items(60, 5) },
    { id: 2, name: 'Other', items: items(5, 2, 'Other ') },
  ], 1));
  await sleep(1200);
  let s = await p.eval(`__h.state()`);
  const baseline = s.innerHeight;
  check('startup: pinned to bottom', s.deficit <= 1, JSON.stringify(s));
  check('startup: no blank rows', (await p.eval(`__h.blank()`)).length === 0);
  check('startup: last item visible', await p.eval(`__h.visible('Item 60')`));
  check('startup: rows fully rendered', (await p.eval(`__h.integrity()`)).length === 0);
  screenshot('01-startup');

  // ---------- real keyboard: tap the add field ----------
  await p.tap(await p.eval(`__h.addInputCenter()`));
  await sleep(1500);
  check('add field: focused', (await p.eval(`__h.focused()`)) === 'add');
  check('add field: real keyboard opened (WebView resized + chip bar hidden)', await keyboardOpen(p, baseline), JSON.stringify(await p.eval(`__h.state()`)));
  s = await p.eval(`__h.state()`);
  check('kbd open (add field): still at bottom', s.deficit <= 1, JSON.stringify(s));
  check('kbd open (add field): no blank rows', (await p.eval(`__h.blank()`)).length === 0);
  check('kbd open (add field): last item visible', await p.eval(`__h.visible('Item 60')`));
  screenshot('02-keyboard-add-field');

  // ---------- add via Enter -> keyboard closes (the reported bug) ----------
  await p.type('Fresh item');
  await sleep(300);
  await p.enter();
  await sleep(1500);
  check('add + Enter: keyboard closed', await keyboardClosed(p, baseline), JSON.stringify(await p.eval(`__h.state()`)));
  s = await p.eval(`__h.state()`);
  check('add + kbd close: pinned to bottom', s.deficit <= 1, JSON.stringify(s));
  check('add + kbd close: new item visible', await p.eval(`__h.visible('Fresh item')`));
  check('add + kbd close: no blank rows', (await p.eval(`__h.blank()`)).length === 0);
  const persisted0 = await p.eval(`__h.persistedTodo()`);
  check('add: persisted last', persisted0[persisted0.length - 1] === 'Fresh item');
  screenshot('03-after-add');

  // ---------- edit 2nd-from-bottom row: keyboard open, dismiss with input kept focused ----------
  await p.tap(await p.eval(`__h.rowInputCenter('Item 60')`));
  await sleep(1500);
  check('edit row: focused', (await p.eval(`__h.focused()`)) === 'row');
  check('edit row: keyboard opened', await keyboardOpen(p, baseline));
  check('edit + kbd open: focused row visible', await p.eval(`__h.visible('Item 60')`));
  check('edit + kbd open: no blank rows', (await p.eval(`__h.blank()`)).length === 0);
  screenshot('04-keyboard-edit-row');
  await p.eval(`__h.hideKeyboard()`);
  await sleep(1500);
  check('edit + Keyboard.hide(): keyboard closed', await keyboardClosed(p, baseline));
  s = await p.eval(`__h.state()`);
  check('edit + kbd close: pinned to bottom', s.deficit <= 1, JSON.stringify(s));
  check('edit + kbd close: last row visible', await p.eval(`__h.visible('Fresh item')`));
  check('edit + kbd close: no blank rows', (await p.eval(`__h.blank()`)).length === 0);
  await p.eval(`__h.blur()`);
  await sleep(600);

  // ---------- mid-list edit: position preserved across keyboard ----------
  await p.eval(`__h.vp().scrollTop = 20 * __h.ROW`);
  await sleep(500);
  const midName = await p.eval(`__h.midRow()`);
  await p.tap(await p.eval(`__h.rowInputCenter('${midName}')`));
  await sleep(1500);
  check('mid-list: keyboard opened', await keyboardOpen(p, baseline));
  check(`mid-list + kbd open: ${midName} visible`, await p.eval(`__h.visible('${midName}')`));
  check('mid-list + kbd open: no blank rows', (await p.eval(`__h.blank()`)).length === 0);
  const midOpen = await p.eval(`__h.state()`);
  await p.eval(`__h.hideKeyboard()`);
  await sleep(1500);
  s = await p.eval(`__h.state()`);
  check('mid-list + kbd close: position preserved', Math.abs(s.st - midOpen.st) <= 1, `open ${midOpen.st} closed ${s.st}`);
  check(`mid-list + kbd close: ${midName} visible`, await p.eval(`__h.visible('${midName}')`));
  check('mid-list + kbd close: no blank rows', (await p.eval(`__h.blank()`)).length === 0);
  await p.eval(`__h.blur()`);
  await sleep(600);

  // ---------- reorder (real touch pipeline) ----------
  // Scroll the to-do section into view (seed: done header + 5 done rows = 6
  // rows above it); a phone viewport is only ~9 rows tall.
  await p.eval(`__h.vp().scrollTop = 6 * __h.ROW`);
  await sleep(500);
  let name = await p.eval(`__h.safeTodo(3 * __h.ROW)`);
  let order = await p.eval(`__h.domTodo()`);
  let before = idx(order, name);
  let from = await p.eval(`__h.handleCenter('${name}')`);
  await touchDrag(p, from, { x: from.x, y: from.y + 3 * ROW }, { shot: '05-mid-drag' });
  await sleep(800);
  order = await p.eval(`__h.domTodo()`);
  check(`reorder down 3: ${name} moved +3`, idx(order, name) === before + 3, order.slice(0, 8).join(','));
  check('reorder: overlay removed', (await p.eval(`__h.overlays()`)) === 0);
  check('reorder: no hidden rows left', (await p.eval(`__h.hidden()`)) === 0);
  check('reorder: no shifted rows left', (await p.eval(`__h.shifted()`)) === 0);
  await sleep(500);
  check('reorder: persisted', (await p.eval(`__h.persistedTodo()`)).slice(0, 8).join(',') === order.slice(0, 8).join(','));
  screenshot('06-after-drop');

  name = await p.eval(`__h.safeTodo(-2 * __h.ROW)`);
  before = idx(order, name);
  from = await p.eval(`__h.handleCenter('${name}')`);
  await touchDrag(p, from, { x: from.x, y: from.y - 2 * ROW });
  await sleep(800);
  order = await p.eval(`__h.domTodo()`);
  check(`reorder up 2: ${name} moved -2`, idx(order, name) === before - 2, order.slice(0, 8).join(','));

  const unchanged = order.join(',');
  name = await p.eval(`__h.safeTodo(2 * __h.ROW)`);
  from = await p.eval(`__h.handleCenter('${name}')`);
  await touchDrag(p, from, { x: from.x, y: from.y + 2 * ROW }, { cancel: true });
  await sleep(800);
  check('reorder: cancel leaves order unchanged', (await p.eval(`__h.domTodo()`)).join(',') === unchanged);
  check('reorder: cancel removes overlay', (await p.eval(`__h.overlays()`)) === 0);

  const firstTodo = order[0];
  from = await p.eval(`__h.handleCenter('${firstTodo}')`);
  await touchDrag(p, from, { x: from.x, y: from.y - 3 * ROW });
  await sleep(800);
  check('reorder: cannot leave to-do section', (await p.eval(`__h.domTodo()`))[0] === firstTodo);

  // ---------- long-distance reorder via edge auto-scroll ----------
  await p.eval(`__h.vp().scrollTop = __h.vp().scrollHeight`);
  await sleep(600);
  const beforeAuto = await p.eval(`__h.persistedTodo()`);
  from = await p.eval(`__h.handleCenter('Item 58')`);
  check('autoscroll: handle found near bottom', !!from);
  const vpTop = (await p.eval(`__h.state()`)).top;
  await touchDrag(p, from, { x: from.x, y: vpTop + 12 }, { holdMs: 2000 });
  await sleep(1000);
  const afterAuto = await p.eval(`__h.persistedTodo()`);
  const moved = idx(beforeAuto, 'Item 58') - idx(afterAuto, 'Item 58');
  check('autoscroll: Item 58 moved far up', moved >= 15, `moved ${moved} positions`);
  check('autoscroll: overlay removed', (await p.eval(`__h.overlays()`)) === 0);
  check('autoscroll: no blank rows', (await p.eval(`__h.blank()`)).length === 0);
  check('autoscroll: rows intact', (await p.eval(`__h.integrity()`)).length === 0);

  // ---------- list switch via chips ----------
  await p.tap(await p.eval(`__h.chipCenter('Other')`));
  await sleep(1200);
  check('switch to short list: rows fully rendered', (await p.eval(`__h.integrity()`)).length === 0);
  s = await p.eval(`__h.state()`);
  check('short list hugs content', s.sh === s.ch && s.ch === 7 * ROW && s.deficit === 0, JSON.stringify(s));
  screenshot('07-short-list');
  await p.tap(await p.eval(`__h.chipCenter('Default')`));
  await sleep(1200);
  check('switch back: rows fully rendered', (await p.eval(`__h.integrity()`)).length === 0, JSON.stringify(await p.eval(`__h.integrity()`)).slice(0, 200));
  check('switch back: pinned to bottom', (await p.eval(`__h.state()`)).deficit <= 1);
  check('switch back: no blank rows', (await p.eval(`__h.blank()`)).length === 0);
  for (let i = 0; i < 3; i++) {
    await p.tap(await p.eval(`__h.chipCenter('Other')`));
    await sleep(700);
    await p.tap(await p.eval(`__h.chipCenter('Default')`));
    await sleep(900);
  }
  check('switch x3: rows fully rendered', (await p.eval(`__h.integrity()`)).length === 0, JSON.stringify(await p.eval(`__h.integrity()`)).slice(0, 200));
  check('switch x3: no blank rows', (await p.eval(`__h.blank()`)).length === 0);

  // ---------- 5,000 items ----------
  ({ cdp, p } = await seedAndRestart(cdp, p, [{ id: 1, name: 'Default', items: items(5000, 4000) }], 1));
  await sleep(2000);
  s = await p.eval(`__h.state()`);
  check('5000 items: pinned to bottom at startup', s.deficit <= 1, JSON.stringify(s));
  check('5000 items: last item visible', await p.eval(`__h.visible('Item 5000')`));
  check('5000 items: virtualized', s.rendered < 80, `rendered ${s.rendered}`);
  check('5000 items: no blank rows', (await p.eval(`__h.blank()`)).length === 0);
  await p.eval(`__h.vp().scrollTop = 2500 * __h.ROW`);
  await sleep(1000);
  check('5000 items: mid-scroll no blank rows', (await p.eval(`__h.blank()`)).length === 0);
  check('5000 items: mid-scroll rows intact', (await p.eval(`__h.integrity()`)).length === 0);
  await p.eval(`__h.vp().scrollTop = __h.vp().scrollHeight`);
  await sleep(800);
  from = await p.eval(`__h.handleCenter('Item 4998')`);
  await touchDrag(p, from, { x: from.x, y: from.y - 2 * ROW });
  await sleep(1000);
  order = await p.eval(`__h.persistedTodo()`);
  check('5000 items: reorder near end persisted', idx(order, 'Item 4998') === idx(order, 'Item 4996') - 1, order.slice(-6).join(','));

  // leave the dev app with a small, sane list
  ({ cdp, p } = await seedAndRestart(cdp, p, [{ id: 1, name: 'Default', items: items(12, 4) }], 1));
  cdp.close();
}

run()
  .catch((e) => {
    console.error('HARNESS ERROR', e);
    results.push({ name: 'harness completed', ok: false });
  })
  .finally(() => {
    const failed = results.filter((r) => !r.ok).length;
    console.log(`\n${results.length - failed}/${results.length} checks passed`);
    process.exit(failed ? 1 : 0);
  });
