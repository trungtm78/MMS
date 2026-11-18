import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../core/constants/app_colors.dart';
import '../../core/constants/app_strings.dart';

/// tasks.status as the backend stores and returns it (Web/backend/src/tasks/task-sql.ts TASK_STATUSES).
/// GET /tasks and GET /tasks/:id return the task's own status, never task_assignments.status
/// ('accepted' and 'rejected' exist only there). Worded by taskStatusText (tasks_texts.dart).
class TaskStatus {
  TaskStatus._();

  /// Created with an assignee, not accepted yet
  static const pending = 'pending';

  /// Assigned, not started
  static const assigned = 'assigned';

  /// Accepted (POST /tasks/:id/accept)
  static const inProgress = 'in_progress';

  /// Reported (POST /tasks/:id/report)
  static const completed = 'completed';

  /// Cancelled by its author (DELETE /tasks/:id)
  static const cancelled = 'cancelled';

  /// Marked late
  static const overdue = 'overdue';

  static const values = [pending, assigned, inProgress, completed, cancelled, overdue];
}

/// Unfinished statuses: these can run past their deadline
const _open = {TaskStatus.pending, TaskStatus.assigned, TaskStatus.inProgress};

/// Tabs of the task list, in display order. Every known status belongs to exactly one tab. Worded by
/// taskTabText (tasks_texts.dart).
enum TaskTab {
  /// in_progress, not late
  inProgress,

  /// pending / assigned (not started), not late
  waiting,
  completed,

  /// status overdue, or an unfinished task that is late
  overdue,
  cancelled,
}

/// The backend status of a task row, or '' when it has none.
String taskStatusOf(Map<String, dynamic> task) {
  final status = task['status'];
  return status is String ? status.trim() : '';
}

/// tasks.deadline (timestamptz, serialised as an ISO string), or null.
DateTime? taskDeadlineOf(Map<String, dynamic> task) {
  final deadline = task['deadline'];
  return deadline is String ? DateTime.tryParse(deadline) : null;
}

/// Whether [task] is late. Status overdue always is, a completed or cancelled task never is. For an
/// unfinished task the server's `overdue` flag (TASK_OVERDUE_SQL, computed against the server clock)
/// decides; a row without a boolean flag falls back to the same rule on the deadline against [now].
bool isTaskOverdue(Map<String, dynamic> task, DateTime now) {
  final status = taskStatusOf(task);
  if (status == TaskStatus.overdue) return true;
  if (!_open.contains(status)) return false;
  final flag = task['overdue'];
  if (flag is bool) return flag;
  final deadline = taskDeadlineOf(task);
  return deadline != null && deadline.isBefore(now);
}

/// The tab [task] is listed under, or null for a status the backend does not use.
TaskTab? taskTabOf(Map<String, dynamic> task, DateTime now) {
  switch (taskStatusOf(task)) {
    case TaskStatus.completed:
      return TaskTab.completed;
    case TaskStatus.cancelled:
      return TaskTab.cancelled;
    case TaskStatus.overdue:
      return TaskTab.overdue;
    case TaskStatus.pending:
    case TaskStatus.assigned:
      return isTaskOverdue(task, now) ? TaskTab.overdue : TaskTab.waiting;
    case TaskStatus.inProgress:
      return isTaskOverdue(task, now) ? TaskTab.overdue : TaskTab.inProgress;
    default:
      return null;
  }
}

/// How many of [tasks] each tab lists (every tab present, zero included).
Map<TaskTab, int> countTaskTabs(Iterable<Map<String, dynamic>> tasks, DateTime now) {
  final counts = {for (final tab in TaskTab.values) tab: 0};
  for (final task in tasks) {
    final tab = taskTabOf(task, now);
    if (tab != null) counts[tab] = counts[tab]! + 1;
  }
  return counts;
}

/// The rows of [tasks] listed under [tab], in their original order.
List<Map<String, dynamic>> tasksInTab(
  Iterable<Map<String, dynamic>> tasks,
  TaskTab tab,
  DateTime now,
) =>
    tasks.where((task) => taskTabOf(task, now) == tab).toList();

/// Badge colour of a backend status.
Color taskStatusColor(String status) => switch (status) {
      TaskStatus.pending || TaskStatus.assigned => AppColors.warning,
      TaskStatus.inProgress => AppColors.blue,
      TaskStatus.completed => AppColors.success,
      TaskStatus.cancelled => AppColors.textMuted,
      TaskStatus.overdue => AppColors.error,
      _ => AppColors.textSecondary,
    };

/// POST /tasks/:id/accept moves a task that is not under way yet to in_progress
/// (tasks.service.ts ACCEPTABLE_STATUSES); any other status is refused with 409 task_not_acceptable.
bool canAcceptTask(Map<String, dynamic> task) =>
    const {TaskStatus.pending, TaskStatus.assigned, TaskStatus.overdue}.contains(taskStatusOf(task));

/// A completion report (POST /tasks/:id/report) is offered once the task is assigned, under way or late;
/// a completed or cancelled task is closed (409 task_closed).
bool canReportTask(Map<String, dynamic> task) =>
    const {TaskStatus.assigned, TaskStatus.inProgress, TaskStatus.overdue}.contains(taskStatusOf(task));

/// The deadline in local time ('dd/MM/yyyy HH:mm'), or '' without one.
String formatTaskDeadline(Map<String, dynamic> task) {
  final deadline = taskDeadlineOf(task);
  return deadline == null ? '' : DateFormat(AppStrings.datetimeFormat).format(deadline.toLocal());
}
