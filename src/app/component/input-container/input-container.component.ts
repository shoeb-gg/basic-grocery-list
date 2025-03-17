import { Component, OnInit } from '@angular/core';

import { IonInput, IonItem, IonIcon } from '@ionic/angular/standalone';

import { addIcons } from 'ionicons';
import { add } from 'ionicons/icons';

@Component({
  selector: 'app-input-container',
  templateUrl: './input-container.component.html',
  styleUrls: ['./input-container.component.scss'],
  imports: [IonInput, IonItem, IonIcon],
})
export class InputContainerComponent implements OnInit {
  constructor() {
    addIcons({ add });
  }

  ngOnInit() {}
}
