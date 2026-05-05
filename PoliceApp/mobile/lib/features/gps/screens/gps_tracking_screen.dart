import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/api_constants.dart';
import '../../../shared/utils/string_utils.dart';
import '../../../shared/widgets/app_header.dart';
import '../../auth/providers/auth_provider.dart';

class GpsTrackingScreen extends ConsumerStatefulWidget {
  const GpsTrackingScreen({super.key});

  @override
  ConsumerState<GpsTrackingScreen> createState() => _GpsTrackingScreenState();
}

class _GpsTrackingScreenState extends ConsumerState<GpsTrackingScreen> {
  List<Map<String, dynamic>> _members = [];
  bool _loading = true;
  io.Socket? _socket;

  @override
  void initState() {
    super.initState();
    _loadTeam();
    _connectSocket();
  }

  @override
  void dispose() {
    _socket?.disconnect();
    _socket?.dispose(); // release listeners + buffers
    _socket = null;
    super.dispose();
  }

  Future<void> _loadTeam() async {
    try {
      final dio = ref.read(dioProvider);
      final resp = await dio.get(ApiConstants.gpsLive);
      if (!mounted) return;
      setState(() {
        _members = List<Map<String, dynamic>>.from(resp.data['data'] as List? ?? []);
        _loading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() { _loading = false; });
    }
  }

  Future<void> _connectSocket() async {
    final storage = ref.read(secureStorageProvider);
    final token = await storage.getAccessToken();
    if (token == null) return;

    _socket = io.io(
      ApiConstants.wsUrl,
      io.OptionBuilder()
          .setTransports(['websocket'])
          .setExtraHeaders({'Authorization': 'Bearer $token'})
          .setAuth({'token': token})
          .build(),
    );

    _socket!.on('gps:update', (data) {
      if (!mounted) return;
      // Guard against malformed events — one bad payload should not crash the screen
      if (data is! Map<String, dynamic>) {
        debugPrint('[GPS] Ignored malformed gps:update payload: $data');
        return;
      }
      final update = data;
      setState(() {
        final idx = _members.indexWhere((m) => m['userId'] == update['userId']);
        if (idx >= 0) {
          _members[idx] = {..._members[idx], ...update};
        } else {
          _members.add(update);
        }
      });
    });
  }

  Color _markerColor(String status) {
    switch (status) {
      case 'moving': return AppColors.warning;
      case 'online': return AppColors.success;
      default: return AppColors.textMuted;
    }
  }

  void _showMemberDetail(Map<String, dynamic> member) {
    showModalBottomSheet(
      context: context,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(16))),
      builder: (_) => Padding(
        padding: const EdgeInsets.all(20),
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            CircleAvatar(
              backgroundColor: _markerColor(member['status'] as String? ?? 'offline'),
              child: Text(
                initials(member['fullName'] as String?),
                style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(member['fullName'] as String? ?? '', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
              Text(member['militiaCode'] as String? ?? '', style: const TextStyle(color: AppColors.textSecondary)),
            ])),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              decoration: BoxDecoration(
                color: _markerColor(member['status'] as String? ?? 'offline').withOpacity(0.15),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Text(
                member['status'] as String? ?? 'offline',
                style: TextStyle(color: _markerColor(member['status'] as String? ?? 'offline'), fontWeight: FontWeight.w600),
              ),
            ),
          ]),
          const SizedBox(height: 16),
          if (member['lat'] != null) Text('Vị trí: ${member['lat']}, ${member['lng']}', style: const TextStyle(fontSize: 13)),
          if (member['battery'] != null) Text('Pin: ${member['battery']}%', style: const TextStyle(fontSize: 13)),
          if (member['currentTask'] != null) ...[
            const SizedBox(height: 8),
            Text('Nhiệm vụ: ${member['currentTask']['title']}', style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
          ],
        ]),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final onlineCount = _members.where((m) => m['status'] == 'online' || m['status'] == 'moving').length;

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: const AppHeader(title: 'Theo dõi GPS', showBack: false),
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: AppColors.navy))
          : Column(children: [
              // Map
              Expanded(
                flex: 2,
                child: FlutterMap(
                  options: const MapOptions(
                    initialCenter: LatLng(10.8231, 106.6297),
                    initialZoom: 15,
                  ),
                  children: [
                    TileLayer(
                      urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                      userAgentPackageName: 'com.mms.policeapp',
                    ),
                    MarkerLayer(
                      markers: _members
                          .where((m) => m['lat'] != null && m['lng'] != null)
                          .map((m) => Marker(
                                point: LatLng(
                                  (m['lat'] as num).toDouble(),
                                  (m['lng'] as num).toDouble(),
                                ),
                                child: GestureDetector(
                                  onTap: () => _showMemberDetail(m),
                                  child: Column(mainAxisSize: MainAxisSize.min, children: [
                                    CircleAvatar(
                                      radius: 14,
                                      backgroundColor: _markerColor(m['status'] as String? ?? 'offline'),
                                      child: Text(
                                        initials(m['fullName'] as String?),
                                        style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 11),
                                      ),
                                    ),
                                    Container(
                                      padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 1),
                                      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(4)),
                                      child: Text(
                                        lastWord(m['fullName'] as String?),
                                        style: const TextStyle(fontSize: 9),
                                      ),
                                    ),
                                  ]),
                                ),
                              ))
                          .toList(),
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
                      Text('Danh sách ($onlineCount online / ${_members.length - onlineCount} offline)',
                          style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
                      const Spacer(),
                      IconButton(icon: const Icon(Icons.refresh), onPressed: _loadTeam),
                    ]),
                  ),
                  Expanded(
                    child: ListView.builder(
                      itemCount: _members.length,
                      itemBuilder: (ctx, i) {
                        final m = _members[i];
                        final status = m['status'] as String? ?? 'offline';
                        return ListTile(
                          dense: true,
                          leading: CircleAvatar(
                            radius: 16,
                            backgroundColor: _markerColor(status),
                            child: Text(
                              initials(m['fullName'] as String?),
                              style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 11),
                            ),
                          ),
                          title: Text(m['fullName'] as String? ?? '', style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
                          subtitle: Text(m['militiaCode'] as String? ?? ''),
                          trailing: Text(
                            m['lastSeenAt'] != null ? '${status}' : 'offline',
                            style: TextStyle(color: _markerColor(status), fontSize: 12, fontWeight: FontWeight.w600),
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
