import {
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TauriService, AppSettings } from '../../../core/tauri.service';

type Tab = 'general' | 'reminders' | 'backup' | 'addons';

@Component({
  selector: 'app-settings-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './settings-dialog.html',
  styleUrl: './settings-dialog.css',
})
export class SettingsDialogComponent implements OnChanges {
  private readonly tauri = inject(TauriService);
  private readonly cdr = inject(ChangeDetectorRef);

  @Input() open = false;
  @Output() closed = new EventEmitter<void>();

  activeTab: Tab = 'general';

  readonly tabs: { id: Tab; label: string; icon: string }[] = [
    { id: 'general',   label: 'General',   icon: '⚙️' },
    { id: 'addons',    label: 'Add-ons',   icon: '🧩' },
    { id: 'reminders', label: 'Reminders', icon: '🔔' },
    { id: 'backup',    label: 'Backup',    icon: '💾' },
  ];

  // ── General ────────────────────────────────────────────────────────────────
  exportPath = '';

  // ── Add-ons: Obsidian ───────────────────────────────────────────────────────
  obsidianEnabled = false;
  obsidianExpanded = false;  // config panel open within the card
  obsidianVaultPath = '';
  obsidianProjectsFolder = '';
  obsidianAutoCreate = false;

  // ── Reminders ──────────────────────────────────────────────────────────────
  reminderEnabled = false;
  reminderCron = '0 0 9,12,17 * * *';

  // ── Backup ─────────────────────────────────────────────────────────────────
  backupEnabled = false;
  backupFrequency = 'daily';
  backupPath = '';
  backupMessage: string | null = null;

  importBackupPath = '';
  importMessage: string | null = null;
  importRestoring = false;

  readonly backupFrequencyOptions = [
    { value: 'daily',   label: 'Daily' },
    { value: 'weekly',  label: 'Weekly' },
    { value: 'monthly', label: 'Monthly' },
    { value: 'annual',  label: 'Annual' },
  ];

  message: string | null = null;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['open']?.currentValue === true) {
      this.message = null;
      this.backupMessage = null;
      void this.load();
    }
  }

  async load(): Promise<void> {
    try {
      const s = await this.tauri.getSettings();
      this.exportPath            = s.exportPath;
      this.obsidianEnabled       = s.obsidianEnabled ?? false;
      this.obsidianVaultPath     = s.obsidianVaultPath ?? '';
      this.obsidianProjectsFolder = s.obsidianProjectsFolder ?? '';
      this.obsidianAutoCreate    = s.obsidianAutoCreate ?? false;
      this.reminderEnabled       = s.reminderEnabled ?? false;
      this.reminderCron          = s.reminderCron?.trim() || '0 0 9,12,17 * * *';
      this.backupEnabled         = s.backupEnabled ?? false;
      this.backupFrequency       = s.backupFrequency || 'daily';
      this.backupPath            = s.backupPath ?? '';
      // Auto-expand Obsidian config panel if already enabled
      this.obsidianExpanded = this.obsidianEnabled;
    } catch (e) {
      console.error(e);
    } finally {
      this.cdr.detectChanges();
    }
  }

  setTab(tab: Tab): void {
    this.activeTab = tab;
    this.message = null;
    this.backupMessage = null;
    this.importMessage = null;
  }

  async browseImportFile(): Promise<void> {
    try {
      const p = await this.tauri.pickBackupFile();
      if (p) { this.importBackupPath = p; this.cdr.detectChanges(); }
    } catch (e) { alert(String(e)); }
  }

  async restoreFromBackup(): Promise<void> {
    if (!this.importBackupPath) return;
    if (!confirm(`Restore from:\n${this.importBackupPath}\n\nThis will replace all current data. Continue?`)) return;
    this.importRestoring = true;
    this.importMessage = null;
    this.cdr.detectChanges();
    try {
      await this.tauri.restoreBackup(this.importBackupPath);
      this.importMessage = '✅ Restored successfully. Reload the app to see updated data.';
      this.importBackupPath = '';
    } catch (e) {
      alert(`Restore failed: ${String(e)}`);
    } finally {
      this.importRestoring = false;
      this.cdr.detectChanges();
    }
  }

  onObsidianToggle(): void {
    if (this.obsidianEnabled) {
      this.obsidianExpanded = true;
    }
    this.cdr.detectChanges();
  }

  async browseVaultPath(): Promise<void> {
    try {
      const p = await this.tauri.pickFolder();
      if (p) { this.obsidianVaultPath = p; this.cdr.detectChanges(); }
    } catch (e) { alert(String(e)); }
  }

  async browseProjectsFolder(): Promise<void> {
    try {
      const p = await this.tauri.pickFolder();
      if (p) { this.obsidianProjectsFolder = p; this.cdr.detectChanges(); }
    } catch (e) { alert(String(e)); }
  }

  async browseBackupPath(): Promise<void> {
    try {
      const p = await this.tauri.pickFolder();
      if (p) { this.backupPath = p; this.cdr.detectChanges(); }
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
        defaultObsidianVault: '',
        obsidianEnabled:         this.obsidianEnabled,
        obsidianVaultPath:       this.obsidianVaultPath.trim(),
        obsidianProjectsFolder:  this.obsidianProjectsFolder.trim(),
        obsidianAutoCreate:      this.obsidianAutoCreate,
        reminderEnabled:         this.reminderEnabled,
        reminderCron:            this.reminderCron.trim() || '0 0 9,12,17 * * *',
        backupEnabled:           this.backupEnabled,
        backupFrequency:         this.backupFrequency || 'daily',
        backupPath:              this.backupPath.trim(),
      };
      await this.tauri.setSettings(settings);
      this.message = 'Settings saved.';
    } catch (e) {
      alert(String(e));
    } finally {
      this.cdr.detectChanges();
    }
  }

  close(): void {
    this.closed.emit();
  }

  backdropClick(ev: MouseEvent): void {
    if (ev.target === ev.currentTarget) this.close();
  }
}
