import { AfterViewInit, Component } from '@angular/core';
import { IonFab, IonFabButton, IonIcon } from '@ionic/angular/standalone';
import { Platform } from '@ionic/angular';

import { addIcons } from 'ionicons';
import { add, checkmarkSharp } from 'ionicons/icons';

import { InputHandlerService } from 'src/app/services/input-handler.service';
import { ListStoreService } from 'src/app/services/list-store.service';

@Component({
  selector: 'app-floating-btn',
  templateUrl: './floating-btn.component.html',
  styleUrls: ['./floating-btn.component.scss'],
  imports: [IonFab, IonFabButton, IonIcon],
})
export class FloatingBtnComponent implements AfterViewInit {
  constructor(
    public readonly inputHandler: InputHandlerService,
    private readonly listStore: ListStoreService,
    private readonly platform: Platform
  ) {
    addIcons({ add, checkmarkSharp });
  }

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

  addToList() {
    this.listStore.addToList(this.inputHandler.inputValue());
    this.inputHandler.inputValue.set('');
  }
}
