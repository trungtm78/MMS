import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/constants/api_constants.dart';
import '../../core/constants/app_colors.dart';
import '../../features/auth/providers/auth_provider.dart';
import '../../l10n/l10n.dart';
import '../../shared/errors/app_failure.dart';
import '../../shared/utils/calendar_date.dart';
import 'militia_search.dart';
import 'training_record.dart';

const _requiredDays = 15;

/// Types the add form offers
const _formTypes = [TrainingType.military, TrainingType.political, TrainingType.fire, TrainingType.firstAid];

String _typeText(AppLocalizations l10n, TrainingType type) => switch (type) {
      TrainingType.military => l10n.trainingTypeMilitary,
      TrainingType.political => l10n.trainingTypePolitical,
      TrainingType.fire => l10n.trainingTypeFire,
      TrainingType.firstAid => l10n.trainingTypeFirstAid,
      TrainingType.other => l10n.trainingTypeOther,
    };

String _outcomeText(AppLocalizations l10n, TrainingOutcome outcome) => switch (outcome) {
      TrainingOutcome.passed => l10n.trainingOutcomePassed,
      TrainingOutcome.failed => l10n.trainingOutcomeFailed,
      TrainingOutcome.notEvaluated => l10n.trainingOutcomeNotEvaluated,
    };

String _daysErrorText(AppLocalizations l10n, TrainingDaysError error) => switch (error) {
      TrainingDaysError.required => l10n.trainingFormDaysRequired,
      TrainingDaysError.notANumber => l10n.trainingFormDaysNotANumber,
      TrainingDaysError.tooManyDecimals => l10n.trainingFormDaysTooManyDecimals,
      TrainingDaysError.belowMinimum => l10n.trainingFormDaysBelowMinimum(formatTrainingDays(minTrainingDays)),
      TrainingDaysError.aboveMaximum => l10n.trainingFormDaysAboveMaximum(formatTrainingDays(maxTrainingDays)),
    };

String _typeIcon(TrainingType? type) => switch (type) {
      TrainingType.military => '⚔️',
      TrainingType.political => '📋',
      TrainingType.fire => '🔥',
      TrainingType.firstAid => '➕',
      _ => '🎖',
    };

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
  AppFailure? _failure;
  String _filter = 'all';

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _failure = null;
    });
    try {
      final dio = ref.read(dioProvider);
      // GET /users/me carries the caller's unitScope; GET /training?unitCode= narrows to it. Without
      // the profile the unit is unknown, so the load fails instead of listing the whole ward.
      final profileRes = await dio.get(ApiConstants.profile);
      final unitCode = unitCodeFromProfile(profileRes.data);
      final res = await dio.get(
        ApiConstants.training,
        queryParameters: {if (unitCode != null) 'unitCode': unitCode, 'limit': 100},
      );
      final body = res.data;
      final rows = body is Map ? body['data'] : null;
      if (rows is! List) throw const FormatException('GET /training: expected {data: [...]}');
      if (!mounted) return;
      setState(() {
        _sessions = rows.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList();
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _failure = AppFailure.from(e);
        _loading = false;
      });
    }
  }

  // ── Computed ─────────────────────────────────────────────────────────────────

  List<Map<String, dynamic>> get _filtered {
    if (_filter == 'all') return _sessions;
    // result is pass | fail | not_evaluated (training/dto/create-training.dto.ts)
    if (_filter == 'passed') {
      return _sessions.where((s) => TrainingOutcome.fromRecord(s) == TrainingOutcome.passed).toList();
    }
    if (_filter == 'failed') {
      return _sessions.where((s) => TrainingOutcome.fromRecord(s) == TrainingOutcome.failed).toList();
    }
    // Filter keys are the training_type codes
    return _sessions.where((s) => s['trainingType'] == _filter).toList();
  }

  int get _passedCount => countPassed(_sessions);

  // ── Build ─────────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final filters = [
      ('all', l10n.trainingFilterAll),
      for (final type in _formTypes) (type.code, _typeText(l10n, type)),
      ('passed', l10n.trainingFilterPassed),
      ('failed', l10n.trainingFilterFailed),
    ];
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.chevron_left, color: AppColors.navy, size: 28),
          onPressed: () => context.pop(),
        ),
        title: Text(
          l10n.trainingManagementTitle,
          style: const TextStyle(
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
                if (!_loading && _failure == null)
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                    decoration: BoxDecoration(
                      color: AppColors.navy.withValues(alpha: 0.06),
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(color: AppColors.navy.withValues(alpha: 0.15)),
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
                            TextSpan(
                              text: ' ${l10n.trainingManagementSummary(_requiredDays)}',
                              style: const TextStyle(
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
                    children: filters.map((f) {
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
                : _failure != null
                    ? _buildError(l10n)
                    : RefreshIndicator(
                        color: AppColors.navy,
                        onRefresh: _load,
                        child: _filtered.isEmpty
                            ? _buildEmpty(l10n)
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
        label: Text(
          l10n.trainingManagementAddButton,
          style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w600),
        ),
        onPressed: () => _showAddForm(context),
      ),
    );
  }

  Widget _buildEmpty(AppLocalizations l10n) {
    return ListView(
      children: [
        const SizedBox(height: 80),
        Column(
          children: [
            const Text('🎖', style: TextStyle(fontSize: 56)),
            const SizedBox(height: 12),
            Text(
              l10n.trainingManagementEmpty,
              style: const TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w600,
                color: AppColors.textPrimary,
              ),
            ),
            const SizedBox(height: 6),
            Text(
              l10n.trainingManagementEmptyHint,
              style: const TextStyle(fontSize: 13, color: AppColors.textSecondary),
            ),
          ],
        ),
      ],
    );
  }

  Widget _buildError(AppLocalizations l10n) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.error_outline, color: AppColors.error, size: 48),
            const SizedBox(height: 12),
            Text(
              l10n.trainingManagementLoadFailed(failureText(l10n, _failure!)),
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
              label: Text(l10n.commonRetry, style: const TextStyle(color: Colors.white)),
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
    final l10n = context.l10n;
    final code = session['trainingType'] as String? ?? '';
    final type = TrainingType.fromCode(code);
    // total_days is NUMERIC (sent as a string); from/to are DATE calendar days
    final days = trainingDays(session['totalDays']);
    final outcome = TrainingOutcome.fromRecord(session);
    final outcomeColor = switch (outcome) {
      TrainingOutcome.passed => AppColors.success,
      TrainingOutcome.failed => AppColors.error,
      TrainingOutcome.notEvaluated => AppColors.textSecondary,
    };
    final location = session['location'] as String? ?? '';
    final instructor = session['instructor'] as String? ?? '';
    final dateRange = formatCalendarRange(session['fromDate'], session['toDate']);
    final militiaName = session['militiaName'] as String? ?? '';
    final militiaCode = session['militiaCode'] as String? ?? '';
    final militia = [militiaName, militiaCode].where((s) => s.isNotEmpty).join(' · ');

    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border(
          left: BorderSide(
            color: outcomeColor,
            width: 4,
          ),
        ),
        boxShadow: [
          BoxShadow(color: Colors.black.withValues(alpha: 0.05), blurRadius: 8),
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
                  color: AppColors.navy.withValues(alpha: 0.08),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Center(
                    child: Text(_typeIcon(type), style: const TextStyle(fontSize: 20))),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      // An unknown type is shown as its code
                      type != null ? _typeText(l10n, type) : (code.isEmpty ? l10n.trainingCardUntyped : code),
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
                    l10n.trainingCardDays(formatTrainingDays(days)),
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
                      color: outcomeColor.withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Text(
                      _outcomeText(l10n, outcome),
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                        color: outcomeColor,
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ),
          if (location.isNotEmpty || instructor.isNotEmpty || militia.isNotEmpty) ...[
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
                if (militia.isNotEmpty)
                  _InfoTag(Icons.badge_outlined, militia),
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
  String _selectedType = TrainingType.military.code;
  DateTime? _fromDate;
  DateTime? _toDate;
  final _daysController = TextEditingController();
  final _locationController = TextEditingController();
  final _instructorController = TextEditingController();
  bool _passed = true;
  bool _saving = false;
  String? _selectedMilitiaId;
  String _selectedMilitiaName = '';

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

  void _snack(String message, {Color? color}) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message), backgroundColor: color));
  }

  Future<void> _save() async {
    final l10n = context.l10n;
    if (!_formKey.currentState!.validate()) return;
    if (_fromDate == null || _toDate == null) {
      _snack(l10n.trainingFormDatesRequired);
      return;
    }
    if (_selectedMilitiaId == null) {
      _snack(l10n.trainingFormMilitiaRequired);
      return;
    }
    setState(() => _saving = true);
    try {
      await ref.read(dioProvider).post(ApiConstants.training, data: {
        'militiaId': _selectedMilitiaId,
        'trainingType': _selectedType,
        'fromDate': toCalendarDateString(_fromDate!),
        'toDate': toCalendarDateString(_toDate!),
        // Validated by the form: a number the backend takes (readTrainingDays)
        'totalDays': readTrainingDays(_daysController.text).days,
        'location': _locationController.text.trim(),
        'instructor': _instructorController.text.trim(),
        'result': _passed ? 'pass' : 'fail',
      });
      if (mounted) widget.onSaved();
    } catch (e) {
      if (!mounted) return;
      _snack(l10n.trainingFormSaveFailed(failureText(l10n, AppFailure.from(e))), color: AppColors.error);
      setState(() => _saving = false);
    }
  }

  String _fmt(DateTime d) =>
      '${d.day.toString().padLeft(2, '0')}/${d.month.toString().padLeft(2, '0')}/${d.year}';

  Future<void> _pickMilitia() async {
    final l10n = context.l10n;
    final dio = ref.read(dioProvider);
    List<MilitiaSearchItem> results = [];
    int total = 0;
    bool searching = false;
    AppFailure? searchFailure;
    String lastQuery = '';

    await showDialog<void>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDialogState) {
          // GET /militia?q=&limit= → {data, total, page, limit} (militia.controller.ts)
          Future<void> search(String q) async {
            final query = q.trim();
            lastQuery = query;
            if (query.length < 2) {
              setDialogState(() {
                results = [];
                total = 0;
                searchFailure = null;
                searching = false;
              });
              return;
            }
            setDialogState(() {
              searching = true;
              searchFailure = null;
            });
            try {
              final res = await dio.get(
                ApiConstants.militiaList,
                queryParameters: {'q': query, 'limit': 10},
              );
              final page = MilitiaSearchPage.fromJson(res.data);
              // Ignore answers to an older query, or after the dialog closed
              if (query != lastQuery || !ctx.mounted) return;
              setDialogState(() {
                results = page.items;
                total = page.total;
                searching = false;
              });
            } catch (e) {
              if (query != lastQuery || !ctx.mounted) return;
              setDialogState(() {
                results = [];
                total = 0;
                searching = false;
                searchFailure = AppFailure.from(e);
              });
            }
          }

          return AlertDialog(
            title: Text(l10n.trainingMilitiaPickerTitle),
            content: SizedBox(
              width: double.maxFinite,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  TextField(
                    autofocus: true,
                    decoration: InputDecoration(
                      hintText: l10n.trainingMilitiaPickerHint,
                      prefixIcon: const Icon(Icons.search),
                      border: const OutlineInputBorder(),
                    ),
                    onChanged: search,
                  ),
                  const SizedBox(height: 8),
                  if (searching)
                    const Padding(
                      padding: EdgeInsets.all(16),
                      child: CircularProgressIndicator(),
                    )
                  else if (searchFailure != null)
                    Padding(
                      padding: const EdgeInsets.all(12),
                      child: Text(
                        l10n.trainingMilitiaPickerFailed(failureText(l10n, searchFailure!)),
                        style: const TextStyle(color: AppColors.error, fontSize: 13),
                      ),
                    )
                  else if (lastQuery.length >= 2 && results.isEmpty)
                    Padding(
                      padding: const EdgeInsets.all(12),
                      child: Text(l10n.trainingMilitiaPickerEmpty,
                          style: const TextStyle(color: AppColors.textSecondary, fontSize: 13)),
                    )
                  else ...[
                    ConstrainedBox(
                      constraints: const BoxConstraints(maxHeight: 240),
                      child: ListView.builder(
                        shrinkWrap: true,
                        itemCount: results.length,
                        itemBuilder: (_, i) {
                          final m = results[i];
                          return ListTile(
                            title: Text(m.fullName),
                            subtitle: Text(m.subtitle),
                            onTap: () {
                              setState(() {
                                _selectedMilitiaId = m.id;
                                _selectedMilitiaName = m.fullName;
                              });
                              Navigator.of(ctx).pop();
                            },
                          );
                        },
                      ),
                    ),
                    if (total > results.length)
                      Padding(
                        padding: const EdgeInsets.only(top: 6),
                        child: Text(
                          l10n.trainingMilitiaPickerShowing(results.length, total),
                          style: const TextStyle(fontSize: 12, color: AppColors.textSecondary),
                        ),
                      ),
                  ],
                ],
              ),
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.of(ctx).pop(),
                child: Text(l10n.trainingMilitiaPickerClose),
              ),
            ],
          );
        },
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
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
              Text(
                l10n.trainingFormTitle,
                style: const TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w800,
                  color: AppColors.textPrimary,
                ),
              ),
              const SizedBox(height: 20),

              // Militia picker
              _Label(l10n.trainingFormMilitiaLabel),
              const SizedBox(height: 6),
              GestureDetector(
                onTap: _pickMilitia,
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
                  decoration: BoxDecoration(
                    border: Border.all(
                      color: _selectedMilitiaId == null ? AppColors.divider : AppColors.navy,
                    ),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Row(
                    children: [
                      Expanded(
                        child: Text(
                          _selectedMilitiaId == null ? l10n.trainingFormMilitiaHint : _selectedMilitiaName,
                          style: TextStyle(
                            color: _selectedMilitiaId == null
                                ? AppColors.textSecondary
                                : AppColors.textPrimary,
                            fontSize: 14,
                          ),
                        ),
                      ),
                      const Icon(Icons.search, size: 18, color: AppColors.navy),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 14),

              // Training type
              _Label(l10n.trainingFormTypeLabel),
              const SizedBox(height: 6),
              DropdownButtonFormField<String>(
                initialValue: _selectedType,
                decoration: _inputDecoration(l10n.trainingFormTypeHint),
                items: [
                  for (final type in _formTypes)
                    DropdownMenuItem(
                      value: type.code,
                      child: Text('${_typeIcon(type)}  ${_typeText(l10n, type)}'),
                    ),
                ],
                onChanged: (v) => setState(() => _selectedType = v!),
                validator: (v) => v == null ? l10n.trainingFormTypeRequired : null,
              ),
              const SizedBox(height: 14),

              // Date range
              Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        _Label(l10n.trainingFormFromLabel),
                        const SizedBox(height: 6),
                        _DateButton(
                          label: _fromDate != null ? _fmt(_fromDate!) : l10n.trainingFormDateHint,
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
                        _Label(l10n.trainingFormToLabel),
                        const SizedBox(height: 6),
                        _DateButton(
                          label: _toDate != null ? _fmt(_toDate!) : l10n.trainingFormDateHint,
                          onTap: () => _pickDate(isFrom: false),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 14),

              // Total days
              _Label(l10n.trainingFormDaysLabel),
              const SizedBox(height: 6),
              TextFormField(
                controller: _daysController,
                keyboardType: TextInputType.number,
                decoration: _inputDecoration(l10n.trainingFormDaysHint),
                validator: (v) => switch (readTrainingDays(v ?? '').error) {
                  final TrainingDaysError error => _daysErrorText(l10n, error),
                  null => null,
                },
              ),
              const SizedBox(height: 14),

              // Location
              _Label(l10n.trainingFormLocationLabel),
              const SizedBox(height: 6),
              TextFormField(
                controller: _locationController,
                decoration: _inputDecoration(l10n.trainingFormLocationHint),
              ),
              const SizedBox(height: 14),

              // Instructor
              _Label(l10n.trainingFormInstructorLabel),
              const SizedBox(height: 6),
              TextFormField(
                controller: _instructorController,
                decoration: _inputDecoration(l10n.trainingFormInstructorHint),
              ),
              const SizedBox(height: 14),

              // Result
              _Label(l10n.trainingFormResultLabel),
              const SizedBox(height: 6),
              Row(
                children: [
                  Expanded(
                    child: _ResultRadio(
                      label: l10n.trainingOutcomePassed,
                      selected: _passed,
                      color: AppColors.success,
                      onTap: () => setState(() => _passed = true),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: _ResultRadio(
                      label: l10n.trainingOutcomeFailed,
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
                      : Text(
                          l10n.trainingFormSave,
                          style: const TextStyle(
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
            color: selected ? color.withValues(alpha: 0.1) : Colors.white,
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
