import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/constants/api_constants.dart';
import '../../../core/router/routes.dart';
import '../../../l10n/l10n.dart';
import '../../../shared/errors/app_failure.dart';
import '../../../shared/utils/json_number.dart';
import '../../../shared/widgets/app_header.dart';
import '../../../shared/widgets/app_logo.dart';
import '../../auth/providers/auth_provider.dart';
import '../../tasks/task_texts.dart';

/// One dashboard call: what it answered, or why it failed
typedef _Part<T> = ({T? value, AppFailure? failure});

/// A page of GET /tasks or GET /sos: the rows shown, the total, and the active alerts of the scope
typedef _Page = ({List<Map<String, dynamic>> rows, int total, int? active});

/// The dashboard calls are independent: each one failing only empties its own part, so a broken
/// secondary endpoint never hides the SOS alerts. Only when every call fails is there nothing to show.
class _Dashboard {
  const _Dashboard({
    required this.fullName,
    required this.tasks,
    required this.alerts,
    required this.onDuty,
    required this.stats,
  });

  final _Part<String> fullName;
  final _Part<_Page> tasks;
  final _Part<_Page> alerts;

  /// Members online or moving on GPS
  final _Part<int> onDuty;
  final _Part<Map<String, dynamic>> stats;

  List<AppFailure?> get _failures => [fullName.failure, tasks.failure, alerts.failure, onDuty.failure, stats.failure];

  bool get allFailed => _failures.every((failure) => failure != null);
}

Future<_Part<T>> _read<T>(Future<Response<dynamic>> request, T Function(Object? body) parse) async {
  try {
    return (value: parse((await request).data), failure: null);
  } catch (e) {
    return (value: null, failure: AppFailure.from(e));
  }
}

/// GET /users/me returns the profile itself (users.service.ts getProfile)
String _fullNameOf(Object? body) {
  if (body is! Map) throw const FormatException('GET /users/me: expected an object');
  final name = body['fullName'];
  return name is String ? name.trim() : '';
}

/// {data, total, page, limit} of GET /tasks; GET /sos adds counts {active, resolved}
_Page _pageOf(Object? body) {
  final rows = body is Map ? body['data'] : null;
  if (rows is! List) throw const FormatException('expected {data: [...]}');
  final page = body as Map;
  final list = rows.whereType<Map>().map((row) => Map<String, dynamic>.from(row)).toList();
  final counts = page['counts'];
  return (
    rows: list,
    total: jsonNumber(page['total'])?.toInt() ?? list.length,
    active: counts is Map ? jsonNumber(counts['active'])?.toInt() : null,
  );
}

/// GET /gps/live returns a plain array; a member is offline once the last position is over
/// 10 minutes old (gps.service.ts getLive)
int _onDutyOf(Object? body) {
  if (body is! List) throw const FormatException('GET /gps/live: expected a list');
  return body.whereType<Map>().where((m) => m['status'] == 'online' || m['status'] == 'moving').length;
}

/// GET /dashboard/stats: {totalMilitia, activeToday, pendingTasks, pendingApprovals, activeSosAlerts}
Map<String, dynamic> _statsOf(Object? body) {
  if (body is! Map) throw const FormatException('GET /dashboard/stats: expected an object');
  return Map<String, dynamic>.from(body);
}

class HomeCAScreen extends ConsumerStatefulWidget {
  const HomeCAScreen({super.key});

  @override
  ConsumerState<HomeCAScreen> createState() => _HomeCAScreenState();
}

class _HomeCAScreenState extends ConsumerState<HomeCAScreen> {
  _Dashboard? _data;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _loadDashboard();
  }

  Future<void> _loadDashboard() async {
    setState(() => _loading = true);
    final dio = ref.read(dioProvider);
    // Started together; each one fails on its own
    final fullName = _read(dio.get(ApiConstants.profile), _fullNameOf);
    // Tasks are created pending and stay so until accepted (tasks.service.ts createTask, acceptTask)
    final tasks = _read(dio.get(ApiConstants.tasks, queryParameters: {'status': 'pending', 'limit': 3}), _pageOf);
    final alerts = _read(dio.get(ApiConstants.sosList, queryParameters: {'status': 'active', 'limit': 3}), _pageOf);
    final onDuty = _read(dio.get(ApiConstants.gpsLive), _onDutyOf);
    final stats = _read(dio.get(ApiConstants.dashboardStats), _statsOf);
    final data = _Dashboard(
      fullName: await fullName,
      tasks: await tasks,
      alerts: await alerts,
      onDuty: await onDuty,
      stats: await stats,
    );
    if (!mounted) return;
    setState(() {
      _data = data;
      _loading = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final data = _data;
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppHeader(
        title: l10n.homeCaTitle,
        showBack: false,
        action: IconButton(
          tooltip: l10n.homeCaNotificationsTooltip,
          icon: const Icon(Icons.notifications_outlined),
          onPressed: () => context.push(Routes.caNotifications),
        ),
      ),
      body: _loading || data == null
          ? const Center(child: CircularProgressIndicator(color: AppColors.navy))
          : data.allFailed
              ? Center(
                  child: Column(mainAxisSize: MainAxisSize.min, children: [
                    const Icon(Icons.error_outline, color: AppColors.error, size: 48),
                    const SizedBox(height: 8),
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 24),
                      child: Text(l10n.homeCaLoadFailed(failureText(l10n, data.fullName.failure!)),
                          textAlign: TextAlign.center),
                    ),
                    const SizedBox(height: 8),
                    ElevatedButton(onPressed: _loadDashboard, child: Text(l10n.commonRetry)),
                  ]),
                )
              : RefreshIndicator(
                  onRefresh: _loadDashboard,
                  child: ListView(
                    padding: const EdgeInsets.all(16),
                    children: [
                      _buildGreeting(l10n, data),
                      const SizedBox(height: 16),
                      _buildCounters(l10n, data),
                      const SizedBox(height: 16),
                      ..._buildAlerts(l10n, data),
                      Text(l10n.homeCaQuickTitle, style: _sectionStyle),
                      const SizedBox(height: 8),
                      Row(children: [
                        _QuickAction(
                          icon: Icons.verified_user_outlined,
                          label: l10n.homeCaQuickCompliance,
                          color: AppColors.navy,
                          onTap: () => context.push(Routes.caCompliance),
                        ),
                        const SizedBox(width: 8),
                        _QuickAction(
                          icon: Icons.military_tech_outlined,
                          label: l10n.homeCaQuickTraining,
                          color: AppColors.warning,
                          onTap: () => context.push(Routes.caTrainingMgmt),
                        ),
                        const SizedBox(width: 8),
                        _QuickAction(
                          icon: Icons.how_to_vote_outlined,
                          label: l10n.homeCaQuickApprovals,
                          color: AppColors.success,
                          onTap: () => context.push(Routes.caApprovals),
                        ),
                      ]),
                      const SizedBox(height: 16),
                      ..._buildTasks(l10n, data),
                    ],
                  ),
                ),
    );
  }

  static const _sectionStyle = TextStyle(fontWeight: FontWeight.w700, fontSize: 13, color: AppColors.textSecondary);

  Widget _buildGreeting(AppLocalizations l10n, _Dashboard data) {
    final name = data.fullName.value ?? '';
    final today = DateFormat('EEEE, dd/MM/yyyy', l10n.localeName).format(DateTime.now());
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(children: [
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(name.isEmpty ? l10n.homeCaGreetingAnonymous : l10n.homeCaGreeting(name),
                  style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
              const SizedBox(height: 4),
              Text(today, style: const TextStyle(color: AppColors.textSecondary, fontSize: 13)),
            ]),
          ),
          const AppLogo(height: 56),
        ]),
      ),
    );
  }

  Widget _buildCounters(AppLocalizations l10n, _Dashboard data) {
    final stats = data.stats.value;
    // Counters are numbers or numeric strings
    int? stat(String key) => jsonNumber(stats?[key])?.toInt();
    // The stats first (dashboard.service.ts getStats); without them, what the lists tell
    final onDuty = stat('activeToday') ?? data.onDuty.value;
    final pendingTasks = stat('pendingTasks') ?? data.tasks.value?.total;
    final approvals = stat('pendingApprovals');
    // The active alerts of the scope, counted as the alerts screen counts them
    final activeSos = data.alerts.value?.active ?? stat('activeSosAlerts');
    String show(int? value) => value == null ? '-' : '$value';
    final statsFailure = data.stats.failure;
    return Column(children: [
      Row(children: [
        _KpiCard(label: l10n.homeCaKpiOnDuty, value: show(onDuty), color: AppColors.success),
        const SizedBox(width: 8),
        _KpiCard(label: l10n.homeCaKpiTasks, value: show(pendingTasks), color: AppColors.navy),
        const SizedBox(width: 8),
        _KpiCard(label: l10n.homeCaKpiApprovals, value: show(approvals), color: AppColors.warning),
      ]),
      if ((activeSos ?? 0) > 0) ...[
        const SizedBox(height: 8),
        Row(children: [
          _KpiCard(label: l10n.homeCaKpiSos, value: show(activeSos), color: AppColors.error),
        ]),
      ],
      if (statsFailure != null) ...[
        const SizedBox(height: 8),
        Text(l10n.homeCaStatsFailed(failureText(l10n, statsFailure)),
            style: const TextStyle(color: AppColors.error, fontSize: 12)),
      ],
    ]);
  }

  List<Widget> _buildAlerts(AppLocalizations l10n, _Dashboard data) {
    final failure = data.alerts.failure;
    if (failure != null) {
      return [
        _SectionFailure(message: l10n.homeCaAlertsFailed(failureText(l10n, failure)), onRetry: _loadDashboard),
        const SizedBox(height: 8),
      ];
    }
    final page = data.alerts.value!;
    if (page.rows.isEmpty) return const [];
    return [
      Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
        Text(l10n.homeCaAlertsTitle(page.active ?? page.total), style: _sectionStyle),
        TextButton(onPressed: () => context.push(Routes.caAlerts), child: Text(l10n.homeCaSeeAll)),
      ]),
      for (final alert in page.rows) _AlertTile(alert: alert, onTap: () => context.push(Routes.caAlerts)),
      const SizedBox(height: 8),
    ];
  }

  List<Widget> _buildTasks(AppLocalizations l10n, _Dashboard data) {
    final failure = data.tasks.failure;
    final rows = data.tasks.value?.rows ?? const <Map<String, dynamic>>[];
    return [
      Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
        Text(l10n.homeCaTasksTitle, style: _sectionStyle),
        TextButton(onPressed: () => context.push(Routes.caTaskCreate), child: Text(l10n.homeCaTasksCreate)),
      ]),
      if (failure != null)
        _SectionFailure(message: l10n.homeCaTasksFailed(failureText(l10n, failure)), onRetry: _loadDashboard)
      else if (rows.isEmpty)
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Text(l10n.homeCaTasksEmpty, style: const TextStyle(color: AppColors.textMuted)),
          ),
        )
      else
        for (final task in rows) _TaskTile(task: task),
    ];
  }
}

class _SectionFailure extends StatelessWidget {
  const _SectionFailure({required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) => Card(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 8, 8),
          child: Row(children: [
            Expanded(child: Text(message, style: const TextStyle(color: AppColors.error, fontSize: 13))),
            TextButton(onPressed: onRetry, child: Text(context.l10n.commonRetry)),
          ]),
        ),
      );
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
  final VoidCallback onTap;
  const _AlertTile({required this.alert, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final color = AppColors.severityColor(alert['severity'] as String? ?? '');
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        onTap: onTap,
        leading: CircleAvatar(
            radius: 16,
            backgroundColor: color.withValues(alpha: 0.15),
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
            boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.04), blurRadius: 6)],
          ),
          child: Column(
            children: [
              Container(
                width: 36,
                height: 36,
                decoration: BoxDecoration(
                  color: color.withValues(alpha: 0.1),
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
    final l10n = context.l10n;
    final status = task['status'] as String? ?? '';
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        title: Text(task['title'] as String? ?? '', style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
        subtitle: Text(task['code'] as String? ?? ''),
        trailing: Row(mainAxisSize: MainAxisSize.min, children: [
          // Open past its deadline, whatever the stored status says
          if (task['overdue'] == true && status != 'overdue') ...[
            _Chip(text: l10n.tasksStatusOverdue, color: AppColors.error),
            const SizedBox(width: 4),
          ],
          _Chip(text: taskStatusText(l10n, status), color: AppColors.taskStatusColor(status)),
        ]),
      ),
    );
  }
}

class _Chip extends StatelessWidget {
  const _Chip({required this.text, required this.color});

  final String text;
  final Color color;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
        decoration: BoxDecoration(color: color.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(12)),
        child: Text(text, style: TextStyle(fontSize: 11, color: color)),
      );
}
