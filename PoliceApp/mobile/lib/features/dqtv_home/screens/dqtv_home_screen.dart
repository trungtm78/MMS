import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/api_constants.dart';
import '../../../core/router/routes.dart';
import '../../../shared/widgets/app_header.dart';
import '../../auth/providers/auth_provider.dart';

class DQTVHomeScreen extends ConsumerStatefulWidget {
  const DQTVHomeScreen({super.key});

  @override
  ConsumerState<DQTVHomeScreen> createState() => _DQTVHomeScreenState();
}

class _DQTVHomeScreenState extends ConsumerState<DQTVHomeScreen> {
  Map<String, dynamic>? _data;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() { _loading = true; });
    try {
      final dio = ref.read(dioProvider);
      final results = await Future.wait([
        dio.get(ApiConstants.profile),
        dio.get(ApiConstants.attendanceToday),
        dio.get(ApiConstants.tasks, queryParameters: {'status': 'assigned', 'limit': '3'}),
        dio.get(ApiConstants.kpiCurrent),
      ]);
      if (!mounted) return;
      setState(() {
        _data = {
          'user': results[0].data['data'],
          'attendance': results[1].data['data'],
          'tasks': results[2].data['data'],
          'kpi': results[3].data['data'],
        };
        _loading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() { _loading = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    final today = DateFormat('EEEE, dd/MM/yyyy', 'vi_VN').format(DateTime.now());
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppHeader(
        title: 'Trang chủ',
        showBack: false,
        action: IconButton(
          icon: const Icon(Icons.notifications_outlined),
          onPressed: () => context.push(Routes.dqtvNotifications),
        ),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: AppColors.navy))
          : RefreshIndicator(
              onRefresh: _load,
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  // Welcome
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Row(children: [
                        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Text('Chào, ${_data?['user']?['fullName'] ?? ''}',
                              style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
                          const SizedBox(height: 4),
                          Text(today, style: const TextStyle(color: AppColors.textSecondary, fontSize: 13)),
                        ])),
                        const CircleAvatar(radius: 24, backgroundColor: AppColors.navy,
                            child: Icon(Icons.shield, color: Colors.white)),
                      ]),
                    ),
                  ),
                  const SizedBox(height: 16),
                  // Attendance card
                  _AttendanceCard(attendance: _data?['attendance'] as Map<String, dynamic>?),
                  const SizedBox(height: 16),
                  // My Tasks
                  const Text('NHIỆM VỤ CỦA TÔI',
                      style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13, color: AppColors.textSecondary)),
                  const SizedBox(height: 8),
                  if (_data?['tasks'] == null || (_data!['tasks'] as List).isEmpty)
                    const Card(child: Padding(padding: EdgeInsets.all(16), child: Text('Không có nhiệm vụ mới')))
                  else
                    ...(_data!['tasks'] as List).map((t) => _TaskItem(task: t as Map<String, dynamic>)),
                  const SizedBox(height: 16),
                  // KPI
                  if (_data?['kpi'] != null)
                    Card(
                      child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          const Text('KPI THÁNG NÀY', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
                          const SizedBox(height: 8),
                          Row(children: [
                            Text(
                              '${_data!['kpi']['totalScore'] ?? 0}',
                              style: TextStyle(
                                fontSize: 32, fontWeight: FontWeight.w800,
                                color: AppColors.kpiScoreColor((_data!['kpi']['totalScore'] as num?)?.toDouble() ?? 0),
                              ),
                            ),
                            const Text(' / 100', style: TextStyle(fontSize: 16, color: AppColors.textSecondary)),
                            const Spacer(),
                            Text('Hạng #${_data!['kpi']['rankInUnit'] ?? '-'}',
                                style: const TextStyle(color: AppColors.navy, fontWeight: FontWeight.w600)),
                          ]),
                        ]),
                      ),
                    ),
                ],
              ),
            ),
    );
  }
}

class _AttendanceCard extends StatelessWidget {
  final Map<String, dynamic>? attendance;
  const _AttendanceCard({this.attendance});

  @override
  Widget build(BuildContext context) {
    if (attendance == null) {
      return Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(children: [
            const Text('CHẤM CÔNG HÔM NAY', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
            const SizedBox(height: 8),
            const Text('Chưa check-in hôm nay', style: TextStyle(color: AppColors.textSecondary)),
            const SizedBox(height: 12),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton.icon(
                onPressed: () => Navigator.of(context).pushNamed('/dqtv/checkin'),
                icon: const Icon(Icons.access_time),
                label: const Text('CHECK IN NGAY'),
                style: ElevatedButton.styleFrom(backgroundColor: AppColors.tertiary),
              ),
            ),
          ]),
        ),
      );
    }

    final checkinTime = attendance!['checkinAt'] as String?;
    final checkoutTime = attendance!['checkoutAt'] as String?;
    final isLate = attendance!['isLate'] as bool? ?? false;

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Text('CHẤM CÔNG HÔM NAY', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
          const SizedBox(height: 8),
          if (checkinTime != null) ...[
            Row(children: [
              const Icon(Icons.check_circle, color: AppColors.success, size: 16),
              const SizedBox(width: 6),
              Text('Check-in: ${checkinTime.substring(11, 16)}${isLate ? ' (Muộn)' : ''}',
                  style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
            ]),
            if (checkoutTime != null) ...[
              const SizedBox(height: 4),
              Row(children: [
                const Icon(Icons.check_circle_outline, color: AppColors.navy, size: 16),
                const SizedBox(width: 6),
                Text('Check-out: ${checkoutTime.substring(11, 16)}', style: const TextStyle(fontSize: 14)),
              ]),
            ] else ...[
              const SizedBox(height: 12),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: () => Navigator.of(context).pushNamed('/dqtv/checkin'),
                  style: ElevatedButton.styleFrom(backgroundColor: AppColors.primary),
                  child: const Text('CHECK OUT'),
                ),
              ),
            ],
          ],
        ]),
      ),
    );
  }
}

class _TaskItem extends StatelessWidget {
  final Map<String, dynamic> task;
  const _TaskItem({required this.task});

  @override
  Widget build(BuildContext context) {
    final status = task['status'] as String? ?? '';
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        title: Text(task['title'] as String? ?? '', style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
        subtitle: Text('${task['code'] ?? ''}  •  Hạn: ${task['deadline']?.toString().substring(0, 10) ?? '-'}'),
        trailing: Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
          decoration: BoxDecoration(
            color: AppColors.taskStatusColor(status).withOpacity(0.12),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Text(AppColors.taskStatusLabel(status),
              style: TextStyle(fontSize: 11, color: AppColors.taskStatusColor(status))),
        ),
      ),
    );
  }
}
