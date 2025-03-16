import { Component, OnInit } from '@angular/core';

import {
  IonList,
  IonItem,
  IonLabel,
  IonCheckbox,
} from '@ionic/angular/standalone';

@Component({
  selector: 'app-list-container',
  templateUrl: './list-container.component.html',
  styleUrls: ['./list-container.component.scss'],
  standalone: true,
  imports: [IonList, IonItem, IonLabel, IonCheckbox],
})
export class ListContainerComponent implements OnInit {
  constructor() {}

  ngOnInit() {}
}
