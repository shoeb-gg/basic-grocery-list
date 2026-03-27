import { Injectable, signal, WritableSignal } from '@angular/core';

import { ListItem, GroceryList } from 'src/models/ListItem';

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

  lists: WritableSignal<GroceryList[]> = signal<GroceryList[]>([]);
  activeListId: WritableSignal<number> = signal<number>(1);

  originalList: WritableSignal<ListItem[]> = signal<ListItem[]>([]);
  checkedList: WritableSignal<ListItem[]> = signal<ListItem[]>([]);
  unCheckedList: WritableSignal<ListItem[]> = signal<ListItem[]>([]);
  maxId: WritableSignal<number> = signal<number>(0);

  // --- Multi-list management ---

  createList(name: string): GroceryList {
    const maxListId = this.lists().reduce((max, l) => Math.max(max, l.id), 0);
    const newList: GroceryList = { id: maxListId + 1, name, items: [] };
    this.lists.update((lists) => [...lists, newList]);
    this.switchList(newList.id);
    this.syncAllLists();
    return newList;
  }

  renameList(id: number, name: string) {
    this.lists.update((lists) =>
      lists.map((l) => (l.id === id ? { ...l, name } : l))
    );
    this.syncAllLists();
  }

  deleteList(id: number) {
    this.lists.update((lists) => lists.filter((l) => l.id !== id));
    if (this.activeListId() === id) {
      const remaining = this.lists();
      if (remaining.length > 0) {
        this.switchList(remaining[0].id);
      }
    }
    this.syncAllLists();
  }

  switchList(id: number) {
    this.saveCurrentListItems();
    this.activeListId.set(id);
    const list = this.lists().find((l) => l.id === id);
    this.originalList.set(list?.items || []);
    this.setUpLists();
    this.setMaxId();
    this.storage.set('active_list_id', id);
  }

  private saveCurrentListItems() {
    const currentId = this.activeListId();
    const currentItems = this.originalList();
    this.lists.update((lists) =>
      lists.map((l) => (l.id === currentId ? { ...l, items: currentItems } : l))
    );
  }

  async syncAllLists() {
    this.saveCurrentListItems();
    await this.storage.set('grocery_lists', this.lists());
    await this.storage.set('active_list_id', this.activeListId());
  }

  // --- Item management (unchanged API) ---

  addToList(): boolean {
    const trimmed = this.inputHandler.inputValue().trim();
    if (trimmed.length === 0) {
      return false;
    }

    const newItem: ListItem = {
      id: this.maxId() + 1,
      itemName: trimmed,
      checked: false,
    };

    this.originalList.update((value) => [newItem, ...value]);
    this.setUpLists();
    this.inputHandler.inputValue.set('');
    this.maxId.update((value) => value + 1);

    this.syncAllLists();
    return true;
  }

  async syncList() {
    await this.syncAllLists();
  }

  setMaxId() {
    this.originalList().forEach((item) => {
      if (item.id > this.maxId()) {
        this.maxId.set(item.id);
      }
    });
  }

  setUpLists() {
    console.time('setUpLists');
    this.checkedList.set(
      this.originalList().filter((item) => item.checked === true)
    );
    this.unCheckedList.set(
      this.originalList().filter((item) => item.checked === false)
    );
    console.timeEnd('setUpLists');
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
