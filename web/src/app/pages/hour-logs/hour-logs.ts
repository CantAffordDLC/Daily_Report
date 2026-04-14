import { ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TauriService, MonthlyHourRow } from '../../core/tauri.service';

@Component({
  selector: 'app-hour-logs',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './hour-logs.html',
  styleUrl: './hour-logs.css',
})
export class HourLogsPage implements OnInit {
  private readonly tauri = inject(TauriService);
  private readonly cdr = inject(ChangeDetectorRef);

  logsYear: number | '' = '';
  yearChoices: number[] = [];
  logRows: MonthlyHourRow[] = [];
  monthTotals: { month: string; hours: number }[] = [];
  logsLoading = false;

  ngOnInit(): void {
    const y = new Date().getFullYear();
    for (let i = 0; i < 6; i++) this.yearChoices.push(y - i);
    void this.refreshLogs();
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
      this.cdr.detectChanges();
    }
  }
}
