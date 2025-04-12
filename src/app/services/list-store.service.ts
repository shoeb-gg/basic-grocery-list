import { Injectable, signal, WritableSignal } from '@angular/core';

import { ListItem } from 'src/models/ListItem';

@Injectable({
  providedIn: 'root',
})
export class ListStoreService {
  constructor() {}

  originalList: WritableSignal<ListItem[]> = signal<ListItem[]>([
    { id: 1, itemName: 'Apples', checked: false },
    { id: 2, itemName: 'Bananas', checked: true },
    { id: 3, itemName: 'Carrots', checked: false },
    { id: 4, itemName: 'Detergent', checked: true },
    { id: 5, itemName: 'Eggs', checked: false },
    { id: 6, itemName: 'Flour', checked: false },
    { id: 7, itemName: 'Grapes', checked: true },
    { id: 8, itemName: 'Honey', checked: false },
    { id: 9, itemName: 'Ice Cream', checked: true },
    { id: 10, itemName: 'Juice', checked: false },
    { id: 11, itemName: 'Kale', checked: false },
    { id: 12, itemName: 'Lettuce', checked: true },
    { id: 13, itemName: 'Milk', checked: true },
    { id: 14, itemName: 'Nuts', checked: false },
    { id: 15, itemName: 'Oats', checked: true },
    { id: 16, itemName: 'Pasta', checked: false },
    { id: 17, itemName: 'Quinoa', checked: false },
    { id: 18, itemName: 'Rice', checked: true },
    { id: 19, itemName: 'Spinach', checked: false },
    { id: 20, itemName: 'Tomatoes', checked: true },
  ]);

  addToList(item: ListItem) {
    this.originalList.update((value) => [item, ...value]);
    console.log(this.originalList());
  }
}
