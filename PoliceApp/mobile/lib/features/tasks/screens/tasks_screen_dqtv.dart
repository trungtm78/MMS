import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/api_constants.dart';
import '../../../shared/widgets/app_header.dart';
import '../../auth/providers/auth_provider.dart';

class MyTasksScreen extends ConsumerStatefulWidget {
  const MyTasksScreen({super.key});

  @override
  ConsumerState<MyTasksScreen> createState() => _MyTasksScreenState();
}

class _MyTasksScreenState extends ConsumerState<MyTasksScreen> with SingleTickerProviderStateMixin {
  late TabController _tabCtrl;
  List<Map<String, dynamic>> _all = [], _assigned = [], _inProgress = [], _completed = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _tabCtrl = TabController(length: 4, vsync: this);
    _load();
  }

  @override
  void dispose() { _tabCtrl.dispose(); super.dispose(); }

  Future<void> _load() async {
    setState(() { _loading = true; });
    try {
      final dio = ref.read(dioProvider);
      final resp = await dio.get(ApiConstants.tasks, queryParameters: {'limit': '50'});
      if (!mounted) return;
      final all = List<Map<String, dynamic>>.from(resp.data['data'] as List? ?? []);
      setState(() {
        _all = all;
        _assigned = all.where((t) => t['assignments'] is List && (t['assignments'] as List).isNotEmpty &&
            (t['assignments'] as List).first['status'] == 'assigned').toList();
        _inProgress = all.where((t) => t['assignments'] is List && (t['assignments'] as List).isNotEmpty &&
            ['accepted', 'in_progress'].contains((t['assignments'] as List).first['status'])).toList();
        _completed = all.where((t) => t['assignments'] is List && (t['assignments'] as List).isNotEmpty &&
            (t['assignments'] as List).first['status'] == 'completed').toList();
        _loading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() { _loading = false; });
    }
  }

  Widget _buildList(List<Map<String, dynamic>> tasks) {
    if (_loading) return const Center(child: CircularProgressIndicator(color: AppColors.navy));
    if (tasks.isEmpty) return const Center(child: Text('Không có nhiệm vụ', style: TextStyle(color: AppColors.textSecondary)));
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: tasks.length,
        itemBuilder: (ctx, i) {
          final task = tasks[i];
          final assignment = (task['assignments'] as List?)?.firstOrNull as Map<String, dynamic>?;
          final assignStatus = assignment?['status'] as String? ?? task['status'] as String? ?? 'pending';
          final progress = assignment?['progress'] as int? ?? 0;
          return Card(
            margin: const EdgeInsets.only(bottom: 10),
            child: InkWell(
              onTap: () => context.push('/dqtv/tasks/${task['id']}'),
              borderRadius: BorderRadius.circular(12),
              child: Padding(
                padding: const EdgeInsets.all(14),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Row(children: [
                    Expanded(child: Text(task['title'] as String? ?? '', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15))),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                      decoration: BoxDecoration(
                        color: AppColors.taskStatusColor(assignStatus).withOpacity(0.12),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Text(AppColors.taskStatusLabel(assignStatus),
                          style: TextStyle(fontSize: 11, color: AppColors.taskStatusColor(assignStatus), fontWeight: FontWeight.w600)),
                    ),
                  ]),
                  const SizedBox(height: 6),
                  Text('${task['code'] ?? ''}  •  Hạn: ${task['deadline']?.toString().substring(0, 10) ?? '-'}',
                      style: const TextStyle(color: AppColors.textSecondary, fontSize: 12)),
                  if (task['locationName'] != null) ...[
                    const SizedBox(height: 4),
                    Row(children: [
                      const Icon(Icons.location_on, size: 13, color: AppColors.textMuted),
                      const SizedBox(width: 4),
                      Text(task['locationName'] as String, style: const TextStyle(fontSize: 12, color: AppColors.textMuted)),
                    ]),
                  ],
                  if (progress > 0) ...[
                    const SizedBox(height: 8),
                    LinearProgressIndicator(
                      value: progress / 100,
                      backgroundColor: AppColors.divider,
                      valueColor: AlwaysStoppedAnimation(AppColors.navy),
                    ),
                    const SizedBox(height: 2),
                    Text('Tiến độ: $progress%', style: const TextStyle(fontSize: 11, color: AppColors.textSecondary)),
                  ],
                ]),
              ),
            ),
          );
        },
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: const AppHeader(title: 'Nhiệm vụ của tôi', showBack: false),
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
              Tab(text: 'Tất cả (${_all.length})'),
              Tab(text: 'Chờ nhận (${_assigned.length})'),
              Tab(text: 'Đang làm (${_inProgress.length})'),
              Tab(text: 'Hoàn thành (${_completed.length})'),
            ],
          ),
        ),
        Expanded(
          child: TabBarView(
            controller: _tabCtrl,
            children: [
              _buildList(_all),
              _buildList(_assigned),
              _buildList(_inProgress),
              _buildList(_completed),
            ],
          ),
        ),
      ]),
    );
  }
}
