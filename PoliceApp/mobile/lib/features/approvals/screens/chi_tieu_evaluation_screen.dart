import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/constants/app_colors.dart';
import '../../../shared/widgets/app_header.dart';
import '../../auth/providers/auth_provider.dart';

class ChiTieuEvaluationScreen extends ConsumerStatefulWidget {
  final String userId;
  const ChiTieuEvaluationScreen({super.key, required this.userId});

  @override
  ConsumerState<ChiTieuEvaluationScreen> createState() => _ChiTieuEvaluationScreenState();
}

class _ChiTieuEvaluationScreenState extends ConsumerState<ChiTieuEvaluationScreen> {
  Map<String, dynamic>? _target;
  bool _loadingTarget = true;

  // 5 criteria scores, 1–10
  final List<double> _scores = [5, 5, 5, 5, 5];
  static const _weights = [0.30, 0.25, 0.20, 0.15, 0.10];
  static const _criteria = [
    'Kỹ năng chuyên môn',
    'Tinh thần trách nhiệm',
    'Hiệu quả công tác',
    'Chấm công',
    'Thái độ tác phong',
  ];
  static const _weightLabels = ['30%', '25%', '20%', '15%', '10%'];

  String? _recommendation;
  static const _recommendations = [
    ('reward', 'Khen thưởng', Icons.emoji_events, AppColors.warning),
    ('maintain', 'Giữ nguyên', Icons.thumb_up, AppColors.success),
    ('training', 'Đào tạo thêm', Icons.school, AppColors.blue),
    ('warning', 'Nhắc nhở', Icons.warning_amber, Color(0xFFF59E0B)),
    ('discipline', 'Kỷ luật', Icons.gavel, AppColors.error),
  ];

  final _notesCtrl = TextEditingController();
  bool _submitting = false;

  double get _weightedScore => _scores.asMap().entries
      .fold(0.0, (sum, e) => sum + e.value * _weights[e.key]);

  @override
  void initState() {
    super.initState();
    _loadTarget();
  }

  @override
  void dispose() {
    _notesCtrl.dispose();
    super.dispose();
  }

  Future<void> _loadTarget() async {
    try {
      final dio = ref.read(dioProvider);
      final res = await dio.get('/militia/${widget.userId}');
      if (mounted) {
        setState(() {
          _target = res.data['data'] as Map<String, dynamic>?;
          _loadingTarget = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _loadingTarget = false);
    }
  }

  Future<void> _submit() async {
    if (_recommendation == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Vui lòng chọn kết luận đánh giá'), backgroundColor: AppColors.warning),
      );
      return;
    }
    setState(() => _submitting = true);
    try {
      final dio = ref.read(dioProvider);
      await dio.post('/kpi/evaluate', data: {
        'targetUserId': widget.userId,
        'criteria': _criteria.toList(),
        'scores': _scores.map((s) => s.round()).toList(),
        'recommendation': _recommendation,
        'notes': _notesCtrl.text.trim().isNotEmpty ? _notesCtrl.text.trim() : null,
      });
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Đánh giá đã được gửi thành công!'),
          backgroundColor: AppColors.success,
        ),
      );
      Navigator.of(context).pop(true);
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Lỗi gửi đánh giá: $e'), backgroundColor: AppColors.error),
      );
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppHeader(title: 'Đánh giá chỉ tiêu DQTV', showBack: true),
      body: _loadingTarget
          ? const Center(child: CircularProgressIndicator(color: AppColors.navy))
          : SingleChildScrollView(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Target info card
                  if (_target != null) _TargetInfoCard(target: _target!),
                  const SizedBox(height: 16),

                  // Criteria sliders
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text('TIÊU CHÍ ĐÁNH GIÁ',
                              style: TextStyle(
                                  fontWeight: FontWeight.w700,
                                  fontSize: 12,
                                  color: AppColors.textSecondary)),
                          const Divider(height: 16),
                          for (int i = 0; i < 5; i++) ...[
                            Row(
                              children: [
                                Expanded(
                                  child: Text(
                                    '${_criteria[i]} (${_weightLabels[i]})',
                                    style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500),
                                  ),
                                ),
                                Container(
                                  width: 36,
                                  alignment: Alignment.center,
                                  child: Text(
                                    _scores[i].round().toString(),
                                    style: TextStyle(
                                      fontWeight: FontWeight.w700,
                                      fontSize: 16,
                                      color: _scoreColor(_scores[i]),
                                    ),
                                  ),
                                ),
                              ],
                            ),
                            Slider(
                              value: _scores[i],
                              min: 1,
                              max: 10,
                              divisions: 9,
                              activeColor: _scoreColor(_scores[i]),
                              onChanged: (v) => setState(() => _scores[i] = v),
                            ),
                            if (i < 4) const Divider(height: 8),
                          ],
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 12),

                  // Weighted score display
                  Card(
                    color: AppColors.navy.withOpacity(0.05),
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Row(
                        children: [
                          const Icon(Icons.star, color: AppColors.navy, size: 28),
                          const SizedBox(width: 12),
                          Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Text('Điểm tổng hợp',
                                  style: TextStyle(color: AppColors.textSecondary, fontSize: 13)),
                              Text(
                                '${_weightedScore.toStringAsFixed(1)} / 10',
                                style: TextStyle(
                                  fontSize: 24,
                                  fontWeight: FontWeight.w800,
                                  color: _scoreColor(_weightedScore),
                                ),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),

                  // Recommendation chips
                  const Text('Kết luận đánh giá *',
                      style: TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
                  const SizedBox(height: 10),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: _recommendations.map((rec) {
                      final selected = _recommendation == rec.$1;
                      return ChoiceChip(
                        label: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(rec.$3, size: 14, color: selected ? Colors.white : rec.$4),
                            const SizedBox(width: 4),
                            Text(rec.$2),
                          ],
                        ),
                        selected: selected,
                        selectedColor: rec.$4,
                        labelStyle: TextStyle(
                          color: selected ? Colors.white : AppColors.textPrimary,
                          fontWeight: FontWeight.w500,
                        ),
                        onSelected: (_) => setState(() => _recommendation = rec.$1),
                      );
                    }).toList(),
                  ),
                  const SizedBox(height: 16),

                  // Notes
                  const Text('Ghi chú',
                      style: TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
                  const SizedBox(height: 8),
                  TextFormField(
                    controller: _notesCtrl,
                    maxLines: 3,
                    decoration: const InputDecoration(
                      hintText: 'Nhập nhận xét thêm (tùy chọn)...',
                      border: OutlineInputBorder(),
                    ),
                  ),
                  const SizedBox(height: 24),

                  // Submit
                  SizedBox(
                    width: double.infinity,
                    height: 50,
                    child: ElevatedButton(
                      onPressed: _submitting ? null : _submit,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppColors.navy,
                        foregroundColor: Colors.white,
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                      ),
                      child: _submitting
                          ? const SizedBox(
                              width: 20,
                              height: 20,
                              child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                            )
                          : const Text('GỬI ĐÁNH GIÁ',
                              style: TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
                    ),
                  ),
                  const SizedBox(height: 24),
                ],
              ),
            ),
    );
  }

  Color _scoreColor(double s) {
    if (s >= 9) return AppColors.success;
    if (s >= 7) return AppColors.blue;
    if (s >= 5) return AppColors.warning;
    return AppColors.error;
  }
}

class _TargetInfoCard extends StatelessWidget {
  final Map<String, dynamic> target;
  const _TargetInfoCard({required this.target});

  @override
  Widget build(BuildContext context) {
    return Card(
      color: AppColors.navy.withOpacity(0.06),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          children: [
            CircleAvatar(
              radius: 24,
              backgroundColor: AppColors.navy.withOpacity(0.15),
              child: Text(
                ((target['fullName'] as String?) ?? '?').substring(0, 1).toUpperCase(),
                style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: AppColors.navy),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    target['fullName'] as String? ?? '',
                    style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15),
                  ),
                  if (target['rank'] != null)
                    Text(target['rank'] as String,
                        style: const TextStyle(fontSize: 13, color: AppColors.textSecondary)),
                  if (target['unit'] != null)
                    Text(target['unit'] as String,
                        style: const TextStyle(fontSize: 13, color: AppColors.textSecondary)),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
