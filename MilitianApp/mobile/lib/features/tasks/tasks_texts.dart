// Task wording. Context-free task code carries backend codes (tasks.status, CreateTaskDto priority and
// type in Web/backend/src/tasks/tasks.controller.ts) and TasksIssue values; the UI words them here
// through the ARB. Backend refusals go through the one error table (lib/l10n/error_texts.dart), file
// errors through filesErrorText.

import '../../l10n/app_localizations.dart';
import '../../l10n/error_texts.dart';
import '../../shared/utils/api_failure.dart';
import '../files/files_repository.dart';
import '../files/files_texts.dart';
import 'task_report_request.dart';
import 'task_status.dart';
import 'tasks_exception.dart';

String taskTabText(AppLocalizations l10n, TaskTab tab) => switch (tab) {
      TaskTab.inProgress => l10n.taskTabInProgress,
      TaskTab.waiting => l10n.taskTabWaiting,
      TaskTab.completed => l10n.taskTabCompleted,
      TaskTab.overdue => l10n.taskTabOverdue,
      TaskTab.cancelled => l10n.taskTabCancelled,
    };

/// A tasks.status code; an unknown code is shown as it is, a missing one as unknown.
String taskStatusText(AppLocalizations l10n, String status) => switch (status) {
      TaskStatus.pending => l10n.taskStatusPending,
      TaskStatus.assigned => l10n.taskStatusAssigned,
      TaskStatus.inProgress => l10n.taskStatusInProgress,
      TaskStatus.completed => l10n.taskStatusCompleted,
      TaskStatus.cancelled => l10n.taskStatusCancelled,
      TaskStatus.overdue => l10n.taskStatusOverdue,
      '' => l10n.taskStatusUnknown,
      _ => status,
    };

/// A tasks.priority code (urgent | high | medium | low); an unknown code is shown as it is.
String taskPriorityText(AppLocalizations l10n, String priority) => switch (priority) {
      'urgent' => l10n.taskPriorityUrgent,
      'high' => l10n.taskPriorityHigh,
      'medium' => l10n.taskPriorityMedium,
      'low' => l10n.taskPriorityLow,
      _ => priority,
    };

/// A tasks.type code (patrol | guard | inspection | support | training | admin | other); an unknown
/// code is shown as it is.
String taskTypeText(AppLocalizations l10n, String type) => switch (type) {
      'patrol' => l10n.taskTypePatrol,
      'guard' => l10n.taskTypeGuard,
      'inspection' => l10n.taskTypeInspection,
      'support' => l10n.taskTypeSupport,
      'training' => l10n.taskTypeTraining,
      'admin' => l10n.taskTypeAdmin,
      'other' => l10n.taskTypeOther,
      _ => type,
    };

String tasksIssueText(AppLocalizations l10n, TasksIssue issue) => switch (issue) {
      TasksIssue.malformedResponse => l10n.taskIssueMalformedResponse,
      TasksIssue.reportDescriptionRequired => l10n.taskIssueReportDescriptionRequired,
      TasksIssue.reportDescriptionTooLong => l10n.taskIssueReportDescriptionTooLong(maxTaskReportDescriptionLength),
      TasksIssue.reportLocationTooLong => l10n.taskIssueReportLocationTooLong(maxTaskReportLocationLength),
      TasksIssue.reportTooManyPhotos => l10n.taskIssueReportTooManyPhotos(maxTaskReportPhotos),
      TasksIssue.reportDuplicatePhotos => l10n.taskIssueReportDuplicatePhotos,
    };

/// Text for any error of a task call: a local [TasksIssue], a file error (a report photo), else the
/// error table. invalid_status is also sent by other modules, so its task reading lives here.
String tasksErrorText(AppLocalizations l10n, Object error) {
  if (error case TasksException(issue: final TasksIssue issue)) return tasksIssueText(l10n, issue);
  if (error is FilesException) return filesErrorText(l10n, error);
  final failure = ApiFailure.from(error);
  if (failure.kind == FailureKind.response && failure.code == 'invalid_status') return l10n.errorTaskInvalidStatus;
  return failure.text(l10n);
}
