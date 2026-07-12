import { provideZoneChangeDetection } from "@angular/core";
import { bootstrapApplication } from '@angular/platform-browser';
import {
  RouteReuseStrategy,
  provideRouter,
  withPreloading,
  PreloadAllModules,
} from '@angular/router';
import {
  IonicRouteStrategy,
  provideIonicAngular,
} from '@ionic/angular/standalone';

import { routes } from './app/app.routes';
import { AppComponent } from './app/app.component';

import { Storage } from '@ionic/storage-angular';

bootstrapApplication(AppComponent, {
  providers: [
    provideZoneChangeDetection(),
    Storage,
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    // scrollAssist/scrollPadding off: the app owns keyboard scrolling itself
    // (AppComponent) against the CDK virtual-scroll viewport, and Ionic's
    // built-in assist fights that — it over-scrolls the focused input to the
    // top of the viewport.
    provideIonicAngular({ scrollAssist: false, scrollPadding: false }),
    provideRouter(routes, withPreloading(PreloadAllModules)),
  ],
});
