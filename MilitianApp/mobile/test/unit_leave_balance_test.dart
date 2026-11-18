// Unit Tests: leave balances banner data
// GET /leave-balances → bare array [{leaveTypeId, leaveTypeName, totalDays, usedDays,
// remainingDays, year}]; NUMERIC columns may arrive as strings
// (Web/backend/src/leave/leave.controller.ts:94-99, leave.service.ts:404-418)
// Run: flutter test test/unit_leave_balance_test.dart

import 'package:flutter_test/flutter_test.dart';
import 'package:militian_app/features/leave/leave_balance.dart';

final _body = <Object?>[
  {
    'leaveTypeId': 'lt1',
    'leaveTypeName': 'Nghỉ phép năm',
    'totalDays': '12.0',
    'usedDays': '2',
    'remainingDays': '10.00',
    'year': 2026,
  },
  {
    'leaveTypeId': 'lt2',
    'leaveTypeName': 'Nghỉ ốm',
    'totalDays': 30,
    'usedDays': 1.5,
    'remainingDays': 28.5,
    'year': '2026',
  },
  {
    'leaveTypeId': 'lt1',
    'leaveTypeName': 'Nghỉ phép năm',
    'totalDays': 12,
    'usedDays': 12,
    'remainingDays': 0,
    'year': 2025,
  },
];

void main() {
  test('rows of the requested year, numbers or numeric strings', () {
    final items = balancesForYear(_body, 2026);

    expect(items, hasLength(2));
    expect(items.first.leaveTypeId, 'lt1');
    expect(items.first.leaveTypeName, 'Nghỉ phép năm');
    expect(items.first.totalDays, 12.0);
    expect(items.first.usedDays, 2.0);
    expect(items.first.remainingDays, 10.0);
    expect(items.first.year, 2026);
    expect(items.last.remainingDays, 28.5);
  });

  test('one banner line per leave type, days without a trailing ,0', () {
    final items = balancesForYear(_body, 2026);
    expect(items.map((b) => b.label), [
      'Nghỉ phép năm: còn 10/12 ngày',
      'Nghỉ ốm: còn 28,5/30 ngày',
    ]);
    expect(balancesForYear(_body, 2025).single.label, 'Nghỉ phép năm: còn 0/12 ngày');
  });

  test('a year without rows is empty', () {
    expect(balancesForYear(_body, 2024), isEmpty);
  });

  test('a body that is not an array is empty', () {
    expect(balancesForYear({'data': _body}, 2026), isEmpty);
    expect(balancesForYear(null, 2026), isEmpty);
    expect(balancesForYear('x', 2026), isEmpty);
  });

  test('rows that cannot be shown truthfully are skipped', () {
    final items = balancesForYear([
      null,
      'x',
      {'leaveTypeName': 'Không số', 'totalDays': 'abc', 'remainingDays': 1, 'year': 2026},
      {'leaveTypeName': 'Thiếu còn lại', 'totalDays': 12, 'year': 2026},
      {'leaveTypeName': '  ', 'totalDays': 12, 'remainingDays': 3, 'year': 2026},
      {'leaveTypeName': 'Không năm', 'totalDays': 12, 'remainingDays': 3},
      {'leaveTypeId': 'lt9', 'leaveTypeName': 'Nghỉ việc riêng', 'totalDays': 3, 'remainingDays': 3, 'year': 2026},
    ], 2026);

    expect(items.map((b) => b.leaveTypeName), ['Nghỉ việc riêng']);
    expect(items.single.usedDays, isNull);
  });
}
