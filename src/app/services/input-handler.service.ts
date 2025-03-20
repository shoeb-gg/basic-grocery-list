import { Injectable, signal, WritableSignal } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class InputHandlerService {
  constructor() {}

  inputValue: WritableSignal<string> = signal<string>('');
  inputFocus: WritableSignal<boolean> = signal<boolean>(false);
}
