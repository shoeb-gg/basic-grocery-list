import { Injectable, signal, WritableSignal } from '@angular/core';

import { ListItem } from 'src/models/ListItem';

import { StorageService } from './storage.service';
import { InputHandlerService } from './input-handler.service';

@Injectable({
  providedIn: 'root',
})
export class ListStoreService {
  constructor(
    private readonly storage: StorageService,
    public readonly inputHandler: InputHandlerService
  ) {}

  originalList: WritableSignal<ListItem[]> = signal<ListItem[]>([]);
  checkedList: WritableSignal<ListItem[]> = signal<ListItem[]>([]);
  unCheckedList: WritableSignal<ListItem[]> = signal<ListItem[]>([]);
  maxId: WritableSignal<number> = signal<number>(0);

  addToList() {
    this.originalList.update((value) => [
      {
        id: this.maxId() + 1,
        itemName: this.inputHandler.inputValue(),
        checked: false,
      },
      ...value,
    ]);
    this.inputHandler.inputValue.set('');
    this.maxId.update((value) => value + 1);

    this.storage.set('list', this.originalList());
    console.log(this.originalList());
  }

  async syncList() {
    await this.storage.set('list', this.originalList());
  }

  setMaxId() {
    this.originalList().forEach((item) => {
      if (item.id > this.maxId()) {
        this.maxId.set(item.id);
      }
    });
  }

  setUpLists() {
    this.checkedList.set(
      this.originalList().filter((item) => item.checked === true)
    );
    this.unCheckedList.set(
      this.originalList().filter((item) => item.checked === false)
    );
  }

  updateLists(id: number) {
    this.checkedList.update((value) => {
      let item = value.find((i) => i.id === id);
      if (item) {
        let toUpdate = this.originalList().find((i) => i.id === id);
        if (toUpdate) {
          item = toUpdate;
        }
      }
      return value;
    });

    this.unCheckedList.update((value) => {
      let item = value.find((i) => i.id === id);
      if (item) {
        let toUpdate = this.originalList().find((i) => i.id === id);
        if (toUpdate) {
          item = toUpdate;
        }
      }
      return value;
    });
  }
}
