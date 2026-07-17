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
import { SettingsDialogComponent } from './pages/settings/settings-dialog/settings-dialog';
import { isTauriRuntime } from './core/tauri.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, ReminderPopupComponent, SettingsDialogComponent],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements OnInit, OnDestroy {
  private readonly zone = inject(NgZone);
  private readonly cdr = inject(ChangeDetectorRef);
  private unlistenReminder: UnlistenFn | undefined;

  reminderOpen = false;
  settingsOpen = false;

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

  openSettings(): void {
    this.settingsOpen = true;
    this.cdr.detectChanges();
  }

  closeSettings(): void {
    this.settingsOpen = false;
    this.cdr.detectChanges();
  }
}
