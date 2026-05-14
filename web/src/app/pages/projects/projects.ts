import { ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  TauriService,
  ProjectRow,
  TaskRow,
} from '../../core/tauri.service';
import { TaskDialogComponent } from '../tasks/task-dialog/task-dialog';

@Component({
  selector: 'app-projects',
  standalone: true,
  imports: [CommonModule, FormsModule, TaskDialogComponent],
  templateUrl: './projects.html',
  styleUrl: './projects.css',
})
export class ProjectsPage implements OnInit {
  private readonly tauri = inject(TauriService);
  private readonly cdr = inject(ChangeDetectorRef);

  allProjects: ProjectRow[] = [];
  /** Project IDs that have at least one task with hours this month. */
  monthlyProjectIds = new Set<number>();
  searchQuery = '';
  loading = false;
  error: string | null = null;

  readonly currentYearMonth: string = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  })();

  renamingProjectId: number | null = null;
  renameDraft = '';

  modalOpen = false;
  activeProject: ProjectRow | null = null;
  tasks: TaskRow[] = [];
  tasksLoading = false;

  taskFormOpen = false;
  editingTaskForDialog: TaskRow | null = null;

  ngOnInit(): void {
    void this.refresh();
  }

  async refresh(): Promise<void> {
    this.loading = true;
    this.error = null;
    try {
      const [projects, logs] = await Promise.all([
        this.tauri.listProjects(),
        this.tauri.getMonthlyHourLogs(new Date().getFullYear()),
      ]);
      this.allProjects = projects;
      this.monthlyProjectIds = new Set(
        logs
          .filter((r) => r.yearMonth === this.currentYearMonth)
          .map((r) => r.projectId),
      );
    } catch (e) {
      this.error = String(e);
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  get normalizedQuery(): string {
    return this.searchQuery.trim().toLowerCase();
  }

  /** Projects shown in the grid: this month's projects when idle, search results when typing. */
  get visibleProjects(): ProjectRow[] {
    const q = this.normalizedQuery;
    if (!q) {
      return this.allProjects.filter((p) => this.monthlyProjectIds.has(p.id));
    }
    return this.allProjects.filter((p) =>
      p.name.toLowerCase().includes(q),
    );
  }

  async createProject(): Promise<void> {
    const name = this.searchQuery.trim();
    if (!name) return;
    try {
      await this.tauri.createProject(name);
      this.searchQuery = '';
      await this.refresh();
    } catch (e) {
      alert(String(e));
    }
  }

  startRename(p: ProjectRow, ev?: Event): void {
    ev?.stopPropagation();
    this.renamingProjectId = p.id;
    this.renameDraft = p.name;
    this.cdr.detectChanges();
  }

  cancelRename(): void {
    this.renamingProjectId = null;
    this.renameDraft = '';
    this.cdr.detectChanges();
  }

  async commitRename(p: ProjectRow): Promise<void> {
    const name = this.renameDraft.trim();
    if (!name || name === p.name) {
      this.cancelRename();
      return;
    }
    try {
      await this.tauri.renameProject(p.id, name);
      if (this.activeProject?.id === p.id) {
        this.activeProject = { ...this.activeProject, name };
      }
      await this.refresh();
    } catch (e) {
      alert(String(e));
    } finally {
      this.renamingProjectId = null;
      this.renameDraft = '';
      this.cdr.detectChanges();
    }
  }

  async deleteProject(p: ProjectRow, ev: Event): Promise<void> {
    ev.stopPropagation();
    if (!confirm(`Delete project "${p.name}" and all its tasks?`)) return;
    try {
      await this.tauri.deleteProject(p.id);
      if (this.activeProject?.id === p.id) this.closeModal();
      await this.refresh();
    } catch (e) {
      alert(String(e));
    }
  }

  async openProject(p: ProjectRow): Promise<void> {
    this.activeProject = p;
    this.modalOpen = true;
    this.taskFormOpen = false;
    this.editingTaskForDialog = null;
    await this.loadTasks();
  }

  closeModal(): void {
    this.modalOpen = false;
    this.activeProject = null;
    this.tasks = [];
    this.taskFormOpen = false;
    this.editingTaskForDialog = null;
    this.cdr.detectChanges();
  }

  openAddTaskPopup(): void {
    this.editingTaskForDialog = null;
    this.taskFormOpen = true;
  }

  openEditTaskPopup(t: TaskRow): void {
    this.editingTaskForDialog = t;
    this.taskFormOpen = true;
    this.cdr.detectChanges();
  }

  onTaskDialogClosed(): void {
    this.taskFormOpen = false;
    this.editingTaskForDialog = null;
    this.cdr.detectChanges();
  }

  get tasksThisMonth(): TaskRow[] {
    return this.tasks.filter((t) => t.taskDate.startsWith(this.currentYearMonth));
  }

  async loadTasks(): Promise<void> {
    if (!this.activeProject) return;
    this.tasksLoading = true;
    try {
      this.tasks = await this.tauri.listTasksByProject(this.activeProject.id);
    } catch (e) {
      alert(String(e));
    } finally {
      this.tasksLoading = false;
      this.cdr.detectChanges();
    }
  }

  async deleteTask(t: TaskRow): Promise<void> {
    if (!confirm('Delete this task?')) return;
    try {
      await this.tauri.deleteTask(t.id);
      await this.loadTasks();
    } catch (e) {
      alert(String(e));
    }
  }

  async openObsidian(uri: string | null): Promise<void> {
    if (!uri) return;
    try {
      await this.tauri.openObsidianUri(uri);
    } catch (e) {
      alert(String(e));
    }
  }

  noteLabel(t: TaskRow): string {
    if (!t.obsidianUri) return '—';
    if (t.obsidianUri.startsWith('obsidian://open?path=')) {
      try {
        const q = t.obsidianUri.split('path=')[1];
        return decodeURIComponent(q || '');
      } catch {
        return t.obsidianUri;
      }
    }
    return t.obsidianUri.length > 40
      ? t.obsidianUri.slice(0, 40) + '…'
      : t.obsidianUri;
  }
}
