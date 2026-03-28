import { Component, effect, ViewChild } from '@angular/core';
import { IonInput, IonItem, IonIcon, IonButton } from '@ionic/angular/standalone';

import { addIcons } from 'ionicons';
import { add, arrowUpCircle } from 'ionicons/icons';

import { InputHandlerService } from 'src/app/services/input-handler.service';
import { ListStoreService } from 'src/app/services/list-store.service';

@Component({
  selector: 'app-input-container',
  templateUrl: './input-container.component.html',
  styleUrls: ['./input-container.component.scss'],
  imports: [IonInput, IonItem, IonIcon, IonButton],
})
export class InputContainerComponent {
  @ViewChild('newItemInput') newItemInput!: IonInput;

  constructor(
    public readonly inputHandler: InputHandlerService,
    public readonly listStore: ListStoreService
  ) {
    addIcons({ add, arrowUpCircle });

    this.listenInput();
  }

  valueChange(event: CustomEvent) {
    this.inputHandler.inputValue.set(event.detail.value);
  }

  listenInput() {
    effect(() => {
      if (this.inputHandler.inputFocus()) {
        this.newItemInput.setFocus();
      }
    });
  }

  addAndBlur() {
    this.listStore.addToList();
    this.newItemInput.getInputElement().then((el) => el.blur());
  }

  unfocusInput() {
    this.inputHandler.inputFocus.set(false);
  }
}
