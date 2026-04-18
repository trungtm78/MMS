import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/api_constants.dart';
import '../../../shared/widgets/app_header.dart';
import '../../auth/providers/auth_provider.dart';

class DQTVListScreen extends ConsumerStatefulWidget {
  const DQTVListScreen({super.key});

  @override
  ConsumerState<DQTVListScreen> createState() => _DQTVListScreenState();
}

class _DQTVListScreenState extends ConsumerState<DQTVListScreen> {
  List<Map<String, dynamic>> _list = [];
  bool _loading = true;
  String _search = '';
  String _statusFilter = 'all';

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() { _loading = true; });
    try {
      final dio = ref.read(dioProvider);
      final params = <String, dynamic>{'role': 'militia'};
      if (_search.isNotEmpty) params['search'] = _search;
      final resp = await dio.get(ApiConstants.users, queryParameters: params);
      if (!mounted) return;
      setState(() {
        _list = List<Map<String, dynamic>>.from(resp.data['data'] as List? ?? []);
        _loading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() { _loading = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: const AppHeader(title: 'Quản lý DQTV', showBack: false),
      body: Column(children: [
        // Search bar
        Padding(
          padding: const EdgeInsets.all(16),
          child: TextField(
            decoration: const InputDecoration(
              hintText: 'Tìm kiếm theo tên, mã DQTV...',
              prefixIcon: Icon(Icons.search),
              filled: true,
              fillColor: Colors.white,
            ),
            onChanged: (v) {
              _search = v;
              // Debounce
              Future.delayed(const Duration(milliseconds: 500), () {
                if (_search == v) _load();
              });
            },
          ),
        ),
        // Filter chips
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: Row(children: [
            _FilterChip('Tất cả', 'all'),
            const SizedBox(width: 8),
            _FilterChip('Đang trực', 'online'),
            const SizedBox(width: 8),
            _FilterChip('Ngoại tuyến', 'offline'),
          ]),
        ),
        const SizedBox(height: 8),
        // List
        Expanded(
          child: _loading
              ? const Center(child: CircularProgressIndicator(color: AppColors.navy))
              : _list.isEmpty
                  ? const Center(child: Text('Không tìm thấy DQTV', style: TextStyle(color: AppColors.textSecondary)))
                  : RefreshIndicator(
                      onRefresh: _load,
                      child: ListView.builder(
                        padding: const EdgeInsets.symmetric(horizontal: 16),
                        itemCount: _list.length,
                        itemBuilder: (ctx, i) {
                          final m = _list[i];
                          final gpsStatus = m['gpsStatus'] as String? ?? 'offline';
                          final kpi = m['kpiScore'] as num?;
                          return Card(
                            margin: const EdgeInsets.only(bottom: 8),
                            child: ListTile(
                              leading: CircleAvatar(
                                backgroundColor: gpsStatus == 'online' ? AppColors.success : AppColors.textMuted,
                                child: Text(
                                  (m['fullName'] as String? ?? 'X').substring(0, 1),
                                  style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
                                ),
                              ),
                              title: Row(children: [
                                Expanded(child: Text(m['fullName'] as String? ?? '', style: const TextStyle(fontWeight: FontWeight.w700))),
                                Container(
                                  width: 10, height: 10,
                                  decoration: BoxDecoration(
                                    shape: BoxShape.circle,
                                    color: gpsStatus == 'online' ? AppColors.success : AppColors.textMuted,
                                  ),
                                ),
                              ]),
                              subtitle: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                                Text('${m['militiaCode'] ?? ''} · ${m['unitName'] ?? ''}'),
                                if (m['currentTask'] != null)
                                  Text(m['currentTask']['title'] as String? ?? '', style: const TextStyle(fontSize: 12, color: AppColors.blue)),
                              ]),
                              trailing: kpi != null
                                  ? Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                                      Text('KPI', style: const TextStyle(fontSize: 10, color: AppColors.textMuted)),
                                      Text('${kpi.toStringAsFixed(0)}',
                                          style: TextStyle(fontWeight: FontWeight.w700, color: AppColors.kpiScoreColor(kpi.toDouble()))),
                                    ])
                                  : null,
                              onTap: () => context.push('/ca/dqtv/${m['id']}'),
                            ),
                          );
                        },
                      ),
                    ),
        ),
      ]),
    );
  }

  Widget _FilterChip(String label, String value) {
    final selected = _statusFilter == value;
    return GestureDetector(
      onTap: () {
        setState(() { _statusFilter = value; });
        _load();
      },
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(
          color: selected ? AppColors.navy : Colors.white,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: selected ? AppColors.navy : AppColors.divider),
        ),
        child: Text(label, style: TextStyle(color: selected ? Colors.white : AppColors.textSecondary, fontSize: 13, fontWeight: FontWeight.w500)),
      ),
    );
  }
}
