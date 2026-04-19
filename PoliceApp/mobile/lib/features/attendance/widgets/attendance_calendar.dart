import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/constants/app_colors.dart';
import '../../auth/providers/auth_provider.dart';

class AttendanceCalendar extends ConsumerStatefulWidget {
  const AttendanceCalendar({super.key});

  @override
  ConsumerState<AttendanceCalendar> createState() => _AttendanceCalendarState();
}

class _AttendanceCalendarState extends ConsumerState<AttendanceCalendar> {
  DateTime _focusedMonth = DateTime(DateTime.now().year, DateTime.now().month);
  Map<DateTime, String> _statusMap = {};
  bool _loading = false;

  @override
  void initState() {
    super.initState();
    _loadMonth(_focusedMonth);
  }

  Future<void> _loadMonth(DateTime month) async {
    setState(() => _loading = true);
    try {
      final dio = ref.read(dioProvider);
      final from = DateTime(month.year, month.month, 1);
      final to = DateTime(month.year, month.month + 1, 0);
      final fromStr = '${from.year}-${from.month.toString().padLeft(2, '0')}-01';
      final toStr = '${to.year}-${to.month.toString().padLeft(2, '0')}-${to.day.toString().padLeft(2, '0')}';
      final res = await dio.get('/attendance', queryParameters: {
        'from': fromStr,
        'to': toStr,
        'limit': 31,
      });
      final items = (res.data['data'] as List?) ?? [];
      final map = <DateTime, String>{};
      for (final item in items) {
        final d = item['workDate'] as String?;
        final s = item['status'] as String?;
        if (d != null && s != null) {
          try {
            final parsed = DateTime.parse(d);
            map[DateTime(parsed.year, parsed.month, parsed.day)] = s;
          } catch (_) {}
        }
      }
      if (mounted) setState(() { _statusMap = map; _loading = false; });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _prevMonth() {
    final prev = DateTime(_focusedMonth.year, _focusedMonth.month - 1);
    setState(() { _focusedMonth = prev; _statusMap = {}; });
    _loadMonth(prev);
  }

  void _nextMonth() {
    final next = DateTime(_focusedMonth.year, _focusedMonth.month + 1);
    setState(() { _focusedMonth = next; _statusMap = {}; });
    _loadMonth(next);
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
    final days = _buildDays();
    const weekdays = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

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
                  onPressed: _prevMonth,
                  icon: const Icon(Icons.chevron_left),
                  padding: EdgeInsets.zero,
                  constraints: const BoxConstraints(),
                ),
                Expanded(
                  child: Center(
                    child: Text(
                      'Tháng ${_focusedMonth.month}/${_focusedMonth.year}',
                      style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15),
                    ),
                  ),
                ),
                IconButton(
                  onPressed: _nextMonth,
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
                                  fontSize: 11,
                                  fontWeight: FontWeight.w600,
                                  color: AppColors.textSecondary)),
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
              children: const [
                _LegendDot(color: Color(0xFFA7F3D0), label: 'Có mặt'),
                _LegendDot(color: Color(0xFFFECACA), label: 'Vắng'),
                _LegendDot(color: Color(0xFFBFDBFE), label: 'Nghỉ phép'),
                _LegendDot(color: Color(0xFFE2E8F0), label: 'Lễ'),
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
