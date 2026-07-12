import {
  AfterViewInit,
  Component,
  ChangeDetectionStrategy,
  ViewChild,
  ElementRef,
  computed,
  signal,
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
import {
  DragDropModule,
  CdkDragDrop,
  moveItemInArray,
} from '@angular/cdk/drag-drop';

import { addIcons } from 'ionicons';
import { trashOutline, closeCircle, reorderThreeOutline } from 'ionicons/icons';

import { InputContainerComponent } from '../input-container/input-container.component';

import { InputHandlerService } from 'src/app/services/input-handler.service';
import { ListStoreService } from 'src/app/services/list-store.service';
import { ListItem } from 'src/models/ListItem';

type Row =
  | { kind: 'done-header'; count: number }
  | { kind: 'todo-header'; count: number }
  | { kind: 'item'; item: ListItem; section: 'done' | 'todo' };

// Every virtual row (items AND section headers) is exactly this tall so the
// fixed-size virtual-scroll strategy positions rows without drift.
export const ROW_HEIGHT = 56;

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
    DragDropModule,
  ],
})
export class ListContainerComponent implements AfterViewInit {
  readonly ROW_HEIGHT = ROW_HEIGHT;

  @ViewChild(CdkVirtualScrollViewport)
  viewport?: CdkVirtualScrollViewport;

  // Measured live so the card hugs the content on short lists (messenger
  // bottom-anchoring) but caps and scrolls on long lists.
  private hostHeight = signal(0);
  private inputHeight = signal(0);

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

  viewportHeight = computed(() => {
    const content = this.rows().length * ROW_HEIGHT;
    const avail = this.hostHeight() - this.inputHeight() - 8; // 8px breathing gap
    if (avail <= 0) return content; // not measured yet — size to content
    return Math.min(content, avail);
  });

  constructor(
    public readonly inputHandler: InputHandlerService,
    public readonly listStore: ListStoreService,
    private readonly toastCtrl: ToastController,
    private readonly hostEl: ElementRef<HTMLElement>
  ) {
    addIcons({ trashOutline, closeCircle, reorderThreeOutline });
  }

  ngAfterViewInit(): void {
    // Track the host (fills the content area) and the add-item input so the
    // viewport can be capped at exactly the free space above the input.
    const host = this.hostEl.nativeElement;
    const inputEl = host.querySelector('app-input-container') as HTMLElement | null;
    const measure = () => {
      this.hostHeight.set(host.clientHeight);
      if (inputEl) this.inputHeight.set(inputEl.offsetHeight);
      // The keyboard opening/closing resizes the host; re-anchor the focused
      // field once the viewport has taken its new size.
      this.scheduleKeepFocusVisible();
    };
    const ro = new ResizeObserver(measure);
    ro.observe(host);
    if (inputEl) ro.observe(inputEl);
    measure();

    // Also re-anchor immediately when focus moves between fields.
    host.addEventListener('focusin', () => this.scheduleKeepFocusVisible());

    // ion-content no longer scrolls; hand the app shell a scroll-to-bottom
    // hook that uses the CDK viewport API (reliable on a fresh virtual list).
    this.listStore.scrollToBottomFn = () => {
      const vp = this.viewport;
      if (!vp) return;
      // Two-pass: the first offset commits the render, the next frame lands
      // exactly at the bottom once the full content size is known.
      const target = this.rows().length * ROW_HEIGHT;
      vp.scrollToOffset(target, 'auto');
      requestAnimationFrame(() => vp.scrollToOffset(target, 'auto'));
    };
    this.listStore.onListSwitch?.();
  }

  // Keyboard show/hide and focus changes settle across a few frames; re-run
  // the anchor a couple of times so we're the last word once the layout is
  // stable, not scrolling against a viewport that's still resizing.
  private scheduleKeepFocusVisible() {
    [0, 120, 300].forEach((d) => setTimeout(() => this.keepFocusVisible(), d));
  }

  private keepFocusVisible() {
    const active = document.activeElement as HTMLElement | null;
    if (!active || active === document.body) return;

    // The add-item field is below the viewport; instead of scrolling it (it
    // can't move), bring the list to the bottom so the newest items show.
    if (active.closest('app-input-container')) {
      this.listStore.scrollToBottomFn?.();
      return;
    }

    // An item's input: align its bottom to the viewport's visible bottom edge
    // (which sits just above the keyboard). scrollIntoView does the math
    // against the real scroll container; scroll-margin-bottom adds the gap.
    const vpEl = this.viewport?.elementRef.nativeElement;
    if (vpEl && vpEl.contains(active)) {
      active.scrollIntoView({ block: 'end', behavior: 'auto' });
    }
  }

  trackRow = (_: number, row: Row): string | number =>
    row.kind === 'item' ? 'i' + row.item.id : row.kind;

  // --- Reorder (CDK drag-drop over the virtualized list) ---

  // Only allow the drop placeholder to land on a to-do item position. `index`
  // is relative to the rendered window, so add the rendered range's start to
  // map it back to the full combined-row array.
  sortPredicate = (index: number): boolean => {
    if (!this.viewport) return false;
    const row = this.rows()[this.viewport.getRenderedRange().start + index];
    return !!row && row.kind === 'item' && row.section === 'todo';
  };

  async drop(event: CdkDragDrop<Row[]>) {
    if (!this.viewport) return;
    const rows = this.rows();
    const start = this.viewport.getRenderedRange().start;
    const from = start + event.previousIndex;
    const to = start + event.currentIndex;

    const fromRow = rows[from];
    if (!fromRow || fromRow.kind !== 'item' || fromRow.section !== 'todo') return;

    // Translate combined-array indices into the unchecked array (to-do items
    // are contiguous at the tail of the combined array).
    const todoStart = rows.findIndex(
      (r) => r.kind === 'item' && r.section === 'todo'
    );
    if (todoStart < 0) return;

    const unchecked = [...this.listStore.unCheckedList()];
    const clamp = (n: number) => Math.max(0, Math.min(unchecked.length - 1, n));
    const uFrom = clamp(from - todoStart);
    const uTo = clamp(to - todoStart);
    if (uFrom === uTo) return;

    moveItemInArray(unchecked, uFrom, uTo);
    this.listStore.unCheckedList.set(unchecked);
    this.listStore.originalList.set([...this.listStore.checkedList(), ...unchecked]);
    await this.listStore.syncList();
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
