import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/constants/api_constants.dart';
import '../../../core/network/dio_client.dart';
import '../../auth/providers/auth_provider.dart';

class LeaveRequestScreen extends ConsumerStatefulWidget {
  const LeaveRequestScreen({super.key});

  @override
  ConsumerState<LeaveRequestScreen> createState() => _LeaveRequestScreenState();
}

class _LeaveRequestScreenState extends ConsumerState<LeaveRequestScreen> {
  String _leaveType = '';
  DateTime? _fromDate;
  DateTime? _toDate;
  final _reasonCtrl = TextEditingController();
  bool _halfDay = false;
  bool _loading = false;
  bool _showSuccess = false;

  static const _leaveTypes = [
    ('paid', '🏖️', 'Nghỉ phép có lương', '12 ngày còn lại'),
    ('sick', '🏥', 'Nghỉ ốm', 'Cần giấy xác nhận bác sĩ'),
    ('family', '👨‍👩‍👧', 'Nghỉ việc gia đình', '3 ngày còn lại/năm'),
    ('unpaid', '💼', 'Nghỉ không lương', 'Không giới hạn'),
  ];

  int get _days {
    if (_fromDate == null || _toDate == null) return 0;
    return _toDate!.difference(_fromDate!).inDays + 1;
  }

  bool get _isValid =>
      _leaveType.isNotEmpty && _fromDate != null && _toDate != null && _reasonCtrl.text.length >= 20;

  @override
  void dispose() {
    _reasonCtrl.dispose();
    super.dispose();
  }

  Future<void> _pickDate(bool isFrom) async {
    final d = await showDatePicker(
      context: context,
      initialDate: DateTime.now(),
      firstDate: DateTime.now(),
      lastDate: DateTime.now().add(const Duration(days: 365)),
      builder: (context, child) => Theme(
        data: ThemeData.light().copyWith(
          colorScheme: const ColorScheme.light(primary: AppColors.navy),
        ),
        child: child!,
      ),
    );
    if (d != null && mounted) {
      setState(() {
        if (isFrom) _fromDate = d; else _toDate = d;
      });
    }
  }

  Future<void> _submit() async {
    if (!_isValid) return;
    setState(() => _loading = true);
    try {
      final storage = ref.read(secureStorageProvider);
      final dio = DioClient.getInstance(storage);
      await dio.post(ApiConstants.leaveRequest, data: {
        'type': _leaveType,
        'fromDate': _fromDate!.toIso8601String(),
        'toDate': _toDate!.toIso8601String(),
        'reason': _reasonCtrl.text.trim(),
      });
      if (mounted) {
        setState(() { _loading = false; _showSuccess = true; });
        await Future.delayed(const Duration(milliseconds: 2500));
        if (mounted) context.pop();
      }
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    // Success overlay
    if (_showSuccess) {
      return Scaffold(
        backgroundColor: AppColors.background,
        body: SafeArea(
          child: Center(
            child: Container(
              margin: const EdgeInsets.all(32),
              padding: const EdgeInsets.all(32),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(20),
                boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.1), blurRadius: 20)],
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Container(
                    width: 80, height: 80,
                    decoration: const BoxDecoration(color: AppColors.success, shape: BoxShape.circle),
                    child: const Icon(Icons.check_circle, color: Colors.white, size: 48),
                  ),
                  const SizedBox(height: 16),
                  const Text('Đã gửi đơn thành công!',
                    style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold, color: AppColors.success)),
                  const SizedBox(height: 8),
                  const Text('Mã đơn: NP-2024-001',
                    style: TextStyle(color: AppColors.textSecondary)),
                  const SizedBox(height: 4),
                  const Text('Chờ phê duyệt',
                    style: TextStyle(fontSize: 13, color: AppColors.textSecondary)),
                  const SizedBox(height: 4),
                  const Text('Thời gian phản hồi: 1-2 ngày làm việc',
                    style: TextStyle(fontSize: 12, color: AppColors.textMuted)),
                ],
              ),
            ),
          ),
        ),
      );
    }

    return Scaffold(
      backgroundColor: AppColors.background,
      body: Column(
        children: [
          // ── Navy Header ────────────────────────────────────────────────────
          Container(
            color: AppColors.navy,
            child: SafeArea(
              bottom: false,
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                child: Row(
                  children: [
                    GestureDetector(
                      onTap: () => context.pop(),
                      child: Container(
                        padding: const EdgeInsets.all(8),
                        decoration: BoxDecoration(
                          color: Colors.white.withOpacity(0.1),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: const Icon(Icons.arrow_back, color: Colors.white, size: 20),
                      ),
                    ),
                    const SizedBox(width: 12),
                    const Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('Đăng Ký Nghỉ Phép',
                            style: TextStyle(color: Colors.white, fontSize: 17, fontWeight: FontWeight.bold)),
                          Text('Gửi đơn xin nghỉ & chọn người thay thế',
                            style: TextStyle(color: Colors.white70, fontSize: 12)),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),

          // ── Form ───────────────────────────────────────────────────────────
          Expanded(
            child: SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 100),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  // Leave type selector
                  _SectionCard(
                    title: 'Loại nghỉ phép',
                    child: Column(
                      children: _leaveTypes.map((t) {
                        final selected = _leaveType == t.$1;
                        return GestureDetector(
                          onTap: () => setState(() => _leaveType = t.$1),
                          child: Container(
                            margin: const EdgeInsets.only(bottom: 8),
                            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
                            decoration: BoxDecoration(
                              color: selected ? AppColors.cardBlueLight : Colors.white,
                              border: Border.all(
                                color: selected ? AppColors.navy : AppColors.divider,
                                width: 2,
                              ),
                              borderRadius: BorderRadius.circular(12),
                            ),
                            child: Row(
                              children: [
                                Text(t.$2, style: const TextStyle(fontSize: 22)),
                                const SizedBox(width: 12),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text(t.$3,
                                        style: TextStyle(
                                          fontWeight: FontWeight.w600,
                                          fontSize: 13,
                                          color: selected ? AppColors.navy : AppColors.textPrimary,
                                        )),
                                      Text(t.$4,
                                        style: const TextStyle(fontSize: 11, color: AppColors.textSecondary)),
                                    ],
                                  ),
                                ),
                                if (selected)
                                  const Icon(Icons.check_circle, color: AppColors.navy, size: 20),
                              ],
                            ),
                          ),
                        );
                      }).toList(),
                    ),
                  ),
                  const SizedBox(height: 12),

                  // Duration
                  _SectionCard(
                    title: 'Thời gian',
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Row(
                          children: [
                            Expanded(child: _DatePicker(
                              label: 'Từ ngày',
                              date: _fromDate,
                              onTap: () => _pickDate(true),
                            )),
                            const SizedBox(width: 12),
                            Expanded(child: _DatePicker(
                              label: 'Đến ngày',
                              date: _toDate,
                              onTap: () => _pickDate(false),
                            )),
                          ],
                        ),
                        if (_days > 0) ...[
                          const SizedBox(height: 10),
                          Container(
                            padding: const EdgeInsets.all(10),
                            decoration: BoxDecoration(
                              color: AppColors.cardBlueLight,
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: Text(
                              'Tổng số ngày: ${_halfDay ? 0.5 : _days} ngày',
                              style: const TextStyle(
                                color: AppColors.navy,
                                fontWeight: FontWeight.w600,
                                fontSize: 13,
                              ),
                            ),
                          ),
                        ],
                        const SizedBox(height: 10),
                        GestureDetector(
                          onTap: () => setState(() => _halfDay = !_halfDay),
                          child: Row(
                            children: [
                              Container(
                                width: 18, height: 18,
                                decoration: BoxDecoration(
                                  color: _halfDay ? AppColors.navy : Colors.transparent,
                                  border: Border.all(color: _halfDay ? AppColors.navy : AppColors.divider, width: 2),
                                  borderRadius: BorderRadius.circular(4),
                                ),
                                child: _halfDay
                                    ? const Icon(Icons.check, size: 12, color: Colors.white)
                                    : null,
                              ),
                              const SizedBox(width: 8),
                              const Text('Nghỉ nửa ngày', style: TextStyle(fontSize: 13, color: AppColors.textPrimary)),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 12),

                  // Reason
                  _SectionCard(
                    title: 'Lý do xin nghỉ',
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        TextField(
                          controller: _reasonCtrl,
                          maxLines: 4,
                          maxLength: 500,
                          onChanged: (_) => setState(() {}),
                          decoration: InputDecoration(
                            hintText: 'Lý do xin nghỉ...',
                            counterText: '',
                            border: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(8),
                              borderSide: const BorderSide(color: AppColors.divider),
                            ),
                            focusedBorder: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(8),
                              borderSide: const BorderSide(color: AppColors.navy),
                            ),
                            contentPadding: const EdgeInsets.all(12),
                          ),
                          style: const TextStyle(fontSize: 13),
                        ),
                        const SizedBox(height: 4),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Text(
                              _reasonCtrl.text.length < 20
                                  ? 'Tối thiểu 20 ký tự (còn ${20 - _reasonCtrl.text.length})'
                                  : 'Đủ ký tự',
                              style: TextStyle(
                                fontSize: 11,
                                color: _reasonCtrl.text.length < 20 ? AppColors.error : AppColors.textSecondary,
                              ),
                            ),
                            Text('${_reasonCtrl.text.length}/500',
                              style: const TextStyle(fontSize: 11, color: AppColors.textSecondary)),
                          ],
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 12),

                  // Attachments
                  _SectionCard(
                    title: 'Giấy tờ đính kèm (nếu có)',
                    child: GestureDetector(
                      child: Container(
                        padding: const EdgeInsets.all(20),
                        decoration: BoxDecoration(
                          border: Border.all(color: AppColors.divider, width: 2, style: BorderStyle.solid),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Column(
                          children: const [
                            Icon(Icons.upload_outlined, size: 32, color: AppColors.textSecondary),
                            SizedBox(height: 6),
                            Text('Chọn file hoặc chụp ảnh',
                              style: TextStyle(fontSize: 13, color: AppColors.textSecondary)),
                            Text('PDF, JPG, PNG • Tối đa 5MB',
                              style: TextStyle(fontSize: 11, color: AppColors.textMuted)),
                          ],
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 12),

                  // Summary preview
                  Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      gradient: const LinearGradient(
                        begin: Alignment.topLeft,
                        end: Alignment.bottomRight,
                        colors: [Color(0x0D366092), Color(0x0D4A90E2)],
                      ),
                      border: Border.all(color: AppColors.navy.withOpacity(0.2)),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text('Tóm tắt đơn',
                          style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14, color: AppColors.textPrimary)),
                        const SizedBox(height: 10),
                        _SummaryRow('Loại nghỉ:', _leaveType.isEmpty
                            ? '-'
                            : _leaveTypes.firstWhere((t) => t.$1 == _leaveType, orElse: () => ('', '', '-', '')).$3),
                        _SummaryRow('Thời gian:', _days > 0 ? '$_days ngày' : '-'),
                        _SummaryRow('Người thay thế:', '-'),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),

      // ── Submit button ──────────────────────────────────────────────────────
      bottomNavigationBar: Container(
        decoration: const BoxDecoration(
          color: Colors.white,
          border: Border(top: BorderSide(color: AppColors.divider)),
        ),
        padding: EdgeInsets.fromLTRB(16, 12, 16, 12 + MediaQuery.of(context).padding.bottom),
        child: SizedBox(
          height: 48,
          child: ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor: _isValid ? AppColors.navy : AppColors.textMuted,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            ),
            onPressed: (_isValid && !_loading) ? _submit : null,
            child: _loading
                ? const SizedBox(width: 20, height: 20,
                    child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                : const Text('Gửi đơn xin nghỉ',
                    style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 15)),
          ),
        ),
      ),
    );
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
class _SectionCard extends StatelessWidget {
  final String title;
  final Widget child;
  const _SectionCard({required this.title, required this.child});

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(16),
    decoration: BoxDecoration(
      color: Colors.white,
      borderRadius: BorderRadius.circular(12),
      boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.05), blurRadius: 8)],
    ),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(title, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14, color: AppColors.textPrimary)),
        const SizedBox(height: 12),
        child,
      ],
    ),
  );
}

class _DatePicker extends StatelessWidget {
  final String label;
  final DateTime? date;
  final VoidCallback onTap;
  const _DatePicker({required this.label, required this.date, required this.onTap});

  @override
  Widget build(BuildContext context) => GestureDetector(
    onTap: onTap,
    child: Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
      decoration: BoxDecoration(
        border: Border.all(color: AppColors.divider),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(label, style: const TextStyle(fontSize: 11, color: AppColors.textSecondary)),
                Text(
                  date == null ? 'Chọn ngày' : '${date!.day}/${date!.month}/${date!.year}',
                  style: TextStyle(
                    fontSize: 13,
                    color: date == null ? AppColors.textMuted : AppColors.textPrimary,
                    fontWeight: date == null ? FontWeight.normal : FontWeight.w500,
                  ),
                ),
              ],
            ),
          ),
          const Icon(Icons.calendar_today_outlined, size: 16, color: AppColors.textSecondary),
        ],
      ),
    ),
  );
}

class _SummaryRow extends StatelessWidget {
  final String label;
  final String value;
  const _SummaryRow(this.label, this.value);

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 6),
    child: Row(
      children: [
        SizedBox(
          width: 110,
          child: Text(label, style: const TextStyle(fontSize: 12, color: AppColors.textSecondary)),
        ),
        Expanded(
          child: Text(value,
            style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AppColors.textPrimary)),
        ),
      ],
    ),
  );
}
