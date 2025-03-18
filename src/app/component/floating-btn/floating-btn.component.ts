import { Component, OnInit } from '@angular/core';

import { IonFab, IonFabButton, IonIcon } from '@ionic/angular/standalone';

import { addIcons } from 'ionicons';
import { add } from 'ionicons/icons';

@Component({
  selector: 'app-floating-btn',
  templateUrl: './floating-btn.component.html',
  styleUrls: ['./floating-btn.component.scss'],
  imports: [IonFab, IonFabButton, IonIcon],
})
export class FloatingBtnComponent implements OnInit {
  constructor() {
    addIcons({ add });
  }

  ngOnInit() {}
}
