import { Injectable, signal, WritableSignal } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class ListStoreService {
  constructor() {}

  originalList: WritableSignal<string[]> = signal<string[]>([]);

  addToList(item: string) {
    this.originalList.update((value) => [item, ...value]);
    console.log(this.originalList());
  }
}
