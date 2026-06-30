import { Injectable, NgZone, inject } from '@angular/core';
import { invoke as ipcInvoke } from '@tauri-apps/api/tauri';

export interface ProjectRow {
  id: number;
  name: string;
  createdAt: string;
}

export interface TaskRow {
  id: number;
  projectId: number;
  taskDate: string;
  dayType: string;
  description: string;
  timeHours: number;
  obsidianUri: string | null;
}

export interface TaskHistoryRow {
  id: number;
  taskId: number;
  changedAt: string;
  delta: number;
}

export interface HourLogRow {
  id: number;
  taskId: number;
  projectId: number;
  loggedDate: string;
  hours: number;
}

export interface MonthlyHourRow {
  yearMonth: string;
  projectId: number;
  projectName: string;
  totalHours: number;
}

export interface AppSettings {
  exportPath: string;
  defaultObsidianVault: string;
  obsidianVaultPath: string;
  obsidianProjectsFolder: string;
  obsidianAutoCreate: boolean;
  /** When true, the app shows a popup on each cron tick (local time). */
  reminderEnabled: boolean;
  /**
   * Six-field cron: second minute hour day-of-month month day-of-week.
   * Example: `0 0 9,17 * * 1-5` → 09:00 and 17:00 on weekdays.
   */
  reminderCron: string;
  // Backup
  backupEnabled: boolean;
  /** "daily" | "weekly" | "monthly" | "annual" */
  backupFrequency: string;
  backupPath: string;
}

type TauriWindow = Window & {
  __TAURI_IPC__?: unknown;
  __TAURI__?: {
    tauri?: {
      invoke?: <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;
    };
  };
};

/** True when running inside the Tauri desktop webview (not a normal browser tab). */
export function isTauriRuntime(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window as TauriWindow;
  if (typeof w.__TAURI_IPC__ === 'function') return true;
  return typeof w.__TAURI__?.tauri?.invoke === 'function';
}

@Injectable({ providedIn: 'root' })
export class TauriService {
  private readonly zone = inject(NgZone);

  /**
   * Prefer low-level IPC used by @tauri-apps/api; fall back to `window.__TAURI__.tauri.invoke`
   * when `withGlobalTauri` exposes the global API (some builds only surface that reliably).
   *
   * Tauri resolves promises outside Angular's zone; re-enter the zone so the UI updates
   * without waiting for the next keyboard/mouse event (e.g. Escape).
   */
  private invokeCmd<T>(
    cmd: string,
    args: Record<string, unknown> = {},
  ): Promise<T> {
    const w = window as TauriWindow;
    let raw: Promise<T>;
    if (typeof w.__TAURI_IPC__ === 'function') {
      raw = ipcInvoke<T>(cmd, args);
    } else {
      const globalInvoke = w.__TAURI__?.tauri?.invoke;
      if (typeof globalInvoke === 'function') {
        raw = globalInvoke<T>(cmd, args);
      } else {
        raw = Promise.reject(
          new Error(
            'Tauri is not available here. Do not open http://localhost:4200 in Chrome, Edge, or Cursor’s Simple Browser. ' +
              'From the repo root run: npm run dev — then use only the Daily Report desktop window.',
          ),
        );
      }
    }

    return new Promise<T>((resolve, reject) => {
      void raw
        .then((v) => this.zone.run(() => resolve(v)))
        .catch((e) => this.zone.run(() => reject(e)));
    });
  }

  getCurrentDate(): Promise<string> {
    return this.invokeCmd<string>('get_current_date');
  }

  getSettings(): Promise<AppSettings> {
    return this.invokeCmd<AppSettings>('get_settings');
  }

  setSettings(settings: AppSettings): Promise<void> {
    return this.invokeCmd('set_settings', { settings });
  }

  listProjects(): Promise<ProjectRow[]> {
    return this.invokeCmd<ProjectRow[]>('list_projects');
  }

  createProject(name: string): Promise<number> {
    return this.invokeCmd<number>('create_project', { name });
  }

  renameProject(id: number, name: string): Promise<void> {
    return this.invokeCmd('rename_project', { id, name });
  }

  deleteProject(id: number): Promise<void> {
    return this.invokeCmd('delete_project', { id });
  }

  listAllTasks(): Promise<TaskRow[]> {
    return this.invokeCmd<TaskRow[]>('list_all_tasks');
  }

  addTaskHours(taskId: number, delta: number): Promise<void> {
    return this.invokeCmd('add_task_hours', { taskId, delta });
  }

  listTaskHistory(taskId: number): Promise<TaskHistoryRow[]> {
    return this.invokeCmd<TaskHistoryRow[]>('list_task_history', { taskId });
  }

  listTasksByProject(projectId: number): Promise<TaskRow[]> {
    return this.invokeCmd<TaskRow[]>('list_tasks_by_project', { projectId });
  }

  createTask(params: {
    projectId: number;
    taskDate: string;
    dayType: string;
    description: string;
    timeHours: number;
    obsidianInput: string | null;
    createNote?: boolean;
  }): Promise<number> {
    return this.invokeCmd<number>('create_task', params as unknown as Record<string, unknown>);
  }

  findObsidianNote(projectId: number, taskName: string): Promise<string | null> {
    return this.invokeCmd<string | null>('find_obsidian_note', { projectId, taskName });
  }

  updateTask(params: {
    id: number;
    projectId: number;
    taskDate: string;
    dayType: string;
    description: string;
    timeHours: number;
    obsidianInput: string | null;
  }): Promise<void> {
    return this.invokeCmd('update_task', params as unknown as Record<string, unknown>);
  }

  deleteTask(id: number): Promise<void> {
    return this.invokeCmd('delete_task', { id });
  }

  pickMarkdownFile(): Promise<string | null> {
    return this.invokeCmd<string | null>('pick_markdown_file');
  }

  pickFolder(): Promise<string | null> {
    return this.invokeCmd<string | null>('pick_folder');
  }

  openObsidianUri(uri: string): Promise<void> {
    return this.invokeCmd('open_obsidian_uri', { uri });
  }

  exportTasksXlsx(months: string[]): Promise<string> {
    return this.invokeCmd<string>('export_tasks_xlsx', { months });
  }

  getMonthlyHourLogs(year: number | null): Promise<MonthlyHourRow[]> {
    return this.invokeCmd<MonthlyHourRow[]>('get_monthly_hour_logs', { year });
  }

  addHourLog(taskId: number, projectId: number, loggedDate: string, hours: number): Promise<void> {
    return this.invokeCmd('add_hour_log', { taskId, projectId, loggedDate, hours });
  }

  listHourLogsForTask(taskId: number): Promise<HourLogRow[]> {
    return this.invokeCmd<HourLogRow[]>('list_hour_logs_for_task', { taskId });
  }

  deleteHourLog(id: number): Promise<void> {
    return this.invokeCmd('delete_hour_log', { id });
  }

  createBackup(): Promise<string> {
    return this.invokeCmd<string>('create_backup');
  }
}
