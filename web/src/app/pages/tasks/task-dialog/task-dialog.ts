import {
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  OnInit,
  Output,
  SimpleChanges,
  inject,
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
export class TaskDialogComponent implements OnInit, OnChanges {
  private readonly tauri = inject(TauriService);
  private readonly cdr = inject(ChangeDetectorRef);

  readonly dayTypeOptions = [
    { value: 'WORKDAY', label: 'Normal' },
    { value: 'FERIAS', label: 'Férias' },
    { value: 'FOLGA', label: 'Folga' },
  ] as const;

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
  dayType = 'WORKDAY';
  obsidianDraft = '';
  createNote = false;
  obsidianConfigured = false;

  saving = false;

  ngOnInit(): void {
    void this.tauri.getSettings().then((s) => {
      this.obsidianConfigured = (s.obsidianEnabled ?? false) && !!s.obsidianVaultPath?.trim();
      this.cdr.detectChanges();
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!this.open) return;
    if (!(changes['open']?.currentValue === true || changes['editTask'])) {
      return;
    }
    const t = this.editTask;
    if (t) {
      this.taskDate = t.taskDate;
      this.taskName = t.description;
      this.dayType = t.dayType ?? 'WORKDAY';
      this.obsidianDraft = t.obsidianUri ?? '';
      this.createNote = false;
      return;
    }
    this.taskName = '';
    this.dayType = 'WORKDAY';
    this.obsidianDraft = '';
    this.createNote = false;
    void this.tauri.getCurrentDate().then(
      (d) => {
        this.taskDate = d;
        this.cdr.detectChanges();
      },
      () => {
        this.taskDate = new Date().toISOString().slice(0, 10);
        this.cdr.detectChanges();
      },
    );
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
      this.cdr.detectChanges();
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
      let obs = this.obsidianPayload();
      let forceCreate = false;

      if (!this.editTask && this.createNote && !obs) {
        // Check if a note with this name already exists in the vault
        const existing = await this.tauri.findObsidianNote(this.projectId, name);
        if (existing) {
          const link = await this.tauri.confirm(
            `A note "${name}.md" already exists in the vault.\n\nClick OK to link it, or Cancel to create a new one.`,
          );
          if (link) {
            obs = existing;
          } else {
            forceCreate = true;
          }
        } else {
          forceCreate = true;
        }
      }

      if (this.editTask) {
        await this.tauri.updateTask({
          id: this.editTask.id,
          projectId: this.projectId,
          taskDate: this.taskDate,
          dayType: this.dayType,
          description: name,
          timeHours: this.editTask.timeHours,
          obsidianInput: obs,
        });
      } else {
        await this.tauri.createTask({
          projectId: this.projectId,
          taskDate: this.taskDate,
          dayType: this.dayType,
          description: name,
          timeHours: 0,
          obsidianInput: obs,
          createNote: forceCreate || undefined,
        });

        // If a note was auto-created, find its URI and offer to open it
        if (forceCreate) {
          const noteUri = await this.tauri.findObsidianNote(this.projectId, name);
          if (noteUri) {
            this.saved.emit();
            this.closed.emit();
            const openNow = await this.tauri.confirm(`✅ Nota criada com sucesso!\n\nClica OK para abrir "${name}" no Obsidian.`);
            if (openNow) {
              await this.tauri.openObsidianUri(noteUri);
            }
            return;
          }
        }
      }
      this.saved.emit();
      this.closed.emit();
    } catch (e) {
      alert(String(e));
    } finally {
      this.saving = false;
      this.cdr.detectChanges();
    }
  }
}
