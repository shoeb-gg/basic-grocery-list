import { Component } from '@angular/core';
// import { RouterLink, RouterLinkActive } from '@angular/router';
import {
  IonApp,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
} from '@ionic/angular/standalone';
import { ListContainerComponent } from './component/list-container/list-container.component';

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
  ],
})
export class AppComponent {
  constructor() {}
}
