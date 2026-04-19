import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/constants/app_colors.dart';

// Placeholder — wire to real API when ready
Future<void> createTask(Map<String, dynamic> payload) async =>
    Future.delayed(const Duration(milliseconds: 800));

class CreateTaskScreen extends ConsumerStatefulWidget {
  const CreateTaskScreen({super.key});
  @override
  ConsumerState<CreateTaskScreen> createState() => _CreateTaskScreenState();
}

class _CreateTaskScreenState extends ConsumerState<CreateTaskScreen> {
  String _type = '', _priority = '';
  final _titleCtrl = TextEditingController();
  final _descCtrl  = TextEditingController();
  final _locCtrl   = TextEditingController();
  DateTime? _date;
  TimeOfDay? _time;
  final Set<String> _assignees = {};
  bool _submitting = false, _success = false;

  static const _types = [
    ('patrol',      '👮', 'Tuần tra'),
    ('incident',    '🚨', 'Xử lý sự vụ'),
    ('propaganda',  '📢', 'Tuyên truyền'),
    ('support',     '🤝', 'Hỗ trợ'),
    ('inspection',  '🔍', 'Kiểm tra'),
    ('other',       '📝', 'Khác'),
  ];

  static const _priorities = [
    ('urgent',  '🔴', 'Khẩn cấp',   'Cần xử lý ngay lập tức'),
    ('high',    '🟠', 'Cao',         'Ưu tiên cao'),
    ('medium',  '🟡', 'Trung bình',  'Xử lý bình thường'),
    ('low',     '🟢', 'Thấp',        'Không gấp'),
  ];

  static const _members = [
    ('1', 'Nguyễn Văn An', 'NA', 3),
    ('2', 'Trần Văn Bình', 'TB', 2),
    ('3', 'Lê Thị Cẩm',   'LC', 4),
    ('4', 'Phạm Minh Đức', 'PD', 5),
    ('5', 'Hoàng Thị Ế',   'HE', 1),
  ];

  Color _priorityColor(String id) {
    switch (id) {
      case 'urgent': return AppColors.error;
      case 'high':   return AppColors.warning;
      case 'medium': return AppColors.blue;
      default:       return AppColors.success;
    }
  }

  @override
  void dispose() { _titleCtrl.dispose(); _descCtrl.dispose(); _locCtrl.dispose(); super.dispose(); }

  bool get _valid => _type.isNotEmpty && _priority.isNotEmpty &&
      _titleCtrl.text.isNotEmpty && _descCtrl.text.length >= 20 &&
      _locCtrl.text.isNotEmpty && _date != null && _assignees.isNotEmpty;

  Future<void> _submit() async {
    if (!_valid || _submitting) return;
    setState(() => _submitting = true);
    await createTask({'type': _type, 'priority': _priority, 'title': _titleCtrl.text,
      'description': _descCtrl.text, 'location': _locCtrl.text,
      'deadline': _date?.toIso8601String(), 'assignees': _assignees.toList()});
    if (mounted) setState(() { _submitting = false; _success = true; });
  }

  @override
  Widget build(BuildContext context) {
    if (_success) return _successView(context);
    return Scaffold(
      backgroundColor: AppColors.background,
      body: Column(children: [
        _header(context),
        Expanded(child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 100),
          children: [
            // Task type
            _card('Loại nhiệm vụ', GridView.count(
              shrinkWrap: true, physics: const NeverScrollableScrollPhysics(),
              crossAxisCount: 3, mainAxisSpacing: 8, crossAxisSpacing: 8, childAspectRatio: 1.4,
              children: _types.map((t) => GestureDetector(
                onTap: () => setState(() => _type = t.$1),
                child: Container(
                  decoration: BoxDecoration(
                    color: _type == t.$1 ? AppColors.cardBlueLight : Colors.white,
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(
                      color: _type == t.$1 ? AppColors.navy : AppColors.divider, width: 2)),
                  child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                    Text(t.$2, style: const TextStyle(fontSize: 22)),
                    Text(t.$3, style: const TextStyle(fontSize: 11,
                        fontWeight: FontWeight.w600, color: AppColors.textPrimary),
                      textAlign: TextAlign.center),
                  ])))).toList())),
            const SizedBox(height: 12),

            // Priority
            _card('Mức độ ưu tiên', Column(children: _priorities.map((p) => GestureDetector(
              onTap: () => setState(() => _priority = p.$1),
              child: Container(
                margin: const EdgeInsets.only(bottom: 8), padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: _priority == p.$1 ? _priorityColor(p.$1).withOpacity(0.08) : Colors.white,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(
                    color: _priority == p.$1 ? _priorityColor(p.$1) : AppColors.divider, width: 2)),
                child: Row(children: [
                  Text(p.$2, style: const TextStyle(fontSize: 22)),
                  const SizedBox(width: 10),
                  Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(p.$3, style: const TextStyle(fontSize: 13,
                        fontWeight: FontWeight.w600, color: AppColors.textPrimary)),
                    Text(p.$4, style: const TextStyle(fontSize: 11, color: AppColors.textSecondary)),
                  ])),
                  if (_priority == p.$1)
                    const Icon(Icons.check_circle, color: AppColors.navy, size: 20),
                ])))).toList())),
            const SizedBox(height: 12),

            // Task info
            _card('Thông tin nhiệm vụ', Column(crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _label('Tiêu đề *'),
                TextField(controller: _titleCtrl,
                  decoration: _inputDeco('VD: Tuần tra khu vực chợ Bến Thành'),
                  onChanged: (_) => setState(() {})),
                const SizedBox(height: 10),
                _label('Mô tả chi tiết *'),
                TextField(controller: _descCtrl, maxLines: 3, maxLength: 1000,
                  decoration: _inputDeco('Mô tả chi tiết nhiệm vụ...'),
                  onChanged: (_) => setState(() {})),
                if (_descCtrl.text.isNotEmpty && _descCtrl.text.length < 20)
                  Text('Còn ${20 - _descCtrl.text.length} ký tự nữa',
                    style: const TextStyle(fontSize: 11, color: AppColors.error)),
              ])),
            const SizedBox(height: 12),

            // Location + deadline
            _card('Địa điểm & Thời hạn', Column(children: [
              TextField(controller: _locCtrl, onChanged: (_) => setState(() {}),
                decoration: _inputDeco('Nhập địa chỉ cụ thể').copyWith(
                  prefixIcon: const Icon(Icons.location_on_outlined,
                      color: AppColors.textSecondary, size: 20))),
              const SizedBox(height: 10),
              Row(children: [
                Expanded(child: GestureDetector(onTap: () async {
                  final d = await showDatePicker(context: context,
                    initialDate: DateTime.now().add(const Duration(days: 1)),
                    firstDate: DateTime.now(),
                    lastDate: DateTime.now().add(const Duration(days: 365)));
                  if (d != null) setState(() => _date = d);
                }, child: _dateChip(Icons.calendar_today_outlined,
                  _date == null ? 'Ngày' : '${_date!.day}/${_date!.month}/${_date!.year}'))),
                const SizedBox(width: 10),
                Expanded(child: GestureDetector(onTap: () async {
                  final t = await showTimePicker(context: context,
                    initialTime: TimeOfDay.now());
                  if (t != null) setState(() => _time = t);
                }, child: _dateChip(Icons.access_time_outlined,
                  _time?.format(context) ?? 'Giờ'))),
              ]),
            ])),
            const SizedBox(height: 12),

            // Assignees
            _card('Giao cho DQTV *',
              Column(children: [
                ..._members.map((m) {
                  final sel = _assignees.contains(m.$1);
                  return GestureDetector(
                    onTap: () => setState(() => sel ? _assignees.remove(m.$1) : _assignees.add(m.$1)),
                    child: Container(
                      margin: const EdgeInsets.only(bottom: 8), padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: sel ? AppColors.cardBlueLight : Colors.white,
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: sel ? AppColors.navy : AppColors.divider, width: 2)),
                      child: Row(children: [
                        CircleAvatar(radius: 18,
                          backgroundColor: sel ? AppColors.navy : AppColors.textSecondary,
                          child: Text(m.$3, style: const TextStyle(
                              color: Colors.white, fontSize: 11, fontWeight: FontWeight.bold))),
                        const SizedBox(width: 10),
                        Expanded(child: Text(m.$2, style: const TextStyle(fontSize: 13,
                            fontWeight: FontWeight.w600, color: AppColors.textPrimary))),
                        if (sel) const Icon(Icons.check_circle, color: AppColors.navy, size: 20),
                      ])));
                }),
                if (_assignees.isNotEmpty)
                  Align(alignment: Alignment.centerLeft,
                    child: Text('Đã chọn: ${_assignees.length} DQTV',
                      style: const TextStyle(fontSize: 12, color: AppColors.navy,
                          fontWeight: FontWeight.w600))),
              ])),
          ],
        )),

        // Submit
        Container(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
          decoration: const BoxDecoration(color: Colors.white,
            border: Border(top: BorderSide(color: AppColors.divider))),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            SizedBox(width: double.infinity, height: 50,
              child: ElevatedButton(
                onPressed: _valid ? _submit : null,
                style: ElevatedButton.styleFrom(
                  backgroundColor: _valid
                      ? (_priority == 'urgent' ? AppColors.error : AppColors.navy)
                      : AppColors.textMuted,
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12))),
                child: _submitting
                    ? const SizedBox(width: 20, height: 20,
                        child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                    : Text(_priority == 'urgent' ? 'GIAO NHIỆM VỤ KHẨN CẤP' : 'GIAO NHIỆM VỤ',
                        style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15)))),
            if (!_valid) ...[
              const SizedBox(height: 6),
              const Text('Vui lòng điền đầy đủ thông tin bắt buộc (*)',
                style: TextStyle(fontSize: 11, color: AppColors.error),
                textAlign: TextAlign.center),
            ],
          ]),
        ),
      ]),
    );
  }

  Widget _successView(BuildContext context) => Scaffold(
    backgroundColor: AppColors.background,
    body: Center(child: Container(
      margin: const EdgeInsets.all(24), padding: const EdgeInsets.all(32),
      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(20),
        boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.08), blurRadius: 16)]),
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        Container(width: 72, height: 72,
          decoration: const BoxDecoration(color: AppColors.success, shape: BoxShape.circle),
          child: const Icon(Icons.check_circle, color: Colors.white, size: 44)),
        const SizedBox(height: 16),
        const Text('Đã giao nhiệm vụ!',
          style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold, color: AppColors.success)),
        const SizedBox(height: 8),
        Text('Đã giao cho ${_assignees.length} DQTV',
          style: const TextStyle(color: AppColors.textSecondary)),
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

  // Shared helpers ────────────────────────────────────────────────────────────
  Widget _header(BuildContext context) => Container(
    decoration: const BoxDecoration(gradient: AppColors.headerGradient,
      border: Border(bottom: BorderSide(color: AppColors.primary, width: 4))),
    child: SafeArea(bottom: false, child: Padding(
      padding: const EdgeInsets.fromLTRB(8, 8, 16, 12),
      child: Row(children: [
        IconButton(icon: const Icon(Icons.arrow_back_ios, color: AppColors.navy),
          onPressed: () => Navigator.of(context).maybePop()),
        const Expanded(child: Text('Giao Nhiệm Vụ Mới',
          style: TextStyle(color: AppColors.textPrimary, fontSize: 20,
              fontWeight: FontWeight.w800), textAlign: TextAlign.center)),
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

  Widget _label(String text) => Padding(padding: const EdgeInsets.only(bottom: 4),
    child: Text(text, style: const TextStyle(fontSize: 12, color: AppColors.textSecondary)));

  Widget _dateChip(IconData icon, String text) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
    decoration: BoxDecoration(border: Border.all(color: AppColors.divider),
        borderRadius: BorderRadius.circular(8)),
    child: Row(children: [
      Expanded(child: Text(text, style: const TextStyle(fontSize: 13, color: AppColors.textPrimary))),
      Icon(icon, size: 16, color: AppColors.textSecondary),
    ]));

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
