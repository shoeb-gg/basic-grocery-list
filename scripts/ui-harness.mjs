// Drives the dev build (http://localhost:4200) in headless Chrome over CDP and
// checks the list flow: bottom pinning across keyboard open/close, focused-row
// visibility, blank-row rendering, list switching, and drag-to-reorder.
import { spawn, spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import path from 'node:path';

const APP = 'http://localhost:4200/';
const DEBUG_PORT = 9333;
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PROFILE = path.join(import.meta.dirname, 'chrome-profile');
const W = 412;
const H = 915;
const KEYBOARD = 320;
const ROW = 56;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -- ' + detail : ''}`);
}

async function waitHttp(url, ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try {
      const r = await fetch(url);
      if (r.ok) return;
    } catch {}
    await sleep(1000);
  }
  throw new Error('timeout waiting for ' + url);
}

class CDP {
  constructor(ws) {
    this.ws = ws;
    this.nextId = 0;
    this.pending = new Map();
    this.handlers = new Set();
    ws.onmessage = (m) => this.onMessage(JSON.parse(m.data));
  }
  static async connect(url) {
    const ws = new WebSocket(url);
    await new Promise((res, rej) => {
      ws.onopen = res;
      ws.onerror = rej;
    });
    return new CDP(ws);
  }
  onMessage(msg) {
    if (msg.id && this.pending.has(msg.id)) {
      const { res, rej } = this.pending.get(msg.id);
      this.pending.delete(msg.id);
      msg.error ? rej(new Error(msg.error.message)) : res(msg.result);
    } else if (msg.method) {
      for (const h of this.handlers) h(msg);
    }
  }
  send(method, params = {}, sessionId) {
    const id = ++this.nextId;
    return new Promise((res, rej) => {
      this.pending.set(id, { res, rej });
      this.ws.send(JSON.stringify({ id, method, params, sessionId }));
    });
  }
  waitEvent(method, sessionId, ms = 30000) {
    return new Promise((res, rej) => {
      const t = setTimeout(() => {
        this.handlers.delete(h);
        rej(new Error('timeout waiting for ' + method));
      }, ms);
      const h = (m) => {
        if (m.method === method && (!sessionId || m.sessionId === sessionId)) {
          clearTimeout(t);
          this.handlers.delete(h);
          res(m.params);
        }
      };
      this.handlers.add(h);
    });
  }
}

class Page {
  constructor(cdp, sid) {
    this.cdp = cdp;
    this.sid = sid;
  }
  send(method, params) {
    return this.cdp.send(method, params, this.sid);
  }
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) {
      throw new Error(r.exceptionDetails.exception?.description || JSON.stringify(r.exceptionDetails));
    }
    return r.result.value;
  }
  resize(height) {
    return this.send('Emulation.setDeviceMetricsOverride', { width: W, height, deviceScaleFactor: 2, mobile: true });
  }
  touch(type, touchPoints) {
    return this.send('Input.dispatchTouchEvent', { type, touchPoints });
  }
  mouse(type, x, y, extra = {}) {
    return this.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', ...extra });
  }
  async goto(url) {
    const loaded = this.cdp.waitEvent('Page.loadEventFired', this.sid, 60000);
    await this.send('Page.navigate', { url });
    await loaded;
    for (let i = 0; i < 100; i++) {
      const ready = await this.eval(
        `!!(window.ng && document.querySelector('app-root') && ng.getComponent(document.querySelector('app-root')) && ng.getComponent(document.querySelector('app-root')).listStore.lists().length > 0)`
      );
      if (ready) break;
      await sleep(200);
    }
    await this.eval(HELPERS);
    await sleep(400);
  }
}

// Page-side helpers. `ng` is Angular's dev-mode debug API (ng serve).
const HELPERS = `
window.__h = {
  ROW: ${ROW},
  app() { return ng.getComponent(document.querySelector('app-root')); },
  store() { return this.app().listStore; },
  vp() { return document.querySelector('cdk-virtual-scroll-viewport'); },
  vpCmp() { return ng.getComponent(this.vp()); },
  state() {
    const el = this.vp();
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return {
      sh: el.scrollHeight, ch: el.clientHeight, st: el.scrollTop,
      deficit: el.scrollHeight - el.clientHeight - el.scrollTop,
      top: r.top, bottom: r.bottom, height: r.height,
      range: this.vpCmp().getRenderedRange(), dataLength: this.vpCmp().getDataLength(),
      rendered: document.querySelectorAll('.v-row').length,
    };
  },
  async seed(n, checked) {
    const items = [];
    for (let i = 1; i <= n; i++) items.push({ id: i, itemName: 'Item ' + i, checked: i <= checked });
    const s = this.store();
    s.originalList.set(items); s.setUpLists(); s.setMaxId();
    await s.syncAllLists();
  },
  order() { return this.store().unCheckedList().map(i => i.itemName); },
  // ion-checkbox adds a hidden form input to the row, so target the text input.
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
  // First to-do row whose handle, and the handle after moving by travelPx,
  // both sit well inside the viewport and outside the auto-scroll edge zones.
  safeTodo(travelPx) {
    const vr = this.vp().getBoundingClientRect();
    const lo = vr.top + this.ROW + 12, hi = vr.bottom - this.ROW - 12;
    // Moving up needs that many to-do rows above (the section clamps otherwise).
    const needAbove = travelPx < 0 ? Math.ceil(-travelPx / this.ROW) : 0;
    const todos = [...document.querySelectorAll('.v-row')].filter(r => r.querySelector('.drag-handle'));
    for (let k = needAbove; k < todos.length; k++) {
      const b = todos[k].querySelector('.drag-handle').getBoundingClientRect();
      const y = b.top + b.height / 2;
      if (y > lo && y < hi && y + travelPx > lo && y + travelPx < hi) return this.textInput(todos[k]).value;
    }
    return null;
  },
  keyboard(open) { this.app().keyboardOpen.set(open); },
  focusRow(name) { const r = this.row(name); if (!r) return false; this.textInput(r).focus(); return true; },
  focusAdd() { document.querySelector('app-input-container input').focus(); },
  blurAll() { document.activeElement && document.activeElement.blur(); },
  typeAndEnter(text) {
    const inp = document.querySelector('app-input-container input');
    inp.focus(); inp.value = text;
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    inp.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true }));
  },
  // Every ROW-px slice of the visible viewport must be covered by a rendered row.
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
  // Each rendered item row must show its checkbox, input and (to-do) handle.
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
};
true;
`;

async function touchDrag(p, from, to, { steps = 12, holdMs = 0, cancel = false } = {}) {
  await p.touch('touchStart', [{ x: from.x, y: from.y }]);
  await sleep(40);
  for (let i = 1; i <= steps; i++) {
    const y = from.y + ((to.y - from.y) * i) / steps;
    await p.touch('touchMove', [{ x: from.x, y }]);
    await sleep(16);
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
  await sleep(60);
  await p.touch(cancel ? 'touchCancel' : 'touchEnd', []);
}

async function mouseDrag(p, from, to, steps = 10) {
  await p.mouse('mouseMoved', from.x, from.y);
  await p.mouse('mousePressed', from.x, from.y, { clickCount: 1 });
  await sleep(40);
  for (let i = 1; i <= steps; i++) {
    await p.mouse('mouseMoved', from.x, from.y + ((to.y - from.y) * i) / steps);
    await sleep(16);
  }
  await sleep(60);
  await p.mouse('mouseReleased', from.x, to.y, { clickCount: 1 });
}

const idx = (order, name) => order.indexOf(name);

async function run(p) {
  // ---------- Scenario: startup lands at the bottom (60 items, 5 done) ----------
  await p.eval(`__h.seed(60, 5)`);
  await p.goto(APP);
  await sleep(1200);
  let s = await p.eval(`__h.state()`);
  check('startup: pinned to bottom', s && s.deficit <= 1, JSON.stringify(s));
  check('startup: no blank rows', (await p.eval(`__h.blank()`)).length === 0);
  check('startup: last item visible', await p.eval(`__h.visible('Item 60')`));
  check('startup: rows fully rendered', (await p.eval(`__h.integrity()`)).length === 0);

  // ---------- Scenario: keyboard opens with the add field focused ----------
  await p.eval(`__h.focusAdd()`);
  await p.resize(H - KEYBOARD);
  await p.eval(`__h.keyboard(true)`);
  await sleep(600);
  s = await p.eval(`__h.state()`);
  check('kbd open (add field): still at bottom', s.deficit <= 1, JSON.stringify(s));
  check('kbd open (add field): no blank rows', (await p.eval(`__h.blank()`)).length === 0);
  check('kbd open (add field): last item visible', await p.eval(`__h.visible('Item 60')`));

  // ---------- Scenario: add via Enter, keyboard closes (the reported bug) ----------
  await p.eval(`__h.typeAndEnter('Fresh item')`);
  await sleep(120);
  await p.resize(H);
  await p.eval(`__h.keyboard(false)`);
  await sleep(700);
  s = await p.eval(`__h.state()`);
  check('add + kbd close: pinned to bottom', s.deficit <= 1, JSON.stringify(s));
  check('add + kbd close: new item visible', await p.eval(`__h.visible('Fresh item')`));
  check('add + kbd close: no blank rows', (await p.eval(`__h.blank()`)).length === 0);
  const order0 = await p.eval(`__h.order()`);
  check('add: item appended last', order0[order0.length - 1] === 'Fresh item');

  // ---------- Scenario: edit 2nd-from-bottom row, keyboard open then close ----------
  check('edit: focus row', await p.eval(`__h.focusRow('Item 60')`));
  await p.resize(H - KEYBOARD);
  await p.eval(`__h.keyboard(true)`);
  await sleep(600);
  check('edit + kbd open: focused row visible', await p.eval(`__h.visible('Item 60')`));
  check('edit + kbd open: no blank rows', (await p.eval(`__h.blank()`)).length === 0);
  await p.resize(H);
  await p.eval(`__h.keyboard(false)`);
  await sleep(700);
  s = await p.eval(`__h.state()`);
  check('edit + kbd close: pinned to bottom', s.deficit <= 1, JSON.stringify(s));
  check('edit + kbd close: last row visible', await p.eval(`__h.visible('Fresh item')`));
  check('edit + kbd close: no blank rows', (await p.eval(`__h.blank()`)).length === 0);
  await p.eval(`__h.blurAll()`);

  // ---------- Scenario: mid-list position preserved across keyboard ----------
  await p.eval(`__h.vp().scrollTop = 20 * __h.ROW`);
  await sleep(200);
  const midBefore = await p.eval(`__h.state()`);
  await p.resize(H - KEYBOARD);
  await p.eval(`__h.keyboard(true)`);
  await sleep(500);
  check('mid-list + kbd open: no blank rows', (await p.eval(`__h.blank()`)).length === 0);
  await p.resize(H);
  await p.eval(`__h.keyboard(false)`);
  await sleep(700);
  s = await p.eval(`__h.state()`);
  check('mid-list: position preserved', Math.abs(s.st - midBefore.st) <= 1, `before ${midBefore.st} after ${s.st}`);
  check('mid-list: no blank rows', (await p.eval(`__h.blank()`)).length === 0);

  // ---------- Scenario: reorder by touch, 3 rows down ----------
  await p.eval(`__h.vp().scrollTop = 0`);
  await sleep(300);
  let name = await p.eval(`__h.safeTodo(3 * __h.ROW)`);
  let order = await p.eval(`__h.order()`);
  let before = idx(order, name);
  let from = await p.eval(`__h.handleCenter('${name}')`);
  check('reorder: handle found', !!from, name);
  await touchDrag(p, from, { x: from.x, y: from.y + 3 * ROW });
  await sleep(500);
  order = await p.eval(`__h.order()`);
  check(`reorder down 3: ${name} moved +3`, idx(order, name) === before + 3, order.slice(0, 8).join(','));
  check('reorder: overlay removed', (await p.eval(`__h.overlays()`)) === 0);
  check('reorder: no hidden rows left', (await p.eval(`__h.hidden()`)) === 0);
  check('reorder: no shifted rows left', (await p.eval(`__h.shifted()`)) === 0);
  check('reorder: persisted', (await p.eval(`__h.store().lists().find(l => l.id === __h.store().activeListId()).items.filter(i => !i.checked).map(i => i.itemName).join(',')`)) === order.join(','));

  // ---------- Scenario: reorder by touch, 2 rows up ----------
  name = await p.eval(`__h.safeTodo(-2 * __h.ROW)`);
  before = idx(order, name);
  from = await p.eval(`__h.handleCenter('${name}')`);
  await touchDrag(p, from, { x: from.x, y: from.y - 2 * ROW });
  await sleep(500);
  order = await p.eval(`__h.order()`);
  check(`reorder up 2: ${name} moved -2`, idx(order, name) === before - 2, order.slice(0, 8).join(','));

  // ---------- Scenario: drop in place -> unchanged ----------
  const unchanged = order.join(',');
  name = await p.eval(`__h.safeTodo(6)`);
  from = await p.eval(`__h.handleCenter('${name}')`);
  await touchDrag(p, from, { x: from.x, y: from.y + 6 });
  await sleep(500);
  check('reorder: drop in place leaves order unchanged', (await p.eval(`__h.order()`)).join(',') === unchanged);

  // ---------- Scenario: cancel -> unchanged, overlay gone ----------
  name = await p.eval(`__h.safeTodo(2 * __h.ROW)`);
  from = await p.eval(`__h.handleCenter('${name}')`);
  await touchDrag(p, from, { x: from.x, y: from.y + 2 * ROW }, { cancel: true });
  await sleep(500);
  check('reorder: cancel leaves order unchanged', (await p.eval(`__h.order()`)).join(',') === unchanged);
  check('reorder: cancel removes overlay', (await p.eval(`__h.overlays()`)) === 0);
  check('reorder: cancel clears shifts', (await p.eval(`__h.shifted()`)) === 0);

  // ---------- Scenario: clamp to the to-do section ----------
  const firstTodo = order[0];
  from = await p.eval(`__h.handleCenter('${firstTodo}')`);
  await touchDrag(p, from, { x: from.x, y: from.y - 3 * ROW });
  await sleep(500);
  check('reorder: cannot leave to-do section', (await p.eval(`__h.order()`))[0] === firstTodo);

  // ---------- Scenario: mouse reorder ----------
  name = await p.eval(`__h.safeTodo(2 * __h.ROW)`);
  before = idx(order, name);
  from = await p.eval(`__h.handleCenter('${name}')`);
  await mouseDrag(p, from, { x: from.x, y: from.y + 2 * ROW });
  await sleep(500);
  order = await p.eval(`__h.order()`);
  check(`reorder (mouse) down 2: ${name} moved +2`, idx(order, name) === before + 2, order.slice(0, 6).join(','));

  // ---------- Scenario: drop just inside the edge zone must not scroll ----------
  const vpBottom = (await p.eval(`__h.state()`)).bottom;
  const nearBottomName = await p.eval(`(() => {
    for (const r of [...document.querySelectorAll('.v-row')].reverse()) {
      const b = r.getBoundingClientRect();
      if (b.bottom <= ${vpBottom} - 3 * ${ROW} && r.querySelector('.drag-handle')) return __h.textInput(r).value;
    }
    return null;
  })()`);
  const beforeEdge = idx(order, nearBottomName);
  from = await p.eval(`__h.handleCenter('${nearBottomName}')`);
  await touchDrag(p, from, { x: from.x, y: vpBottom - 20 }, { steps: 8 });
  await sleep(500);
  order = await p.eval(`__h.order()`);
  // The drop slot is the one under the dragged card's centre; the handle is
  // vertically centred in its row, so half a row of travel already crosses.
  const expectedEdge = Math.floor((vpBottom - 20 - from.y + ROW / 2) / ROW);
  check('reorder: quick drop at the edge lands on the slot under the card (no auto-scroll)',
    idx(order, nearBottomName) === beforeEdge + expectedEdge,
    `moved ${idx(order, nearBottomName) - beforeEdge}, expected ${expectedEdge}`);

  // ---------- Scenario: long-distance reorder via edge auto-scroll ----------
  await p.eval(`__h.store().onListSwitch()`); // pin to bottom like the app does
  await sleep(400);
  const beforeAuto = await p.eval(`__h.order()`);
  from = await p.eval(`__h.handleCenter('Item 58')`);
  check('autoscroll: handle found near bottom', !!from);
  const vpTop = (await p.eval(`__h.state()`)).top;
  await touchDrag(p, from, { x: from.x, y: vpTop + 12 }, { holdMs: 1800 });
  await sleep(600);
  order = await p.eval(`__h.order()`);
  const moved = idx(beforeAuto, 'Item 58') - idx(order, 'Item 58');
  check('autoscroll: Item 58 moved far up', moved >= 15, `moved ${moved} positions`);
  check('autoscroll: overlay removed', (await p.eval(`__h.overlays()`)) === 0);
  check('autoscroll: no blank rows', (await p.eval(`__h.blank()`)).length === 0);
  check('autoscroll: rows intact', (await p.eval(`__h.integrity()`)).length === 0);

  // ---------- Scenario: list switch keeps rows fully rendered ----------
  const mainListId = await p.eval(`__h.store().activeListId()`);
  const otherListId = await p.eval(`__h.store().createList('Other').id`);
  await sleep(500);
  await p.eval(`__h.seed(5, 2)`); // 5 items + 2 headers = 7 rows = 392px, well under the viewport
  await sleep(500);
  await p.eval(`__h.store().switchList(${mainListId})`);
  await sleep(1000);
  check('switch back: rows fully rendered', (await p.eval(`__h.integrity()`)).length === 0, JSON.stringify(await p.eval(`__h.integrity()`)).slice(0, 200));
  check('switch back: pinned to bottom', (await p.eval(`__h.state()`)).deficit <= 1);
  check('switch back: no blank rows', (await p.eval(`__h.blank()`)).length === 0);
  await p.eval(`__h.store().switchList(${otherListId})`);
  await sleep(800);
  check('switch to short list: rows fully rendered', (await p.eval(`__h.integrity()`)).length === 0);
  s = await p.eval(`__h.state()`);
  check('short list hugs content (no inner scroll)', s.sh === s.ch && s.ch === 7 * ROW && s.deficit === 0, JSON.stringify(s));
  // Keyboard on a short list: viewport must not stretch or collapse.
  await p.resize(H - KEYBOARD);
  await p.eval(`__h.keyboard(true)`);
  await sleep(500);
  s = await p.eval(`__h.state()`);
  check('short list + kbd open: still hugs content', s.sh === s.ch && s.ch === 7 * ROW, JSON.stringify(s));
  await p.resize(H);
  await p.eval(`__h.keyboard(false)`);
  await sleep(500);
  await p.eval(`__h.store().switchList(${mainListId})`);
  await sleep(800);

  // ---------- Scenario: empty list -> first item ----------
  await p.eval(`__h.store().createList('Empty')`);
  await sleep(500);
  check('empty: shows empty state', await p.eval(`!!document.querySelector('.empty-state') && !__h.vp()`));
  await p.eval(`__h.typeAndEnter('First')`);
  await sleep(700);
  check('empty -> first item visible', await p.eval(`!!__h.vp() && __h.visible('First')`));
  check('empty -> first item: rows intact', (await p.eval(`__h.integrity()`)).length === 0);

  // ---------- Scenario: 5,000 items ----------
  const t0 = Date.now();
  await p.eval(`__h.seed(5000, 4000)`);
  await p.eval(`__h.store().onListSwitch()`);
  await sleep(1500);
  s = await p.eval(`__h.state()`);
  check('5000 items: pinned to bottom', s.deficit <= 1, JSON.stringify(s));
  check('5000 items: last item visible', await p.eval(`__h.visible('Item 5000')`));
  check('5000 items: virtualized (few rows rendered)', s.rendered < 80, `rendered ${s.rendered}, total ${s.dataLength}, ${Date.now() - t0}ms`);
  check('5000 items: no blank rows', (await p.eval(`__h.blank()`)).length === 0);
  await p.eval(`__h.vp().scrollTop = 2500 * __h.ROW`);
  await sleep(600);
  check('5000 items: mid-scroll no blank rows', (await p.eval(`__h.blank()`)).length === 0);
  check('5000 items: mid-scroll rows intact', (await p.eval(`__h.integrity()`)).length === 0);
  await p.eval(`__h.store().onListSwitch()`);
  await sleep(600);
  from = await p.eval(`__h.handleCenter('Item 4998')`);
  await touchDrag(p, from, { x: from.x, y: from.y - 2 * ROW });
  await sleep(600);
  order = await p.eval(`__h.order()`);
  check('5000 items: reorder near end', idx(order, 'Item 4998') === idx(order, 'Item 4996') - 1, order.slice(-6).join(','));
  check('5000 items: startup reload pinned', await (async () => {
    await p.goto(APP);
    await sleep(2000);
    const st = await p.eval(`__h.state()`);
    return st && st.deficit <= 1 && (await p.eval(`__h.visible('Item 5000')`));
  })());
}

async function main() {
  await waitHttp(APP, 300000);
  rmSync(PROFILE, { recursive: true, force: true }); // fresh IndexedDB every run
  const chrome = spawn(
    CHROME,
    [
      `--remote-debugging-port=${DEBUG_PORT}`,
      `--user-data-dir=${PROFILE}`,
      '--headless=new',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-gpu',
      '--hide-scrollbars',
      '--window-size=412,915',
      'about:blank',
    ],
    { stdio: 'ignore' }
  );
  try {
    let version;
    for (let i = 0; i < 60 && !version; i++) {
      try {
        const r = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`);
        if (r.ok) version = await r.json();
      } catch {}
      if (!version) await sleep(500);
    }
    if (!version) throw new Error('Chrome did not expose the debugging port');
    const cdp = await CDP.connect(version.webSocketDebuggerUrl);
    const { targetInfos } = await cdp.send('Target.getTargets');
    const target = targetInfos.find((t) => t.type === 'page');
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: target.targetId, flatten: true });
    const p = new Page(cdp, sessionId);
    await p.send('Page.enable');
    await p.send('Runtime.enable');
    await p.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await p.resize(H);
    await p.goto(APP);
    await run(p);
  } catch (e) {
    console.error('HARNESS ERROR', e);
    results.push({ name: 'harness completed', ok: false });
  } finally {
    spawnSync('taskkill', ['/PID', String(chrome.pid), '/T', '/F'], { stdio: 'ignore' });
  }
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  process.exit(failed ? 1 : 0);
}

main();
