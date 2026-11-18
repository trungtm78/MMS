import '../../l10n/app_localizations.dart';

/// Text of a task priority code (tasks.controller.ts CreateTaskDto); an unknown code is shown as it is
String taskPriorityText(AppLocalizations l10n, String code) => switch (code) {
      'low' => l10n.tasksPriorityLow,
      'medium' => l10n.tasksPriorityMedium,
      'high' => l10n.tasksPriorityHigh,
      'urgent' => l10n.tasksPriorityUrgent,
      _ => code,
    };

/// Text of a task status code (task-sql.ts TASK_STATUSES); an unknown code is shown as it is
String taskStatusText(AppLocalizations l10n, String code) => switch (code) {
      'pending' => l10n.tasksStatusPending,
      'assigned' => l10n.tasksStatusAssigned,
      'in_progress' => l10n.tasksStatusInProgress,
      'completed' => l10n.tasksStatusCompleted,
      'overdue' => l10n.tasksStatusOverdue,
      'cancelled' => l10n.tasksStatusCancelled,
      _ => code,
    };
