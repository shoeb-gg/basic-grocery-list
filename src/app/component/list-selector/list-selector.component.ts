import { Component, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  IonSelect,
  IonSelectOption,
  IonButton,
  IonIcon,
  IonAlert,
} from '@ionic/angular/standalone';

import { addIcons } from 'ionicons';
import { createOutline, trashOutline, listOutline } from 'ionicons/icons';

import { ListStoreService } from 'src/app/services/list-store.service';

@Component({
  selector: 'app-list-selector',
  templateUrl: './list-selector.component.html',
  styleUrls: ['./list-selector.component.scss'],
  imports: [
    FormsModule,
    IonSelect,
    IonSelectOption,
    IonButton,
    IonIcon,
    IonAlert,
  ],
})
export class ListSelectorComponent {
  @ViewChild(IonSelect) selectRef!: IonSelect;

  readonly NEW_LIST_ID = -1;

  isRenameAlertOpen = false;
  isDeleteAlertOpen = false;
  isNewListAlertOpen = false;

  renameAlertInputs = [
    {
      name: 'name',
      type: 'text' as const,
      placeholder: 'List name',
      value: '',
    },
  ];

  newListAlertInputs = [
    {
      name: 'name',
      type: 'text' as const,
      placeholder: 'New list name',
    },
  ];

  deleteAlertButtons = [
    { text: 'Cancel', role: 'cancel' },
    { text: 'Delete', role: 'destructive' },
  ];

  renameAlertButtons = [
    { text: 'Cancel', role: 'cancel' },
    { text: 'Rename', role: 'confirm' },
  ];

  newListAlertButtons = [
    { text: 'Cancel', role: 'cancel' },
    { text: 'Create', role: 'confirm' },
  ];

  constructor(public readonly listStore: ListStoreService) {
    addIcons({ createOutline, trashOutline, listOutline });
  }

  openSelectDropdown() {
    this.selectRef.open();
  }

  onListChange(event: CustomEvent) {
    const id = event.detail.value;
    if (id === this.NEW_LIST_ID) {
      // Reset select back to current list before opening alert
      this.selectRef.value = this.listStore.activeListId();
      this.openNewListAlert();
      return;
    }
    if (id !== this.listStore.activeListId()) {
      this.listStore.switchList(id);
    }
  }

  openRenameAlert() {
    const activeList = this.listStore.lists().find(
      (l) => l.id === this.listStore.activeListId()
    );
    this.renameAlertInputs = [
      {
        name: 'name',
        type: 'text' as const,
        placeholder: 'List name',
        value: activeList?.name || '',
      },
    ];
    this.isRenameAlertOpen = true;
  }

  onRenameResult(event: CustomEvent) {
    this.isRenameAlertOpen = false;
    if (event.detail.role === 'confirm') {
      const name = event.detail.data?.values?.name?.trim();
      if (name) {
        this.listStore.renameList(this.listStore.activeListId(), name);
      }
    }
  }

  openDeleteAlert() {
    this.isDeleteAlertOpen = true;
  }

  onDeleteResult(event: CustomEvent) {
    this.isDeleteAlertOpen = false;
    if (event.detail.role === 'destructive') {
      this.listStore.deleteList(this.listStore.activeListId());
    }
  }

  openNewListAlert() {
    this.isNewListAlertOpen = true;
  }

  onNewListResult(event: CustomEvent) {
    this.isNewListAlertOpen = false;
    if (event.detail.role === 'confirm') {
      const name = event.detail.data?.values?.name?.trim();
      if (name) {
        this.listStore.createList(name);
      }
    }
  }

  get canDelete(): boolean {
    return this.listStore.lists().length > 1;
  }
}
