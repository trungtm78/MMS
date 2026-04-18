import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/constants/api_constants.dart';
import '../../../shared/widgets/app_header.dart';
import '../../auth/providers/auth_provider.dart';

// Unit coordinates fallback (Phú Định)
const _unitLat = 10.8231;
const _unitLng = 106.6297;
const _maxDistanceM = 15.0;

class CheckInScreen extends ConsumerStatefulWidget {
  const CheckInScreen({super.key});

  @override
  ConsumerState<CheckInScreen> createState() => _CheckInScreenState();
}

class _CheckInScreenState extends ConsumerState<CheckInScreen> {
  Position? _currentPos;
  Map<String, dynamic>? _attendance;
  bool _loading = true;
  bool _submitting = false;
  String? _error;

  double get _distance {
    if (_currentPos == null) return double.infinity;
    return Geolocator.distanceBetween(
      _unitLat, _unitLng,
      _currentPos!.latitude, _currentPos!.longitude,
    );
  }

  bool get _inRange => _distance <= _maxDistanceM;

  @override
  void initState() {
    super.initState();
    _init();
  }

  Future<void> _init() async {
    await _loadAttendance();
    await _getLocation();
  }

  Future<void> _loadAttendance() async {
    try {
      final dio = ref.read(dioProvider);
      final resp = await dio.get(ApiConstants.attendanceToday);
      if (!mounted) return;
      setState(() { _attendance = resp.data['data'] as Map<String, dynamic>?; });
    } catch (_) {}
  }

  Future<void> _getLocation() async {
    setState(() { _loading = true; });
    try {
      bool serviceEnabled = await Geolocator.isLocationServiceEnabled();
      if (!serviceEnabled) {
        setState(() { _error = 'Vui lòng bật GPS'; _loading = false; }); return;
      }
      LocationPermission perm = await Geolocator.checkPermission();
      if (perm == LocationPermission.denied) {
        perm = await Geolocator.requestPermission();
        if (perm == LocationPermission.denied) {
          setState(() { _error = 'Cần quyền truy cập vị trí'; _loading = false; }); return;
        }
      }
      final pos = await Geolocator.getCurrentPosition(desiredAccuracy: LocationAccuracy.high);
      if (!mounted) return;
      setState(() { _currentPos = pos; _loading = false; _error = null; });
    } catch (e) {
      if (!mounted) return;
      setState(() { _error = 'Không lấy được vị trí: $e'; _loading = false; });
    }
  }

  Future<void> _checkIn() async {
    if (!_inRange || _submitting || _currentPos == null) return;
    setState(() { _submitting = true; });
    try {
      final dio = ref.read(dioProvider);
      final resp = await dio.post(ApiConstants.checkIn, data: {
        'location': {'lat': _currentPos!.latitude, 'lng': _currentPos!.longitude, 'accuracy': _currentPos!.accuracy},
        'source': 'mobile',
      });
      if (!mounted) return;
      final att = resp.data['data'] as Map<String, dynamic>;
      setState(() { _attendance = att; _submitting = false; });
      final isLate = att['isLate'] as bool? ?? false;
      if (isLate) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Bạn đã check-in muộn'), backgroundColor: AppColors.warning),
        );
      }
    } catch (e) {
      if (!mounted) return;
      setState(() { _submitting = false; });
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Lỗi: $e'), backgroundColor: AppColors.error),
      );
    }
  }

  Future<void> _checkOut() async {
    if (_submitting || _currentPos == null) return;
    setState(() { _submitting = true; });
    try {
      final dio = ref.read(dioProvider);
      final resp = await dio.post(ApiConstants.checkOut, data: {
        'location': {'lat': _currentPos!.latitude, 'lng': _currentPos!.longitude, 'accuracy': _currentPos!.accuracy},
      });
      if (!mounted) return;
      final att = resp.data['data'] as Map<String, dynamic>;
      setState(() { 
        _attendance = {...?_attendance, ...att};
        _submitting = false; 
      });
    } catch (e) {
      if (!mounted) return;
      setState(() { _submitting = false; });
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Lỗi: $e'), backgroundColor: AppColors.error),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final hasCheckin = _attendance?['checkinAt'] != null;
    final hasCheckout = _attendance?['checkoutAt'] != null;

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: const AppHeader(title: 'Điểm danh GPS', showBack: false),
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: AppColors.navy))
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                // Map
                SizedBox(
                  height: 220,
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(12),
                    child: FlutterMap(
                      options: MapOptions(
                        initialCenter: _currentPos != null
                            ? LatLng(_currentPos!.latitude, _currentPos!.longitude)
                            : const LatLng(_unitLat, _unitLng),
                        initialZoom: 17,
                      ),
                      children: [
                        TileLayer(
                          urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                          userAgentPackageName: 'com.mms.policeapp',
                        ),
                        MarkerLayer(markers: [
                          if (_currentPos != null)
                            Marker(
                              point: LatLng(_currentPos!.latitude, _currentPos!.longitude),
                              child: const Icon(Icons.my_location, color: AppColors.navy, size: 32),
                            ),
                          const Marker(
                            point: LatLng(_unitLat, _unitLng),
                            child: Icon(Icons.location_city, color: AppColors.primary, size: 32),
                          ),
                        ]),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 16),
                // Status info
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      if (_currentPos != null) ...[
                        Row(children: [
                          Icon(_inRange ? Icons.check_circle : Icons.cancel,
                              color: _inRange ? AppColors.success : AppColors.error, size: 20),
                          const SizedBox(width: 8),
                          Text(
                            _inRange
                                ? 'Trong phạm vi hợp lệ (${_distance.toStringAsFixed(1)}m)'
                                : 'Ngoài phạm vi (${_distance.toStringAsFixed(1)}m)',
                            style: TextStyle(
                                color: _inRange ? AppColors.success : AppColors.error,
                                fontWeight: FontWeight.w600),
                          ),
                        ]),
                        const SizedBox(height: 4),
                        Text('Độ chính xác: ±${_currentPos!.accuracy.toStringAsFixed(1)}m',
                            style: const TextStyle(color: AppColors.textSecondary, fontSize: 13)),
                      ] else ...[
                        Text(_error ?? 'Đang lấy vị trí...', style: const TextStyle(color: AppColors.textSecondary)),
                      ],
                    ]),
                  ),
                ),
                const SizedBox(height: 16),
                // Check-in / Check-out buttons
                if (!hasCheckin) ...[
                  SizedBox(
                    height: 52,
                    child: ElevatedButton.icon(
                      onPressed: (_inRange && !_submitting) ? _checkIn : null,
                      icon: const Icon(Icons.login),
                      label: _submitting
                          ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                          : const Text('CHECK IN', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppColors.tertiary,
                        foregroundColor: Colors.white,
                        disabledBackgroundColor: AppColors.divider,
                      ),
                    ),
                  ),
                ] else ...[
                  // Show check-in info
                  Card(
                    color: AppColors.success.withOpacity(0.05),
                    child: Padding(
                      padding: const EdgeInsets.all(12),
                      child: Row(children: [
                        const Icon(Icons.check_circle, color: AppColors.success),
                        const SizedBox(width: 8),
                        Text(
                          'Đã check-in: ${(_attendance!['checkinAt'] as String).substring(11, 16)}',
                          style: const TextStyle(fontWeight: FontWeight.w600, color: AppColors.success),
                        ),
                      ]),
                    ),
                  ),
                  if (!hasCheckout) ...[
                    const SizedBox(height: 12),
                    SizedBox(
                      height: 52,
                      child: ElevatedButton.icon(
                        onPressed: !_submitting ? _checkOut : null,
                        icon: const Icon(Icons.logout),
                        label: _submitting
                            ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                            : const Text('CHECK OUT', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: AppColors.primary,
                          foregroundColor: Colors.white,
                        ),
                      ),
                    ),
                  ] else ...[
                    Card(
                      color: AppColors.navy.withOpacity(0.05),
                      child: Padding(
                        padding: const EdgeInsets.all(12),
                        child: Row(children: [
                          const Icon(Icons.logout, color: AppColors.navy),
                          const SizedBox(width: 8),
                          Text(
                            'Đã check-out: ${(_attendance!['checkoutAt'] as String).substring(11, 16)}',
                            style: const TextStyle(fontWeight: FontWeight.w600, color: AppColors.navy),
                          ),
                        ]),
                      ),
                    ),
                  ],
                ],
                const SizedBox(height: 16),
                OutlinedButton.icon(
                  onPressed: _getLocation,
                  icon: const Icon(Icons.refresh),
                  label: const Text('Cập nhật vị trí'),
                ),
              ],
            ),
    );
  }
}
