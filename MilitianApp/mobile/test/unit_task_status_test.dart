// Unit Tests: task status → tab, colour and actions, against the values the backend really uses
//   tasks.status: pending | assigned | in_progress | completed | cancelled | overdue
//     (Web/backend/src/tasks/task-sql.ts TASK_STATUSES)
//   GET /tasks rows carry `overdue` (TASK_OVERDUE_SQL: status overdue, or open past the deadline). The flag decides the
//   "overdue" tab; a row without it falls back to the same rule on the deadline.
//   POST /tasks/:id/accept: pending | assigned | overdue (tasks.service.ts ACCEPTABLE_STATUSES), else 409.
//   Texts live in tasks_texts.dart (test/unit_tasks_texts_test.dart).
// Run: flutter test test/unit_task_status_test.dart

import 'package:flutter_test/flutter_test.dart';
import 'package:intl/intl.dart';
import 'package:militian_app/core/constants/app_colors.dart';
import 'package:militian_app/features/tasks/task_status.dart';

import 'helpers/fakes.dart';

final _now = DateTime.utc(2026, 9, 14, 12);
const _past = '2026-09-13T10:00:00.000Z';
const _future = '2026-09-20T10:00:00.000Z';

/// A row without the server's overdue flag: the deadline rule decides
Map<String, dynamic> _unflagged(String status, [String? deadline]) =>
    backendTaskRow('t', status, deadline: deadline)..remove('overdue');

TaskTab? _tab(String status, [String? deadline]) => taskTabOf(_unflagged(status, deadline), _now);

void main() {
  group('parsing', () {
    test('UT-TS-01: status and deadline are read from the backend row', () {
      final row = backendTaskRow('t1', 'in_progress', deadline: _future);
      expect(taskStatusOf(row), TaskStatus.inProgress);
      expect(taskDeadlineOf(row), DateTime.utc(2026, 9, 20, 10));
      expect(taskDeadlineOf(backendTaskRow('t2', 'pending')), isNull);
      expect(taskDeadlineOf({'deadline': 'not a date'}), isNull);
      expect(taskStatusOf({'id': 't3'}), '');
      expect(taskStatusOf({'id': 't3', 'status': 7}), '');
    });

    test('UT-TS-02: the status codes are exactly the backend values', () {
      expect(TaskStatus.values, ['pending', 'assigned', 'in_progress', 'completed', 'cancelled', 'overdue']);
    });
  });

  group('tabs', () {
    test('UT-TS-03: each backend status belongs to one tab', () {
      expect(_tab('pending', _future), TaskTab.waiting);
      expect(_tab('assigned'), TaskTab.waiting);
      expect(_tab('in_progress', _future), TaskTab.inProgress);
      expect(_tab('in_progress'), TaskTab.inProgress);
      expect(_tab('completed'), TaskTab.completed);
      expect(_tab('cancelled'), TaskTab.cancelled);
      expect(_tab('overdue', _future), TaskTab.overdue);
    });

    test('UT-TS-04: without the flag, past the deadline and neither completed nor cancelled is overdue', () {
      expect(_tab('pending', _past), TaskTab.overdue);
      expect(_tab('assigned', _past), TaskTab.overdue);
      expect(_tab('in_progress', _past), TaskTab.overdue);
      expect(_tab('completed', _past), TaskTab.completed);
      expect(_tab('cancelled', _past), TaskTab.cancelled);

      expect(isTaskOverdue(_unflagged('in_progress', _past), _now), isTrue);
      expect(isTaskOverdue(_unflagged('overdue'), _now), isTrue);
      expect(isTaskOverdue(_unflagged('completed', _past), _now), isFalse);
      expect(isTaskOverdue(_unflagged('in_progress'), _now), isFalse);
      // Exactly at the deadline is not late yet
      expect(isTaskOverdue(_unflagged('pending', '2026-09-14T12:00:00.000Z'), _now), isFalse);
    });

    test('UT-TS-13: the server\'s overdue flag decides over the device clock', () {
      final lateByServer = backendTaskRow('t1', 'in_progress', deadline: _future, overdue: true);
      expect(isTaskOverdue(lateByServer, _now), isTrue);
      expect(taskTabOf(lateByServer, _now), TaskTab.overdue);

      final onTimeByServer = backendTaskRow('t2', 'pending', deadline: _past, overdue: false);
      expect(isTaskOverdue(onTimeByServer, _now), isFalse);
      expect(taskTabOf(onTimeByServer, _now), TaskTab.waiting);

      // A flag that is not a boolean is ignored: the deadline rule applies
      final odd = backendTaskRow('t3', 'assigned', deadline: _past)..['overdue'] = 'false';
      expect(isTaskOverdue(odd, _now), isTrue);

      // A closed task is never listed as late
      expect(taskTabOf(backendTaskRow('t4', 'completed', overdue: true), _now), TaskTab.completed);
    });

    test('UT-TS-05: client-only or unknown codes are in no tab', () {
      expect(_tab('in-progress'), isNull);
      // 'accepted' exists only in task_assignments.status, which GET /tasks does not return
      expect(_tab('accepted'), isNull);
      expect(taskTabOf({'id': 't'}, _now), isNull);
    });

    test('UT-TS-06: counts and filters partition the rows', () {
      final rows = [
        _unflagged('pending', _future)..['id'] = 't1',
        _unflagged('assigned')..['id'] = 't2',
        _unflagged('in_progress', _future)..['id'] = 't3',
        _unflagged('in_progress', _past)..['id'] = 't4',
        _unflagged('completed', _past)..['id'] = 't5',
        _unflagged('cancelled')..['id'] = 't6',
        _unflagged('overdue')..['id'] = 't7',
        _unflagged('in-progress')..['id'] = 't8',
        backendTaskRow('t9', 'pending', deadline: _future, overdue: true),
      ];

      final counts = countTaskTabs(rows, _now);

      expect(counts, {
        TaskTab.inProgress: 1,
        TaskTab.waiting: 2,
        TaskTab.completed: 1,
        TaskTab.overdue: 3,
        TaskTab.cancelled: 1,
      });
      expect(tasksInTab(rows, TaskTab.inProgress, _now).map((t) => t['id']), ['t3']);
      expect(tasksInTab(rows, TaskTab.waiting, _now).map((t) => t['id']), ['t1', 't2']);
      expect(tasksInTab(rows, TaskTab.overdue, _now).map((t) => t['id']), ['t4', 't7', 't9']);
      expect(countTaskTabs(const [], _now).values.every((c) => c == 0), isTrue);
    });
  });

  test('UT-TS-08: a colour for every backend status', () {
    const expected = {
      'pending': AppColors.warning,
      'assigned': AppColors.warning,
      'in_progress': AppColors.blue,
      'completed': AppColors.success,
      'cancelled': AppColors.textMuted,
      'overdue': AppColors.error,
    };
    expected.forEach((status, colour) => expect(taskStatusColor(status), colour, reason: status));
    expect(taskStatusColor('in-progress'), AppColors.textSecondary);
  });

  group('actions', () {
    Map<String, dynamic> row(String status) => backendTaskRow('t', status);

    test('UT-TS-09: accepting is offered from pending, assigned or overdue (ACCEPTABLE_STATUSES)', () {
      for (final s in ['pending', 'assigned', 'overdue']) {
        expect(canAcceptTask(row(s)), isTrue, reason: s);
      }
      for (final s in ['in_progress', 'completed', 'cancelled', 'in-progress', '']) {
        expect(canAcceptTask(row(s)), isFalse, reason: s);
      }
    });

    test('UT-TS-10: a report is offered for started, assigned or overdue tasks, never a closed one', () {
      for (final s in ['assigned', 'in_progress', 'overdue']) {
        expect(canReportTask(row(s)), isTrue, reason: s);
      }
      for (final s in ['pending', 'completed', 'cancelled', 'in-progress']) {
        expect(canReportTask(row(s)), isFalse, reason: s);
      }
    });
  });

  test('UT-TS-12: the deadline is shown in local time', () {
    expect(
      formatTaskDeadline(backendTaskRow('t', 'pending', deadline: _future)),
      DateFormat('dd/MM/yyyy HH:mm').format(DateTime.utc(2026, 9, 20, 10).toLocal()),
    );
    expect(formatTaskDeadline(backendTaskRow('t', 'pending')), '');
  });
}
