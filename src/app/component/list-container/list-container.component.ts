import { Component, OnInit } from '@angular/core';

import {
  IonList,
  IonItem,
  IonCheckbox,
  IonLabel,
} from '@ionic/angular/standalone';

import { InputContainerComponent } from '../input-container/input-container.component';

import { InputHandlerService } from 'src/app/services/input-handler.service';
import { ListStoreService } from 'src/app/services/list-store.service';

@Component({
  selector: 'app-list-container',
  templateUrl: './list-container.component.html',
  styleUrls: ['./list-container.component.scss'],
  standalone: true,
  imports: [IonLabel, IonList, IonItem, IonCheckbox, InputContainerComponent],
})
export class ListContainerComponent implements OnInit {
  constructor(
    public readonly inputHandler: InputHandlerService,
    public readonly listStore: ListStoreService
  ) {}

  ngOnInit() {}
}
