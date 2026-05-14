import { ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TauriService, AppSettings } from '../../core/tauri.service';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './settings.html',
  styleUrl: './settings.css',
})
export class SettingsPage implements OnInit {
  private readonly tauri = inject(TauriService);
  private readonly cdr = inject(ChangeDetectorRef);

  exportPath = '';
  defaultObsidianVault = '';
  obsidianVaultPath = '';
  obsidianAutoCreate = false;
  reminderEnabled = false;
  reminderCron = '0 0 9,12,17 * * *';
  message: string | null = null;

  ngOnInit(): void {
    void this.load();
  }

  async load(): Promise<void> {
    try {
      const s = await this.tauri.getSettings();
      this.exportPath = s.exportPath;
      this.defaultObsidianVault = s.defaultObsidianVault ?? '';
      this.obsidianVaultPath = s.obsidianVaultPath ?? '';
      this.obsidianAutoCreate = s.obsidianAutoCreate ?? false;
      this.reminderEnabled = s.reminderEnabled ?? false;
      this.reminderCron = s.reminderCron?.trim() || '0 0 9,12,17 * * *';
    } catch (e) {
      console.error(e);
    } finally {
      this.cdr.detectChanges();
    }
  }

  async browseVaultPath(): Promise<void> {
    try {
      const path = await this.tauri.pickFolder();
      if (path) {
        this.obsidianVaultPath = path;
        this.cdr.detectChanges();
      }
    } catch (e) {
      alert(String(e));
    }
  }

  async save(): Promise<void> {
    this.message = null;
    const exportPath = this.exportPath.trim();
    if (!exportPath) {
      alert('Export folder path is required.');
      return;
    }
    try {
      const settings: AppSettings = {
        exportPath,
        defaultObsidianVault: this.defaultObsidianVault.trim(),
        obsidianVaultPath: this.obsidianVaultPath.trim(),
        obsidianAutoCreate: this.obsidianAutoCreate,
        reminderEnabled: this.reminderEnabled,
        reminderCron: this.reminderCron.trim() || '0 0 9,12,17 * * *',
      };
      await this.tauri.setSettings(settings);
      this.message = 'Settings saved.';
    } catch (e) {
      alert(String(e));
    } finally {
      this.cdr.detectChanges();
    }
  }
}
