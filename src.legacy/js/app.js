/* global $ */
(function () {
  const { invoke } = window.__TAURI__.tauri;

  const DayTypeIcons = {
    FERIAS: 'fas fa-umbrella-beach',
    FERIADO: 'fas fa-flag',
    WORKDAY: 'fas fa-briefcase',
  };

  function iconToDayType(iconClass) {
    if (iconClass === DayTypeIcons.FERIAS) return 'FERIAS';
    if (iconClass === DayTypeIcons.FERIADO) return 'FERIADO';
    if (iconClass === DayTypeIcons.WORKDAY) return 'WORKDAY';
    return 'WORKDAY';
  }

  function getSelectedDateYmd() {
    const t = $('#dateDisplay').text().trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
    try {
      return $('#datepicker').datepicker('getFormattedDate') || t;
    } catch (e) {
      return t;
    }
  }

  async function refreshCurrentDate() {
    try {
      const d = await invoke('get_current_date');
      $('#dateDisplay').text(d);
      $('#datepicker').datepicker('setDate', d);
    } catch (e) {
      console.error(e);
    }
  }

  function showPage(id) {
    $('.app-page').removeClass('active');
    $('#page-' + id).addClass('active');
    $('.app-nav button').removeClass('active');
    $('.app-nav button[data-page="' + id + '"]').addClass('active');
    if (id === 'manage') {
      loadManageTasks();
      renderExportMonths();
    }
    if (id === 'logs') {
      loadHourLogs();
    }
    if (id === 'daily') {
      loadDailyTasks();
    }
  }

  async function loadSettingsForm() {
    try {
      const s = await invoke('get_settings');
      $('#settingsExportPath').val(s.exportPath || '');
      $('#settingsVault').val(s.defaultObsidianVault || '');
    } catch (e) {
      console.error(e);
    }
  }

  async function saveSettingsForm() {
    const exportPath = $('#settingsExportPath').val().trim();
    const defaultObsidianVault = $('#settingsVault').val().trim();
    if (!exportPath) {
      alert('Export folder path is required.');
      return;
    }
    try {
      await invoke('set_settings', {
        settings: {
          exportPath,
          defaultObsidianVault,
        },
      });
      alert('Settings saved.');
    } catch (e) {
      alert('Failed to save settings: ' + e);
    }
  }

  async function getProjects() {
    return await invoke('list_projects');
  }

  async function fillProjectSelect($sel, includePlaceholder) {
    const projects = await getProjects();
    $sel.empty();
    if (includePlaceholder) {
      $sel.append($('<option>').val('').text('Select project…'));
    }
    projects.forEach((p) => {
      $sel.append($('<option>').val(p.id).text(p.name));
    });
    return projects;
  }

  async function loadDailyTasks() {
    const pid = parseInt($('#dailyProjectSelect').val(), 10);
    const date = getSelectedDateYmd();
    const $list = $('#task-list');
    $list.empty();
    if (!pid) {
      $list.append(
        $('<p class="text-muted">').text('Select a project to see tasks for this day.')
      );
      return;
    }
    try {
      const tasks = await invoke('list_tasks_by_date', {
        projectId: pid,
        taskDate: date,
      });
      tasks.forEach((t) => renderDailyTaskRow($list, t));
    } catch (e) {
      console.error(e);
      $list.append($('<p class="text-danger">').text(String(e)));
    }
  }

  function renderDailyTaskRow($list, t) {
    const icon = DayTypeIcons[t.dayType] || DayTypeIcons.WORKDAY;
    const $row = $('<div class="task-item fade-in">').attr('data-task-id', t.id);
    const $left = $('<div class="task-left">');
    const $iconWrap = $('<span class="icon-item">').html(
      '<i class="' + icon + '"></i>'
    );
    const $time = $('<p class="task-time">').text(
      String(Math.round(t.timeHours)).padStart(2, '0') + 'H'
    );
    $left.append($iconWrap).append($time);
    const $desc = $('<p class="task-description">').text(t.description);
    const $rm = $('<span class="status-icon">').html('<i class="fa fa-times-circle"></i>');
    $rm.on('click', async () => {
      if (!confirm('Remove this task?')) return;
      try {
        await invoke('delete_task', { id: t.id });
        $row.remove();
      } catch (e) {
        alert(String(e));
      }
    });
    if (t.obsidianUri) {
      const $ob = $('<button type="button" class="btn btn-sm btn-link obsidian-btn">')
        .text('Obsidian')
        .on('click', () => openObsidian(t.obsidianUri));
      $row.append($left).append($desc).append($ob).append($rm);
    } else {
      $row.append($left).append($desc).append($rm);
    }
    $list.append($row);
  }

  async function openObsidian(uri) {
    try {
      await invoke('open_obsidian_uri', { uri });
    } catch (e) {
      alert('Could not open link: ' + e);
    }
  }

  async function addDailyTask() {
    const pid = parseInt($('#dailyProjectSelect').val(), 10);
    const text = $('#taskInput').val().trim();
    const timeTxt = $('#selectedTime').text();
    const iconClass = $('#iconContainer').attr('class') || DayTypeIcons.WORKDAY;
    const obs = $('#obsidianInput').val().trim() || null;

    if (!pid) {
      alert('Select a project.');
      return;
    }
    if (timeTxt === '00H' || !timeTxt) {
      alert('Please select a time (hours).');
      return;
    }
    if (!text) {
      alert('Please enter a task description.');
      return;
    }
    const hours = parseInt(timeTxt.replace('H', ''), 10);
    const dayType = iconToDayType(iconClass);
    const taskDate = getSelectedDateYmd();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(taskDate)) {
      alert('Invalid date. Use the calendar to pick YYYY-MM-DD.');
      return;
    }
    try {
      await invoke('create_task', {
        projectId: pid,
        taskDate,
        dayType,
        description: text,
        timeHours: hours,
        obsidianInput: obs,
      });
      $('#taskInput').val('');
      $('#obsidianInput').val('');
      await loadDailyTasks();
    } catch (e) {
      alert(String(e));
    }
  }

  let manageEditingId = null;

  async function loadManageTasks() {
    const pid = parseInt($('#manageProjectSelect').val(), 10);
    const $tb = $('#manageTasksBody');
    $tb.empty();
    manageEditingId = null;
    $('#manageEditPanel').hide();
    if (!pid) return;
    try {
      const tasks = await invoke('list_tasks_by_project', { projectId: pid });
      tasks.forEach((t) => {
        const $tr = $('<tr>')
          .append($('<td>').text(t.taskDate))
          .append($('<td>').text(t.dayType))
          .append($('<td>').text(t.description))
          .append($('<td>').text(t.timeHours))
          .append($('<td>').text(t.obsidianUri || '—'));
        const $act = $('<td>');
        const $ed = $('<button type="button" class="btn btn-sm btn-outline-primary mr-1">')
          .text('Edit')
          .on('click', () => startEditTask(t));
        const $del = $('<button type="button" class="btn btn-sm btn-outline-danger">')
          .text('Delete')
          .on('click', async () => {
            if (!confirm('Delete this task?')) return;
            try {
              await invoke('delete_task', { id: t.id });
              loadManageTasks();
            } catch (e) {
              alert(String(e));
            }
          });
        $act.append($ed).append($del);
        $tr.append($act);
        $tb.append($tr);
      });
    } catch (e) {
      console.error(e);
    }
  }

  function startEditTask(t) {
    manageEditingId = t.id;
    $('#manageEditPanel').show();
    $('#editTaskDate').val(t.taskDate);
    $('#editTaskDayType').val(t.dayType);
    $('#editTaskDesc').val(t.description);
    $('#editTaskHours').val(t.timeHours);
    $('#editTaskObsidian').val(t.obsidianUri || '');
  }

  async function saveEditedTask() {
    const pid = parseInt($('#manageProjectSelect').val(), 10);
    if (!manageEditingId || !pid) return;
    try {
      await invoke('update_task', {
        id: manageEditingId,
        projectId: pid,
        taskDate: $('#editTaskDate').val(),
        dayType: $('#editTaskDayType').val(),
        description: $('#editTaskDesc').val(),
        timeHours: parseFloat($('#editTaskHours').val()),
        obsidianInput: $('#editTaskObsidian').val().trim() || null,
      });
      manageEditingId = null;
      $('#manageEditPanel').hide();
      loadManageTasks();
      loadDailyTasks();
    } catch (e) {
      alert(String(e));
    }
  }

  async function createProject() {
    const name = $('#newProjectName').val().trim();
    if (!name) {
      alert('Enter a project name.');
      return;
    }
    try {
      await invoke('create_project', { name });
      $('#newProjectName').val('');
      await refreshAllProjectSelects();
    } catch (e) {
      alert(String(e));
    }
  }

  async function deleteManageProject() {
    const pid = parseInt($('#manageProjectSelect').val(), 10);
    if (!pid) return;
    if (!confirm('Delete this project and all its tasks?')) return;
    try {
      await invoke('delete_project', { id: pid });
      await refreshAllProjectSelects();
      loadManageTasks();
    } catch (e) {
      alert(String(e));
    }
  }

  async function refreshAllProjectSelects() {
    await fillProjectSelect($('#dailyProjectSelect'), true);
    await fillProjectSelect($('#manageProjectSelect'), true);
    await fillProjectSelect($('#exportProjectSelect'), true);
    const v = $('#dailyProjectSelect').val();
    if (v) $('#manageProjectSelect').val(v);
  }

  function renderExportMonths() {
    const $box = $('#exportMonthChecks');
    $box.empty();
    const now = new Date();
    for (let i = 0; i < 24; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const ym =
        d.getFullYear() +
        '-' +
        String(d.getMonth() + 1).padStart(2, '0');
      const id = 'm-' + ym;
      const $lab = $('<label class="custom-control custom-checkbox d-block">');
      const $cb = $('<input type="checkbox" class="custom-control-input">').attr({
        id,
        value: ym,
      });
      const text =
        d.toLocaleString('default', { month: 'long', year: 'numeric' }) +
        ' (' +
        ym +
        ')';
      $lab.append($cb).append(
        $('<span class="custom-control-label">').attr('for', id).text(text)
      );
      $box.append($lab);
    }
  }

  async function runExport() {
    const pid = parseInt($('#exportProjectSelect').val(), 10);
    if (!pid) {
      alert('Select a project to export.');
      return;
    }
    const months = $('#exportMonthChecks input:checked')
      .map(function () {
        return $(this).val();
      })
      .get();
    if (!months.length) {
      alert('Select at least one month.');
      return;
    }
    try {
      const path = await invoke('export_project_tasks_xlsx', {
        projectId: pid,
        months,
      });
      alert('Exported to:\n' + path);
    } catch (e) {
      alert(String(e));
    }
  }

  async function loadHourLogs() {
    const yearVal = $('#logsYearSelect').val();
    const year = yearVal === '' ? null : parseInt(yearVal, 10);
    const $tb = $('#logsTableBody');
    const $sum = $('#logsSummary');
    $tb.empty();
    $sum.empty();
    try {
      const rows = await invoke('get_monthly_hour_logs', { year });
      const byMonth = {};
      rows.forEach((r) => {
        const $tr = $('<tr>')
          .append($('<td>').text(r.yearMonth))
          .append($('<td>').text(r.projectName))
          .append($('<td>').text(r.totalHours.toFixed(2)));
        $tb.append($tr);
        byMonth[r.yearMonth] = (byMonth[r.yearMonth] || 0) + r.totalHours;
      });
      Object.keys(byMonth)
        .sort()
        .reverse()
        .forEach((m) => {
          $sum.append(
            $('<tr>')
              .append($('<td>').text(m))
              .append($('<td>').text('All projects'))
              .append($('<td>').text(byMonth[m].toFixed(2)))
          );
        });
    } catch (e) {
      console.error(e);
      $tb.append($('<tr>').append($('<td colspan="3">').text(String(e))));
    }
  }

  function buildDayTypeDropdown() {
    const $list = $('#dropdownOptions');
    $list.empty();
    Object.keys(DayTypeIcons).forEach((type) => {
      const iconClass = DayTypeIcons[type];
      const $a = $('<a class="dropdown-item" href="#">')
        .append($('<i>').addClass(iconClass))
        .append(document.createTextNode(' ' + type));
      $a.on('click', function (e) {
        e.preventDefault();
        $('#dropdownMenuButton').html(
          '<i id="iconContainer" class="' + iconClass + '"></i>'
        );
      });
      $list.append($a);
    });
  }

  function buildTimeDropdown() {
    const $opts = $('#timeOptions');
    $opts.empty();
    for (let i = 0; i < 12; i++) {
      const hour = String(i).padStart(2, '0') + 'H';
      const $a = $('<a class="dropdown-item" href="#">').text(hour);
      $a.on('click', function (e) {
        e.preventDefault();
        if (hour === '00H') {
          $('#selectedTime').hide().text('00H');
          $('#timeDropdown').removeClass('spanactive timedropdown');
        } else {
          $('#selectedTime').show().text(hour);
          $('#timeDropdown').addClass('spanactive timedropdown');
        }
      });
      $opts.append($a);
    }
  }

  $(document).ready(function () {
    buildDayTypeDropdown();
    buildTimeDropdown();

    $('#datepicker').datepicker({
      format: 'yyyy-mm-dd',
      todayBtn: true,
    });

    $('#datepicker-icon, #dateDisplay').on('click', function () {
      $('#dateDisplay').hide();
      $('#datepicker').show().datepicker('show');
    });

    $('#datepicker').on('changeDate', function () {
      const f = $('#datepicker').datepicker('getFormattedDate');
      $('#dateDisplay').text(f).show();
      $('#datepicker').hide();
      loadDailyTasks();
    });

    $(document).on('click', function (e) {
      if (
        !$(e.target).closest(
          '#datepicker, #datepicker-icon, #dateDisplay'
        ).length
      ) {
        if ($('#datepicker').is(':visible')) {
          $('#datepicker').hide();
          $('#dateDisplay').show();
        }
      }
    });

    $('.app-nav button[data-page]').on('click', function () {
      showPage($(this).data('page'));
    });

    $('#dailyProjectSelect').on('change', loadDailyTasks);
    $('#manageProjectSelect').on('change', loadManageTasks);
    $('#btnAddTask').on('click', addDailyTask);
    $('#btnCreateProject').on('click', createProject);
    $('#btnDeleteProject').on('click', deleteManageProject);
    $('#btnSaveSettings').on('click', saveSettingsForm);
    $('#btnExportXlsx').on('click', runExport);
    $('#btnRefreshLogs').on('click', loadHourLogs);
    $('#btnSaveEditTask').on('click', saveEditedTask);
    $('#btnCancelEditTask').on('click', function () {
      manageEditingId = null;
      $('#manageEditPanel').hide();
    });

    (async function boot() {
      await refreshCurrentDate();
      await loadSettingsForm();
      await refreshAllProjectSelects();
      const ysel = $('#logsYearSelect');
      const y = new Date().getFullYear();
      for (let i = 0; i < 6; i++) {
        ysel.append($('<option>').val(y - i).text(y - i));
      }
      showPage('daily');
    })();
  });
})();
