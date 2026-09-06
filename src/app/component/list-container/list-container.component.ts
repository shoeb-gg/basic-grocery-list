import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  viewChild,
} from '@angular/core';

import {
  IonItem,
  IonCheckbox,
  IonInput,
  IonItemSliding,
  IonItemOptions,
  IonItemOption,
  IonIcon,
} from '@ionic/angular/standalone';
import { ToastController } from '@ionic/angular/standalone';
import {
  ScrollingModule,
  CdkVirtualScrollViewport,
} from '@angular/cdk/scrolling';

import { addIcons } from 'ionicons';
import { trashOutline, closeCircle, reorderThreeOutline } from 'ionicons/icons';

import { InputContainerComponent } from '../input-container/input-container.component';
import { RowDragController } from './row-drag';

import { InputHandlerService } from 'src/app/services/input-handler.service';
import { ListStoreService } from 'src/app/services/list-store.service';
import { ListItem } from 'src/models/ListItem';

type Row =
  | { kind: 'done-header'; count: number }
  | { kind: 'todo-header'; count: number }
  | { kind: 'item'; item: ListItem; section: 'done' | 'todo' };

// Every virtual row (items AND section headers) is exactly this tall so the
// fixed-size virtual-scroll strategy positions rows without drift, and so the
// reorder can turn a finger position into a slot with plain arithmetic.
export const ROW_HEIGHT = 56;

// Rows rendered beyond the visible area. Generous because the view cache is
// off (Ionic web components don't survive recycling), so a fling has rows
// ready instead of flashing empty space while new ones hydrate.
const BUFFER_MIN_PX = ROW_HEIGHT * 8;
const BUFFER_MAX_PX = ROW_HEIGHT * 16;

// Gap kept between a focused row and the viewport edge (keyboard) when the
// row is scrolled into view.
const REVEAL_MARGIN_PX = 8;

@Component({
  selector: 'app-list-container',
  templateUrl: './list-container.component.html',
  styleUrls: ['./list-container.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    IonItem,
    IonCheckbox,
    InputContainerComponent,
    IonInput,
    IonItemSliding,
    IonItemOptions,
    IonItemOption,
    IonIcon,
    ScrollingModule,
  ],
})
export class ListContainerComponent {
  readonly ROW_HEIGHT = ROW_HEIGHT;
  readonly BUFFER_MIN_PX = BUFFER_MIN_PX;
  readonly BUFFER_MAX_PX = BUFFER_MAX_PX;

  // Present only while the list has rows (the empty state replaces it).
  private readonly viewport = viewChild(CdkVirtualScrollViewport);
  private readonly injector = inject(Injector);

  // Viewport geometry as of the last anchor pass. Together with the current
  // scrollTop this tells whether the list sat at the bottom *before* the
  // layout change that triggered the current pass — without relying on scroll
  // events, which fire a frame late and can read a half-resized box.
  private prevScrollHeight = 0;
  private prevClientHeight = 0;
  private sizesKnown = false;

  // Flattened, uniform-height rows: [done header, done items, todo header,
  // todo items]. Section headers only appear where the original UI showed
  // them (done when there are checked items; "to do" only when both sections
  // are non-empty).
  rows = computed<Row[]>(() => {
    const checked = this.listStore.checkedList();
    const unchecked = this.listStore.unCheckedList();
    const out: Row[] = [];
    if (checked.length) {
      out.push({ kind: 'done-header', count: checked.length });
      for (const it of checked) out.push({ kind: 'item', item: it, section: 'done' });
    }
    if (unchecked.length) {
      if (checked.length) out.push({ kind: 'todo-header', count: unchecked.length });
      for (const it of unchecked) out.push({ kind: 'item', item: it, section: 'todo' });
    }
    return out;
  });

  isEmpty = computed(() => this.rows().length === 0);

  // To-do rows are contiguous at the tail of `rows`; this is the only range a
  // drag may start in or land on.
  private readonly todoRange = computed(() => {
    const rows = this.rows();
    const start = rows.findIndex((r) => r.kind === 'item' && r.section === 'todo');
    return start < 0 ? null : { start, end: rows.length };
  });

  readonly drag = new RowDragController({
    viewportEl: () => this.viewportEl(),
    rowHeight: ROW_HEIGHT,
    slotRange: () => this.todoRange(),
    commit: (fromRow, toRow, sourceId) => this.commitReorder(fromRow, toRow, sourceId),
  });

  constructor(
    public readonly inputHandler: InputHandlerService,
    public readonly listStore: ListStoreService,
    private readonly toastCtrl: ToastController,
    hostEl: ElementRef<HTMLElement>,
    destroyRef: DestroyRef
  ) {
    addIcons({ trashOutline, closeCircle, reorderThreeOutline });

    // ion-content doesn't scroll; the app shell asks us to land on the newest
    // rows after startup, add, and list switch.
    this.listStore.scrollToBottomFn = () => this.scrollToBottom();

    // Wire up the viewport whenever it (re)appears — the empty state swaps it
    // out — and tear down when it goes away.
    effect((onCleanup) => {
      const vp = this.viewport();
      if (!vp) return;
      const el = vp.elementRef.nativeElement;
      this.sizesKnown = false; // a fresh viewport opens at its newest rows

      // CDK only re-measures on window resize. Our height changes also come
      // from the chip bar collapsing/expanding and from the row count, so tell
      // it every time the box or the content size actually changes — then
      // re-anchor. Observing the spacer catches "rows were added while we sat
      // at the bottom" precisely when the new height has been applied.
      const ro = new ResizeObserver(() => {
        vp.checkViewportSize();
        this.anchor();
      });
      ro.observe(el);
      const spacer = el.querySelector('.cdk-virtual-scroll-spacer');
      if (spacer) ro.observe(spacer);

      onCleanup(() => ro.disconnect());
    });

    // Moving focus between fields (keyboard already up) needs the same
    // treatment as a resize.
    const host = hostEl.nativeElement;
    const onFocusIn = () => this.anchor();
    host.addEventListener('focusin', onFocusIn);
    destroyRef.onDestroy(() => {
      host.removeEventListener('focusin', onFocusIn);
      this.drag.cancel();
    });
  }

  trackRow = (_: number, row: Row): string | number =>
    row.kind === 'item' ? 'i' + row.item.id : row.kind;

  // --- Scroll anchoring ---

  private viewportEl(): HTMLElement | null {
    return this.viewport()?.elementRef.nativeElement ?? null;
  }

  // Decide where the list should sit after a layout change (keyboard, chip
  // bar, row count) or a focus change:
  //  1. add-item field focused -> newest rows must be visible: pin to bottom;
  //  2. we were at the bottom -> stay there (messenger behaviour);
  //  3. a row's field is focused -> make sure that row is on screen.
  // Order matters: pinning first and then revealing means "editing the
  // second-to-last row" still shows the last row when there is room.
  private anchor(): void {
    const el = this.viewportEl();
    if (!el) return;
    if (this.drag.active()) {
      this.recordSizes(el);
      return;
    }

    // "Were we at the bottom?" — against the previous geometry (the box just
    // shrank: scrollTop is unchanged, so the old maximum tells) OR the current
    // one (the box just grew: the browser already clamped us to the new
    // maximum). A user who scrolled away fails both. Before the first pass
    // there is nothing to compare, and a fresh list opens at its newest rows.
    const st = el.scrollTop;
    const nowAtBottom = el.scrollHeight - el.clientHeight - st <= 1;
    const wasAtBottom = this.prevScrollHeight - this.prevClientHeight - st <= 1;
    const pinToBottom = !this.sizesKnown || nowAtBottom || wasAtBottom;

    const active = document.activeElement as HTMLElement | null;
    if (active?.closest('app-input-container') || pinToBottom) this.pin(el);
    if (active && el.contains(active)) this.revealRow(el, active);
    this.recordSizes(el);
  }

  private recordSizes(el: HTMLElement): void {
    this.prevScrollHeight = el.scrollHeight;
    this.prevClientHeight = el.clientHeight;
    this.sizesKnown = true;
  }

  private pin(el: HTMLElement): void {
    el.scrollTop = el.scrollHeight; // the browser clamps to the real maximum
  }

  // Minimal scroll so the focused row is fully inside the viewport, done with
  // the viewport's own scrollTop rather than scrollIntoView, which would also
  // scroll every overflow:hidden ancestor (ion-content, the card) and leave
  // them stuck.
  private revealRow(el: HTMLElement, active: HTMLElement): void {
    const row = active.closest('.v-row') as HTMLElement | null;
    if (!row) return;
    const vr = el.getBoundingClientRect();
    const rr = row.getBoundingClientRect();
    if (rr.bottom > vr.bottom - REVEAL_MARGIN_PX) {
      el.scrollTop += rr.bottom - (vr.bottom - REVEAL_MARGIN_PX);
    } else if (rr.top < vr.top + REVEAL_MARGIN_PX) {
      el.scrollTop -= vr.top + REVEAL_MARGIN_PX - rr.top;
    }
  }

  // Pin now, after the pending render (new rows / spacer applied), and one
  // frame later. From then on the ResizeObserver keeps us pinned as long as
  // the user doesn't scroll away.
  private scrollToBottom(): void {
    const pinNow = () => {
      const el = this.viewportEl();
      if (el) this.pin(el);
    };
    pinNow();
    afterNextRender(pinNow, { injector: this.injector });
    requestAnimationFrame(pinNow);
  }

  // --- Reorder ---

  private commitReorder(fromRow: number, toRow: number, sourceId: number): void {
    const range = this.todoRange();
    if (!range) return;
    const unchecked = [...this.listStore.unCheckedList()];
    // Locate the dragged item by id (authoritative), falling back to the row
    // index it was grabbed at.
    let uFrom = unchecked.findIndex((it) => it.id === sourceId);
    if (uFrom < 0) uFrom = fromRow - range.start;
    const uTo = Math.max(0, Math.min(unchecked.length - 1, toRow - range.start));
    if (uFrom < 0 || uFrom >= unchecked.length || uFrom === uTo) return;

    const [item] = unchecked.splice(uFrom, 1);
    unchecked.splice(uTo, 0, item);

    this.listStore.unCheckedList.set(unchecked);
    this.listStore.originalList.set([...this.listStore.checkedList(), ...unchecked]);
    void this.listStore.syncList();
  }

  // --- Item editing / toggling / deleting (unchanged behavior) ---

  valueChange(id: number, event: CustomEvent) {
    this.listStore.originalList.update((currentItems) => {
      const item = currentItems.find((i) => i.id === id);
      if (item) {
        item.itemName = event.detail.value;
      }
      return currentItems;
    });

    this.listStore.scheduleSave();
  }

  async blurItem(id: number) {
    const item = this.listStore.originalList().find((i) => i.id === id);
    if (item && item.itemName.trim() === '') {
      await this.deleteItem(id);
    } else {
      // Flush any pending debounced edit immediately on leaving the field.
      await this.listStore.syncAllLists();
    }
  }

  async checkItem(id: number) {
    this.listStore.originalList.update((currentItems) => {
      const item = currentItems.find((i) => i.id === id);
      if (item) {
        item.checked = !item.checked;
      }
      return currentItems;
    });

    this.listStore.setUpLists();
    await this.listStore.syncList();
  }

  async deleteItemWithUndo(item: ListItem) {
    const deletedItem = { ...item };
    const sourceListId = this.listStore.activeListId();
    await this.deleteItem(item.id);

    const toast = await this.toastCtrl.create({
      message: `"${deletedItem.itemName}" deleted`,
      duration: 5000,
      position: 'bottom',
      cssClass: 'undo-toast',
      buttons: [
        {
          text: 'UNDO',
          role: 'cancel',
          handler: () => {
            this.listStore.restoreItem(deletedItem, sourceListId);
          },
        },
      ],
    });
    await toast.present();
  }

  async deleteItem(id: number) {
    this.listStore.originalList.update((currentItems) => {
      const itemIndex = currentItems.findIndex((i) => i.id === id);
      if (itemIndex !== -1) {
        currentItems.splice(itemIndex, 1);
      }
      return currentItems;
    });
    this.listStore.setUpLists();

    await this.listStore.syncList();
    this.listStore.setMaxId();
  }
}
