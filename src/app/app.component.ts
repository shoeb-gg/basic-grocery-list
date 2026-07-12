import { Component, OnInit, Optional, ViewChild, AfterViewInit, ChangeDetectionStrategy, signal } from '@angular/core';
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
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    IonApp,
    IonContent,
    ListContainerComponent,
    ListSelectorComponent,
  ],
})
export class AppComponent implements OnInit, AfterViewInit {
  @ViewChild(IonContent) content!: IonContent;
  // A signal (not a plain field) so that toggling it from the Capacitor
  // Keyboard listener callback — which is outside Angular's template-event
  // flow — still refreshes this OnPush view's [class.keyboard-open] binding.
  keyboardOpen = signal(false);

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

    // Hide the bottom chip bar / list header while the keyboard is up so the
    // focused field has room (see .selector-card.keyboard-open). Re-anchoring
    // the focused field within the scroll viewport is owned by
    // ListContainerComponent, which is where the viewport actually lives.
    Keyboard.addListener('keyboardDidShow', () => this.keyboardOpen.set(true));
    Keyboard.addListener('keyboardWillHide', () => this.keyboardOpen.set(false));

    // Safety net for the debounced writes: if the app is backgrounded while a
    // pending item-name edit hasn't been flushed yet, persist immediately so
    // nothing is lost. Covers both the web/WebView path and native pause.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        void this.listStore.syncAllLists();
      }
    });
    App.addListener('pause', () => {
      void this.listStore.syncAllLists();
    });
  }

  scrollToBottom() {
    this.listStore.scrollToBottomFn?.();
  }
}
