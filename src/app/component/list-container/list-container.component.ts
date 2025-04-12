import { Component } from '@angular/core';

import {
  IonList,
  IonItem,
  IonCheckbox,
  IonInput,
} from '@ionic/angular/standalone';

import { InputContainerComponent } from '../input-container/input-container.component';

import { InputHandlerService } from 'src/app/services/input-handler.service';
import { ListStoreService } from 'src/app/services/list-store.service';

@Component({
  selector: 'app-list-container',
  templateUrl: './list-container.component.html',
  styleUrls: ['./list-container.component.scss'],
  standalone: true,
  imports: [IonList, IonItem, IonCheckbox, InputContainerComponent, IonInput],
})
export class ListContainerComponent {
  constructor(
    public readonly inputHandler: InputHandlerService,
    public readonly listStore: ListStoreService
  ) {}

  valueChange(id: number, event: CustomEvent) {
    this.listStore.originalList.update((currentItems) => {
      const item = currentItems.find((i) => i.id === id);
      if (item) {
        item.itemName = event.detail.value;
      }
      return currentItems;
    });
  }

  checkItem(id: number) {
    this.listStore.originalList.update((currentItems) => {
      const item = currentItems.find((i) => i.id === id);
      if (item) {
        item.checked = !item.checked;
      }
      return currentItems;
    });
  }
}
