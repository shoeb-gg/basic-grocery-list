import { Component, inject, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import {
  IonHeader,
  IonToolbar,
  IonButtons,
  IonMenuButton,
  IonTitle,
  IonContent,
} from '@ionic/angular/standalone';

@Component({
  selector: 'app-folder',
  templateUrl: './folder.page.html',
  styleUrls: ['./folder.page.scss'],
  imports: [
    IonHeader,
    IonToolbar,
    IonButtons,
    IonMenuButton,
    IonTitle,
    IonContent,
  ],
})
export class FolderPage implements OnInit {
  public folder!: string;
  private activatedRoute = inject(ActivatedRoute);
  constructor() {}

  ngOnInit() {
    this.folder = this.activatedRoute.snapshot.paramMap.get('id') as string;
  }
}

// import { addIcons } from 'ionicons';
// import {
//   mailOutline,
//   mailSharp,
//   paperPlaneOutline,
//   paperPlaneSharp,
//   heartOutline,
//   heartSharp,
//   archiveOutline,
//   archiveSharp,
//   trashOutline,
//   trashSharp,
//   warningOutline,
//   warningSharp,
//   bookmarkOutline,
//   bookmarkSharp,
// } from 'ionicons/icons';

// public appPages = [
//   { title: 'Inbox', url: '/folder/inbox', icon: 'mail' },
//   { title: 'Outbox', url: '/folder/outbox', icon: 'paper-plane' },
//   { title: 'Favorites', url: '/folder/favorites', icon: 'heart' },
//   { title: 'Archived', url: '/folder/archived', icon: 'archive' },
//   { title: 'Trash', url: '/folder/trash', icon: 'trash' },
//   { title: 'Spam', url: '/folder/spam', icon: 'warning' },
// ];
// public labels = ['Family', 'Friends', 'Notes', 'Work', 'Travel', 'Reminders'];
// constructor() {
//   // addIcons({ mailOutline, mailSharp, paperPlaneOutline, paperPlaneSharp, heartOutline, heartSharp, archiveOutline, archiveSharp, trashOutline, trashSharp, warningOutline, warningSharp, bookmarkOutline, bookmarkSharp });
// }

// imports: [
//   RouterLink,
//   RouterLinkActive,
//   IonApp,
//   IonSplitPane,
//   IonMenu,
//   IonContent,
//   IonList,
//   IonListHeader,
//   IonNote,
//   IonMenuToggle,
//   IonItem,
//   IonIcon,
//   IonLabel,
//   IonRouterLink,
//   IonRouterOutlet,
// ],
