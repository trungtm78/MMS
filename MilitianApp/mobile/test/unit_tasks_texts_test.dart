// Unit Tests: task wording (lib/features/tasks/tasks_texts.dart)
//   Context-free task code carries backend codes and TasksIssue values; the UI words them here through the ARB
//   and the one backend error table. Values: tasks.status (task-sql.ts TASK_STATUSES), CreateTaskDto priority
//   urgent|high|medium|low and type patrol|guard|inspection|support|training|admin|other (tasks.controller.ts).
// Run: flutter test test/unit_tasks_texts_test.dart

import 'package:flutter_test/flutter_test.dart';
import 'package:militian_app/features/files/files.dart';
import 'package:militian_app/features/tasks/task_report_request.dart';
import 'package:militian_app/features/tasks/task_status.dart';
import 'package:militian_app/features/tasks/tasks_exception.dart';
import 'package:militian_app/features/tasks/tasks_texts.dart';
import 'package:militian_app/shared/utils/api_failure.dart';

import 'helpers/l10n.dart';

final _l = viL10n;

void main() {
  test('UT-TTXT-01: every tab has its text, in display order', () {
    expect(TaskTab.values.map((t) => taskTabText(_l, t)), [
      _l.taskTabInProgress,
      _l.taskTabWaiting,
      _l.taskTabCompleted,
      _l.taskTabOverdue,
      _l.taskTabCancelled,
    ]);
  });

  test('UT-TTXT-02: every backend status is worded; an unknown code shows as it is', () {
    expect({for (final s in TaskStatus.values) s: taskStatusText(_l, s)}, {
      'pending': _l.taskStatusPending,
      'assigned': _l.taskStatusAssigned,
      'in_progress': _l.taskStatusInProgress,
      'completed': _l.taskStatusCompleted,
      'cancelled': _l.taskStatusCancelled,
      'overdue': _l.taskStatusOverdue,
    });
    expect(taskStatusText(_l, 'something_new'), 'something_new');
    expect(taskStatusText(_l, ''), _l.taskStatusUnknown);
  });

  test('UT-TTXT-03: priorities and types are worded; unknown codes show as they are', () {
    expect(
      [for (final p in ['urgent', 'high', 'medium', 'low']) taskPriorityText(_l, p)],
      [_l.taskPriorityUrgent, _l.taskPriorityHigh, _l.taskPriorityMedium, _l.taskPriorityLow],
    );
    expect(taskPriorityText(_l, 'critical'), 'critical');
    expect(
      [for (final t in ['patrol', 'guard', 'inspection', 'support', 'training', 'admin', 'other']) taskTypeText(_l, t)],
      [
        _l.taskTypePatrol,
        _l.taskTypeGuard,
        _l.taskTypeInspection,
        _l.taskTypeSupport,
        _l.taskTypeTraining,
        _l.taskTypeAdmin,
        _l.taskTypeOther,
      ],
    );
    expect(taskTypeText(_l, 'diving'), 'diving');
  });

  test('UT-TTXT-04: every local issue has its text', () {
    expect({for (final i in TasksIssue.values) i: tasksIssueText(_l, i)}, {
      TasksIssue.malformedResponse: _l.taskIssueMalformedResponse,
      TasksIssue.reportDescriptionRequired: _l.taskIssueReportDescriptionRequired,
      TasksIssue.reportDescriptionTooLong: _l.taskIssueReportDescriptionTooLong(maxTaskReportDescriptionLength),
      TasksIssue.reportLocationTooLong: _l.taskIssueReportLocationTooLong(maxTaskReportLocationLength),
      TasksIssue.reportTooManyPhotos: _l.taskIssueReportTooManyPhotos(maxTaskReportPhotos),
      TasksIssue.reportDuplicatePhotos: _l.taskIssueReportDuplicatePhotos,
    });
  });

  test('UT-TTXT-05: tasksErrorText words issues, backend codes and file errors', () {
    expect(tasksErrorText(_l, const TasksException(TasksIssue.reportDuplicatePhotos)),
        _l.taskIssueReportDuplicatePhotos);
    for (final (code, status, text) in [
      ('task_not_found', 404, _l.errorTaskNotFound),
      ('task_not_acceptable', 409, _l.errorTaskNotAcceptable),
      ('task_closed', 409, _l.errorTaskClosed),
      ('invalid_status', 400, _l.errorTaskInvalidStatus),
      ('task_cannot_be_edited_in_current_status', 409, _l.errorTaskCannotBeEdited),
      ('task_cannot_be_cancelled', 409, _l.errorTaskCannotBeCancelled),
      ('file_purpose_mismatch', 400, _l.errorFilePurposeMismatch),
    ]) {
      expect(tasksErrorText(_l, TasksException.api(ApiFailure(code: code, status: status))), text, reason: code);
    }
    expect(tasksErrorText(_l, const FilesException(FilesIssue.unreadable)), _l.filesIssueUnreadable);
    expect(tasksErrorText(_l, StateError('boom')), _l.errorUnexpected);
  });
}
