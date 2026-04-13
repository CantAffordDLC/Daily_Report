import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  TauriService,
  ProjectRow,
  MonthlyHourRow,
} from '../../core/tauri.service';

@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './reports.html',
  styleUrl: './reports.css',
})
export class ReportsPage implements OnInit {
  private readonly tauri = inject(TauriService);

  projects: ProjectRow[] = [];
  exportProjectId: number | null = null;
  monthOptions: { value: string; label: string }[] = [];
  selectedMonths = new Set<string>();

  logsYear: number | '' = '';
  yearChoices: number[] = [];
  logRows: MonthlyHourRow[] = [];
  monthTotals: { month: string; hours: number }[] = [];
  logsLoading = false;

  exportMessage: string | null = null;

  ngOnInit(): void {
    const now = new Date();
    for (let i = 0; i < 24; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleString('default', { month: 'long', year: 'numeric' });
      this.monthOptions.push({ value: ym, label: `${label} (${ym})` });
    }
    const y = now.getFullYear();
    for (let i = 0; i < 6; i++) this.yearChoices.push(y - i);
    void this.loadProjects();
    void this.refreshLogs();
  }

  async loadProjects(): Promise<void> {
    try {
      this.projects = await this.tauri.listProjects();
      if (this.projects.length && this.exportProjectId == null) {
        this.exportProjectId = this.projects[0].id;
      }
    } catch (e) {
      console.error(e);
    }
  }

  toggleMonth(ym: string): void {
    if (this.selectedMonths.has(ym)) this.selectedMonths.delete(ym);
    else this.selectedMonths.add(ym);
  }

  isMonthSelected(ym: string): boolean {
    return this.selectedMonths.has(ym);
  }

  async runExport(): Promise<void> {
    this.exportMessage = null;
    if (this.exportProjectId == null) {
      alert('Select a project.');
      return;
    }
    const months = [...this.selectedMonths].sort();
    if (!months.length) {
      alert('Select at least one month.');
      return;
    }
    try {
      const path = await this.tauri.exportProjectTasksXlsx(this.exportProjectId, months);
      this.exportMessage = `Exported to:\n${path}`;
    } catch (e) {
      alert(String(e));
    }
  }

  async refreshLogs(): Promise<void> {
    this.logsLoading = true;
    try {
      const year =
        this.logsYear === '' || this.logsYear === null
          ? null
          : Number(this.logsYear);
      this.logRows = await this.tauri.getMonthlyHourLogs(year);
      const byMonth: Record<string, number> = {};
      for (const r of this.logRows) {
        byMonth[r.yearMonth] = (byMonth[r.yearMonth] || 0) + r.totalHours;
      }
      this.monthTotals = Object.keys(byMonth)
        .sort()
        .reverse()
        .map((month) => ({ month, hours: byMonth[month] }));
    } catch (e) {
      console.error(e);
      this.logRows = [];
      this.monthTotals = [];
    } finally {
      this.logsLoading = false;
    }
  }
}
