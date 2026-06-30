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
  logsMonth = '';
  yearChoices: number[] = [];
  readonly monthChoices = [
    { value: '01', label: 'Janeiro' },
    { value: '02', label: 'Fevereiro' },
    { value: '03', label: 'Março' },
    { value: '04', label: 'Abril' },
    { value: '05', label: 'Maio' },
    { value: '06', label: 'Junho' },
    { value: '07', label: 'Julho' },
    { value: '08', label: 'Agosto' },
    { value: '09', label: 'Setembro' },
    { value: '10', label: 'Outubro' },
    { value: '11', label: 'Novembro' },
    { value: '12', label: 'Dezembro' },
  ];

  logRows: MonthlyHourRow[] = [];
  monthTotals: { month: string; hours: number }[] = [];
  logsLoading = false;

  ngOnInit(): void {
    const y = new Date().getFullYear();
    for (let i = 0; i < 6; i++) this.yearChoices.push(y - i);
    void this.refreshLogs();
  }

  filteredLogRows: MonthlyHourRow[] = [];
  filteredMonthTotals: { month: string; hours: number }[] = [];
  groupedLogRows: { month: string; rows: MonthlyHourRow[] }[] = [];

  applyFilters(): void {
    this.filteredLogRows = this.logsMonth
      ? this.logRows.filter((r) => r.yearMonth.endsWith('-' + this.logsMonth))
      : this.logRows;

    this.filteredMonthTotals = this.logsMonth
      ? this.monthTotals.filter((t) => t.month.endsWith('-' + this.logsMonth))
      : this.monthTotals;

    const map = new Map<string, MonthlyHourRow[]>();
    for (const r of this.filteredLogRows) {
      const arr = map.get(r.yearMonth) ?? [];
      arr.push(r);
      map.set(r.yearMonth, arr);
    }
    this.groupedLogRows = Array.from(map.entries()).map(([month, rows]) => ({ month, rows }));
    this.cdr.detectChanges();
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
      this.applyFilters();
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
