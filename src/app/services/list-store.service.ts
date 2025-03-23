import { Injectable, signal, WritableSignal } from '@angular/core';

import { ListItem } from 'src/models/ListItem';

@Injectable({
  providedIn: 'root',
})
export class ListStoreService {
  constructor() {}

  originalList: WritableSignal<ListItem[]> = signal<ListItem[]>([]);

  addToList(item: ListItem) {
    this.originalList.update((value) => [item, ...value]);
    console.log(this.originalList());
  }
}
