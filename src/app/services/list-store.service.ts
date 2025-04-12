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

  addToList() {
    this.originalList.update((value) => [
      {
        id: this.originalList().length + 1,
        itemName: this.inputHandler.inputValue(),
        checked: false,
      },
      ...value,
    ]);
    this.inputHandler.inputValue.set('');

    this.storage.set('list', this.originalList());
    console.log(this.originalList());
  }

  async syncList() {
    await this.storage.set('list', this.originalList());
  }
}
