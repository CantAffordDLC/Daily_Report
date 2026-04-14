import { ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TauriService, ProjectRow } from '../../core/tauri.service';

@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './reports.html',
  styleUrl: './reports.css',
})
export class ReportsPage implements OnInit {
  private readonly tauri = inject(TauriService);
  private readonly cdr = inject(ChangeDetectorRef);

  projects: ProjectRow[] = [];
  exportProjectId: number | null = null;
  monthOptions: { value: string; label: string }[] = [];
  selectedMonths = new Set<string>();

  exportMessage: string | null = null;

  ngOnInit(): void {
    const now = new Date();
    for (let i = 0; i < 24; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleString('default', { month: 'long', year: 'numeric' });
      this.monthOptions.push({ value: ym, label: `${label} (${ym})` });
    }
    void this.loadProjects();
  }

  async loadProjects(): Promise<void> {
    try {
      this.projects = await this.tauri.listProjects();
      if (this.projects.length && this.exportProjectId == null) {
        this.exportProjectId = this.projects[0].id;
      }
    } catch (e) {
      console.error(e);
    } finally {
      this.cdr.detectChanges();
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
    } finally {
      this.cdr.detectChanges();
    }
  }
}
