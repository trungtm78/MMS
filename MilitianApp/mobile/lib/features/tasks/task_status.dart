import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../core/constants/app_colors.dart';
import '../../core/constants/app_strings.dart';

/// tasks.status as the backend stores and returns it (Web/backend/migrations/003_tasks.sql:25,
/// src/tasks/task.entity.ts:19-25). GET /tasks and GET /tasks/:id return the task's own status, never
/// task_assignments.status ('accepted' and 'rejected' exist only there).
class TaskStatus {
  TaskStatus._();

  /// Created with an assignee, not accepted yet (tasks.service.ts:101)
  static const pending = 'pending';

  /// Allowed by the CHECK constraint but written by no service code; not started
  static const assigned = 'assigned';

  /// POST /tasks/:id/accept (from pending only) or PATCH /tasks/:id/progress
  /// (tasks.service.ts:184-188, 226-230)
  static const inProgress = 'in_progress';

  /// POST /tasks/:id/report or PATCH /tasks/:id/progress (tasks.service.ts:284-287)
  static const completed = 'completed';

  /// DELETE /tasks/:id (tasks.service.ts:368-371)
  static const cancelled = 'cancelled';

  /// Allowed by the CHECK constraint but written by no service code, so lateness is also
  /// derived from the deadline
  static const overdue = 'overdue';

  static const values = [pending, assigned, inProgress, completed, cancelled, overdue];
}

/// Unfinished statuses: these can run past their deadline
const _open = {TaskStatus.pending, TaskStatus.assigned, TaskStatus.inProgress};

/// Tabs of the task list, in display order. Every known status belongs to exactly one tab.
enum TaskTab {
  /// in_progress, deadline not passed
  inProgress(AppStrings.filterInProgress),

  /// pending / assigned (not started), deadline not passed
  waiting(AppStrings.filterPending),
  completed(AppStrings.filterCompleted),

  /// status overdue, or past the deadline and neither completed nor cancelled
  overdue(AppStrings.filterOverdue),
  cancelled(AppStrings.statusCancelled);

  const TaskTab(this.label);

  final String label;
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

/// Status overdue, or an unfinished task whose deadline is before [now].
bool isTaskOverdue(Map<String, dynamic> task, DateTime now) {
  final status = taskStatusOf(task);
  if (status == TaskStatus.overdue) return true;
  if (!_open.contains(status)) return false;
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

/// Vietnamese label of a backend status; an unknown code is shown as is.
String taskStatusLabel(String status) => switch (status) {
      TaskStatus.pending => 'Chờ tiếp nhận',
      TaskStatus.assigned => 'Đã giao',
      TaskStatus.inProgress => AppStrings.statusInProgress,
      TaskStatus.completed => AppStrings.statusCompleted,
      TaskStatus.cancelled => AppStrings.statusCancelled,
      TaskStatus.overdue => AppStrings.statusOverdue,
      '' => 'Không rõ',
      _ => status,
    };

/// Badge colour of a backend status.
Color taskStatusColor(String status) => switch (status) {
      TaskStatus.pending || TaskStatus.assigned => AppColors.warning,
      TaskStatus.inProgress => AppColors.blue,
      TaskStatus.completed => AppColors.success,
      TaskStatus.cancelled => AppColors.textMuted,
      TaskStatus.overdue => AppColors.error,
      _ => AppColors.textSecondary,
    };

/// POST /tasks/:id/accept only moves a pending task (tasks.service.ts:184-188); on any other
/// status it answers 200 and changes nothing.
bool canAcceptTask(Map<String, dynamic> task) => taskStatusOf(task) == TaskStatus.pending;

/// A completion report (POST /tasks/:id/report) is offered once the task is assigned, under way or late.
bool canReportTask(Map<String, dynamic> task) =>
    const {TaskStatus.assigned, TaskStatus.inProgress, TaskStatus.overdue}.contains(taskStatusOf(task));

/// Statuses the assignee can set with PATCH /tasks/:id/progress (UpdateProgressDto.status,
/// tasks.controller.ts:104-106).
List<String> taskStatusTargets(Map<String, dynamic> task) => switch (taskStatusOf(task)) {
      TaskStatus.pending ||
      TaskStatus.assigned ||
      TaskStatus.overdue =>
        const <String>[TaskStatus.inProgress, TaskStatus.completed],
      TaskStatus.inProgress => const <String>[TaskStatus.completed],
      _ => const <String>[],
    };

/// The deadline in local time ('dd/MM/yyyy HH:mm'), or '' without one.
String formatTaskDeadline(Map<String, dynamic> task) {
  final deadline = taskDeadlineOf(task);
  return deadline == null ? '' : DateFormat(AppStrings.datetimeFormat).format(deadline.toLocal());
}
