import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/constants/api_constants.dart';
import '../../../l10n/l10n.dart';
import '../../../shared/errors/app_failure.dart';
import '../../../shared/utils/json_number.dart';
import '../../../shared/widgets/app_header.dart';
import '../../auth/providers/auth_provider.dart';

/// SOS_TEXT_MAX_LENGTH (Web/backend/src/sos/sos.controller.ts): resolutionNote @MaxLength
const _maxResolutionNoteLength = 2000;

/// Text of an incident severity code (sos/incident-values.ts); an unknown code is shown as it is
String _severityText(AppLocalizations l10n, String code) => switch (code) {
      'low' => l10n.alertsSeverityLow,
      'medium' => l10n.alertsSeverityMedium,
      'high' => l10n.alertsSeverityHigh,
      'urgent' => l10n.alertsSeverityUrgent,
      _ => code,
    };

/// Text of an incident type code (sos/incident-values.ts); an unknown code is shown as it is
String _typeText(AppLocalizations l10n, String code) => switch (code) {
      'sos' => l10n.alertsTypeSos,
      'security' => l10n.alertsTypeSecurity,
      'fire' => l10n.alertsTypeFire,
      'medical' => l10n.alertsTypeMedical,
      'accident' => l10n.alertsTypeAccident,
      'utility' => l10n.alertsTypeUtility,
      'other' => l10n.alertsTypeOther,
      _ => code,
    };

class AlertsScreen extends ConsumerStatefulWidget {
  const AlertsScreen({super.key});

  @override
  ConsumerState<AlertsScreen> createState() => _AlertsScreenState();
}

class _AlertsScreenState extends ConsumerState<AlertsScreen> with SingleTickerProviderStateMixin {
  late final TabController _tabCtrl = TabController(length: 2, vsync: this);
  List<Map<String, dynamic>> _active = [], _resolved = [];
  int _activeCount = 0;
  bool _loading = true;
  AppFailure? _failure;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _tabCtrl.dispose();
    super.dispose();
  }

  /// GET /sos?status=active|resolved: the alerts of the caller's scope, active first, with counts
  /// over the whole scope (sos-alerts.service.ts list)
  Future<void> _load() async {
    setState(() {
      _loading = true;
      _failure = null;
    });
    try {
      final dio = ref.read(dioProvider);
      final results = await Future.wait([
        dio.get(ApiConstants.sosList, queryParameters: {'status': 'active'}),
        dio.get(ApiConstants.sosList, queryParameters: {'status': 'resolved'}),
      ]);
      final active = _rows(results[0].data);
      final resolved = _rows(results[1].data);
      final counts = (results[0].data as Map)['counts'];
      if (!mounted) return;
      setState(() {
        _active = active;
        _resolved = resolved;
        // Counts as JSON numbers or numeric strings
        _activeCount = (counts is Map ? jsonNumber(counts['active'])?.toInt() : null) ?? active.length;
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

  static List<Map<String, dynamic>> _rows(Object? body) {
    final rows = body is Map ? body['data'] : null;
    if (rows is! List) throw const FormatException('GET /sos: expected {data: [...]}');
    return rows.whereType<Map>().map((row) => Map<String, dynamic>.from(row)).toList();
  }

  /// PATCH /sos/:id/status {status: resolved, resolutionNote?}; the backend refuses a move the alert's
  /// status does not allow (409 invalid_status_transition) and alerts outside the scope (404)
  Future<void> _resolve(String id) async {
    final l10n = context.l10n;
    final note = await showDialog<String>(context: context, builder: (_) => const _ResolveDialog());
    if (note == null || !mounted) return;
    try {
      await ref.read(dioProvider).patch(
        ApiConstants.sosResolve.replaceAll('{id}', id),
        data: {'status': 'resolved', if (note.isNotEmpty) 'resolutionNote': note},
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(l10n.alertsResolved), backgroundColor: AppColors.success),
      );
      _load();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(l10n.alertsResolveFailed(failureText(l10n, AppFailure.from(e)))),
        backgroundColor: AppColors.error,
      ));
    }
  }

  Widget _buildList(AppLocalizations l10n, List<Map<String, dynamic>> alerts, bool showAction) {
    if (_loading) return const Center(child: CircularProgressIndicator(color: AppColors.navy));
    if (alerts.isEmpty) {
      return Center(child: Text(l10n.alertsEmpty, style: const TextStyle(color: AppColors.textSecondary)));
    }
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: alerts.length,
        itemBuilder: (ctx, i) {
          final a = alerts[i];
          final severity = a['severity'] as String? ?? '';
          final color = AppColors.severityColor(severity);
          final created = DateTime.tryParse('${a['createdAt'] ?? ''}');
          final code = a['code'];
          return Card(
            margin: const EdgeInsets.only(bottom: 10),
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Row(children: [
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                    decoration: BoxDecoration(color: color.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(12)),
                    child: Text(_severityText(l10n, severity),
                        style: TextStyle(fontSize: 11, color: color, fontWeight: FontWeight.w700)),
                  ),
                  const SizedBox(width: 8),
                  Text(_typeText(l10n, a['incidentType'] as String? ?? ''),
                      style: const TextStyle(color: AppColors.textMuted, fontSize: 12)),
                  const Spacer(),
                  Text(
                    created == null ? '' : DateFormat('HH:mm').format(created.toLocal()),
                    style: const TextStyle(color: AppColors.textMuted, fontSize: 12),
                  ),
                ]),
                const SizedBox(height: 8),
                Text(a['title'] as String? ?? '', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
                if (code is String) Text(code, style: const TextStyle(color: AppColors.textMuted, fontSize: 11)),
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
                      child: Text(l10n.alertsResolveButton, style: const TextStyle(fontSize: 13)),
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
    final l10n = context.l10n;
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppHeader(
        title: l10n.alertsTitle,
        showBack: false,
        action: IconButton(tooltip: l10n.alertsRefreshTooltip, icon: const Icon(Icons.refresh), onPressed: _load),
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
              Tab(text: l10n.alertsTabActive(_activeCount)),
              Tab(text: l10n.alertsTabResolved),
            ],
          ),
        ),
        Expanded(
          child: _failure != null
              ? Center(
                  child: Column(mainAxisSize: MainAxisSize.min, children: [
                    const Icon(Icons.error_outline, color: AppColors.error, size: 48),
                    const SizedBox(height: 8),
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 24),
                      child: Text(l10n.alertsLoadFailed(failureText(l10n, _failure!)), textAlign: TextAlign.center),
                    ),
                    ElevatedButton(onPressed: _load, child: Text(l10n.commonRetry)),
                  ]),
                )
              : TabBarView(
                  controller: _tabCtrl,
                  children: [_buildList(l10n, _active, true), _buildList(l10n, _resolved, false)],
                ),
        ),
      ]),
    );
  }
}

/// Asks for an optional resolution note; returns it trimmed on confirm, null on cancel. It owns its
/// text field, which lives as long as the dialog does.
class _ResolveDialog extends StatefulWidget {
  const _ResolveDialog();

  @override
  State<_ResolveDialog> createState() => _ResolveDialogState();
}

class _ResolveDialogState extends State<_ResolveDialog> {
  final _note = TextEditingController();

  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return AlertDialog(
      title: Text(l10n.alertsResolveDialogTitle),
      content: TextField(
        controller: _note,
        decoration: InputDecoration(labelText: l10n.alertsResolveNoteLabel),
        maxLines: 2,
        maxLength: _maxResolutionNoteLength,
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: Text(l10n.alertsResolveCancel)),
        ElevatedButton(
          onPressed: () => Navigator.pop(context, _note.text.trim()),
          style: ElevatedButton.styleFrom(backgroundColor: AppColors.navy),
          child: Text(l10n.alertsResolveConfirm),
        ),
      ],
    );
  }
}
