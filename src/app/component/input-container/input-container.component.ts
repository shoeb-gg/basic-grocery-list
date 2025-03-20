import { Component, computed, ViewChild } from '@angular/core';
import { IonInput, IonItem, IonIcon } from '@ionic/angular/standalone';

import { addIcons } from 'ionicons';
import { add } from 'ionicons/icons';

import { InputHandlerService } from 'src/app/services/input-handler.service';

@Component({
  selector: 'app-input-container',
  templateUrl: './input-container.component.html',
  styleUrls: ['./input-container.component.scss'],
  imports: [IonInput, IonItem, IonIcon],
})
export class InputContainerComponent {
  @ViewChild('THE_INPUT') thisInput!: IonInput;

  constructor(public readonly inputHandler: InputHandlerService) {
    addIcons({ add });
  }

  valueChange(event: CustomEvent) {
    this.inputHandler.inputValue.set(event.detail.value);
  }
}
