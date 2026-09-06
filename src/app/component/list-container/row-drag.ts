import { signal } from '@angular/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';

/** What the reorder controller needs from the list that hosts it. */
export interface RowDragHost {
  /** Scrolling element that holds the rows; null while the list is empty. */
  viewportEl(): HTMLElement | null;
  /** Uniform row height in px (items AND section headers). */
  rowHeight: number;
  /** Half-open [start, end) range of row indices that may be dragged / dropped on. */
  slotRange(): { start: number; end: number } | null;
  /** Apply the reorder to the model. Indices are combined-row indices. */
  commit(fromRow: number, toRow: number, sourceId: number): void;
}

interface Overlay {
  preview: HTMLElement;
  card: HTMLElement;
  slot: HTMLElement;
}

/** Holding the finger this close to a viewport edge scrolls the list. */
const EDGE_ZONE_PX = 56;
/**
 * The finger has to rest in the edge zone this long before scrolling starts,
 * so dropping a row near the edge never nudges the list at the last moment.
 */
const ENGAGE_MS = 150;
/** Auto-scroll speed (px per frame) right at the edge, before acceleration. */
const BASE_SPEED_PX = 12;
/** Speed multiplier reached after holding at the edge for ACCEL_MS. */
const MAX_ACCEL = 3.5;
const ACCEL_MS = 1200;
/**
 * Finger travel needed before auto-scroll arms, so grabbing a row that already
 * sits near an edge doesn't immediately scroll the list away.
 */
const ARM_DISTANCE_PX = 10;
/** Preview glide-into-slot duration on release. */
const SETTLE_MS = 180;
/** Preview cross-fade once the real row is revealed underneath it. */
const FADE_MS = 120;

const HANDLE_SVG =
  '<svg viewBox="0 0 512 512" width="22" height="22" aria-hidden="true">' +
  '<path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" ' +
  'stroke-width="32" d="M96 256h320M96 176h320M96 336h320"/></svg>';

const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, n));

/**
 * Pointer-driven reorder for a fixed-row-height virtual list.
 *
 * The drop slot is derived from geometry (finger position, scroll offset, row
 * height) and never from which rows happen to be rendered, so it stays correct
 * while the virtual scroller creates and destroys rows under the finger. Rows
 * between the source and target slots are shifted through a signal, so rows
 * rendered mid-drag pick up the right offset too. A fixed-position preview and
 * slot indicator live on <body>, outside the scroller, so they survive any
 * re-render and are never clipped by it.
 */
export class RowDragController {
  /** True from pointerdown on a handle until release or cancel. */
  readonly active = signal(false);

  private readonly fromRow = signal(-1);
  private readonly toRow = signal(-1);
  private readonly sourceId = signal<number | null>(null);
  /** The moved row stays hidden while the preview glides onto it. */
  private readonly settlingId = signal<number | null>(null);

  private pointerId = -1;
  private startY = 0;
  private pointerY = 0;
  /** Finger offset from the top of the grabbed row. */
  private grabOffset = 0;
  private armed = false;
  private edgeSince = 0;
  private rafId = 0;
  private overlay: Overlay | null = null;
  private unbind: (() => void) | null = null;

  constructor(private readonly host: RowDragHost) {}

  /** Row is invisible: it is being dragged, or still settling into place. */
  isHidden(itemId: number): boolean {
    return this.sourceId() === itemId || this.settlingId() === itemId;
  }

  /** Transform for the row at `index` so rows part to open the drop slot. */
  shiftFor(index: number): string | null {
    if (!this.active()) return null;
    const from = this.fromRow();
    const to = this.toRow();
    if (from === to || index === from) return null;
    const h = this.host.rowHeight;
    if (from < to && index > from && index <= to) return `translate3d(0, -${h}px, 0)`;
    if (to < from && index >= to && index < from) return `translate3d(0, ${h}px, 0)`;
    return null;
  }

  start(event: PointerEvent, rowIndex: number, itemId: number, label: string): void {
    if (this.active() || this.settlingId() !== null) return;
    if (!event.isPrimary) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const vp = this.host.viewportEl();
    const range = this.host.slotRange();
    if (!vp || !range || rowIndex < range.start || rowIndex >= range.end) return;

    // Keeps focus where it is (no keyboard flicker) and stops the row's own
    // gestures (swipe-to-delete, tap-to-edit) from seeing this pointer.
    event.preventDefault();
    event.stopPropagation();

    const h = this.host.rowHeight;
    const vpRect = vp.getBoundingClientRect();
    // Row's on-screen top from geometry, so it doesn't matter whether the
    // handle's row element is mid-render.
    const rowTop = vpRect.top + rowIndex * h - vp.scrollTop;

    this.pointerId = event.pointerId;
    this.startY = this.pointerY = event.clientY;
    this.grabOffset = clamp(event.clientY - rowTop, 0, h);
    this.armed = false;
    this.edgeSince = 0;

    this.fromRow.set(rowIndex);
    this.toRow.set(rowIndex);
    this.sourceId.set(itemId);
    this.active.set(true);

    this.overlay = buildOverlay(label, h);
    this.placeOverlay(vp, vpRect);
    // Lift on the next frame so the scale/shadow transition is visible.
    requestAnimationFrame(() => this.overlay?.card.classList.add('lifted'));

    this.bind();
    this.rafId = requestAnimationFrame(this.tick);
    haptic(ImpactStyle.Light);
  }

  /** Abort an in-progress drag without changing the model. */
  cancel(): void {
    if (this.active()) this.finish(false);
  }

  // Listen on window (capture) rather than capturing the pointer on the handle:
  // the handle's row may be destroyed by the virtual scroller mid-drag, which
  // would silently drop a captured pointer.
  private bind(): void {
    const own = (e: PointerEvent) => e.pointerId === this.pointerId;
    const move = (e: PointerEvent) => {
      if (!own(e)) return;
      e.preventDefault();
      this.pointerY = e.clientY;
      this.updateTarget();
    };
    const up = (e: PointerEvent) => {
      if (!own(e)) return;
      e.preventDefault();
      this.finish(true);
    };
    const abort = (e: PointerEvent) => {
      if (own(e)) this.finish(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') this.finish(false);
    };
    const hidden = () => {
      if (document.visibilityState === 'hidden') this.finish(false);
    };
    const blur = () => this.finish(false);

    const opts: AddEventListenerOptions = { capture: true, passive: false };
    window.addEventListener('pointermove', move, opts);
    window.addEventListener('pointerup', up, opts);
    window.addEventListener('pointercancel', abort, opts);
    window.addEventListener('keydown', key, true);
    window.addEventListener('blur', blur);
    document.addEventListener('visibilitychange', hidden);
    this.unbind = () => {
      window.removeEventListener('pointermove', move, opts);
      window.removeEventListener('pointerup', up, opts);
      window.removeEventListener('pointercancel', abort, opts);
      window.removeEventListener('keydown', key, true);
      window.removeEventListener('blur', blur);
      document.removeEventListener('visibilitychange', hidden);
    };
  }

  private readonly tick = (now: number): void => {
    if (!this.active()) return;
    const vp = this.host.viewportEl();
    if (!vp) {
      this.finish(false);
      return;
    }
    const vpRect = vp.getBoundingClientRect();
    this.autoScroll(vp, vpRect, now);
    if (!this.active()) return; // autoScroll -> updateTarget may have aborted
    this.placeOverlay(vp, vpRect);
    this.rafId = requestAnimationFrame(this.tick);
  };

  private autoScroll(vp: HTMLElement, vpRect: DOMRect, now: number): void {
    if (!this.armed) {
      if (Math.abs(this.pointerY - this.startY) < ARM_DISTANCE_PX) return;
      this.armed = true;
    }
    // On a very short viewport (keyboard up) the zones must not meet in the
    // middle, or the list would scroll no matter where the finger rests.
    const zone = Math.min(EDGE_ZONE_PX, vpRect.height / 4);
    if (zone <= 0) return;
    const topZone = vpRect.top + zone;
    const bottomZone = vpRect.bottom - zone;

    let dir = 0;
    let strength = 0;
    if (this.pointerY < topZone) {
      dir = -1;
      strength = (topZone - this.pointerY) / zone;
    } else if (this.pointerY > bottomZone) {
      dir = 1;
      strength = (this.pointerY - bottomZone) / zone;
    }
    if (dir === 0) {
      this.edgeSince = 0;
      return;
    }
    if (this.edgeSince === 0) this.edgeSince = now;
    const held = now - this.edgeSince;
    if (held < ENGAGE_MS) return;
    const accel = 1 + (MAX_ACCEL - 1) * Math.min(1, (held - ENGAGE_MS) / ACCEL_MS);
    const before = vp.scrollTop;
    vp.scrollTop = before + dir * Math.min(1, strength) * BASE_SPEED_PX * accel;
    if (vp.scrollTop !== before) this.updateTarget();
  }

  private updateTarget(): void {
    const vp = this.host.viewportEl();
    const range = this.host.slotRange();
    const from = this.fromRow();
    if (!vp || !range || from < range.start || from >= range.end) {
      // The list changed under us (section vanished); bail out safely.
      this.finish(false);
      return;
    }
    const h = this.host.rowHeight;
    const vpRect = vp.getBoundingClientRect();
    // The slot under the dragged card's centre (not the finger), which is
    // what people expect the row to land on.
    const centerY = this.pointerY - this.grabOffset + h / 2;
    const contentY = centerY - vpRect.top + vp.scrollTop;
    const slot = clamp(Math.floor(contentY / h), range.start, range.end - 1);
    if (slot !== this.toRow()) this.toRow.set(slot);
  }

  private placeOverlay(vp: HTMLElement, vpRect: DOMRect): void {
    const o = this.overlay;
    if (!o) return;
    const h = this.host.rowHeight;
    // The preview follows the finger but never leaves the list's box.
    const top = clamp(this.pointerY - this.grabOffset, vpRect.top - h * 0.35, vpRect.bottom - h * 0.65);
    o.preview.style.transform = `translate3d(0, ${top}px, 0)`;
    o.preview.style.left = `${vpRect.left}px`;
    o.preview.style.width = `${vpRect.width}px`;

    const slotTop = vpRect.top + this.toRow() * h - vp.scrollTop;
    const visible = slotTop > vpRect.top - h && slotTop < vpRect.bottom;
    o.slot.style.opacity = visible ? '1' : '0';
    o.slot.style.transform = `translate3d(0, ${slotTop}px, 0)`;
    o.slot.style.left = `${vpRect.left}px`;
    o.slot.style.width = `${vpRect.width}px`;
  }

  private finish(commit: boolean): void {
    if (!this.active()) return;
    cancelAnimationFrame(this.rafId);
    this.unbind?.();
    this.unbind = null;

    const from = this.fromRow();
    const to = this.toRow();
    const id = this.sourceId();
    const moved = commit && id !== null && from !== to;
    const landing = moved ? to : from;

    // Rows snap to their final order instantly (the transition is scoped to
    // `.dragging`, which goes away in the same change detection pass); the
    // moved row stays hidden until the preview has glided onto it.
    this.settlingId.set(id);
    this.active.set(false);
    this.fromRow.set(-1);
    this.toRow.set(-1);
    this.sourceId.set(null);
    if (moved) {
      this.host.commit(from, to, id);
      haptic(ImpactStyle.Medium);
    }

    const o = this.overlay;
    this.overlay = null;
    const vp = this.host.viewportEl();
    const reveal = () => this.settlingId.set(null);
    if (!o) {
      reveal();
      return;
    }
    const remove = () => {
      o.preview.remove();
      o.slot.remove();
    };
    if (!vp) {
      remove();
      reveal();
      return;
    }

    const h = this.host.rowHeight;
    const vpRect = vp.getBoundingClientRect();
    const targetTop = vpRect.top + landing * h - vp.scrollTop;
    const onScreen = targetTop > vpRect.top - h && targetTop < vpRect.bottom;

    o.card.classList.remove('lifted');
    o.slot.style.opacity = '0';
    const glide = onScreen
      ? o.preview.animate(
          [{ transform: o.preview.style.transform }, { transform: `translate3d(0, ${targetTop}px, 0)` }],
          { duration: SETTLE_MS, easing: 'cubic-bezier(0.2, 0, 0, 1)', fill: 'forwards' }
        )
      : o.preview.animate([{ opacity: 1 }, { opacity: 0 }], { duration: SETTLE_MS, fill: 'forwards' });

    let settled = false;
    const settle = () => {
      if (settled) return;
      settled = true;
      // Reveal the real row first, then fade the preview out over it.
      reveal();
      const fade = o.preview.animate([{ opacity: 1 }, { opacity: 0 }], { duration: FADE_MS, fill: 'forwards' });
      let removed = false;
      const finishRemove = () => {
        if (removed) return;
        removed = true;
        remove();
      };
      fade.addEventListener('finish', finishRemove);
      fade.addEventListener('cancel', finishRemove);
      setTimeout(finishRemove, FADE_MS + 100);
    };
    glide.addEventListener('finish', settle);
    glide.addEventListener('cancel', settle);
    setTimeout(settle, SETTLE_MS + 100); // safety net if animations are disabled
  }
}

function buildOverlay(label: string, rowHeight: number): Overlay {
  const preview = document.createElement('div');
  preview.className = 'row-drag-preview';
  preview.setAttribute('aria-hidden', 'true');
  preview.style.height = `${rowHeight}px`;

  const card = document.createElement('div');
  card.className = 'row-drag-preview__card';
  const box = document.createElement('span');
  box.className = 'row-drag-preview__box';
  const text = document.createElement('span');
  text.className = 'row-drag-preview__label';
  text.textContent = label;
  const handle = document.createElement('span');
  handle.className = 'row-drag-preview__handle';
  handle.innerHTML = HANDLE_SVG;
  card.append(box, text, handle);
  preview.append(card);

  const slot = document.createElement('div');
  slot.className = 'row-drag-slot';
  slot.setAttribute('aria-hidden', 'true');
  slot.style.height = `${rowHeight}px`;

  document.body.append(slot, preview);
  return { preview, card, slot };
}

function haptic(style: ImpactStyle): void {
  try {
    void Haptics.impact({ style }).catch(() => undefined);
  } catch {
    // Not available on this platform; purely cosmetic.
  }
}
