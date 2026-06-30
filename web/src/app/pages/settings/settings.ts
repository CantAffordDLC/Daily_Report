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
  obsidianProjectsFolder = '';
  obsidianAutoCreate = false;
  reminderEnabled = false;
  reminderCron = '0 0 9,12,17 * * *';
  backupEnabled = false;
  backupFrequency = 'daily';
  backupPath = '';
  backupMessage: string | null = null;
  message: string | null = null;

  readonly backupFrequencyOptions = [
    { value: 'daily', label: 'Daily' },
    { value: 'weekly', label: 'Weekly' },
    { value: 'monthly', label: 'Monthly' },
    { value: 'annual', label: 'Annual' },
  ];

  ngOnInit(): void {
    void this.load();
  }

  async load(): Promise<void> {
    try {
      const s = await this.tauri.getSettings();
      this.exportPath = s.exportPath;
      this.defaultObsidianVault = s.defaultObsidianVault ?? '';
      this.obsidianVaultPath = s.obsidianVaultPath ?? '';
      this.obsidianProjectsFolder = s.obsidianProjectsFolder ?? '';
      this.obsidianAutoCreate = s.obsidianAutoCreate ?? false;
      this.reminderEnabled = s.reminderEnabled ?? false;
      this.reminderCron = s.reminderCron?.trim() || '0 0 9,12,17 * * *';
      this.backupEnabled = s.backupEnabled ?? false;
      this.backupFrequency = s.backupFrequency || 'daily';
      this.backupPath = s.backupPath ?? '';
    } catch (e) {
      console.error(e);
    } finally {
      this.cdr.detectChanges();
    }
  }

  async browseVaultPath(): Promise<void> {
    try {
      const path = await this.tauri.pickFolder();
      if (path) { this.obsidianVaultPath = path; this.cdr.detectChanges(); }
    } catch (e) { alert(String(e)); }
  }

  async browseProjectsFolder(): Promise<void> {
    try {
      const path = await this.tauri.pickFolder();
      if (path) { this.obsidianProjectsFolder = path; this.cdr.detectChanges(); }
    } catch (e) { alert(String(e)); }
  }

  async browseBackupPath(): Promise<void> {
    try {
      const path = await this.tauri.pickFolder();
      if (path) { this.backupPath = path; this.cdr.detectChanges(); }
    } catch (e) { alert(String(e)); }
  }

  async runBackup(): Promise<void> {
    this.backupMessage = null;
    try {
      const dest = await this.tauri.createBackup();
      this.backupMessage = `Backup saved to: ${dest}`;
    } catch (e) {
      alert(String(e));
    } finally {
      this.cdr.detectChanges();
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
        obsidianProjectsFolder: this.obsidianProjectsFolder.trim(),
        obsidianAutoCreate: this.obsidianAutoCreate,
        reminderEnabled: this.reminderEnabled,
        reminderCron: this.reminderCron.trim() || '0 0 9,12,17 * * *',
        backupEnabled: this.backupEnabled,
        backupFrequency: this.backupFrequency || 'daily',
        backupPath: this.backupPath.trim(),
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
