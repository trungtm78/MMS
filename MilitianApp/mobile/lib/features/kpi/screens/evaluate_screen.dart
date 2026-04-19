import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/constants/app_colors.dart';

// Placeholder — wire to real API when ready
Future<void> submitEvaluation(Map<String, dynamic> payload) async =>
    Future.delayed(const Duration(milliseconds: 800));

class EvaluateScreen extends ConsumerStatefulWidget {
  const EvaluateScreen({super.key});
  @override
  ConsumerState<EvaluateScreen> createState() => _EvaluateScreenState();
}

class _EvaluateScreenState extends ConsumerState<EvaluateScreen> {
  String _selDqtv = '', _selTask = '';
  final _ratings = <String, int>{
    'Chấp hành kỷ luật': 0,
    'Hoàn thành nhiệm vụ': 0,
    'Tinh thần làm việc': 0,
    'Kỹ năng nghiệp vụ': 0,
    'Phối hợp đồng đội': 0,
  };
  final _noteCtrl = TextEditingController();
  bool _submitting = false, _success = false;

  static const _dqtvList = [
    ('1', 'Nguyễn Văn An', 'HCM-PHD-T12-0001'),
    ('2', 'Trần Văn Bình', 'HCM-PHD-T12-0002'),
    ('3', 'Lê Thị Cẩm',   'HCM-PHD-T12-0003'),
  ];
  static const _taskList = [
    ('1', 'NV-2024-001 - Tuần tra khu vực chợ Bến Thành'),
    ('2', 'NV-2024-002 - Tuyên truyền phòng cháy chữa cháy'),
    ('3', 'NV-2024-003 - Xử lý tranh chấp dân sự'),
  ];

  @override
  void dispose() { _noteCtrl.dispose(); super.dispose(); }

  double get _overall {
    final vals = _ratings.values.where((v) => v > 0);
    return vals.isEmpty ? 0 : vals.reduce((a, b) => a + b) / _ratings.length;
  }

  bool get _valid => _selDqtv.isNotEmpty && _selTask.isNotEmpty &&
      _ratings.values.every((r) => r > 0) && _noteCtrl.text.length >= 20;

  Future<void> _submit() async {
    if (!_valid || _submitting) return;
    setState(() => _submitting = true);
    await submitEvaluation({'dqtvId': _selDqtv, 'taskId': _selTask,
      'ratings': _ratings, 'note': _noteCtrl.text});
    if (mounted) setState(() { _submitting = false; _success = true; });
  }

  @override
  Widget build(BuildContext context) {
    if (_success) return _successView(context);
    return Scaffold(
      backgroundColor: AppColors.background,
      body: Column(children: [
        _header(context, 'Đánh Giá DQTV'),
        Expanded(child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 100),
          children: [
            _card('Chọn DQTV', Column(children: _dqtvList.map((d) =>
              _selTile(d.$2, d.$3, _selDqtv == d.$1,
                  () => setState(() => _selDqtv = d.$1))).toList())),
            const SizedBox(height: 12),
            _card('Nhiệm vụ đánh giá', DropdownButtonFormField<String>(
              value: _selTask.isEmpty ? null : _selTask,
              decoration: _inputDeco('Chọn nhiệm vụ'),
              items: _taskList.map((t) => DropdownMenuItem(value: t.$1,
                child: Text(t.$2, style: const TextStyle(fontSize: 13)))).toList(),
              onChanged: (v) => setState(() => _selTask = v ?? ''),
            )),
            const SizedBox(height: 12),
            _card('Tiêu chí đánh giá', Column(children: [
              ..._ratings.keys.map((label) => _starRow(label)),
              if (_overall > 0) ...[
                const Divider(color: AppColors.divider),
                Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                  Row(children: List.generate(5, (i) => Icon(
                    i + 1 <= _overall.round() ? Icons.star : Icons.star_border,
                    size: 20, color: const Color(0xFFFBBF24)))),
                  Text(_overall.toStringAsFixed(1),
                    style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold,
                        color: AppColors.navy)),
                ]),
              ],
            ])),
            const SizedBox(height: 12),
            _card('Nhận xét *', Column(crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                TextField(controller: _noteCtrl, maxLines: 4, maxLength: 1000,
                  decoration: _inputDeco('Nhận xét về hiệu quả, thái độ...'),
                  onChanged: (_) => setState(() {})),
                if (_noteCtrl.text.isNotEmpty && _noteCtrl.text.length < 20)
                  Text('Còn ${20 - _noteCtrl.text.length} ký tự nữa',
                    style: const TextStyle(fontSize: 11, color: AppColors.error)),
              ])),
          ],
        )),
        _submitBar(),
      ]),
    );
  }

  Widget _starRow(String label) => Padding(
    padding: const EdgeInsets.only(bottom: 14),
    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(label, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600,
          color: AppColors.textPrimary)),
      const SizedBox(height: 4),
      Row(children: [
        ...List.generate(5, (i) {
          final star = i + 1;
          return GestureDetector(
            onTap: () => setState(() => _ratings[label] = star),
            child: Padding(padding: const EdgeInsets.only(right: 4),
              child: Icon(star <= _ratings[label]! ? Icons.star : Icons.star_border,
                size: 30,
                color: star <= _ratings[label]!
                    ? const Color(0xFFFBBF24) : AppColors.divider)));
        }),
        Padding(padding: const EdgeInsets.only(left: 4),
          child: Text('${_ratings[label]}/5',
            style: const TextStyle(fontSize: 12, color: AppColors.textSecondary))),
      ]),
    ]),
  );

  Widget _selTile(String name, String code, bool sel, VoidCallback onTap) =>
    GestureDetector(onTap: onTap, child: Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: sel ? AppColors.cardBlueLight : Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: sel ? AppColors.navy : AppColors.divider, width: 2)),
      child: Row(children: [
        CircleAvatar(radius: 18,
          backgroundColor: sel ? AppColors.navy : AppColors.textSecondary,
          child: Text(name.split(' ').last[0],
            style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold))),
        const SizedBox(width: 10),
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(name, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600,
              color: AppColors.textPrimary)),
          Text(code, style: const TextStyle(fontSize: 11, color: AppColors.textSecondary)),
        ])),
        if (sel) const Icon(Icons.check_circle, color: AppColors.navy, size: 20),
      ]),
    ));

  Widget _submitBar() => Container(
    padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
    decoration: const BoxDecoration(color: Colors.white,
      border: Border(top: BorderSide(color: AppColors.divider))),
    child: Column(mainAxisSize: MainAxisSize.min, children: [
      SizedBox(width: double.infinity, height: 50,
        child: ElevatedButton.icon(
          onPressed: _valid ? _submit : null,
          icon: _submitting
              ? const SizedBox(width: 18, height: 18,
                  child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
              : const Icon(Icons.send, size: 18),
          label: const Text('GỬI ĐÁNH GIÁ',
            style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
          style: ElevatedButton.styleFrom(
            backgroundColor: _valid ? AppColors.navy : AppColors.textMuted,
            foregroundColor: Colors.white,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12))),
        )),
      if (!_valid) ...[
        const SizedBox(height: 6),
        const Text('Vui lòng chọn DQTV, nhiệm vụ và đánh giá đầy đủ tiêu chí',
          style: TextStyle(fontSize: 11, color: AppColors.error),
          textAlign: TextAlign.center),
      ],
    ]),
  );

  Widget _successView(BuildContext context) => Scaffold(
    backgroundColor: AppColors.background,
    body: Center(child: Container(
      margin: const EdgeInsets.all(24),
      padding: const EdgeInsets.all(32),
      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(20),
        boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.08), blurRadius: 16)]),
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        Container(width: 72, height: 72,
          decoration: const BoxDecoration(color: AppColors.success, shape: BoxShape.circle),
          child: const Icon(Icons.check_circle, color: Colors.white, size: 44)),
        const SizedBox(height: 16),
        const Text('Đã gửi đánh giá!',
          style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold, color: AppColors.success)),
        const SizedBox(height: 8),
        Row(mainAxisAlignment: MainAxisAlignment.center,
          children: List.generate(5, (i) => Icon(
            i + 1 <= _overall.round() ? Icons.star : Icons.star_border,
            size: 24, color: const Color(0xFFFBBF24)))),
        const SizedBox(height: 4),
        Text('Điểm trung bình: ${_overall.toStringAsFixed(1)}/5',
          style: const TextStyle(fontSize: 13, color: AppColors.textSecondary)),
        const SizedBox(height: 24),
        SizedBox(width: double.infinity,
          child: ElevatedButton(
            onPressed: () => Navigator.of(context).maybePop(),
            style: ElevatedButton.styleFrom(backgroundColor: AppColors.navy,
              foregroundColor: Colors.white,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12))),
            child: const Text('Quay lại'))),
      ]),
    )),
  );

  // Shared helpers
  Widget _header(BuildContext context, String title) => Container(
    decoration: const BoxDecoration(gradient: AppColors.headerGradient,
      border: Border(bottom: BorderSide(color: AppColors.primary, width: 4))),
    child: SafeArea(bottom: false, child: Padding(
      padding: const EdgeInsets.fromLTRB(8, 8, 16, 12),
      child: Row(children: [
        IconButton(icon: const Icon(Icons.arrow_back_ios, color: AppColors.navy),
          onPressed: () => Navigator.of(context).maybePop()),
        Expanded(child: Text(title,
          style: const TextStyle(color: AppColors.textPrimary, fontSize: 20,
              fontWeight: FontWeight.w800),
          textAlign: TextAlign.center)),
        const SizedBox(width: 48),
      ]),
    )),
  );

  Widget _card(String title, Widget child) => Container(
    padding: const EdgeInsets.all(16),
    decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(12),
      boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.05), blurRadius: 8)]),
    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(title, style: const TextStyle(fontWeight: FontWeight.w700,
          fontSize: 14, color: AppColors.textPrimary)),
      const SizedBox(height: 12),
      child,
    ]),
  );

  InputDecoration _inputDeco(String hint) => InputDecoration(
    hintText: hint,
    hintStyle: const TextStyle(fontSize: 13, color: AppColors.textMuted),
    contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
    border: OutlineInputBorder(borderRadius: BorderRadius.circular(8),
        borderSide: const BorderSide(color: AppColors.divider)),
    focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(8),
        borderSide: const BorderSide(color: AppColors.navy)),
    enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(8),
        borderSide: const BorderSide(color: AppColors.divider)),
  );
}
