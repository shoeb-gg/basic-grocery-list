import { Component } from '@angular/core';
// import { RouterLink, RouterLinkActive } from '@angular/router';
import {
  IonApp,
  IonHeader,
  IonToolbar,
  IonButtons,
  IonMenuButton,
  IonTitle,
} from '@ionic/angular/standalone';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
  imports: [IonApp, IonHeader, IonToolbar, IonButtons, IonMenuButton, IonTitle],
})
export class AppComponent {
  constructor() {}
}
