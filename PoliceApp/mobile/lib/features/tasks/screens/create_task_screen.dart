import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/constants/api_constants.dart';
import '../../../shared/widgets/app_header.dart';
import '../../auth/providers/auth_provider.dart';

class CreateTaskScreen extends ConsumerStatefulWidget {
  const CreateTaskScreen({super.key});

  @override
  ConsumerState<CreateTaskScreen> createState() => _CreateTaskScreenState();
}

class _CreateTaskScreenState extends ConsumerState<CreateTaskScreen> {
  final _formKey = GlobalKey<FormState>();
  final _titleCtrl = TextEditingController();
  final _descCtrl = TextEditingController();
  final _locationCtrl = TextEditingController();

  List<Map<String, dynamic>> _militiaUsers = [];
  String? _selectedUserId;
  String _priority = 'normal';
  DateTime? _dueDate;
  bool _loading = false;
  bool _loadingUsers = true;

  final _priorityOptions = ['low', 'normal', 'high', 'urgent'];
  final _priorityLabels = {
    'low': 'Thấp', 'normal': 'Bình thường', 'high': 'Cao', 'urgent': 'Khẩn cấp',
  };

  @override
  void initState() {
    super.initState();
    _loadUsers();
  }

  @override
  void dispose() {
    _titleCtrl.dispose();
    _descCtrl.dispose();
    _locationCtrl.dispose();
    super.dispose();
  }

  Future<void> _loadUsers() async {
    try {
      final dio = ref.read(dioProvider);
      final resp = await dio.get(ApiConstants.users, queryParameters: {'role': 'militia'});
      final data = resp.data['data'];
      if (data is List) {
        setState(() { _militiaUsers = List<Map<String, dynamic>>.from(data); _loadingUsers = false; });
      } else {
        setState(() { _loadingUsers = false; });
      }
    } catch (_) {
      setState(() { _loadingUsers = false; });
    }
  }

  Future<void> _pickDueDate() async {
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: _dueDate ?? now.add(const Duration(days: 1)),
      firstDate: now,
      lastDate: now.add(const Duration(days: 365)),
    );
    if (picked != null) {
      final time = await showTimePicker(
        context: context,
        initialTime: TimeOfDay.fromDateTime(_dueDate ?? now.add(const Duration(hours: 1))),
      );
      if (time != null && mounted) {
        setState(() {
          _dueDate = DateTime(picked.year, picked.month, picked.day, time.hour, time.minute);
        });
      }
    }
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() { _loading = true; });
    try {
      final dio = ref.read(dioProvider);
      final body = <String, dynamic>{
        'title': _titleCtrl.text.trim(),
        'description': _descCtrl.text.trim(),
        'priority': _priority,
        if (_locationCtrl.text.trim().isNotEmpty) 'location': _locationCtrl.text.trim(),
        if (_dueDate != null) 'dueDate': _dueDate!.toIso8601String(),
        if (_selectedUserId != null) 'assigneeId': _selectedUserId,
      };
      await dio.post(ApiConstants.tasks, data: body);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Đã tạo nhiệm vụ thành công'), backgroundColor: AppColors.success),
      );
      context.pop();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Lỗi tạo nhiệm vụ'), backgroundColor: AppColors.error),
      );
    } finally {
      if (mounted) setState(() { _loading = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppHeader(title: 'Giao nhiệm vụ', showBack: true),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            // Title
            _SectionLabel('Tiêu đề nhiệm vụ *'),
            TextFormField(
              controller: _titleCtrl,
              decoration: const InputDecoration(hintText: 'Nhập tiêu đề...'),
              validator: (v) => (v == null || v.trim().isEmpty) ? 'Bắt buộc nhập tiêu đề' : null,
              maxLength: 200,
              textInputAction: TextInputAction.next,
            ),
            const SizedBox(height: 12),

            // Description
            _SectionLabel('Mô tả'),
            TextFormField(
              controller: _descCtrl,
              decoration: const InputDecoration(hintText: 'Mô tả chi tiết nhiệm vụ...'),
              maxLines: 3,
              maxLength: 1000,
              textInputAction: TextInputAction.next,
            ),
            const SizedBox(height: 12),

            // Location
            _SectionLabel('Địa điểm'),
            TextFormField(
              controller: _locationCtrl,
              decoration: const InputDecoration(
                hintText: 'Địa điểm thực hiện...',
                prefixIcon: Icon(Icons.location_on_outlined),
              ),
              textInputAction: TextInputAction.next,
            ),
            const SizedBox(height: 12),

            // Priority
            _SectionLabel('Mức độ ưu tiên'),
            DropdownButtonFormField<String>(
              value: _priority,
              decoration: const InputDecoration(),
              items: _priorityOptions.map((p) => DropdownMenuItem(
                value: p,
                child: Row(children: [
                  Icon(_priorityIcon(p), size: 16, color: _priorityColor(p)),
                  const SizedBox(width: 8),
                  Text(_priorityLabels[p] ?? p),
                ]),
              )).toList(),
              onChanged: (v) => setState(() => _priority = v ?? 'normal'),
            ),
            const SizedBox(height: 12),

            // Due date
            _SectionLabel('Hạn hoàn thành'),
            InkWell(
              onTap: _pickDueDate,
              child: InputDecorator(
                decoration: const InputDecoration(
                  prefixIcon: Icon(Icons.calendar_today_outlined),
                  suffixIcon: Icon(Icons.chevron_right),
                ),
                child: Text(
                  _dueDate != null
                      ? DateFormat('dd/MM/yyyy HH:mm').format(_dueDate!)
                      : 'Chọn ngày giờ...',
                  style: TextStyle(color: _dueDate != null ? AppColors.textPrimary : AppColors.textMuted),
                ),
              ),
            ),
            const SizedBox(height: 12),

            // Assignee
            _SectionLabel('Giao cho DQTV'),
            _loadingUsers
                ? const Center(child: CircularProgressIndicator(color: AppColors.navy))
                : DropdownButtonFormField<String>(
                    value: _selectedUserId,
                    decoration: const InputDecoration(hintText: 'Chọn DQTV (tùy chọn)'),
                    items: [
                      const DropdownMenuItem(value: null, child: Text('Chưa giao')),
                      ..._militiaUsers.map((u) => DropdownMenuItem(
                        value: u['id'] as String?,
                        child: Text(u['fullName'] as String? ?? u['username'] as String? ?? ''),
                      )),
                    ],
                    onChanged: (v) => setState(() => _selectedUserId = v),
                  ),
            const SizedBox(height: 24),

            SizedBox(
              width: double.infinity,
              height: 50,
              child: ElevatedButton.icon(
                onPressed: _loading ? null : _submit,
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.navy,
                  foregroundColor: Colors.white,
                ),
                icon: _loading
                    ? const SizedBox(width: 16, height: 16,
                        child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                    : const Icon(Icons.assignment_turned_in_outlined),
                label: Text(_loading ? 'Đang giao...' : 'GIAO NHIỆM VỤ',
                    style: const TextStyle(fontWeight: FontWeight.w700)),
              ),
            ),
            const SizedBox(height: 16),
          ],
        ),
      ),
    );
  }

  IconData _priorityIcon(String p) {
    switch (p) {
      case 'urgent': return Icons.priority_high;
      case 'high': return Icons.arrow_upward;
      case 'low': return Icons.arrow_downward;
      default: return Icons.remove;
    }
  }

  Color _priorityColor(String p) {
    switch (p) {
      case 'urgent': return AppColors.error;
      case 'high': return AppColors.warning;
      case 'low': return AppColors.textMuted;
      default: return AppColors.navy;
    }
  }
}

class _SectionLabel extends StatelessWidget {
  final String text;
  const _SectionLabel(this.text);
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 6),
        child: Text(text, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
      );
}
