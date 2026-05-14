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
import { TauriService, TaskRow, TaskHistoryRow } from '../../../core/tauri.service';

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

  taskName = '';
  taskDate = '';
  timeHours = 0;
  obsidianDraft = '';
  saving = false;

  get open(): boolean {
    return this.task !== null;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['task']) return;
    const t = this.task;
    if (!t) {
      this.history = [];
      return;
    }
    this.taskName = t.description;
    this.taskDate = t.taskDate;
    this.timeHours = t.timeHours;
    this.obsidianDraft = t.obsidianUri ?? '';
    void this.loadHistory(t.id);
  }

  private async loadHistory(taskId: number): Promise<void> {
    this.historyLoading = true;
    this.cdr.detectChanges();
    try {
      this.history = await this.tauri.listTaskHistory(taskId);
    } catch {
      this.history = [];
    } finally {
      this.historyLoading = false;
      this.cdr.detectChanges();
    }
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
        timeHours: this.timeHours,
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
    if (!confirm(`Delete task "${this.task.description}"? This cannot be undone.`)) return;
    try {
      await this.tauri.deleteTask(this.task.id);
      this.deleted.emit();
    } catch (e) {
      alert(String(e));
    }
  }
}
