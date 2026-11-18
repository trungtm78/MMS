import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/constants/api_constants.dart';
import '../../../l10n/l10n.dart';
import '../../../shared/errors/app_failure.dart';
import '../../../shared/widgets/app_header.dart';
import '../../auth/providers/auth_provider.dart';
import '../models/task_status.dart';
import '../task_texts.dart';

class MyTasksScreen extends ConsumerStatefulWidget {
  const MyTasksScreen({super.key});

  @override
  ConsumerState<MyTasksScreen> createState() => _MyTasksScreenState();
}

class _MyTasksScreenState extends ConsumerState<MyTasksScreen> with SingleTickerProviderStateMixin {
  late final TabController _tabCtrl = TabController(length: 4, vsync: this);
  List<Map<String, dynamic>> _all = [];
  bool _loading = true;
  AppFailure? _failure;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _tabCtrl.dispose();
    super.dispose();
  }

  /// GET /tasks: one row per task of the caller's scope (tasks.service.ts listTasksPaginated)
  Future<void> _load() async {
    setState(() {
      _loading = true;
      _failure = null;
    });
    try {
      final resp = await ref.read(dioProvider).get(ApiConstants.tasks, queryParameters: {'limit': 50});
      final body = resp.data;
      final rows = body is Map ? body['data'] : null;
      if (rows is! List) throw const FormatException('GET /tasks: expected {data: [...]}');
      if (!mounted) return;
      setState(() {
        _all = rows.whereType<Map>().map((row) => Map<String, dynamic>.from(row)).toList();
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _failure = AppFailure.from(e);
        _loading = false;
      });
    }
  }

  List<Map<String, dynamic>> _where(bool Function(String status) test) =>
      _all.where((task) => test(task['status'] as String? ?? '')).toList();

  Widget _buildList(AppLocalizations l10n, List<Map<String, dynamic>> tasks) {
    if (_loading) return const Center(child: CircularProgressIndicator(color: AppColors.navy));
    if (tasks.isEmpty) {
      return Center(child: Text(l10n.tasksMyListEmpty, style: const TextStyle(color: AppColors.textSecondary)));
    }
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: tasks.length,
        itemBuilder: (ctx, i) => _TaskCard(task: tasks[i]),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final toAccept = _where(acceptableTaskStatuses.contains);
    final inProgress = _where((status) => status == 'in_progress');
    final completed = _where((status) => status == 'completed');
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppHeader(title: l10n.tasksMyListTitle, showBack: false),
      body: Column(children: [
        Container(
          color: Colors.white,
          child: TabBar(
            controller: _tabCtrl,
            isScrollable: true,
            labelColor: AppColors.navy,
            unselectedLabelColor: AppColors.textSecondary,
            indicatorColor: AppColors.navy,
            tabs: [
              Tab(text: l10n.tasksMyListTabAll(_all.length)),
              Tab(text: l10n.tasksMyListTabToAccept(toAccept.length)),
              Tab(text: l10n.tasksMyListTabInProgress(inProgress.length)),
              Tab(text: l10n.tasksMyListTabCompleted(completed.length)),
            ],
          ),
        ),
        Expanded(
          child: _failure != null
              ? Center(
                  child: Column(mainAxisSize: MainAxisSize.min, children: [
                    const Icon(Icons.error_outline, color: AppColors.error, size: 48),
                    const SizedBox(height: 8),
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 24),
                      child: Text(l10n.tasksMyListLoadFailed(failureText(l10n, _failure!)),
                          textAlign: TextAlign.center),
                    ),
                    ElevatedButton(onPressed: _load, child: Text(l10n.commonRetry)),
                  ]),
                )
              : TabBarView(
                  controller: _tabCtrl,
                  children: [
                    _buildList(l10n, _all),
                    _buildList(l10n, toAccept),
                    _buildList(l10n, inProgress),
                    _buildList(l10n, completed),
                  ],
                ),
        ),
      ]),
    );
  }
}

class _TaskCard extends StatelessWidget {
  const _TaskCard({required this.task});

  final Map<String, dynamic> task;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final status = task['status'] as String? ?? '';
    final color = AppColors.taskStatusColor(status);
    final deadline = DateTime.tryParse('${task['deadline'] ?? ''}');
    final location = task['locationName'];
    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      child: InkWell(
        onTap: () => context.push('/dqtv/tasks/${task['id']}'),
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              Expanded(
                child: Text(task['title'] as String? ?? '',
                    style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
              ),
              _Chip(text: taskStatusText(l10n, status), color: color),
              // Open past its deadline, whatever the stored status says
              if (task['overdue'] == true && status != 'overdue') ...[
                const SizedBox(width: 6),
                _Chip(text: l10n.tasksStatusOverdue, color: AppColors.error),
              ],
            ]),
            const SizedBox(height: 6),
            Text(
              '${task['code'] ?? ''}  •  '
              '${l10n.tasksMyListDeadline(deadline == null ? '-' : DateFormat('dd/MM/yyyy').format(deadline.toLocal()))}',
              style: const TextStyle(color: AppColors.textSecondary, fontSize: 12),
            ),
            if (location is String && location.isNotEmpty) ...[
              const SizedBox(height: 4),
              Row(children: [
                const Icon(Icons.location_on, size: 13, color: AppColors.textMuted),
                const SizedBox(width: 4),
                Text(location, style: const TextStyle(fontSize: 12, color: AppColors.textMuted)),
              ]),
            ],
          ]),
        ),
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
        child: Text(text, style: TextStyle(fontSize: 11, color: color, fontWeight: FontWeight.w600)),
      );
}
