import { Component, OnInit, inject } from '@angular/core';
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

  exportPath = '';
  defaultObsidianVault = '';
  message: string | null = null;

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  async load(): Promise<void> {
    try {
      const s = await this.tauri.getSettings();
      this.exportPath = s.exportPath;
      this.defaultObsidianVault = s.defaultObsidianVault ?? '';
    } catch (e) {
      console.error(e);
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
      };
      await this.tauri.setSettings(settings);
      this.message = 'Settings saved.';
    } catch (e) {
      alert(String(e));
    }
  }
}
