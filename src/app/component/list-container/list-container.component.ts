import { AfterViewInit, Component } from '@angular/core';

import {
  IonList,
  IonItem,
  IonCheckbox,
  IonInput,
  IonReorder,
  IonReorderGroup,
  IonItemSliding,
  IonItemOptions,
  IonItemOption,
  IonIcon,
  ItemReorderEventDetail,
} from '@ionic/angular/standalone';
import { Platform, ToastController } from '@ionic/angular';

import { addIcons } from 'ionicons';
import { trashOutline } from 'ionicons/icons';

import { InputContainerComponent } from '../input-container/input-container.component';

import { InputHandlerService } from 'src/app/services/input-handler.service';
import { ListStoreService } from 'src/app/services/list-store.service';
import { ListItem } from 'src/models/ListItem';

@Component({
  selector: 'app-list-container',
  templateUrl: './list-container.component.html',
  styleUrls: ['./list-container.component.scss'],
  standalone: true,
  imports: [
    IonList,
    IonItem,
    IonCheckbox,
    InputContainerComponent,
    IonInput,
    IonReorder,
    IonReorderGroup,
    IonItemSliding,
    IonItemOptions,
    IonItemOption,
    IonIcon,
  ],
})
export class ListContainerComponent implements AfterViewInit {
  constructor(
    public readonly inputHandler: InputHandlerService,
    public readonly listStore: ListStoreService,
    private readonly platform: Platform,
    private readonly toastCtrl: ToastController
  ) {
    addIcons({ trashOutline });
  }

  ngAfterViewInit(): void {
    this.setListBottomMargin();
  }

  async valueChange(id: number, event: CustomEvent) {
    if (event.detail.value === '') {
      this.deleteItem(id);
      return;
    }

    this.listStore.originalList.update((currentItems) => {
      const item = currentItems.find((i) => i.id === id);
      if (item) {
        item.itemName = event.detail.value;
      }
      return currentItems;
    });

    this.listStore.updateLists(id);
    await this.listStore.syncList();
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
            this.listStore.originalList.update((items) => [deletedItem, ...items]);
            this.listStore.setUpLists();
            this.listStore.syncList();
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

  setListBottomMargin() {
    const input = document.querySelector('ion-list');

    this.platform.keyboardDidShow.subscribe((event: any) => {
      input?.style.setProperty('transition', 'margin-bottom 0.1s ease-in');
      input?.style.setProperty(
        'margin-bottom',
        `${event.keyboardHeight + 80}px`,
        'important'
      );
    });
    this.platform.keyboardDidHide.subscribe((event) => {
      input?.style.removeProperty('margin-bottom');
    });
  }

  async handleReorder(event: CustomEvent<ItemReorderEventDetail>) {
    let newUnCheckedList: ListItem[] = [];

    this.listStore.unCheckedList.update((currentItems) => {
      const updated = [...currentItems];
      const [movedItem] = updated.splice(event.detail.from, 1);
      updated.splice(event.detail.to, 0, movedItem);
      newUnCheckedList = updated;
      return updated;
    });

    this.listStore.originalList.update(() => {
      return [...this.listStore.checkedList(), ...newUnCheckedList];
    });

    event.detail.complete();

    await this.listStore.syncList();
  }
}
