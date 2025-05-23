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

import { AuthModule } from '@auth0/auth0-angular';
import config from '../capacitor.config';
import { importProvidersFrom } from '@angular/core';

// const redirect_uri = `${config.appId}://dev-el6qa1wf65zu3q1h.eu.auth0.com/capacitor/${config.appId}/callback`;
// const redirect_uri = 'http://localhost:8100';

bootstrapApplication(AppComponent, {
  providers: [
    Storage,
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    provideIonicAngular(),

    importProvidersFrom(
      AuthModule.forRoot({
        domain: 'dev-el6qa1wf65zu3q1h.eu.auth0.com',
        clientId: 'eNmlPSYJl9y3AHEZIOinbzyocT6FbfJP',
        useRefreshTokens: true,
        useRefreshTokensFallback: false,
        authorizationParams: {
          redirect_uri: window.location.origin,
        },
      })
    ),

    provideRouter(routes, withPreloading(PreloadAllModules)),
  ],
});
