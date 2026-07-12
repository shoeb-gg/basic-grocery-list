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
  onListSwitch: (() => void) | null = null;

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
    this.onListSwitch?.();
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

    this.originalList.update((value) => [...value, newItem]);
    this.setUpLists();
    this.inputHandler.inputValue.set('');
    this.maxId.update((value) => value + 1);

    this.syncAllLists();
    this.onListSwitch?.();
    return true;
  }

  async syncList() {
    await this.syncAllLists();
  }

  setMaxId() {
    const allIds = [
      ...this.lists().flatMap((l) => l.items.map((i) => i.id)),
      ...this.originalList().map((i) => i.id),
    ];
    const currentMax = allIds.reduce((max, id) => Math.max(max, id), 0);
    if (currentMax > this.maxId()) {
      this.maxId.set(currentMax);
    }
  }

  restoreItem(item: ListItem, listId: number) {
    const targetExists = this.lists().some((l) => l.id === listId);
    if (this.activeListId() === listId || !targetExists) {
      // Falls back to the active list if the source list itself was deleted
      // in the meantime, so the item is never silently lost.
      this.originalList.update((items) => [item, ...items]);
      this.setUpLists();
    } else {
      this.lists.update((lists) =>
        lists.map((l) => (l.id === listId ? { ...l, items: [item, ...l.items] } : l))
      );
    }
    this.setMaxId();
    this.syncAllLists();
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
