import {
  ChangeDetectorRef,
  Component,
  EventEmitter,
  HostListener,
  Input,
  type OnChanges,
  Output,
  SimpleChanges,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TauriService, ProjectRow } from '../core/tauri.service';

@Component({
  selector: 'app-reminder-popup',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './reminder-popup.html',
  styleUrl: './reminder-popup.css',
})
export class ReminderPopupComponent implements OnChanges {
  private readonly tauri = inject(TauriService);
  private readonly cdr = inject(ChangeDetectorRef);
  private static readonly DAY_TYPE = 'WORKDAY' as const;

  @Input({ required: true }) open = false;
  @Output() closed = new EventEmitter<void>();
  @Output() saved = new EventEmitter<void>();

  projects: ProjectRow[] = [];
  projectQuery = '';
  projectMenuOpen = false;
  selectedProjectId: number | null = null;

  taskQuery = '';
  taskMenuOpen = false;
  taskSuggestions: string[] = [];

  taskDate = '';
  timeHours = 1;
  saving = false;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['open']?.currentValue !== true) return;
    this.resetForm();
    void this.bootstrap();
  }

  private async bootstrap(): Promise<void> {
    try {
      this.projects = await this.tauri.listProjects();
      this.taskDate = await this.tauri.getCurrentDate();
    } catch {
      this.projects = [];
      this.taskDate = new Date().toISOString().slice(0, 10);
    }
    this.cdr.detectChanges();
  }

  private resetForm(): void {
    this.projectQuery = '';
    this.projectMenuOpen = false;
    this.selectedProjectId = null;
    this.taskQuery = '';
    this.taskMenuOpen = false;
    this.taskSuggestions = [];
    this.timeHours = 1;
    this.saving = false;
  }

  dismiss(): void {
    this.closed.emit();
  }

  backdropClick(ev: MouseEvent): void {
    if (ev.target === ev.currentTarget) this.dismiss();
  }

  filteredProjects(): ProjectRow[] {
    const q = this.projectQuery.trim().toLowerCase();
    if (!q) return this.projects;
    return this.projects.filter((p) => p.name.toLowerCase().includes(q));
  }

  showCreateProjectRow(): boolean {
    const q = this.projectQuery.trim();
    if (!q) return false;
    return !this.projects.some((p) => p.name.toLowerCase() === q.toLowerCase());
  }

  pickProject(p: ProjectRow): void {
    this.projectQuery = p.name;
    this.selectedProjectId = p.id;
    this.projectMenuOpen = false;
    void this.loadTaskSuggestions(p.id);
  }

  createProjectFromQuery(): void {
    const q = this.projectQuery.trim();
    if (!q) return;
    this.selectedProjectId = null;
    this.projectMenuOpen = false;
    this.taskSuggestions = [];
    this.taskQuery = '';
  }

  onProjectInput(): void {
    this.selectedProjectId = null;
    this.taskSuggestions = [];
    this.taskQuery = '';
    this.projectMenuOpen = true;
  }

  onProjectFocus(): void {
    this.projectMenuOpen = true;
  }

  onProjectBlur(): void {
    setTimeout(() => {
      this.projectMenuOpen = false;
      const q = this.projectQuery.trim();
      if (q && this.selectedProjectId == null) {
        const exact = this.projects.find(
          (p) => p.name.toLowerCase() === q.toLowerCase(),
        );
        if (exact) {
          this.selectedProjectId = exact.id;
          void this.loadTaskSuggestions(exact.id);
        }
      }
      this.cdr.detectChanges();
    }, 180);
  }

  filteredTaskSuggestions(): string[] {
    const q = this.taskQuery.trim().toLowerCase();
    if (!q) return this.taskSuggestions;
    return this.taskSuggestions.filter((t) => t.toLowerCase().includes(q));
  }

  pickTask(name: string): void {
    this.taskQuery = name;
    this.taskMenuOpen = false;
  }

  onTaskInput(): void {
    this.taskMenuOpen = true;
  }

  onTaskFocus(): void {
    this.taskMenuOpen = true;
  }

  onTaskBlur(): void {
    setTimeout(() => {
      this.taskMenuOpen = false;
      this.cdr.detectChanges();
    }, 180);
  }

  private async loadTaskSuggestions(projectId: number): Promise<void> {
    try {
      const tasks = await this.tauri.listTasksByProject(projectId);
      const seen = new Set<string>();
      const names: string[] = [];
      for (const t of tasks) {
        const d = t.description.trim();
        if (d && !seen.has(d.toLowerCase())) {
          seen.add(d.toLowerCase());
          names.push(d);
        }
      }
      names.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
      this.taskSuggestions = names;
    } catch {
      this.taskSuggestions = [];
    }
    this.cdr.detectChanges();
  }

  private async resolveProjectId(): Promise<number> {
    if (this.selectedProjectId != null) return this.selectedProjectId;
    const q = this.projectQuery.trim();
    if (!q) throw new Error('Enter or choose a project.');
    const exact = this.projects.find((p) => p.name.toLowerCase() === q.toLowerCase());
    if (exact) {
      this.selectedProjectId = exact.id;
      return exact.id;
    }
    const id = await this.tauri.createProject(q);
    this.projects = await this.tauri.listProjects();
    this.selectedProjectId = id;
    return id;
  }

  async submit(): Promise<void> {
    const desc = this.taskQuery.trim();
    if (!desc) {
      alert('Enter or choose a task name.');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(this.taskDate)) {
      alert('Date must be YYYY-MM-DD.');
      return;
    }
    this.saving = true;
    try {
      const projectId = await this.resolveProjectId();
      const taskId = await this.tauri.createTask({
        projectId,
        taskDate: this.taskDate,
        dayType: ReminderPopupComponent.DAY_TYPE,
        description: desc,
        timeHours: 0,
        obsidianInput: null,
      });
      await this.tauri.addHourLog(taskId, projectId, this.taskDate, this.timeHours);
      this.saved.emit();
      this.closed.emit();
    } catch (e) {
      alert(String(e));
    } finally {
      this.saving = false;
      this.cdr.detectChanges();
    }
  }

  @HostListener('document:keydown', ['$event'])
  onDocKeydown(ev: KeyboardEvent): void {
    if (ev.key === 'Escape' && this.open) {
      ev.stopPropagation();
      this.dismiss();
    }
  }
}
