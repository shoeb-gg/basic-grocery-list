import { Component, NgZone, OnInit, Optional } from '@angular/core';
import {
  IonApp,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonButton,
  IonButtons,
  IonIcon,
} from '@ionic/angular/standalone';
import { Platform, IonRouterOutlet } from '@ionic/angular';
import { App } from '@capacitor/app';

import { ListContainerComponent } from './component/list-container/list-container.component';
import { FloatingBtnComponent } from './component/floating-btn/floating-btn.component';

import { StorageService } from './services/storage.service';
import { ListStoreService } from './services/list-store.service';
import { addIcons } from 'ionicons';
import { person } from 'ionicons/icons';
import { AuthenticationService } from './services/auth.service';
import config from 'capacitor.config';
import { AuthService } from '@auth0/auth0-angular';
import { mergeMap } from 'rxjs/operators';
import { Browser } from '@capacitor/browser';

const callbackUri = `${config.appId}://dev-el6qa1wf65zu3q1h.eu.auth0.com/capacitor/${config.appId}/callback`;

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
    IonButton,
    IonButtons,
    IonIcon,
    ListContainerComponent,
    FloatingBtnComponent,
  ],
})
export class AppComponent implements OnInit {
  constructor(
    private readonly storage: StorageService,
    private readonly listStore: ListStoreService,
    private readonly platform: Platform,
    public readonly auth: AuthenticationService,
    // public readonly auth0: AuthService,
    private readonly ngZone: NgZone,
    @Optional() private readonly routerOutlet?: IonRouterOutlet
  ) {
    this.platform.backButton.subscribeWithPriority(1, () => {
      if (!this.routerOutlet?.canGoBack()) {
        App.minimizeApp();
      }
    });

    addIcons({ person });
  }
  origin = window.location.origin;

  async ngOnInit() {
    await this.storage.init();
    await this.storage.get('list').then((list) => {
      this.listStore.originalList.set(list || []);
    });
    this.listStore.setUpLists();
    this.listStore.setMaxId();

    // this.handleLoginCallback();
  }

  // handleLoginCallback() {
  //   // Use Capacitor's App plugin to subscribe to the `appUrlOpen` event
  //   App.addListener('appUrlOpen', ({ url }) => {
  //     // Must run inside an NgZone for Angular to pick up the changes
  //     this.ngZone.run(() => {
  //       if (url?.includes('dev-el6qa1wf65zu3q1h.eu.auth0.com/capacitor/')) {
  //         // If the URL is an authentication callback URL..
  //         if (
  //           url.includes('state=') &&
  //           (url.includes('error=') || url.includes('code='))
  //         ) {
  //           // Call handleRedirectCallback and close the browser
  //           this.auth0
  //             .handleRedirectCallback(url)
  //             .pipe(mergeMap(() => Browser.close()))
  //             .subscribe();
  //         } else {
  //           Browser.close();
  //         }
  //       }
  //     });
  //   });
  // }
}
