import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/constants/app_strings.dart';
import '../../../core/constants/api_constants.dart';
import '../../../core/network/dio_client.dart';
import '../../auth/providers/auth_provider.dart';
import '../../../shared/widgets/app_header.dart';

const _unitLat = 10.8231;
const _unitLng = 106.6297;
const _maxDistanceMeters = 15.0;

class CheckinScreen extends ConsumerStatefulWidget {
  const CheckinScreen({super.key});

  @override
  ConsumerState<CheckinScreen> createState() => _CheckinScreenState();
}

class _CheckinScreenState extends ConsumerState<CheckinScreen> {
  bool _locating = false;
  double? _distance;
  bool _locationOk = false;
  bool _loading = false;
  String? _message;
  bool _checkedIn = false;
  bool _success = false;
  Position? _currentPosition;

  Future<void> _locate() async {
    setState(() { _locating = true; _message = null; });
    try {
      LocationPermission perm = await Geolocator.checkPermission();
      if (perm == LocationPermission.denied) {
        perm = await Geolocator.requestPermission();
      }
      if (perm == LocationPermission.deniedForever) {
        setState(() { _message = AppStrings.errorGpsPermission; _locating = false; });
        return;
      }
      if (!await Geolocator.isLocationServiceEnabled()) {
        setState(() { _message = AppStrings.errorGpsDisabled; _locating = false; });
        return;
      }
      final pos = await Geolocator.getCurrentPosition(
        desiredAccuracy: LocationAccuracy.high,
      );
      final dist = Geolocator.distanceBetween(_unitLat, _unitLng, pos.latitude, pos.longitude);
      setState(() {
        _currentPosition = pos;
        _distance = dist;
        _locationOk = dist <= _maxDistanceMeters;
        _locating = false;
      });
    } catch (_) {
      setState(() { _message = AppStrings.errorGpsPermission; _locating = false; });
    }
  }

  Future<void> _checkin() async {
    if (!_locationOk || _currentPosition == null) return;
    setState(() => _loading = true);
    try {
      final storage = ref.read(secureStorageProvider);
      final dio = DioClient.getInstance(storage);
      await dio.post(ApiConstants.checkIn, data: {
        'location': {
          'lat': _currentPosition!.latitude,
          'lng': _currentPosition!.longitude,
          'accuracy': _currentPosition!.accuracy,
        },
        'source': 'mobile',
      });
      setState(() { _checkedIn = true; _success = true; _message = AppStrings.checkinSuccess; _loading = false; });
    } catch (_) {
      setState(() { _message = AppStrings.errorGeneral; _loading = false; });
    }
  }

  Future<void> _checkout() async {
    setState(() => _loading = true);
    try {
      final storage = ref.read(secureStorageProvider);
      final dio = DioClient.getInstance(storage);
      final data = _currentPosition != null
          ? {'location': {'lat': _currentPosition!.latitude, 'lng': _currentPosition!.longitude, 'accuracy': _currentPosition!.accuracy}}
          : <String, dynamic>{};
      await dio.post(ApiConstants.checkOut, data: data);
      setState(() { _checkedIn = false; _success = true; _message = AppStrings.checkoutSuccess; _loading = false; });
    } catch (_) {
      setState(() { _message = AppStrings.errorGeneral; _loading = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    final now = DateTime.now();
    final timeStr = '${now.hour.toString().padLeft(2, '0')}:${now.minute.toString().padLeft(2, '0')}';

    return Scaffold(
      appBar: AppHeader(title: AppStrings.checkin),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // ── Time display (per Refs: text-4xl font-bold text-[#366092]) ──
              Text(
                timeStr,
                textAlign: TextAlign.center,
                style: const TextStyle(
                  fontSize: 48,
                  fontWeight: FontWeight.w800,
                  color: AppColors.navy,
                  letterSpacing: 2,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                '${now.day}/${now.month}/${now.year}',
                textAlign: TextAlign.center,
                style: const TextStyle(
                  fontSize: 14,
                  color: AppColors.textSecondary,
                ),
              ),
              const SizedBox(height: 20),

              // ── GPS Map placeholder ───────────────────────────────────────
              _GpsIndicator(
                locating: _locating,
                distance: _distance,
                locationOk: _locationOk,
              ),
              const SizedBox(height: 16),

              // ── Locate button ─────────────────────────────────────────────
              OutlinedButton.icon(
                icon: Icon(
                  Icons.my_location,
                  color: _locating ? AppColors.textSecondary : AppColors.navy,
                ),
                label: Text(
                  _locating ? AppStrings.locating : 'Xác định vị trí',
                  style: TextStyle(
                    color: _locating ? AppColors.textSecondary : AppColors.navy,
                  ),
                ),
                style: OutlinedButton.styleFrom(
                  side: BorderSide(
                    color: _locating ? AppColors.textMuted : AppColors.navy,
                    width: 1.5,
                  ),
                  minimumSize: const Size(double.infinity, 44),
                ),
                onPressed: _locating ? null : _locate,
              ),
              const SizedBox(height: 12),

              // ── Distance status ───────────────────────────────────────────
              if (_distance != null)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                  decoration: BoxDecoration(
                    color: _locationOk
                        ? AppColors.success.withOpacity(0.1)
                        : AppColors.error.withOpacity(0.1),
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(
                      color: _locationOk ? AppColors.success : AppColors.error,
                    ),
                  ),
                  child: Row(
                    children: [
                      Icon(
                        _locationOk ? Icons.check_circle : Icons.cancel,
                        color: _locationOk ? AppColors.success : AppColors.error,
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          _locationOk ? AppStrings.locationOk : AppStrings.locationFar,
                          style: TextStyle(
                            color: _locationOk ? AppColors.success : AppColors.error,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                      Text(
                        '${_distance!.toStringAsFixed(1)} m',
                        style: TextStyle(
                          color: _locationOk ? AppColors.success : AppColors.error,
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                  ),
                ),

              if (_message != null) ...[
                const SizedBox(height: 12),
                Text(
                  _message!,
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    color: _success ? AppColors.success : AppColors.error,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],

              const Spacer(),

              // ── Check-in / Check-out gradient button (per Refs) ───────────
              _GradientButton(
                key: const Key('checkin_button'),
                label: _checkedIn ? AppStrings.checkOut : AppStrings.checkIn,
                icon: _checkedIn ? Icons.logout : Icons.login,
                gradient: _checkedIn
                    ? AppColors.checkOutGradient
                    : AppColors.checkInGradient,
                loading: _loading,
                disabled: !_locationOk && !_checkedIn,
                onTap: (_loading || (!_locationOk && !_checkedIn))
                    ? null
                    : (_checkedIn ? _checkout : _checkin),
              ),
              const SizedBox(height: 8),
            ],
          ),
        ),
      ),
    );
  }
}

// ─── GPS indicator ────────────────────────────────────────────────────────────
class _GpsIndicator extends StatelessWidget {
  final bool locating;
  final double? distance;
  final bool locationOk;

  const _GpsIndicator({
    required this.locating,
    required this.distance,
    required this.locationOk,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 130,
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.divider, width: 1.5),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.04),
            blurRadius: 6,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          if (locating)
            const CircularProgressIndicator(
              color: AppColors.navy,
              strokeWidth: 3,
            )
          else
            Icon(
              Icons.location_on,
              size: 52,
              color: distance == null
                  ? AppColors.textSecondary
                  : locationOk
                      ? AppColors.success
                      : AppColors.error,
            ),
          const SizedBox(height: 6),
          Text(
            locating
                ? AppStrings.locating
                : distance == null
                    ? 'Nhấn để xác định vị trí'
                    : '${distance!.toStringAsFixed(1)} m từ đơn vị',
            style: const TextStyle(color: AppColors.textSecondary, fontSize: 13),
          ),
          if (!locating)
            const Text(
              AppStrings.gpsThreshold,
              style: TextStyle(fontSize: 11, color: AppColors.textMuted),
            ),
        ],
      ),
    );
  }
}

// ─── Gradient button ──────────────────────────────────────────────────────────
class _GradientButton extends StatelessWidget {
  final String label;
  final IconData icon;
  final LinearGradient gradient;
  final bool loading;
  final bool disabled;
  final VoidCallback? onTap;

  const _GradientButton({
    super.key,
    required this.label,
    required this.icon,
    required this.gradient,
    required this.loading,
    required this.disabled,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        height: 54,
        decoration: BoxDecoration(
          gradient: disabled ? null : gradient,
          color: disabled ? AppColors.divider : null,
          borderRadius: BorderRadius.circular(12),
          boxShadow: disabled
              ? null
              : [
                  BoxShadow(
                    color: Colors.black.withOpacity(0.2),
                    blurRadius: 8,
                    offset: const Offset(0, 3),
                  ),
                ],
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            if (loading)
              const SizedBox(
                height: 22,
                width: 22,
                child: CircularProgressIndicator(
                  strokeWidth: 2.5,
                  color: Colors.white,
                ),
              )
            else ...[
              Icon(icon, color: Colors.white, size: 22),
              const SizedBox(width: 10),
              Text(
                label,
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 16,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 0.5,
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
