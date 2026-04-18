import { ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TauriService } from '../../core/tauri.service';

@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './reports.html',
  styleUrl: './reports.css',
})
export class ReportsPage implements OnInit {
  private readonly tauri = inject(TauriService);
  private readonly cdr = inject(ChangeDetectorRef);

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
    const months = [...this.selectedMonths].sort();
    if (!months.length) {
      alert('Select at least one month.');
      return;
    }
    try {
      const path = await this.tauri.exportTasksXlsx(months);
      this.exportMessage = `Exported to:\n${path}`;
    } catch (e) {
      alert(String(e));
    } finally {
      this.cdr.detectChanges();
    }
  }
}
