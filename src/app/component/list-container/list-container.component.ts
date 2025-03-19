import { Component, OnInit } from '@angular/core';

import {
  IonList,
  IonItem,
  IonLabel,
  IonCheckbox,
} from '@ionic/angular/standalone';

import { InputContainerComponent } from '../input-container/input-container.component';

import { InputHandlerService } from 'src/app/services/input-handler.service';

@Component({
  selector: 'app-list-container',
  templateUrl: './list-container.component.html',
  styleUrls: ['./list-container.component.scss'],
  standalone: true,
  imports: [IonList, IonItem, IonLabel, IonCheckbox, InputContainerComponent],
})
export class ListContainerComponent implements OnInit {
  constructor(public readonly inputHandler: InputHandlerService) {}

  ngOnInit() {}
}
