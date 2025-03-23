import { Component, computed } from '@angular/core';

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

  valueChange(event: CustomEvent) {
    this.inputHandler.inputValue.set(event.detail.value);
  }

  checkItem(id: number) {
    this.listStore.originalList.update((currentItems) =>
      currentItems.map((item) =>
        item.id === id ? { ...item, checked: !item.checked } : item
      )
    );
  }
}
