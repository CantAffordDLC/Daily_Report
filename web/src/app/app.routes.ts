import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', redirectTo: 'projects', pathMatch: 'full' },
  {
    path: 'projects',
    loadComponent: () =>
      import('./pages/projects/projects').then((m) => m.ProjectsPage),
  },
  {
    path: 'hours',
    loadComponent: () =>
      import('./pages/hours/hours').then((m) => m.HoursPage),
  },
  {
    path: 'hour-logs',
    loadComponent: () =>
      import('./pages/hour-logs/hour-logs').then((m) => m.HourLogsPage),
  },
  {
    path: 'reports',
    loadComponent: () =>
      import('./pages/reports/reports').then((m) => m.ReportsPage),
  },
  {
    path: 'settings',
    loadComponent: () =>
      import('./pages/settings/settings').then((m) => m.SettingsPage),
  },
];
