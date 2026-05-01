import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/constants/app_colors.dart';
import '../../features/auth/providers/auth_provider.dart';

const _requiredDays = 15;

const _trainingTypes = [
  ('military', 'Quân sự', '⚔️'),
  ('political', 'Chính trị', '📋'),
  ('fire', 'PCCC', '🔥'),
  ('firstaid', 'Sơ cứu', '➕'),
];

const _filterOptions = [
  ('all', 'Tất cả'),
  ('military', 'Quân sự'),
  ('political', 'Chính trị'),
  ('fire', 'PCCC'),
  ('firstaid', 'Sơ cứu'),
  ('passed', 'Đã đạt'),
  ('failed', 'Chưa đạt'),
];

// ── Screen ────────────────────────────────────────────────────────────────────
class TrainingManagementScreen extends ConsumerStatefulWidget {
  const TrainingManagementScreen({super.key});

  @override
  ConsumerState<TrainingManagementScreen> createState() =>
      _TrainingManagementScreenState();
}

class _TrainingManagementScreenState
    extends ConsumerState<TrainingManagementScreen> {
  List<Map<String, dynamic>> _sessions = [];
  bool _loading = true;
  String? _error;
  String _filter = 'all';

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      final dio = ref.read(dioProvider);
      // Fetch profile to get unitCode
      String unitCode = '';
      try {
        final profileRes = await dio.get('/users/me');
        unitCode = profileRes.data['data']?['unitCode'] as String?
            ?? profileRes.data['data']?['unit']?['code'] as String?
            ?? '';
      } catch (_) {}
      final queryParams = unitCode.isNotEmpty ? {'unitCode': unitCode} : <String, dynamic>{};
      final res = await dio.get(
        '/training',
        queryParameters: queryParams,
      );
      final data = (res.data['data'] as List?) ?? [];
      if (mounted) {
        setState(() {
          _sessions = data.cast<Map<String, dynamic>>();
          _loading = false;
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() { _error = 'Lỗi tải dữ liệu. Vui lòng thử lại.'; _loading = false; });
      }
    }
  }

  // ── Computed ─────────────────────────────────────────────────────────────────

  List<Map<String, dynamic>> get _filtered {
    if (_filter == 'all') return _sessions;
    if (_filter == 'passed') return _sessions.where((s) => _isPassed(s)).toList();
    if (_filter == 'failed') return _sessions.where((s) => !_isPassed(s)).toList();
    return _sessions.where((s) {
      final type = (s['trainingType'] as String? ?? s['type'] as String? ?? '').toLowerCase();
      switch (_filter) {
        case 'military': return type.contains('quân sự') || type.contains('military');
        case 'political': return type.contains('chính trị') || type.contains('political');
        case 'fire': return type.contains('pccc') || type.contains('fire');
        case 'firstaid': return type.contains('sơ cứu') || type.contains('firstaid');
        default: return true;
      }
    }).toList();
  }

  int get _passedCount =>
      _sessions.where((s) => _isPassed(s)).length;

  // ── Build ─────────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.chevron_left, color: AppColors.navy, size: 28),
          onPressed: () => context.pop(),
        ),
        title: const Text(
          'Quản lý Huấn luyện',
          style: TextStyle(
            fontSize: 18,
            fontWeight: FontWeight.bold,
            color: AppColors.textPrimary,
          ),
        ),
        centerTitle: true,
        bottom: const PreferredSize(
          preferredSize: Size.fromHeight(1),
          child: Divider(height: 1, color: AppColors.divider),
        ),
      ),
      body: Column(
        children: [
          // Summary + filter
          Container(
            color: Colors.white,
            padding: const EdgeInsets.fromLTRB(16, 10, 16, 0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Summary
                if (!_loading && _error == null)
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                    decoration: BoxDecoration(
                      color: AppColors.navy.withOpacity(0.06),
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(color: AppColors.navy.withOpacity(0.15)),
                    ),
                    child: Row(
                      children: [
                        const Icon(Icons.military_tech, color: AppColors.navy, size: 18),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text.rich(TextSpan(children: [
                            TextSpan(
                              text: '$_passedCount/${_sessions.length}',
                              style: const TextStyle(
                                fontWeight: FontWeight.w800,
                                fontSize: 14,
                                color: AppColors.navy,
                              ),
                            ),
                            const TextSpan(
                              text: ' DQTV đã đạt yêu cầu $_requiredDays ngày huấn luyện',
                              style: TextStyle(
                                fontSize: 12,
                                color: AppColors.textSecondary,
                              ),
                            ),
                          ])),
                        ),
                      ],
                    ),
                  ),
                const SizedBox(height: 10),
                // Filter chips
                SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(
                    children: _filterOptions.map((f) {
                      final active = _filter == f.$1;
                      return GestureDetector(
                        onTap: () => setState(() => _filter = f.$1),
                        child: AnimatedContainer(
                          duration: const Duration(milliseconds: 150),
                          margin: const EdgeInsets.only(right: 8),
                          padding: const EdgeInsets.symmetric(
                              horizontal: 12, vertical: 6),
                          decoration: BoxDecoration(
                            color: active ? AppColors.navy : Colors.white,
                            borderRadius: BorderRadius.circular(20),
                            border: Border.all(
                              color: active ? AppColors.navy : AppColors.divider,
                              width: 1.5,
                            ),
                          ),
                          child: Text(
                            f.$2,
                            style: TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w600,
                              color: active
                                  ? Colors.white
                                  : AppColors.textSecondary,
                            ),
                          ),
                        ),
                      );
                    }).toList(),
                  ),
                ),
                const SizedBox(height: 10),
              ],
            ),
          ),
          const Divider(height: 1, color: AppColors.divider),

          // List
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator(color: AppColors.navy))
                : _error != null
                    ? _buildError()
                    : RefreshIndicator(
                        color: AppColors.navy,
                        onRefresh: _load,
                        child: _filtered.isEmpty
                            ? _buildEmpty()
                            : ListView.separated(
                                padding: const EdgeInsets.fromLTRB(16, 16, 16, 100),
                                itemCount: _filtered.length,
                                separatorBuilder: (_, __) => const SizedBox(height: 10),
                                itemBuilder: (ctx, i) =>
                                    _SessionCard(session: _filtered[i]),
                              ),
                      ),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        backgroundColor: AppColors.navy,
        icon: const Icon(Icons.add, color: Colors.white),
        label: const Text(
          'Thêm đợt huấn luyện',
          style: TextStyle(color: Colors.white, fontWeight: FontWeight.w600),
        ),
        onPressed: () => _showAddForm(context),
      ),
    );
  }

  Widget _buildEmpty() {
    return ListView(
      children: [
        const SizedBox(height: 80),
        Column(
          children: const [
            Text('🎖', style: TextStyle(fontSize: 56)),
            SizedBox(height: 12),
            Text(
              'Chưa có đợt huấn luyện nào',
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w600,
                color: AppColors.textPrimary,
              ),
            ),
            SizedBox(height: 6),
            Text(
              'Nhấn + để thêm đợt huấn luyện mới',
              style: TextStyle(fontSize: 13, color: AppColors.textSecondary),
            ),
          ],
        ),
      ],
    );
  }

  Widget _buildError() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.error_outline, color: AppColors.error, size: 48),
            const SizedBox(height: 12),
            Text(
              _error!,
              textAlign: TextAlign.center,
              style: const TextStyle(color: AppColors.textPrimary),
            ),
            const SizedBox(height: 16),
            ElevatedButton.icon(
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.navy,
                shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(10)),
              ),
              icon: const Icon(Icons.refresh, color: Colors.white, size: 18),
              label:
                  const Text('Thử lại', style: TextStyle(color: Colors.white)),
              onPressed: _load,
            ),
          ],
        ),
      ),
    );
  }

  // ── Add Form Sheet ────────────────────────────────────────────────────────────
  void _showAddForm(BuildContext context) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => _AddTrainingForm(
        onSaved: () {
          Navigator.pop(ctx);
          _load();
        },
      ),
    );
  }
}

// ── Session Card ──────────────────────────────────────────────────────────────
class _SessionCard extends StatelessWidget {
  final Map<String, dynamic> session;
  const _SessionCard({required this.session});

  @override
  Widget build(BuildContext context) {
    final type = session['trainingType'] as String? ?? session['type'] as String? ?? '';
    final icon = _typeIcon(type);
    final days = session['totalDays'] as int? ?? session['days'] as int? ?? 0;
    final passed = _isPassed(session);
    final location = session['location'] as String? ?? '';
    final instructor = session['instructor'] as String? ?? '';
    final fromDate = session['fromDate'] as String? ?? session['from_date'] as String? ?? '';
    final toDate = session['toDate'] as String? ?? session['to_date'] as String? ?? '';
    final dateRange = (fromDate.isNotEmpty && toDate.isNotEmpty && fromDate != toDate)
        ? '$fromDate – $toDate'
        : fromDate;
    final participants = session['participantCount'] as int?;

    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border(
          left: BorderSide(
            color: passed ? AppColors.success : AppColors.error,
            width: 4,
          ),
        ),
        boxShadow: [
          BoxShadow(color: Colors.black.withOpacity(0.05), blurRadius: 8),
        ],
      ),
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  color: AppColors.navy.withOpacity(0.08),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Center(
                    child: Text(icon, style: const TextStyle(fontSize: 20))),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      type.isEmpty ? 'Huấn luyện' : type,
                      style: const TextStyle(
                        fontWeight: FontWeight.w700,
                        fontSize: 14,
                        color: AppColors.textPrimary,
                      ),
                    ),
                    if (dateRange.isNotEmpty)
                      Text(
                        dateRange,
                        style: const TextStyle(
                            fontSize: 12, color: AppColors.textSecondary),
                      ),
                  ],
                ),
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(
                    '$days ngày',
                    style: const TextStyle(
                      fontWeight: FontWeight.w800,
                      fontSize: 15,
                      color: AppColors.navy,
                    ),
                  ),
                  Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                    decoration: BoxDecoration(
                      color:
                          (passed ? AppColors.success : AppColors.error)
                              .withOpacity(0.1),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Text(
                      passed ? 'Đạt' : 'Không đạt',
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                        color: passed ? AppColors.success : AppColors.error,
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ),
          if (location.isNotEmpty || instructor.isNotEmpty || participants != null) ...[
            const SizedBox(height: 8),
            const Divider(height: 1, color: AppColors.divider),
            const SizedBox(height: 8),
            Wrap(
              spacing: 16,
              runSpacing: 4,
              children: [
                if (location.isNotEmpty)
                  _InfoTag(Icons.location_on_outlined, location),
                if (instructor.isNotEmpty)
                  _InfoTag(Icons.person_outlined, instructor),
                if (participants != null)
                  _InfoTag(Icons.group_outlined, '$participants người'),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

class _InfoTag extends StatelessWidget {
  final IconData icon;
  final String text;
  const _InfoTag(this.icon, this.text);

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 12, color: AppColors.textSecondary),
        const SizedBox(width: 3),
        Text(text,
            style: const TextStyle(
                fontSize: 11, color: AppColors.textSecondary)),
      ],
    );
  }
}

// ── Add Training Form ─────────────────────────────────────────────────────────
class _AddTrainingForm extends ConsumerStatefulWidget {
  final VoidCallback onSaved;
  const _AddTrainingForm({required this.onSaved});

  @override
  ConsumerState<_AddTrainingForm> createState() => _AddTrainingFormState();
}

class _AddTrainingFormState extends ConsumerState<_AddTrainingForm> {
  final _formKey = GlobalKey<FormState>();
  String _selectedType = 'military';
  DateTime? _fromDate;
  DateTime? _toDate;
  final _daysController = TextEditingController();
  final _locationController = TextEditingController();
  final _instructorController = TextEditingController();
  bool _passed = true;
  bool _saving = false;

  @override
  void dispose() {
    _daysController.dispose();
    _locationController.dispose();
    _instructorController.dispose();
    super.dispose();
  }

  void _autoCalcDays() {
    if (_fromDate != null && _toDate != null) {
      final diff = _toDate!.difference(_fromDate!).inDays + 1;
      if (diff > 0) {
        _daysController.text = '$diff';
      }
    }
  }

  Future<void> _pickDate({required bool isFrom}) async {
    final picked = await showDatePicker(
      context: context,
      initialDate: DateTime.now(),
      firstDate: DateTime(2020),
      lastDate: DateTime(2030),
      builder: (ctx, child) => Theme(
        data: Theme.of(ctx).copyWith(
          colorScheme: const ColorScheme.light(primary: AppColors.navy),
        ),
        child: child!,
      ),
    );
    if (picked == null) return;
    setState(() {
      if (isFrom) {
        _fromDate = picked;
        if (_toDate != null && _toDate!.isBefore(picked)) _toDate = null;
      } else {
        _toDate = picked;
      }
      _autoCalcDays();
    });
  }

  Future<void> _save() async {
    if (!_formKey.currentState!.validate()) return;
    if (_fromDate == null || _toDate == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Vui lòng chọn ngày bắt đầu và kết thúc')),
      );
      return;
    }
    setState(() => _saving = true);
    try {
      final dio = ref.read(dioProvider);
      final typeLabel = _trainingTypes
          .firstWhere((t) => t.$1 == _selectedType, orElse: () => _trainingTypes[0])
          .$2;

      await dio.post('/training', data: {
        'trainingType': typeLabel,
        'fromDate': _fmt(_fromDate!),
        'toDate': _fmt(_toDate!),
        'totalDays': int.tryParse(_daysController.text) ?? 0,
        'location': _locationController.text.trim(),
        'instructor': _instructorController.text.trim(),
        'result': _passed ? 'Đạt' : 'Không đạt',
        'passed': _passed,
      });
      if (mounted) widget.onSaved();
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Lỗi lưu dữ liệu. Vui lòng thử lại.'),
            backgroundColor: AppColors.error,
          ),
        );
        setState(() => _saving = false);
      }
    }
  }

  String _fmt(DateTime d) =>
      '${d.day.toString().padLeft(2, '0')}/${d.month.toString().padLeft(2, '0')}/${d.year}';

  @override
  Widget build(BuildContext context) {
    final bottom = MediaQuery.of(context).viewInsets.bottom;
    return Container(
      decoration: const BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      padding: EdgeInsets.fromLTRB(20, 20, 20, 20 + bottom),
      child: SingleChildScrollView(
        child: Form(
          key: _formKey,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              // Handle
              Center(
                child: Container(
                  width: 40,
                  height: 4,
                  decoration: BoxDecoration(
                    color: AppColors.divider,
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),
              const SizedBox(height: 16),
              const Text(
                'Thêm đợt huấn luyện',
                style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w800,
                  color: AppColors.textPrimary,
                ),
              ),
              const SizedBox(height: 20),

              // Training type
              const _Label('Loại huấn luyện *'),
              const SizedBox(height: 6),
              DropdownButtonFormField<String>(
                value: _selectedType,
                decoration: _inputDecoration('Chọn loại'),
                items: _trainingTypes.map((t) {
                  return DropdownMenuItem(
                    value: t.$1,
                    child: Text('${t.$3}  ${t.$2}'),
                  );
                }).toList(),
                onChanged: (v) => setState(() => _selectedType = v!),
                validator: (v) => v == null ? 'Vui lòng chọn' : null,
              ),
              const SizedBox(height: 14),

              // Date range
              Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const _Label('Ngày bắt đầu *'),
                        const SizedBox(height: 6),
                        _DateButton(
                          label: _fromDate != null ? _fmt(_fromDate!) : 'Chọn ngày',
                          onTap: () => _pickDate(isFrom: true),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const _Label('Ngày kết thúc *'),
                        const SizedBox(height: 6),
                        _DateButton(
                          label: _toDate != null ? _fmt(_toDate!) : 'Chọn ngày',
                          onTap: () => _pickDate(isFrom: false),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 14),

              // Total days
              const _Label('Số ngày'),
              const SizedBox(height: 6),
              TextFormField(
                controller: _daysController,
                keyboardType: TextInputType.number,
                decoration: _inputDecoration('Tự động tính hoặc nhập tay'),
                validator: (v) {
                  if (v == null || v.isEmpty) return null;
                  if (int.tryParse(v) == null) return 'Nhập số nguyên';
                  return null;
                },
              ),
              const SizedBox(height: 14),

              // Location
              const _Label('Địa điểm'),
              const SizedBox(height: 6),
              TextFormField(
                controller: _locationController,
                decoration: _inputDecoration('Tên địa điểm huấn luyện'),
              ),
              const SizedBox(height: 14),

              // Instructor
              const _Label('Giáo viên / Chỉ huy'),
              const SizedBox(height: 6),
              TextFormField(
                controller: _instructorController,
                decoration: _inputDecoration('Họ tên người phụ trách'),
              ),
              const SizedBox(height: 14),

              // Result
              const _Label('Kết quả'),
              const SizedBox(height: 6),
              Row(
                children: [
                  Expanded(
                    child: _ResultRadio(
                      label: 'Đạt',
                      selected: _passed,
                      color: AppColors.success,
                      onTap: () => setState(() => _passed = true),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: _ResultRadio(
                      label: 'Không đạt',
                      selected: !_passed,
                      color: AppColors.error,
                      onTap: () => setState(() => _passed = false),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 24),

              // Submit
              SizedBox(
                width: double.infinity,
                height: 50,
                child: ElevatedButton(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.navy,
                    shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12)),
                  ),
                  onPressed: _saving ? null : _save,
                  child: _saving
                      ? const SizedBox(
                          height: 22,
                          width: 22,
                          child: CircularProgressIndicator(
                              strokeWidth: 2.5, color: Colors.white),
                        )
                      : const Text(
                          'Lưu đợt huấn luyện',
                          style: TextStyle(
                              color: Colors.white,
                              fontSize: 16,
                              fontWeight: FontWeight.w700),
                        ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ── Helper Widgets ────────────────────────────────────────────────────────────

class _Label extends StatelessWidget {
  final String text;
  const _Label(this.text);
  @override
  Widget build(BuildContext context) => Text(
        text,
        style: const TextStyle(
          fontSize: 13,
          fontWeight: FontWeight.w600,
          color: AppColors.textPrimary,
        ),
      );
}

InputDecoration _inputDecoration(String hint) => InputDecoration(
      hintText: hint,
      hintStyle: const TextStyle(color: AppColors.textMuted, fontSize: 13),
      filled: true,
      fillColor: AppColors.background,
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: const BorderSide(color: AppColors.divider),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: const BorderSide(color: AppColors.divider),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: const BorderSide(color: AppColors.navy, width: 2),
      ),
    );

class _DateButton extends StatelessWidget {
  final String label;
  final VoidCallback onTap;
  const _DateButton({required this.label, required this.onTap});

  @override
  Widget build(BuildContext context) => GestureDetector(
        onTap: onTap,
        child: Container(
          height: 48,
          padding: const EdgeInsets.symmetric(horizontal: 14),
          decoration: BoxDecoration(
            color: AppColors.background,
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: AppColors.divider),
          ),
          child: Row(
            children: [
              const Icon(Icons.calendar_today_outlined,
                  size: 16, color: AppColors.textSecondary),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  label,
                  style: const TextStyle(
                      fontSize: 13, color: AppColors.textPrimary),
                ),
              ),
            ],
          ),
        ),
      );
}

class _ResultRadio extends StatelessWidget {
  final String label;
  final bool selected;
  final Color color;
  final VoidCallback onTap;
  const _ResultRadio({
    required this.label,
    required this.selected,
    required this.color,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) => GestureDetector(
        onTap: onTap,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 150),
          height: 44,
          decoration: BoxDecoration(
            color: selected ? color.withOpacity(0.1) : Colors.white,
            borderRadius: BorderRadius.circular(10),
            border: Border.all(
              color: selected ? color : AppColors.divider,
              width: 1.5,
            ),
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(
                selected ? Icons.radio_button_checked : Icons.radio_button_unchecked,
                color: selected ? color : AppColors.textMuted,
                size: 16,
              ),
              const SizedBox(width: 6),
              Text(
                label,
                style: TextStyle(
                  fontWeight: FontWeight.w600,
                  fontSize: 13,
                  color: selected ? color : AppColors.textSecondary,
                ),
              ),
            ],
          ),
        ),
      );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

bool _isPassed(Map<String, dynamic> s) {
  final result = s['result'] as String? ?? '';
  final passed = s['passed'];
  return result == 'Đạt' || passed == true;
}

String _typeIcon(String type) {
  final t = type.toLowerCase();
  if (t.contains('quân sự') || t.contains('military')) return '⚔️';
  if (t.contains('chính trị') || t.contains('political')) return '📋';
  if (t.contains('pccc') || t.contains('fire')) return '🔥';
  if (t.contains('sơ cứu') || t.contains('first aid') || t.contains('firstaid')) return '➕';
  return '🎖';
}
