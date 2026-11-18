import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/constants/api_constants.dart';
import '../../../core/constants/app_colors.dart';
import '../../../l10n/l10n.dart';
import '../../../shared/errors/app_failure.dart';
import '../../../shared/utils/calendar_date.dart';
import '../../auth/providers/auth_provider.dart';

/// A month of the user's attendance (GET /attendance?from=&to=), one coloured day per record.
class AttendanceCalendar extends ConsumerStatefulWidget {
  const AttendanceCalendar({super.key});

  @override
  ConsumerState<AttendanceCalendar> createState() => _AttendanceCalendarState();
}

class _AttendanceCalendarState extends ConsumerState<AttendanceCalendar> {
  DateTime _focusedMonth = DateTime(DateTime.now().year, DateTime.now().month);
  Map<DateTime, String> _statusMap = {};
  bool _loading = false;
  AppFailure? _failure;

  @override
  void initState() {
    super.initState();
    _loadMonth(_focusedMonth);
  }

  /// Only the month still shown takes its answer: moving between months quickly must not let a
  /// late answer paint another month's days.
  Future<void> _loadMonth(DateTime month) async {
    setState(() {
      _loading = true;
      _failure = null;
    });
    try {
      final res = await ref.read(dioProvider).get<Object?>(ApiConstants.attendanceList, queryParameters: {
        'from': toCalendarDateString(DateTime(month.year, month.month, 1)),
        'to': toCalendarDateString(DateTime(month.year, month.month + 1, 0)),
        'limit': 31,
      });
      final body = res.data;
      if (body is! Map || body['data'] is! List) throw const FormatException('attendance list without data');
      final map = <DateTime, String>{};
      for (final item in (body['data'] as List).whereType<Map>()) {
        // work_date is a DATE column: a 'YYYY-MM-DD' calendar day
        final day = parseCalendarDate(item['workDate']);
        final status = item['status'];
        if (day != null && status is String) map[day] = status;
      }
      if (!mounted || month != _focusedMonth) return;
      setState(() {
        _statusMap = map;
        _loading = false;
      });
    } catch (e) {
      if (!mounted || month != _focusedMonth) return;
      setState(() {
        _failure = AppFailure.from(e);
        _loading = false;
      });
    }
  }

  void _showMonth(int offset) {
    final month = DateTime(_focusedMonth.year, _focusedMonth.month + offset);
    setState(() {
      _focusedMonth = month;
      _statusMap = {};
    });
    _loadMonth(month);
  }

  List<DateTime?> _buildDays() {
    final firstDay = DateTime(_focusedMonth.year, _focusedMonth.month, 1);
    final lastDay = DateTime(_focusedMonth.year, _focusedMonth.month + 1, 0);
    // Monday=1..Sunday=7; shift so Mon=0
    final startOffset = (firstDay.weekday - 1) % 7;
    final cells = <DateTime?>[...List.filled(startOffset, null)];
    for (var d = 1; d <= lastDay.day; d++) {
      cells.add(DateTime(_focusedMonth.year, _focusedMonth.month, d));
    }
    return cells;
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final days = _buildDays();
    final weekdays = [
      l10n.attendanceCalendarWeekdayMon,
      l10n.attendanceCalendarWeekdayTue,
      l10n.attendanceCalendarWeekdayWed,
      l10n.attendanceCalendarWeekdayThu,
      l10n.attendanceCalendarWeekdayFri,
      l10n.attendanceCalendarWeekdaySat,
      l10n.attendanceCalendarWeekdaySun,
    ];
    final failure = _failure;

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Month navigation
            Row(
              children: [
                IconButton(
                  tooltip: l10n.attendanceCalendarPreviousMonth,
                  onPressed: () => _showMonth(-1),
                  icon: const Icon(Icons.chevron_left),
                  padding: EdgeInsets.zero,
                  constraints: const BoxConstraints(),
                ),
                Expanded(
                  child: Center(
                    child: Text(
                      l10n.attendanceCalendarMonth(_focusedMonth.month, _focusedMonth.year),
                      style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15),
                    ),
                  ),
                ),
                IconButton(
                  tooltip: l10n.attendanceCalendarNextMonth,
                  onPressed: () => _showMonth(1),
                  icon: const Icon(Icons.chevron_right),
                  padding: EdgeInsets.zero,
                  constraints: const BoxConstraints(),
                ),
              ],
            ),
            const SizedBox(height: 8),

            // Weekday labels
            Row(
              children: weekdays
                  .map((d) => Expanded(
                        child: Center(
                          child: Text(d,
                              style: const TextStyle(
                                  fontSize: 11, fontWeight: FontWeight.w600, color: AppColors.textSecondary)),
                        ),
                      ))
                  .toList(),
            ),
            const SizedBox(height: 4),

            // Days grid
            if (_loading)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 24),
                child: Center(child: CircularProgressIndicator(color: AppColors.navy, strokeWidth: 2)),
              )
            else if (failure != null)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 16),
                child: Row(children: [
                  Expanded(
                    child: Text(l10n.attendanceCalendarLoadError(failureText(l10n, failure)),
                        style: const TextStyle(fontSize: 12, color: AppColors.error)),
                  ),
                  TextButton(onPressed: () => _loadMonth(_focusedMonth), child: Text(l10n.commonRetry)),
                ]),
              )
            else
              GridView.builder(
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                  crossAxisCount: 7,
                  childAspectRatio: 1,
                  mainAxisSpacing: 4,
                  crossAxisSpacing: 2,
                ),
                itemCount: days.length,
                itemBuilder: (ctx, i) {
                  final date = days[i];
                  if (date == null) return const SizedBox();
                  final status = _statusMap[DateTime(date.year, date.month, date.day)];
                  return _DayCell(date: date, status: status);
                },
              ),

            const SizedBox(height: 12),

            // Legend
            Wrap(
              spacing: 12,
              runSpacing: 6,
              children: [
                _LegendDot(color: const Color(0xFFA7F3D0), label: l10n.attendanceCalendarLegendPresent),
                _LegendDot(color: const Color(0xFFFECACA), label: l10n.attendanceCalendarLegendAbsent),
                _LegendDot(color: const Color(0xFFBFDBFE), label: l10n.attendanceCalendarLegendLeave),
                _LegendDot(color: const Color(0xFFE2E8F0), label: l10n.attendanceCalendarLegendHoliday),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _DayCell extends StatelessWidget {
  final DateTime date;
  final String? status;
  const _DayCell({required this.date, this.status});

  static Color _bgColor(String? s) {
    switch (s) {
      case 'present':
      case 'checked_in':
      case 'checked_out':
        return const Color(0xFFA7F3D0);
      case 'absent':
        return const Color(0xFFFECACA);
      case 'leave':
        return const Color(0xFFBFDBFE);
      case 'holiday':
        return const Color(0xFFE2E8F0);
      default:
        return Colors.transparent;
    }
  }

  static Color _fgColor(String? s) {
    switch (s) {
      case 'present':
      case 'checked_in':
      case 'checked_out':
        return const Color(0xFF065F46);
      case 'absent':
        return const Color(0xFF991B1B);
      case 'leave':
        return const Color(0xFF1E40AF);
      case 'holiday':
        return const Color(0xFF475569);
      default:
        return AppColors.textPrimary;
    }
  }

  @override
  Widget build(BuildContext context) {
    final isToday = date.year == DateTime.now().year &&
        date.month == DateTime.now().month &&
        date.day == DateTime.now().day;
    return Container(
      margin: const EdgeInsets.all(2),
      decoration: BoxDecoration(
        color: _bgColor(status),
        shape: BoxShape.circle,
        border: isToday ? Border.all(color: AppColors.navy, width: 2) : null,
      ),
      child: Center(
        child: Text(
          '${date.day}',
          style: TextStyle(
            fontSize: 11,
            fontWeight: isToday ? FontWeight.w700 : FontWeight.w400,
            color: _fgColor(status),
          ),
        ),
      ),
    );
  }
}

class _LegendDot extends StatelessWidget {
  final Color color;
  final String label;
  const _LegendDot({required this.color, required this.label});

  @override
  Widget build(BuildContext context) => Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 12,
            height: 12,
            decoration: BoxDecoration(color: color, shape: BoxShape.circle),
          ),
          const SizedBox(width: 4),
          Text(label, style: const TextStyle(fontSize: 11, color: AppColors.textSecondary)),
        ],
      );
}
