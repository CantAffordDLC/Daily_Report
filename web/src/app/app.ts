import {
  ChangeDetectorRef,
  Component,
  NgZone,
  OnDestroy,
  OnInit,
  inject,
} from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { ReminderPopupComponent } from './reminder/reminder-popup';
import { isTauriRuntime } from './core/tauri.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, ReminderPopupComponent],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements OnInit, OnDestroy {
  private readonly zone = inject(NgZone);
  private readonly cdr = inject(ChangeDetectorRef);
  private unlistenReminder: UnlistenFn | undefined;

  reminderOpen = false;

  ngOnInit(): void {
    if (!isTauriRuntime()) return;
    void listen('reminder-tick', () => {
      this.zone.run(() => {
        if (!this.reminderOpen) {
          this.reminderOpen = true;
          this.cdr.detectChanges();
        }
      });
    }).then((fn) => {
      this.unlistenReminder = fn;
    });
  }

  ngOnDestroy(): void {
    void this.unlistenReminder?.();
  }

  onReminderClosed(): void {
    this.reminderOpen = false;
  }
}
