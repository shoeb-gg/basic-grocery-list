import { Injectable } from '@angular/core';

import { Storage } from '@ionic/storage-angular';

@Injectable({
  providedIn: 'root',
})
export class StorageService {
  private _storage: Storage | null = null;

  constructor(private readonly storage: Storage) {}

  async init() {
    const storage = await this.storage.create();
    this._storage = storage;
  }

  public async set(key: string, value: any) {
    if (!this._storage) {
      throw new Error(`Storage not initialized: cannot set "${key}"`);
    }
    await this._storage.set(key, value);
  }

  public async get(key: string) {
    if (!this._storage) {
      throw new Error(`Storage not initialized: cannot get "${key}"`);
    }
    return await this._storage.get(key);
  }

  public async remove(key: string) {
    if (!this._storage) {
      throw new Error(`Storage not initialized: cannot remove "${key}"`);
    }
    await this._storage.remove(key);
  }

  public async clear() {
    if (!this._storage) {
      throw new Error('Storage not initialized: cannot clear storage');
    }
    await this._storage.clear();
  }
}
