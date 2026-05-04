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

  projects: ProjectRow[] = [];
  newProjectName = '';
  loading = false;
  error: string | null = null;

  modalOpen = false;
  activeProject: ProjectRow | null = null;
  tasks: TaskRow[] = [];
  tasksLoading = false;

  /** Second-level popup for create / edit task (includes Name field). */
  taskFormOpen = false;
  editingTaskForDialog: TaskRow | null = null;

  ngOnInit(): void {
    void this.refreshProjects();
  }

  async refreshProjects(): Promise<void> {
    this.loading = true;
    this.error = null;
    try {
      this.projects = await this.tauri.listProjects();
    } catch (e) {
      this.error = String(e);
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  async createProject(): Promise<void> {
    const name = this.newProjectName.trim();
    if (!name) return;
    try {
      await this.tauri.createProject(name);
      this.newProjectName = '';
      await this.refreshProjects();
    } catch (e) {
      alert(String(e));
    }
  }

  async deleteProject(p: ProjectRow, ev: Event): Promise<void> {
    ev.stopPropagation();
    if (!confirm(`Delete project "${p.name}" and all its tasks?`)) return;
    try {
      await this.tauri.deleteProject(p.id);
      if (this.activeProject?.id === p.id) this.closeModal();
      await this.refreshProjects();
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
