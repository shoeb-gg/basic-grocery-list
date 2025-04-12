import { Injectable, signal, WritableSignal } from '@angular/core';

import { ListItem } from 'src/models/ListItem';

import { StorageService } from './storage.service';

@Injectable({
  providedIn: 'root',
})
export class ListStoreService {
  constructor(private readonly storage: StorageService) {}

  originalList: WritableSignal<ListItem[]> = signal<ListItem[]>([]);

  addToList(item: ListItem) {
    this.originalList.update((value) => [item, ...value]);

    this.storage.set('list', this.originalList());
    console.log(this.originalList());
  }

  async syncList() {
    await this.storage.set('list', this.originalList());
  }
}
