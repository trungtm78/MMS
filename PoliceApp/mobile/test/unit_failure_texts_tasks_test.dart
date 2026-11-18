// Unit Tests: failure codes of tasks, training, DQTV, profile, SOS (lib/l10n/failure_texts.dart, that section)
// Backend codes: tasks/tasks.service.ts, training/training.service.ts, militia/militia.service.ts,
// kpi/kpi.service.ts, users/users.service.ts, sos/sos.service.ts, sos/sos-alerts.service.ts
// Run: flutter test test/unit_failure_texts_tasks_test.dart

import 'package:flutter_test/flutter_test.dart';
import 'package:police_app/l10n/failure_texts.dart';
import 'package:police_app/shared/errors/app_failure.dart';

import 'helpers/l10n.dart';

void main() {
  test('UT-FT-TASK-01: the local task checks have texts', () {
    String text(String code, [Map<String, Object> args = const {}]) =>
        failureText(viL10n, AppFailure(code, args: args));

    expect(text(AppFailure.taskPriorityInvalid), viL10n.tasksErrorPriorityInvalid);
    expect(text(AppFailure.taskLocationNameTooLong, {'max': 500}), viL10n.tasksErrorLocationNameTooLong(500));
    expect(text(AppFailure.taskCoordinatesIncomplete), viL10n.tasksErrorCoordinatesIncomplete);
    expect(text(AppFailure.taskLatitudeOutOfRange), viL10n.tasksErrorLatitudeOutOfRange);
    expect(text(AppFailure.taskLongitudeOutOfRange), viL10n.tasksErrorLongitudeOutOfRange);
    expect(text(AppFailure.taskReportDescriptionRequired), viL10n.tasksErrorReportDescriptionRequired);
    expect(text(AppFailure.taskReportDescriptionTooLong, {'max': 1000}),
        viL10n.tasksErrorReportDescriptionTooLong(1000));
  });

  test('UT-FT-TASK-02: backend codes of tasks, training, militia, KPI, users and SOS have texts', () {
    final texts = {
      'task_not_found': viL10n.tasksErrorTaskNotFound,
      // Scoped task routes answer 409 on a state conflict
      'task_not_acceptable': viL10n.tasksErrorTaskNotAcceptable,
      'task_closed': viL10n.tasksErrorTaskClosed,
      'task_cannot_be_edited_in_current_status': viL10n.tasksErrorTaskCannotBeEdited,
      'task_cannot_be_cancelled': viL10n.tasksErrorTaskCannotBeCancelled,
      'invalid_status': viL10n.commonErrorInvalidStatus,
      'militia_no_user_account': viL10n.tasksErrorMilitiaNoUserAccount,
      'dqtv_not_assigned_to_ca': viL10n.tasksErrorDqtvNotAssignedToCa,
      'insufficient_role_to_create_training': viL10n.trainingErrorInsufficientRoleToCreate,
      'militia_not_found': viL10n.dqtvErrorMilitiaNotFound,
      'kpi_not_visible': viL10n.dqtvErrorKpiNotVisible,
      'user_not_found': viL10n.profileErrorUserNotFound,
      'incident_not_found': viL10n.alertsErrorIncidentNotFound,
      'invalid_status_transition': viL10n.alertsErrorInvalidStatusTransition,
      'assignee_not_found': viL10n.alertsErrorAssigneeNotFound,
    };
    for (final entry in texts.entries) {
      expect(codeText(viL10n, entry.key), entry.value, reason: entry.key);
    }
  });

  test('UT-FT-TASK-03: a non-assignee is told the task is not found, not_task_assignee is gone', () {
    // Scoped task routes answer 404 task_not_found instead of 403 not_task_assignee
    expect(codeText(viL10n, 'not_task_assignee'), isNull);
  });
}
