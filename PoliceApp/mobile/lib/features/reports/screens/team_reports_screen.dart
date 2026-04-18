import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/constants/api_constants.dart';
import '../../../shared/widgets/app_header.dart';
import '../../auth/providers/auth_provider.dart';

class TeamReportsScreen extends ConsumerStatefulWidget {
  const TeamReportsScreen({super.key});

  @override
  ConsumerState<TeamReportsScreen> createState() => _TeamReportsScreenState();
}

class _TeamReportsScreenState extends ConsumerState<TeamReportsScreen> {
  List<Map<String, dynamic>> _reports = [];
  Map<String, dynamic>? _summary;
  bool _loading = true;
  String? _error;
  String _period = 'month'; // 'week' | 'month'

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      final dio = ref.read(dioProvider);
      final resp = await dio.get(ApiConstants.reportsTeam, queryParameters: {'period': _period});
      final data = resp.data['data'];
      if (data is Map) {
        setState(() {
          _reports = List<Map<String, dynamic>>.from(data['items'] as List? ?? []);
          _summary = data['summary'] as Map<String, dynamic>?;
          _loading = false;
        });
      } else if (data is List) {
        setState(() { _reports = List<Map<String, dynamic>>.from(data); _loading = false; });
      } else {
        setState(() { _loading = false; });
      }
    } catch (e) {
      setState(() { _error = 'Lỗi tải báo cáo'; _loading = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppHeader(title: 'Báo cáo đội', showBack: true),
      body: Column(
        children: [
          // Period selector
          Padding(
            padding: const EdgeInsets.all(12),
            child: SegmentedButton<String>(
              segments: const [
                ButtonSegment(value: 'week', label: Text('Tuần này')),
                ButtonSegment(value: 'month', label: Text('Tháng này')),
              ],
              selected: {_period},
              onSelectionChanged: (s) {
                setState(() => _period = s.first);
                _load();
              },
              style: ButtonStyle(
                backgroundColor: WidgetStateProperty.resolveWith((states) =>
                    states.contains(WidgetState.selected) ? AppColors.navy : null),
                foregroundColor: WidgetStateProperty.resolveWith((states) =>
                    states.contains(WidgetState.selected) ? Colors.white : AppColors.textPrimary),
              ),
            ),
          ),
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator(color: AppColors.navy))
                : _error != null
                    ? Center(child: Column(mainAxisSize: MainAxisSize.min, children: [
                        const Icon(Icons.error_outline, color: AppColors.error, size: 48),
                        const SizedBox(height: 8),
                        Text(_error!),
                        ElevatedButton(onPressed: _load, child: const Text('Thử lại')),
                      ]))
                    : RefreshIndicator(
                        onRefresh: _load,
                        child: ListView(
                          padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                          children: [
                            // Summary cards
                            if (_summary != null) ...[
                              Row(children: [
                                _SummaryCard(
                                  label: 'Tổng báo cáo',
                                  value: '${_summary!['totalReports'] ?? _reports.length}',
                                  color: AppColors.navy,
                                ),
                                const SizedBox(width: 8),
                                _SummaryCard(
                                  label: 'Hoàn thành',
                                  value: '${_summary!['completedTasks'] ?? '-'}',
                                  color: AppColors.success,
                                ),
                                const SizedBox(width: 8),
                                _SummaryCard(
                                  label: 'DQTV báo cáo',
                                  value: '${_summary!['activeMembers'] ?? '-'}',
                                  color: AppColors.warning,
                                ),
                              ]),
                              const SizedBox(height: 12),
                            ],

                            // Report list
                            if (_reports.isEmpty)
                              const Card(
                                child: Padding(
                                  padding: EdgeInsets.all(24),
                                  child: Center(
                                    child: Text('Chưa có báo cáo nào', style: TextStyle(color: AppColors.textMuted)),
                                  ),
                                ),
                              )
                            else
                              ..._reports.map((r) => _ReportCard(report: r)),
                          ],
                        ),
                      ),
          ),
        ],
      ),
    );
  }
}

class _SummaryCard extends StatelessWidget {
  final String label;
  final String value;
  final Color color;
  const _SummaryCard({required this.label, required this.value, required this.color});

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Card(
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 8),
          child: Column(children: [
            Text(value, style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: color)),
            const SizedBox(height: 4),
            Text(label, style: const TextStyle(fontSize: 11, color: AppColors.textSecondary), textAlign: TextAlign.center),
          ]),
        ),
      ),
    );
  }
}

class _ReportCard extends StatelessWidget {
  final Map<String, dynamic> report;
  const _ReportCard({required this.report});

  @override
  Widget build(BuildContext context) {
    final createdAt = report['createdAt'] as String?;
    String dateStr = '';
    if (createdAt != null) {
      try { dateStr = DateFormat('dd/MM HH:mm').format(DateTime.parse(createdAt).toLocal()); } catch (_) {}
    }
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            const Icon(Icons.person_outline, size: 16, color: AppColors.textSecondary),
            const SizedBox(width: 6),
            Text(report['authorName'] as String? ?? report['authorUsername'] as String? ?? 'DQTV',
                style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
            const Spacer(),
            Text(dateStr, style: const TextStyle(fontSize: 12, color: AppColors.textMuted)),
          ]),
          const SizedBox(height: 8),
          Text(report['content'] as String? ?? '',
              maxLines: 3, overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontSize: 13, color: AppColors.textPrimary)),
          if (report['taskTitle'] != null) ...[
            const SizedBox(height: 6),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
              decoration: BoxDecoration(
                color: AppColors.navy.withOpacity(0.08),
                borderRadius: BorderRadius.circular(6),
              ),
              child: Text('Nhiệm vụ: ${report['taskTitle']}',
                  style: const TextStyle(fontSize: 11, color: AppColors.navy)),
            ),
          ],
        ]),
      ),
    );
  }
}
