import { ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  TauriService,
  ProjectRow,
  TaskRow,
} from '../../core/tauri.service';
import { TaskDetailsDialogComponent } from './task-details-dialog/task-details-dialog';

interface ProjectTasks {
  project: ProjectRow;
  tasks: TaskRow[];
}

@Component({
  selector: 'app-hours',
  standalone: true,
  imports: [CommonModule, FormsModule, TaskDetailsDialogComponent],
  templateUrl: './hours.html',
  styleUrl: './hours.css',
})
export class HoursPage implements OnInit {
  private readonly tauri = inject(TauriService);
  private readonly cdr = inject(ChangeDetectorRef);

  groups: ProjectTasks[] = [];
  loading = false;
  error: string | null = null;

  searchQuery = '';
  private collapsedProjectIds = new Set<number>();
  hourDraft: Record<number, number | null> = {};
  savingAll = false;

  detailTask: TaskRow | null = null;

  ngOnInit(): void {
    void this.refresh();
  }

  async refresh(): Promise<void> {
    this.loading = true;
    this.error = null;
    try {
      const projects = await this.tauri.listProjects();
      const pairs = await Promise.all(
        projects.map(async (p) => ({
          project: p,
          tasks: await this.tauri.listTasksByProject(p.id),
        })),
      );
      this.groups = pairs.sort((a, b) =>
        a.project.name.localeCompare(b.project.name, undefined, {
          sensitivity: 'base',
        }),
      );
    } catch (e) {
      this.error = String(e);
      this.groups = [];
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  normalizedSearch(): string {
    return this.searchQuery.trim().toLowerCase();
  }

  taskMatchesSearch(t: TaskRow, q: string, projectName: string): boolean {
    if (!q) return true;
    const hay = [
      t.description,
      t.taskDate,
      t.dayType,
      String(t.timeHours),
      projectName,
    ]
      .join(' ')
      .toLowerCase();
    return hay.includes(q);
  }

  visibleGroups(): ProjectTasks[] {
    const q = this.normalizedSearch();
    const out: ProjectTasks[] = [];
    for (const g of this.groups) {
      const tasks = q
        ? g.tasks.filter((t) => this.taskMatchesSearch(t, q, g.project.name))
        : g.tasks;
      if (!q && tasks.length === 0) {
        out.push({ project: g.project, tasks: [] });
        continue;
      }
      if (tasks.length === 0) continue;
      out.push({ project: g.project, tasks });
    }
    return out;
  }

  projectTotalHours(tasks: TaskRow[]): number {
    return tasks.reduce((s, t) => s + t.timeHours, 0);
  }

  isCollapsed(projectId: number): boolean {
    return this.collapsedProjectIds.has(projectId);
  }

  projectChevron(projectId: number): string {
    return this.isCollapsed(projectId) ? '▸' : '▾';
  }

  toggleProject(projectId: number): void {
    if (this.collapsedProjectIds.has(projectId)) {
      this.collapsedProjectIds.delete(projectId);
    } else {
      this.collapsedProjectIds.add(projectId);
    }
    this.cdr.detectChanges();
  }

  expandAll(): void {
    this.collapsedProjectIds.clear();
    this.cdr.detectChanges();
  }

  collapseAll(): void {
    for (const g of this.groups) {
      this.collapsedProjectIds.add(g.project.id);
    }
    this.cdr.detectChanges();
  }

  openDetails(task: TaskRow): void {
    this.detailTask = task;
    this.cdr.detectChanges();
  }

  closeDetails(): void {
    this.detailTask = null;
    this.cdr.detectChanges();
  }

  async applyAllPendingHours(): Promise<void> {
    const taskById = new Map<number, TaskRow>();
    for (const g of this.groups) {
      for (const t of g.tasks) {
        taskById.set(t.id, t);
      }
    }

    const pending: { task: TaskRow; delta: number }[] = [];
    const invalid: string[] = [];

    for (const [idStr, raw] of Object.entries(this.hourDraft)) {
      const id = Number(idStr);
      if (!Number.isInteger(id)) continue;
      if (raw === null || raw === undefined) continue;
      const delta = Number(raw);
      const task = taskById.get(id);
      if (!task) continue;
      if (!Number.isFinite(delta) || delta <= 0) {
        invalid.push(`"${task.description}" (${task.taskDate}): not a positive number`);
        continue;
      }
      pending.push({ task, delta });
    }

    if (invalid.length) {
      alert('Fix these fields before applying:\n\n' + invalid.join('\n'));
      return;
    }
    if (!pending.length) {
      alert('Enter hours to add on one or more tasks first.');
      return;
    }

    this.savingAll = true;
    this.cdr.detectChanges();
    try {
      for (const { task, delta } of pending) {
        await this.tauri.addTaskHours(task.id, delta);
      }
      for (const { task } of pending) {
        this.hourDraft[task.id] = null;
      }
      await this.refresh();
    } catch (e) {
      alert(String(e));
    } finally {
      this.savingAll = false;
      this.cdr.detectChanges();
    }
  }
}
