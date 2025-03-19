import { Component } from '@angular/core';
// import { RouterLink, RouterLinkActive } from '@angular/router';
import {
  IonApp,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonFooter,
} from '@ionic/angular/standalone';

import { ListContainerComponent } from './component/list-container/list-container.component';
import { FloatingBtnComponent } from './component/floating-btn/floating-btn.component';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
  imports: [
    IonFooter,
    IonApp,
    IonHeader,
    IonToolbar,
    IonContent,
    IonTitle,
    ListContainerComponent,
    FloatingBtnComponent,
  ],
})
export class AppComponent {
  constructor() {}
}
