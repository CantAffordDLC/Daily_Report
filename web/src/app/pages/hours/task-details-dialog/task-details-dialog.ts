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
import { TauriService, TaskRow, TaskHistoryRow, HourLogRow } from '../../../core/tauri.service';

@Component({
  selector: 'app-task-details-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './task-details-dialog.html',
  styleUrl: './task-details-dialog.css',
})
export class TaskDetailsDialogComponent implements OnChanges {
  private readonly tauri = inject(TauriService);
  private readonly cdr = inject(ChangeDetectorRef);

  @Input() task: TaskRow | null = null;
  @Output() closed = new EventEmitter<void>();
  @Output() saved = new EventEmitter<void>();
  @Output() deleted = new EventEmitter<void>();

  history: TaskHistoryRow[] = [];
  historyLoading = false;
  hourLogs: HourLogRow[] = [];

  taskName = '';
  taskDate = '';
  obsidianDraft = '';
  saving = false;

  logHours: number | null = null;

  get currentYearMonth(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  get currentMonthHours(): number {
    const ym = this.currentYearMonth;
    return this.hourLogs
      .filter((l) => l.loggedDate.startsWith(ym))
      .reduce((s, l) => s + l.hours, 0);
  }

  get open(): boolean {
    return this.task !== null;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['task']) return;
    const t = this.task;
    if (!t) {
      this.history = [];
      this.hourLogs = [];
      return;
    }
    this.taskName = t.description;
    this.taskDate = t.taskDate;
    this.obsidianDraft = t.obsidianUri ?? '';
    this.logHours = null;
    void this.loadData(t.id);
  }

  private async loadData(taskId: number): Promise<void> {
    this.historyLoading = true;
    this.cdr.detectChanges();
    try {
      [this.history, this.hourLogs] = await Promise.all([
        this.tauri.listTaskHistory(taskId),
        this.tauri.listHourLogsForTask(taskId),
      ]);
    } catch {
      this.history = [];
      this.hourLogs = [];
    } finally {
      this.historyLoading = false;
      this.cdr.detectChanges();
    }
  }

  async addLogEntry(): Promise<void> {
    if (!this.task) return;
    const h = Number(this.logHours);
    if (!Number.isFinite(h) || h <= 0) {
      alert('Enter a positive number of hours.');
      return;
    }
    const today = new Date().toISOString().slice(0, 10);
    try {
      await this.tauri.addHourLog(this.task.id, this.task.projectId, today, h);
      this.logHours = null;
      await this.loadData(this.task.id);
      this.saved.emit();
    } catch (e) {
      alert(String(e));
    }
    this.cdr.detectChanges();
  }

  async deleteLogEntry(logId: number): Promise<void> {
    if (!await this.tauri.confirm('Delete this hour log entry?')) return;
    try {
      await this.tauri.deleteHourLog(logId);
      await this.loadData(this.task!.id);
      this.saved.emit();
    } catch (e) {
      alert(String(e));
    }
    this.cdr.detectChanges();
  }

  dismiss(): void {
    this.closed.emit();
  }

  backdropClick(ev: MouseEvent): void {
    if (ev.target === ev.currentTarget) this.dismiss();
  }

  async pickNote(): Promise<void> {
    try {
      const path = await this.tauri.pickMarkdownFile();
      if (path) this.obsidianDraft = path;
      this.cdr.detectChanges();
    } catch (e) {
      alert(String(e));
    }
  }

  clearNote(): void {
    this.obsidianDraft = '';
  }

  formatDelta(delta: number): string {
    const sign = delta >= 0 ? '+' : '';
    return `${sign}${delta.toFixed(2).replace(/\.00$/, '')} h`;
  }

  formatDate(iso: string): string {
    try {
      return new Date(iso).toLocaleString();
    } catch {
      return iso;
    }
  }

  async save(): Promise<void> {
    if (!this.task) return;
    const name = this.taskName.trim();
    if (!name) { alert('Name is required.'); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(this.taskDate)) { alert('Date must be YYYY-MM-DD.'); return; }
    this.saving = true;
    try {
      const obs = this.obsidianDraft.trim() || null;
      await this.tauri.updateTask({
        id: this.task.id,
        projectId: this.task.projectId,
        taskDate: this.taskDate,
        dayType: this.task.dayType,
        description: name,
        timeHours: this.task.timeHours,
        obsidianInput: obs,
      });
      this.saved.emit();
    } catch (e) {
      alert(String(e));
    } finally {
      this.saving = false;
      this.cdr.detectChanges();
    }
  }

  async deleteTask(): Promise<void> {
    if (!this.task) return;
    if (!await this.tauri.confirm(`Delete task "${this.task.description}"? This cannot be undone.`)) return;
    try {
      await this.tauri.deleteTask(this.task.id);
      this.deleted.emit();
    } catch (e) {
      alert(String(e));
    }
  }
}
