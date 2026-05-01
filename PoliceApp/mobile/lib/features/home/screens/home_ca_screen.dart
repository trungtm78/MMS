import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/api_constants.dart';
import '../../../core/router/routes.dart';
import '../../../shared/widgets/app_header.dart';
import '../../auth/providers/auth_provider.dart';

class HomeCAScreen extends ConsumerStatefulWidget {
  const HomeCAScreen({super.key});

  @override
  ConsumerState<HomeCAScreen> createState() => _HomeCAScreenState();
}

class _HomeCAScreenState extends ConsumerState<HomeCAScreen> {
  Map<String, dynamic>? _dashboardData;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadDashboard();
  }

  Future<void> _loadDashboard() async {
    setState(() { _loading = true; _error = null; });
    try {
      final dio = ref.read(dioProvider);
      final futures = await Future.wait([
        dio.get(ApiConstants.profile),
        dio.get(ApiConstants.tasks, queryParameters: {'status': 'assigned', 'limit': '5'}),
        dio.get(ApiConstants.sosList, queryParameters: {'status': 'active', 'limit': '3'}),
        dio.get(ApiConstants.gpsLive),
        dio.get(ApiConstants.dashboardStats).catchError((_) => null),
      ]);
      if (!mounted) return;
      final statsResp = futures[4];
      final stats = statsResp?.data is Map ? statsResp!.data as Map<String, dynamic> : <String, dynamic>{};
      setState(() {
        _dashboardData = {
          'user': futures[0].data['data'],
          'tasks': futures[1].data['data'],
          'alerts': futures[2].data['data'],
          'gpsTeam': futures[3].data['data'],
          'stats': stats,
        };
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() { _error = 'Lỗi tải dữ liệu'; _loading = false; });
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
          onPressed: () => context.push(Routes.caNotifications),
        ),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: AppColors.navy))
          : _error != null
              ? Center(child: Column(mainAxisSize: MainAxisSize.min, children: [
                  const Icon(Icons.error_outline, color: AppColors.error, size: 48),
                  const SizedBox(height: 8),
                  Text(_error!),
                  const SizedBox(height: 8),
                  ElevatedButton(onPressed: _loadDashboard, child: const Text('Thử lại')),
                ]))
              : RefreshIndicator(
                  onRefresh: _loadDashboard,
                  child: ListView(
                    padding: const EdgeInsets.all(16),
                    children: [
                      // Welcome card
                      Card(
                        child: Padding(
                          padding: const EdgeInsets.all(16),
                          child: Row(children: [
                            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                              Text('Chào, ${_dashboardData!['user']['fullName'] ?? ''}',
                                  style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
                              const SizedBox(height: 4),
                              Text(today, style: const TextStyle(color: AppColors.textSecondary, fontSize: 13)),
                            ])),
                            const CircleAvatar(radius: 24, backgroundColor: AppColors.navy,
                                child: Icon(Icons.local_police, color: Colors.white)),
                          ]),
                        ),
                      ),
                      const SizedBox(height: 16),
                      // KPI summary row
                      Builder(builder: (_) {
                        final stats = _dashboardData!['stats'] as Map<String, dynamic>? ?? {};
                        final activeToday = stats['activeToday'] as int? ??
                            (_dashboardData!['gpsTeam'] as List?)?.where((m) => m['status'] == 'online' || m['status'] == 'moving').length ?? 0;
                        final pendingTasks = stats['pendingTasks'] as int? ??
                            (_dashboardData!['tasks'] as List?)?.length ?? 0;
                        final pendingApprovals = stats['pendingApprovals'] as int? ?? 0;
                        final activeSos = stats['activeSosAlerts'] as int? ??
                            (_dashboardData!['alerts'] as List?)?.length ?? 0;
                        return Column(children: [
                          Row(children: [
                            _KpiCard(label: 'Đang trực', value: '$activeToday', color: AppColors.success),
                            const SizedBox(width: 8),
                            _KpiCard(label: 'Nhiệm vụ', value: '$pendingTasks', color: AppColors.navy),
                            const SizedBox(width: 8),
                            _KpiCard(label: 'Chờ duyệt', value: '$pendingApprovals', color: AppColors.warning),
                          ]),
                          if (activeSos > 0) ...[
                            const SizedBox(height: 8),
                            Row(children: [
                              _KpiCard(label: 'SOS khẩn', value: '$activeSos', color: AppColors.error),
                            ]),
                          ],
                        ]);
                      }),
                      const SizedBox(height: 16),
                      // Alerts
                      if ((_dashboardData!['alerts'] as List?)?.isNotEmpty == true) ...[
                        Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                          Text('CẢNH BÁO MỚI (${(_dashboardData!['alerts'] as List).length})',
                              style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13, color: AppColors.textSecondary)),
                          TextButton(onPressed: () => context.push(Routes.caAlerts), child: const Text('Xem tất cả →')),
                        ]),
                        ...(_dashboardData!['alerts'] as List).map((a) => _AlertTile(alert: a as Map<String, dynamic>)),
                        const SizedBox(height: 8),
                      ],
                      // Quick action row
                      const Text('TRUY CẬP NHANH', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13, color: AppColors.textSecondary)),
                      const SizedBox(height: 8),
                      Row(children: [
                        _QuickAction(
                          icon: Icons.verified_user_outlined,
                          label: 'Tuân thủ\nđơn vị',
                          color: AppColors.navy,
                          onTap: () => context.push(Routes.caCompliance),
                        ),
                        const SizedBox(width: 8),
                        _QuickAction(
                          icon: Icons.military_tech_outlined,
                          label: 'Quản lý\nhuấn luyện',
                          color: AppColors.warning,
                          onTap: () => context.push(Routes.caTrainingMgmt),
                        ),
                        const SizedBox(width: 8),
                        _QuickAction(
                          icon: Icons.how_to_vote_outlined,
                          label: 'Phê\nduyệt',
                          color: AppColors.success,
                          onTap: () => context.push(Routes.caApprovals),
                        ),
                      ]),
                      const SizedBox(height: 16),
                      // Tasks
                      Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                        const Text('NHIỆM VỤ HÔM NAY', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13, color: AppColors.textSecondary)),
                        TextButton(onPressed: () => context.push(Routes.caTaskCreate), child: const Text('Giao nhiệm vụ +')),
                      ]),
                      if ((_dashboardData!['tasks'] as List?)?.isEmpty != false)
                        const Card(child: Padding(padding: EdgeInsets.all(16), child: Text('Không có nhiệm vụ hôm nay', style: TextStyle(color: AppColors.textMuted))))
                      else
                        ...(_dashboardData!['tasks'] as List).take(3).map((t) => _TaskTile(task: t as Map<String, dynamic>)),
                    ],
                  ),
                ),
    );
  }
}

class _KpiCard extends StatelessWidget {
  final String label;
  final String value;
  final Color color;
  const _KpiCard({required this.label, required this.value, required this.color});

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

class _AlertTile extends StatelessWidget {
  final Map<String, dynamic> alert;
  const _AlertTile({required this.alert});

  @override
  Widget build(BuildContext context) {
    final severity = alert['severity'] as String? ?? 'info';
    final color = AppColors.severityColor(severity);
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        leading: CircleAvatar(radius: 16, backgroundColor: color.withOpacity(0.15),
            child: Icon(Icons.warning_outlined, color: color, size: 16)),
        title: Text(alert['title'] as String? ?? '', style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
        subtitle: Text(alert['message'] as String? ?? '', maxLines: 1, overflow: TextOverflow.ellipsis),
        trailing: const Icon(Icons.chevron_right),
      ),
    );
  }
}

class _QuickAction extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color color;
  final VoidCallback onTap;
  const _QuickAction({
    required this.icon,
    required this.label,
    required this.color,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: GestureDetector(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 8),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: AppColors.divider),
            boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.04), blurRadius: 6)],
          ),
          child: Column(
            children: [
              Container(
                width: 36,
                height: 36,
                decoration: BoxDecoration(
                  color: color.withOpacity(0.1),
                  shape: BoxShape.circle,
                ),
                child: Icon(icon, color: color, size: 18),
              ),
              const SizedBox(height: 6),
              Text(
                label,
                textAlign: TextAlign.center,
                style: const TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w600,
                  color: AppColors.textPrimary,
                  height: 1.3,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _TaskTile extends StatelessWidget {
  final Map<String, dynamic> task;
  const _TaskTile({required this.task});

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        title: Text(task['title'] as String? ?? '', style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
        subtitle: Text(task['code'] as String? ?? ''),
        trailing: Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
          decoration: BoxDecoration(
            color: AppColors.taskStatusColor(task['status'] as String? ?? '').withOpacity(0.12),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Text(
            AppColors.taskStatusLabel(task['status'] as String? ?? ''),
            style: TextStyle(fontSize: 11, color: AppColors.taskStatusColor(task['status'] as String? ?? '')),
          ),
        ),
      ),
    );
  }
}
