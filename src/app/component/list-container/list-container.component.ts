import { AfterViewInit, Component } from '@angular/core';

import {
  IonList,
  IonItem,
  IonCheckbox,
  IonInput,
} from '@ionic/angular/standalone';
import { Platform } from '@ionic/angular';

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
export class ListContainerComponent implements AfterViewInit {
  constructor(
    public readonly inputHandler: InputHandlerService,
    public readonly listStore: ListStoreService,
    private readonly platform: Platform
  ) {}

  ngAfterViewInit(): void {
    this.setListBottomMargin();
  }

  async valueChange(id: number, event: CustomEvent) {
    this.listStore.originalList.update((currentItems) => {
      const item = currentItems.find((i) => i.id === id);
      if (item) {
        item.itemName = event.detail.value;
      }
      return currentItems;
    });
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
    await this.listStore.syncList();
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
}
