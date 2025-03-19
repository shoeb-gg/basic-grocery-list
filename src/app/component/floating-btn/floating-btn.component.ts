import { AfterViewInit, Component, OnInit } from '@angular/core';
import { IonFab, IonFabButton, IonIcon } from '@ionic/angular/standalone';
import { Platform } from '@ionic/angular';

import { addIcons } from 'ionicons';
import { add, checkmarkSharp, logIn } from 'ionicons/icons';

import { InputHandlerService } from 'src/app/services/input-handler.service';

import { take } from 'rxjs/internal/operators/take';

@Component({
  selector: 'app-floating-btn',
  templateUrl: './floating-btn.component.html',
  styleUrls: ['./floating-btn.component.scss'],
  imports: [IonFab, IonFabButton, IonIcon],
})
export class FloatingBtnComponent implements OnInit, AfterViewInit {
  constructor(
    public readonly inputHandler: InputHandlerService,
    private readonly platform: Platform
  ) {
    addIcons({ add, checkmarkSharp });
  }

  ngOnInit() {}

  ngAfterViewInit(): void {
    const input = document.querySelector('ion-fab');

    this.platform.keyboardDidShow.subscribe((event: any) => {
      input?.style.setProperty('transition', 'transform 0.1s ease-in');
      input?.style.setProperty(
        'transform',
        `translate3d(0, -${event.keyboardHeight}px, 0)`
      );
    });

    this.platform.keyboardDidHide.subscribe((event) => {
      input?.style.removeProperty('transform');
    });
  }
}
