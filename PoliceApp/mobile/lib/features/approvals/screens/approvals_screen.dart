import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/api_constants.dart';
import '../../../shared/widgets/app_header.dart';
import '../../../shared/widgets/status_badge.dart';
import '../../auth/providers/auth_provider.dart';

class ApprovalsScreen extends ConsumerStatefulWidget {
  const ApprovalsScreen({super.key});

  @override
  ConsumerState<ApprovalsScreen> createState() => _ApprovalsScreenState();
}

class _ApprovalsScreenState extends ConsumerState<ApprovalsScreen> with SingleTickerProviderStateMixin {
  late TabController _tabCtrl;
  List<Map<String, dynamic>> _pending = [], _approved = [], _rejected = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _tabCtrl = TabController(length: 3, vsync: this);
    _load();
  }

  @override
  void dispose() { _tabCtrl.dispose(); super.dispose(); }

  Future<void> _load() async {
    setState(() { _loading = true; });
    try {
      final dio = ref.read(dioProvider);
      final results = await Future.wait([
        dio.get(ApiConstants.leaveRequests, queryParameters: {'status': 'pending'}),
        dio.get(ApiConstants.leaveRequests, queryParameters: {'status': 'approved'}),
        dio.get(ApiConstants.leaveRequests, queryParameters: {'status': 'rejected'}),
      ]);
      if (!mounted) return;
      setState(() {
        _pending = List<Map<String, dynamic>>.from(results[0].data['data'] as List? ?? []);
        _approved = List<Map<String, dynamic>>.from(results[1].data['data'] as List? ?? []);
        _rejected = List<Map<String, dynamic>>.from(results[2].data['data'] as List? ?? []);
        _loading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() { _loading = false; });
    }
  }

  Future<void> _decide(String id, String action, {String? reason}) async {
    try {
      final dio = ref.read(dioProvider);
      final url = ApiConstants.leaveDecision.replaceAll('{id}', id);
      await dio.post(url, data: {'action': action, if (reason != null) 'reason': reason});
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(action == 'approved' ? 'Đã duyệt đơn' : 'Đã từ chối đơn'),
            backgroundColor: action == 'approved' ? AppColors.success : AppColors.error),
      );
      _load();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Lỗi: $e'), backgroundColor: AppColors.error),
      );
    }
  }

  Future<void> _showRejectDialog(String id) async {
    final reasonCtrl = TextEditingController();
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Từ chối đơn nghỉ phép'),
        content: TextField(
          controller: reasonCtrl,
          decoration: const InputDecoration(labelText: 'Lý do từ chối *', hintText: 'Nhập lý do...'),
          maxLines: 3,
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Hủy')),
          ElevatedButton(
            onPressed: () {
              if (reasonCtrl.text.trim().isEmpty) {
                ScaffoldMessenger.of(ctx).showSnackBar(
                  const SnackBar(content: Text('Vui lòng nhập lý do từ chối')),
                );
                return;
              }
              Navigator.pop(ctx, true);
            },
            style: ElevatedButton.styleFrom(backgroundColor: AppColors.error),
            child: const Text('XÁC NHẬN'),
          ),
        ],
      ),
    );
    if (confirmed == true) {
      await _decide(id, 'rejected', reason: reasonCtrl.text.trim());
    }
    reasonCtrl.dispose();
  }

  Widget _buildList(List<Map<String, dynamic>> list, bool showActions) {
    if (_loading) return const Center(child: CircularProgressIndicator(color: AppColors.navy));
    if (list.isEmpty) return const Center(child: Text('Không có dữ liệu', style: TextStyle(color: AppColors.textSecondary)));
    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: list.length,
      itemBuilder: (ctx, i) {
        final req = list[i];
        return Card(
          margin: const EdgeInsets.only(bottom: 12),
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                Expanded(child: Text(req['requesterName'] as String? ?? '', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15))),
                Text(req['code'] as String? ?? '', style: const TextStyle(color: AppColors.textMuted, fontSize: 12)),
              ]),
              const SizedBox(height: 6),
              Text('${req['leaveType']?['name'] ?? ''}  •  ${req['fromDate']} → ${req['toDate']} (${req['totalDays']} ngày)',
                  style: const TextStyle(color: AppColors.textSecondary, fontSize: 13)),
              const SizedBox(height: 4),
              Text('Lý do: ${req['reason'] ?? ''}', style: const TextStyle(fontSize: 13)),
              if (showActions) ...[
                const SizedBox(height: 12),
                Row(children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: () => _showRejectDialog(req['id'] as String),
                      style: OutlinedButton.styleFrom(side: const BorderSide(color: AppColors.error), foregroundColor: AppColors.error),
                      child: const Text('TỪ CHỐI'),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: ElevatedButton(
                      onPressed: () => _decide(req['id'] as String, 'approved'),
                      style: ElevatedButton.styleFrom(backgroundColor: AppColors.tertiary),
                      child: const Text('DUYỆT'),
                    ),
                  ),
                ]),
              ] else
                Align(alignment: Alignment.centerRight, child: StatusBadge.leave(req['status'] as String? ?? 'pending')),
            ]),
          ),
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppHeader(
        title: 'Duyệt đơn nghỉ phép',
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
              Tab(text: 'Chờ duyệt (${_pending.length})'),
              Tab(text: 'Đã duyệt'),
              Tab(text: 'Từ chối'),
            ],
          ),
        ),
        Expanded(
          child: TabBarView(
            controller: _tabCtrl,
            children: [
              _buildList(_pending, true),
              _buildList(_approved, false),
              _buildList(_rejected, false),
            ],
          ),
        ),
      ]),
    );
  }
}
