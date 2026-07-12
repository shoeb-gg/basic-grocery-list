import { Component, OnInit, Optional, ViewChild, AfterViewInit, ChangeDetectionStrategy } from '@angular/core';
import {
  IonApp,
  IonContent,
} from '@ionic/angular/standalone';
import { Platform, IonRouterOutlet } from '@ionic/angular';
import { App } from '@capacitor/app';
import { Keyboard } from '@capacitor/keyboard';

import { ListContainerComponent } from './component/list-container/list-container.component';
import { ListSelectorComponent } from './component/list-selector/list-selector.component';

import { StorageService } from './services/storage.service';
import { ListStoreService } from './services/list-store.service';
import { GroceryList } from 'src/models/ListItem';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [
    IonApp,
    IonContent,
    ListContainerComponent,
    ListSelectorComponent,
  ],
})
export class AppComponent implements OnInit, AfterViewInit {
  @ViewChild(IonContent) content!: IonContent;
  keyboardOpen = false;

  constructor(
    private readonly storage: StorageService,
    private readonly listStore: ListStoreService,
    private readonly platform: Platform,
    @Optional() private readonly routerOutlet?: IonRouterOutlet
  ) {
    this.platform.backButton.subscribeWithPriority(1, () => {
      if (!this.routerOutlet?.canGoBack()) {
        App.minimizeApp();
      }
    });
  }

  async ngOnInit() {
    await this.storage.init();

    const groceryLists: GroceryList[] | null = await this.storage.get('grocery_lists');

    if (groceryLists && groceryLists.length > 0) {
      this.listStore.lists.set(groceryLists);
      const activeId: number = (await this.storage.get('active_list_id')) || groceryLists[0].id;
      const activeList = groceryLists.find((l) => l.id === activeId) || groceryLists[0];
      this.listStore.activeListId.set(activeList.id);
      this.listStore.originalList.set(activeList.items);
    } else {
      // Migrate from old single-list storage
      const oldList = await this.storage.get('list');
      const defaultList: GroceryList = {
        id: 1,
        name: 'Default',
        items: oldList || [],
      };
      this.listStore.lists.set([defaultList]);
      this.listStore.activeListId.set(1);
      this.listStore.originalList.set(defaultList.items);
      await this.storage.remove('list');
      await this.listStore.syncAllLists();
    }

    this.listStore.setUpLists();
    this.listStore.setMaxId();

    setTimeout(() => this.scrollToBottom(), 100);
  }

  ngAfterViewInit() {
    this.listStore.onListSwitch = () => {
      setTimeout(() => this.scrollToBottom(), 50);
    };

    // The bottom chip bar + list header (.selector-card) is a plain sibling
    // of ion-content, not an <ion-footer>, so Ionic's own keyboard
    // scroll-assist doesn't know it needs to reserve room for it — a
    // focused item could end up scrolled to just behind it. Hiding it
    // outright is simpler and more robust than computing extra scroll
    // clearance, but relying on the browser's own scroll-into-view timing
    // is unreliable, and it never retriggers when switching focus directly
    // between fields (the footer stays collapsed, so nothing re-fires).
    // So: correct explicitly whenever an input gains focus while the
    // keyboard is (or is about to be) open, once the footer has actually
    // finished collapsing so we're never scrolling against a viewport
    // that's still mid-change.
    const footerEl = document.querySelector('.selector-card') as HTMLElement | null;
    let footerSettled = true;

    footerEl?.addEventListener('transitionend', (event) => {
      if (event.propertyName === 'max-height') {
        footerSettled = true;
        if (this.keyboardOpen) {
          this.correctScrollRepeatedly();
        }
      }
    });

    document.addEventListener('focusin', () => {
      if (this.keyboardOpen && footerSettled) {
        this.correctScrollRepeatedly();
      }
    });

    Keyboard.addListener('keyboardDidShow', () => {
      this.keyboardOpen = true;
      footerSettled = false;
    });

    Keyboard.addListener('keyboardWillHide', () => {
      this.keyboardOpen = false;
    });
  }

  scrollToBottom() {
    this.content?.scrollToBottom(300);
  }

  // Native/Ionic scroll-assist can fire at unpredictable times and fight our
  // correction — re-applying it a couple of times over a short window makes
  // us the last word regardless of when any native adjustment runs. Each
  // call only corrects the residual overlap, so once positioned correctly
  // the later calls are no-ops.
  private correctScrollRepeatedly() {
    [0, 150, 350].forEach((delay) => {
      setTimeout(() => this.scrollFocusedInputAboveKeyboard(), delay);
    });
  }

  private async scrollFocusedInputAboveKeyboard() {
    const active = document.activeElement as HTMLElement | null;
    if (!active || active === document.body || !this.content) {
      return;
    }

    // Target a fixed gap above the keyboard and correct in EITHER direction
    // — not just when the item overlaps the keyboard, but also when a stray
    // native scroll adjustment has pushed it too far up, leaving a large
    // empty gap. Both cases converge on the same resting position.
    const gap = 16;
    const rect = active.getBoundingClientRect();
    const desiredBottom = window.innerHeight - gap;
    const delta = rect.bottom - desiredBottom;
    if (Math.abs(delta) > 4) {
      await this.content.scrollByPoint(0, delta, 100);
    }
  }
}
