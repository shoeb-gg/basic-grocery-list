import { Injectable } from '@angular/core';
import { AuthService } from '@auth0/auth0-angular';
import { Browser } from '@capacitor/browser';

@Injectable({
  providedIn: 'root',
})
export class AuthenticationService {
  // constructor(private readonly auth: AuthService) {}
  login() {
    // this.auth
    //   .loginWithRedirect({
    //     async openUrl(url: string) {
    //       await Browser.open({ url, windowName: '_self' });
    //     },
    //   })
    //   .subscribe();
  }
}
