import {
  Component,
  EventEmitter,
  Input,
  Output,
  inject,
  OnChanges,
  SimpleChanges,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TauriService, TaskRow } from '../../../core/tauri.service';

@Component({
  selector: 'app-task-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './task-dialog.html',
  styleUrl: './task-dialog.css',
})
export class TaskDialogComponent implements OnChanges {
  private readonly tauri = inject(TauriService);
  /** Backend still expects `day_type` until you remove it; fixed value from UI. */
  private static readonly DAY_TYPE = 'WORKDAY' as const;

  /** When true, the popup is visible. */
  @Input({ required: true }) open = false;
  @Input({ required: true }) projectId!: number;
  /** If set, dialog is in edit mode for this task. */
  @Input() editTask: TaskRow | null = null;

  @Output() closed = new EventEmitter<void>();
  @Output() saved = new EventEmitter<void>();

  taskDate = '';
  /** Shown as “Name” in the UI; stored as task description in the backend. */
  taskName = '';
  timeHours = 1;
  obsidianDraft = '';

  saving = false;

  async ngOnChanges(changes: SimpleChanges): Promise<void> {
    if (!this.open) return;
    if (changes['open']?.currentValue === true || changes['editTask']) {
      await this.syncFormFromInputs();
    }
  }

  private async syncFormFromInputs(): Promise<void> {
    const t = this.editTask;
    if (t) {
      this.taskDate = t.taskDate;
      this.taskName = t.description;
      this.timeHours = t.timeHours;
      this.obsidianDraft = t.obsidianUri ?? '';
    } else {
      this.taskName = '';
      this.timeHours = 1;
      this.obsidianDraft = '';
      try {
        this.taskDate = await this.tauri.getCurrentDate();
      } catch {
        this.taskDate = new Date().toISOString().slice(0, 10);
      }
    }
  }

  dismiss(): void {
    this.closed.emit();
  }

  backdropClick(ev: MouseEvent): void {
    if (ev.target === ev.currentTarget) {
      this.dismiss();
    }
  }

  async pickNote(): Promise<void> {
    try {
      const path = await this.tauri.pickMarkdownFile();
      if (path) this.obsidianDraft = path;
    } catch (e) {
      alert(String(e));
    }
  }

  clearNote(): void {
    this.obsidianDraft = '';
  }

  private obsidianPayload(): string | null {
    const s = this.obsidianDraft.trim();
    return s ? s : null;
  }

  async submit(): Promise<void> {
    const name = this.taskName.trim();
    if (!name) {
      alert('Please enter a task name.');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(this.taskDate)) {
      alert('Date must be YYYY-MM-DD.');
      return;
    }
    this.saving = true;
    try {
      const obs = this.obsidianPayload();
      if (this.editTask) {
        await this.tauri.updateTask({
          id: this.editTask.id,
          projectId: this.projectId,
          taskDate: this.taskDate,
          dayType: TaskDialogComponent.DAY_TYPE,
          description: name,
          timeHours: this.timeHours,
          obsidianInput: obs,
        });
      } else {
        await this.tauri.createTask({
          projectId: this.projectId,
          taskDate: this.taskDate,
          dayType: TaskDialogComponent.DAY_TYPE,
          description: name,
          timeHours: this.timeHours,
          obsidianInput: obs,
        });
      }
      this.saved.emit();
      this.closed.emit();
    } catch (e) {
      alert(String(e));
    } finally {
      this.saving = false;
    }
  }
}
