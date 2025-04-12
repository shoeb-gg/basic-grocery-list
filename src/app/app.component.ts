import { Component, OnInit } from '@angular/core';
import {
  IonApp,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
} from '@ionic/angular/standalone';

import { ListContainerComponent } from './component/list-container/list-container.component';
import { FloatingBtnComponent } from './component/floating-btn/floating-btn.component';

import { StorageService } from './services/storage.service';
import { ListStoreService } from './services/list-store.service';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
  imports: [
    IonApp,
    IonHeader,
    IonToolbar,
    IonContent,
    IonTitle,
    ListContainerComponent,
    FloatingBtnComponent,
  ],
})
export class AppComponent implements OnInit {
  constructor(
    private readonly storage: StorageService,
    private readonly listStore: ListStoreService
  ) {}

  async ngOnInit() {
    await this.storage.init();
    await this.storage.get('list').then((list) => {
      this.listStore.originalList.set(list || []);
    });
  }
}
