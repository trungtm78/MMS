import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:latlong2/latlong.dart';

import '../../../core/constants/app_colors.dart';
import '../../../l10n/l10n.dart';
import '../../../shared/errors/app_failure.dart';
import '../../../shared/utils/string_utils.dart';
import '../../../shared/widgets/app_header.dart';
import '../../auth/providers/auth_provider.dart';
import '../../chat/chat_socket.dart';
import '../models/gps_position.dart';
import '../providers/gps_provider.dart';

/// The latest position of each member in the caller's scope (GET /gps/live), kept current by the
/// gateway's 'gps:update' events.
class GpsTrackingScreen extends ConsumerStatefulWidget {
  const GpsTrackingScreen({super.key});

  @override
  ConsumerState<GpsTrackingScreen> createState() => _GpsTrackingScreenState();
}

class _GpsTrackingScreenState extends ConsumerState<GpsTrackingScreen> {
  /// Where the map opens when nobody has a position yet
  static const _defaultCenter = LatLng(10.8231, 106.6297);

  List<GpsPosition> _members = [];
  bool _loading = true;
  AppFailure? _error;
  ChatSocket? _socket;

  @override
  void initState() {
    super.initState();
    _loadTeam();
    _connectSocket();
  }

  @override
  void dispose() {
    _socket?.dispose();
    _socket = null;
    super.dispose();
  }

  Future<void> _loadTeam() async {
    // The first load starts in the loading state already
    if (!_loading || _error != null) setState(() { _loading = true; _error = null; });
    try {
      final members = await ref.read(gpsApiProvider).live();
      if (!mounted) return;
      setState(() { _members = members; _loading = false; });
    } on AppFailure catch (failure) {
      if (!mounted) return;
      setState(() { _error = failure; _loading = false; });
    }
  }

  Future<void> _connectSocket() async {
    final token = await ref.read(secureStorageProvider).getAccessToken();
    if (token == null || !mounted) return;
    final socket = ref.read(chatSocketFactoryProvider)(token);
    _socket = socket;
    // One /gps/live row per event; anything else is ignored
    socket.on('gps:update', (data) {
      if (!mounted || data is! Map) return;
      final update = Map<String, dynamic>.from(data);
      final id = GpsPosition.idOf(update);
      if (id == null) return;
      setState(() {
        final members = List<GpsPosition>.of(_members);
        final index = members.indexWhere((m) => m.militiaId == id);
        if (index >= 0) {
          members[index] = members[index].mergedWith(update);
        } else {
          members.add(GpsPosition.fromJson(update));
        }
        _members = members;
      });
    });
  }

  Color _statusColor(String status) => switch (status) {
        'moving' => AppColors.warning,
        'online' => AppColors.success,
        _ => AppColors.textMuted,
      };

  String _statusLabel(AppLocalizations l10n, String status) => switch (status) {
        'moving' => l10n.gpsStatusMoving,
        'online' => l10n.gpsStatusOnline,
        _ => l10n.gpsStatusOffline,
      };

  /// 12.0 → "12", 10.82 → "10.82"
  static String _number(double value) =>
      value == value.roundToDouble() ? value.toInt().toString() : value.toString();

  /// The middle of the members' positions, so their markers open in view
  LatLng get _center {
    final placed = _members.where((m) => m.hasLocation).toList();
    if (placed.isEmpty) return _defaultCenter;
    final lat = placed.map((m) => m.lat!).reduce((a, b) => a + b) / placed.length;
    final lng = placed.map((m) => m.lng!).reduce((a, b) => a + b) / placed.length;
    return LatLng(lat, lng);
  }

  void _showMemberDetail(GpsPosition member) {
    final l10n = context.l10n;
    final color = _statusColor(member.status);
    final lastSeenAt = member.lastSeenAt;
    final accuracy = member.accuracy;
    final unitCode = member.unitCode;
    showModalBottomSheet<void>(
      context: context,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(16))),
      builder: (_) => Padding(
        padding: const EdgeInsets.all(20),
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            CircleAvatar(
              backgroundColor: color,
              child: Text(
                initials(member.fullName),
                style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(member.fullName, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
                if (unitCode != null)
                  Text(l10n.gpsMemberUnit(unitCode), style: const TextStyle(color: AppColors.textSecondary)),
              ]),
            ),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              decoration: BoxDecoration(
                color: color.withValues(alpha: 0.15),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Text(
                _statusLabel(l10n, member.status),
                style: TextStyle(color: color, fontWeight: FontWeight.w600),
              ),
            ),
          ]),
          const SizedBox(height: 16),
          Text(
            member.hasLocation
                ? l10n.gpsMemberPosition(_number(member.lat!), _number(member.lng!))
                : l10n.gpsMemberNoPosition,
            style: const TextStyle(fontSize: 13),
          ),
          if (accuracy != null) Text(l10n.gpsMemberAccuracy(_number(accuracy)), style: const TextStyle(fontSize: 13)),
          if (lastSeenAt != null)
            Text(
              l10n.gpsMemberLastSeen(DateFormat('HH:mm dd/MM').format(lastSeenAt.toLocal())),
              style: const TextStyle(fontSize: 13, color: AppColors.textSecondary),
            ),
        ]),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final tiles = ref.watch(gpsMapTilesProvider);
    final error = _error;
    final onlineCount = _members.where((m) => m.isOnline).length;

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppHeader(title: l10n.gpsTrackingTitle, showBack: false),
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: AppColors.navy))
          : error != null
              ? Center(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Column(mainAxisSize: MainAxisSize.min, children: [
                      const Icon(Icons.error_outline, color: AppColors.error, size: 48),
                      const SizedBox(height: 8),
                      Text(l10n.gpsTrackingLoadFailed(failureText(l10n, error)), textAlign: TextAlign.center),
                      const SizedBox(height: 8),
                      ElevatedButton(onPressed: _loadTeam, child: Text(l10n.commonRetry)),
                    ]),
                  ),
                )
              : Column(children: [
                  // Map
                  Expanded(
                    flex: 2,
                    child: FlutterMap(
                      options: MapOptions(initialCenter: _center, initialZoom: 15),
                      children: [
                        if (tiles != null)
                          TileLayer(urlTemplate: tiles, userAgentPackageName: 'com.mms.policeapp'),
                        MarkerLayer(
                          markers: [
                            for (final m in _members)
                              if (m.hasLocation)
                                Marker(
                                  point: LatLng(m.lat!, m.lng!),
                                  width: 80,
                                  height: 48,
                                  child: GestureDetector(
                                    onTap: () => _showMemberDetail(m),
                                    child: Column(mainAxisSize: MainAxisSize.min, children: [
                                      CircleAvatar(
                                        radius: 14,
                                        backgroundColor: _statusColor(m.status),
                                        child: Text(
                                          initials(m.fullName),
                                          style: const TextStyle(
                                              color: Colors.white, fontWeight: FontWeight.bold, fontSize: 11),
                                        ),
                                      ),
                                      Container(
                                        padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 1),
                                        decoration: BoxDecoration(
                                            color: Colors.white, borderRadius: BorderRadius.circular(4)),
                                        child: Text(lastWord(m.fullName), style: const TextStyle(fontSize: 9)),
                                      ),
                                    ]),
                                  ),
                                ),
                          ],
                        ),
                      ],
                    ),
                  ),
                  // Member list
                  Expanded(
                    flex: 1,
                    child: Column(children: [
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                        child: Row(children: [
                          Expanded(
                            child: Text(
                              l10n.gpsTrackingSummary(onlineCount, _members.length - onlineCount),
                              style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13),
                            ),
                          ),
                          IconButton(
                            tooltip: l10n.gpsTrackingRefresh,
                            icon: const Icon(Icons.refresh),
                            onPressed: _loadTeam,
                          ),
                        ]),
                      ),
                      Expanded(
                        child: _members.isEmpty
                            ? Center(
                                child: Text(l10n.gpsTrackingEmpty,
                                    style: const TextStyle(color: AppColors.textMuted)),
                              )
                            : ListView.builder(
                                itemCount: _members.length,
                                itemBuilder: (ctx, i) {
                                  final m = _members[i];
                                  final unitCode = m.unitCode;
                                  return ListTile(
                                    dense: true,
                                    leading: CircleAvatar(
                                      radius: 16,
                                      backgroundColor: _statusColor(m.status),
                                      child: Text(
                                        initials(m.fullName),
                                        style: const TextStyle(
                                            color: Colors.white, fontWeight: FontWeight.bold, fontSize: 11),
                                      ),
                                    ),
                                    title: Text(m.fullName,
                                        style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
                                    subtitle: unitCode == null ? null : Text(l10n.gpsMemberUnit(unitCode)),
                                    trailing: Text(
                                      _statusLabel(l10n, m.status),
                                      style: TextStyle(
                                          color: _statusColor(m.status), fontSize: 12, fontWeight: FontWeight.w600),
                                    ),
                                    onTap: () => _showMemberDetail(m),
                                  );
                                },
                              ),
                      ),
                    ]),
                  ),
                ]),
    );
  }
}
