import { ChangeDetectorRef, Component, NgZone, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  TauriService,
  ProjectRow,
  TaskRow,
} from '../../core/tauri.service';
import { TaskDialogComponent } from '../tasks/task-dialog/task-dialog';
import { TaskDetailsDialogComponent } from '../hours/task-details-dialog/task-details-dialog';

@Component({
  selector: 'app-projects',
  standalone: true,
  imports: [CommonModule, FormsModule, TaskDialogComponent, TaskDetailsDialogComponent],
  templateUrl: './projects.html',
  styleUrl: './projects.css',
})
export class ProjectsPage implements OnInit {
  private readonly tauri = inject(TauriService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly zone = inject(NgZone);

  allProjects: ProjectRow[] = [];
  /** Project IDs that have at least one task with hours this month. */
  monthlyProjectIds = new Set<number>();
  /** All tasks across all projects, used for search. */
  allTasks: TaskRow[] = [];
  searchQuery = '';
  loading = false;
  error: string | null = null;

  todayHours = 0;
  obsidianEnabled = false;

  readonly currentYearMonth: string = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  })();

  readonly today: string = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  })();

  renamingProjectId: number | null = null;
  renameDraft = '';

  modalOpen = false;
  activeProject: ProjectRow | null = null;
  tasks: TaskRow[] = [];
  tasksLoading = false;

  taskFormOpen = false;
  editingTaskForDialog: TaskRow | null = null;
  detailTask: TaskRow | null = null;

  ngOnInit(): void {
    void this.refresh();
  }

  async refresh(): Promise<void> {
    this.loading = true;
    this.error = null;
    try {
      const [projects, logs, tasks, todayLogs, settings] = await Promise.all([
        this.tauri.listProjects(),
        this.tauri.getMonthlyHourLogs(new Date().getFullYear()),
        this.tauri.listAllTasks(),
        this.tauri.getDailyHourLogs(this.today),
        this.tauri.getSettings(),
      ]);
      this.allProjects = projects;
      this.allTasks = tasks;
      this.monthlyProjectIds = new Set(
        logs
          .filter((r) => r.yearMonth === this.currentYearMonth)
          .map((r) => r.projectId),
      );
      this.todayHours = todayLogs.reduce((s, r) => s + r.totalHours, 0);
      this.obsidianEnabled = (settings.obsidianEnabled ?? false) && !!settings.obsidianVaultPath?.trim();
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

  /** Projects shown in the grid: this month's projects + projects with no tasks when idle, search results when typing. */
  get visibleProjects(): ProjectRow[] {
    const q = this.normalizedQuery;
    if (!q) {
      const taskProjectIds = new Set(this.allTasks.map((t) => t.projectId));
      return this.allProjects.filter(
        (p) => this.monthlyProjectIds.has(p.id) || !taskProjectIds.has(p.id),
      );
    }
    const matchingProjectIds = new Set(
      this.allTasks
        .filter((t) => t.description.toLowerCase().includes(q))
        .map((t) => t.projectId),
    );
    return this.allProjects.filter(
      (p) => p.name.toLowerCase().includes(q) || matchingProjectIds.has(p.id),
    );
  }

  promptCreateProject(): void {
    const prefill = this.searchQuery.trim();
    const name = prompt('New project name:', prefill) ?? '';
    if (!name.trim()) return;
    this.searchQuery = '';
    void this.tauri.createProject(name.trim())
      .then(() => this.refresh())
      .catch((e) => alert(String(e)));
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
      if (this.activeProject?.id === p.id) {
        this.modalOpen = false;
        this.activeProject = null;
        this.tasks = [];
        this.cdr.detectChanges();
      }
      await this.refresh();
    } catch (e) {
      alert(String(e));
    }
  }

  async openProject(p: ProjectRow): Promise<void> {
    this.activeProject = p;
    this.modalOpen = true;
    this.tasks = [];
    this.otherMonthsExpanded = false;
    this.taskFormOpen = false;
    this.editingTaskForDialog = null;
    this.detailTask = null;
    this.cdr.detectChanges();
    await this.loadTasks();
  }

  closeModal(): void {
    this.modalOpen = false;
    this.activeProject = null;
    this.tasks = [];
    this.otherMonthsExpanded = false;
    this.taskFormOpen = false;
    this.editingTaskForDialog = null;
    this.detailTask = null;
    this.cdr.detectChanges();
    void this.refresh();
  }

  openAddTaskPopup(): void {
    this.editingTaskForDialog = null;
    this.taskFormOpen = true;
    this.cdr.detectChanges();
    void this.refresh();
  }

  openEditTaskPopup(t: TaskRow): void {
    this.detailTask = t;
    this.cdr.detectChanges();
  }

  closeDetailTask(): void {
    this.detailTask = null;
    this.cdr.detectChanges();
  }

  async onDetailTaskSaved(): Promise<void> {
    await this.loadTasks();
    void this.refresh();
    if (this.detailTask) {
      const refreshed = this.tasks.find((t) => t.id === this.detailTask!.id) ?? null;
      this.detailTask = refreshed;
      this.cdr.detectChanges();
    }
  }

  async onDetailTaskDeleted(): Promise<void> {
    this.detailTask = null;
    await this.loadTasks();
    void this.refresh();
  }

  onNewTaskSaved(): void {
    void this.loadTasks();
    this.cdr.detectChanges();
    void this.refresh();
  }

  onTaskDialogClosed(): void {
    this.taskFormOpen = false;
    this.editingTaskForDialog = null;
    this.cdr.detectChanges();
  }

  /** Effective date = max(taskDate, lastLogDate). Task is "this month" if either falls in current month. */
  private effectiveMonth(t: TaskRow): string {
    const logYm = t.lastLogDate ? t.lastLogDate.slice(0, 7) : '';
    const taskYm = t.taskDate.slice(0, 7);
    return logYm > taskYm ? logYm : taskYm;
  }

  get tasksThisMonth(): TaskRow[] {
    return this.tasks.filter((t) => this.effectiveMonth(t) === this.currentYearMonth);
  }

  async loadTasks(): Promise<void> {
    if (!this.activeProject) return;
    this.tasksLoading = true;
    try {
      const [tasks, allTasks] = await Promise.all([
        this.tauri.listTasksByProject(this.activeProject.id),
        this.tauri.listAllTasks(),
      ]);
      // Wrap inside zone.run() so Angular's change detection reliably picks up
      // the new data even when the Tauri IPC callback resolves outside the zone.
      this.zone.run(() => {
        this.tasks = tasks;
        this.allTasks = allTasks;
        this.tasksLoading = false;
        this.cdr.detectChanges();
      });
    } catch (e) {
      this.zone.run(() => {
        this.tasksLoading = false;
        this.cdr.detectChanges();
      });
      alert(String(e));
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
        const encoded = t.obsidianUri.slice('obsidian://open?path='.length);
        const fullPath = decodeURIComponent(encoded).replace(/\\/g, '/');
        const parts = fullPath.split('/').filter(Boolean);
        return parts[parts.length - 1] ?? fullPath;
      } catch {
        return t.obsidianUri;
      }
    }
    if (t.obsidianUri.startsWith('obsidian://')) {
      try {
        const url = new URL(t.obsidianUri);
        const file = url.searchParams.get('file');
        if (file) {
          const decoded = decodeURIComponent(file).replace(/\\/g, '/');
          return decoded.split('/').filter(Boolean).pop() ?? decoded;
        }
      } catch { /* fallthrough */ }
    }
    return t.obsidianUri.length > 40
      ? t.obsidianUri.slice(0, 40) + '…'
      : t.obsidianUri;
  }

  otherMonthsExpanded = false;

  toggleOtherMonths(): void {
    this.otherMonthsExpanded = !this.otherMonthsExpanded;
    this.cdr.detectChanges();
  }

  get tasksOtherMonths(): TaskRow[] {
    return this.tasks.filter((t) => this.effectiveMonth(t) !== this.currentYearMonth);
  }

  get tasksByMonthOther(): { month: string; tasks: TaskRow[] }[] {
    const map = new Map<string, TaskRow[]>();
    for (const t of this.tasksOtherMonths) {
      const ym = t.taskDate.slice(0, 7);
      const arr = map.get(ym) ?? [];
      arr.push(t);
      map.set(ym, arr);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([month, tasks]) => ({ month, tasks }));
  }
}
