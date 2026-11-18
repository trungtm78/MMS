import '../../shared/utils/number_format.dart';

/// One row of GET /leave-balances (Web/backend/src/leave/leave.service.ts:404-418).
class LeaveBalanceItem {
  final String leaveTypeId;
  final String leaveTypeName;
  final double totalDays;
  final double? usedDays;
  final double remainingDays;
  final int year;

  const LeaveBalanceItem({
    required this.leaveTypeId,
    required this.leaveTypeName,
    required this.totalDays,
    this.usedDays,
    required this.remainingDays,
    required this.year,
  });

  /// Banner line, e.g. 'Nghỉ phép năm: còn 10/12 ngày'
  String get label =>
      '$leaveTypeName: còn ${formatDecimal(remainingDays)}/${formatDecimal(totalDays)} ngày';
}

/// The balances of [year] from the bare array GET /leave-balances returns. NUMERIC columns
/// may be strings. Rows without a name, a year or numeric total/remaining days are skipped,
/// and a body that is not an array gives none.
List<LeaveBalanceItem> balancesForYear(Object? body, int year) {
  if (body is! List) return const [];
  final items = <LeaveBalanceItem>[];
  for (final row in body) {
    if (row is! Map) continue;
    final name = row['leaveTypeName'];
    if (name is! String || name.trim().isEmpty) continue;
    if (parseDecimal(row['year']) != year) continue;
    final total = parseDecimal(row['totalDays']);
    final remaining = parseDecimal(row['remainingDays']);
    if (total == null || remaining == null) continue;
    items.add(LeaveBalanceItem(
      leaveTypeId: row['leaveTypeId']?.toString() ?? '',
      leaveTypeName: name.trim(),
      totalDays: total,
      usedDays: parseDecimal(row['usedDays']),
      remainingDays: remaining,
      year: year,
    ));
  }
  return items;
}
