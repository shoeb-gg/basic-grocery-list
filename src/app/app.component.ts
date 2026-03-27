import { Component, OnInit, Optional } from '@angular/core';
import {
  IonApp,
  IonContent,
} from '@ionic/angular/standalone';
import { Platform, IonRouterOutlet } from '@ionic/angular';
import { App } from '@capacitor/app';

import { ListContainerComponent } from './component/list-container/list-container.component';
import { FloatingBtnComponent } from './component/floating-btn/floating-btn.component';
import { ListSelectorComponent } from './component/list-selector/list-selector.component';

import { StorageService } from './services/storage.service';
import { ListStoreService } from './services/list-store.service';
import { GroceryList } from 'src/models/ListItem';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
  imports: [
    IonApp,
    IonContent,
    ListContainerComponent,
    FloatingBtnComponent,
    ListSelectorComponent,
  ],
})
export class AppComponent implements OnInit {
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
      this.listStore.activeListId.set(activeId);
      const activeList = groceryLists.find((l) => l.id === activeId) || groceryLists[0];
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
  }
}
