import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/api_constants.dart';
import '../../../shared/widgets/app_header.dart';
import '../../auth/providers/auth_provider.dart';

class AlertsScreen extends ConsumerStatefulWidget {
  const AlertsScreen({super.key});

  @override
  ConsumerState<AlertsScreen> createState() => _AlertsScreenState();
}

class _AlertsScreenState extends ConsumerState<AlertsScreen> with SingleTickerProviderStateMixin {
  late TabController _tabCtrl;
  List<Map<String, dynamic>> _active = [], _resolved = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _tabCtrl = TabController(length: 2, vsync: this);
    _load();
  }

  @override
  void dispose() { _tabCtrl.dispose(); super.dispose(); }

  Future<void> _load() async {
    setState(() { _loading = true; });
    try {
      final dio = ref.read(dioProvider);
      final results = await Future.wait([
        dio.get(ApiConstants.sosList, queryParameters: {'status': 'active'}),
        dio.get(ApiConstants.sosList, queryParameters: {'status': 'resolved'}),
      ]);
      if (!mounted) return;
      setState(() {
        _active = List<Map<String, dynamic>>.from(results[0].data['data'] as List? ?? []);
        _resolved = List<Map<String, dynamic>>.from(results[1].data['data'] as List? ?? []);
        _loading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() { _loading = false; });
    }
  }

  Future<void> _resolve(String id) async {
    final noteCtrl = TextEditingController();
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Xử lý cảnh báo'),
        content: TextField(
          controller: noteCtrl,
          decoration: const InputDecoration(labelText: 'Ghi chú xử lý (tùy chọn)'),
          maxLines: 2,
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Hủy')),
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: ElevatedButton.styleFrom(backgroundColor: AppColors.navy),
            child: const Text('XÁC NHẬN'),
          ),
        ],
      ),
    );
    if (confirmed == true) {
      try {
        final dio = ref.read(dioProvider);
        final url = ApiConstants.sosResolve.replaceAll('{id}', id);
        await dio.patch(url, data: {'status': 'resolved', 'resolutionNote': noteCtrl.text.trim()});
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Đã xử lý cảnh báo'), backgroundColor: AppColors.success),
        );
        _load();
      } catch (e) {
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Lỗi: $e'), backgroundColor: AppColors.error),
        );
      }
    }
    noteCtrl.dispose();
  }

  Widget _buildList(List<Map<String, dynamic>> alerts, bool showAction) {
    if (_loading) return const Center(child: CircularProgressIndicator(color: AppColors.navy));
    if (alerts.isEmpty) return const Center(child: Text('Không có cảnh báo', style: TextStyle(color: AppColors.textSecondary)));
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: alerts.length,
        itemBuilder: (ctx, i) {
          final a = alerts[i];
          final severity = a['severity'] as String? ?? 'info';
          final color = AppColors.severityColor(severity);
          return Card(
            margin: const EdgeInsets.only(bottom: 10),
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Row(children: [
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                    decoration: BoxDecoration(color: color.withOpacity(0.12), borderRadius: BorderRadius.circular(12)),
                    child: Text(severity.toUpperCase(),
                        style: TextStyle(fontSize: 11, color: color, fontWeight: FontWeight.w700)),
                  ),
                  const SizedBox(width: 8),
                  Text(a['category'] as String? ?? '', style: const TextStyle(color: AppColors.textMuted, fontSize: 12)),
                  const Spacer(),
                  Text(
                    (a['createdAt'] as String? ?? '').isNotEmpty
                        ? (a['createdAt'] as String).substring(11, 16)
                        : '',
                    style: const TextStyle(color: AppColors.textMuted, fontSize: 12),
                  ),
                ]),
                const SizedBox(height: 8),
                Text(a['title'] as String? ?? '', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
                const SizedBox(height: 4),
                Text(a['message'] as String? ?? '', style: const TextStyle(color: AppColors.textSecondary, fontSize: 13)),
                if (showAction) ...[
                  const SizedBox(height: 10),
                  Align(
                    alignment: Alignment.centerRight,
                    child: ElevatedButton(
                      onPressed: () => _resolve(a['id'] as String),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppColors.navy,
                        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                      ),
                      child: const Text('XỬ LÝ', style: TextStyle(fontSize: 13)),
                    ),
                  ),
                ],
              ]),
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
      appBar: AppHeader(
        title: 'Cảnh báo',
        showBack: false,
        action: IconButton(icon: const Icon(Icons.refresh), onPressed: _load),
      ),
      body: Column(children: [
        Container(
          color: Colors.white,
          child: TabBar(
            controller: _tabCtrl,
            labelColor: AppColors.navy,
            unselectedLabelColor: AppColors.textSecondary,
            indicatorColor: AppColors.navy,
            tabs: [
              Tab(text: 'Chưa xử lý (${_active.length})'),
              const Tab(text: 'Đã xử lý'),
            ],
          ),
        ),
        Expanded(
          child: TabBarView(
            controller: _tabCtrl,
            children: [_buildList(_active, true), _buildList(_resolved, false)],
          ),
        ),
      ]),
    );
  }
}
