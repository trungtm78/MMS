import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/constants/api_constants.dart';
import '../../auth/providers/auth_provider.dart';

class GpsUploadService {
  Timer? _timer;
  final Ref _ref;

  /// Last known location, set externally by a location plugin listener.
  /// Until a real plugin is wired (geolocator), uploads are skipped — we
  /// MUST NOT post {lat:null, lng:null} which is fake telemetry.
  double? _lastLat;
  double? _lastLng;
  double? _lastAccuracy;

  GpsUploadService(this._ref);

  /// Update the cached location. Wire this to a `geolocator` stream
  /// (or platform-channel watcher) when implementing real tracking.
  void updateLocation({required double lat, required double lng, double? accuracy}) {
    _lastLat = lat;
    _lastLng = lng;
    _lastAccuracy = accuracy;
  }

  void start({Duration interval = const Duration(seconds: 30)}) {
    _timer?.cancel();
    _timer = Timer.periodic(interval, (_) => _upload());
  }

  void stop() => _timer?.cancel();

  Future<void> _upload() async {
    final lat = _lastLat;
    final lng = _lastLng;
    if (lat == null || lng == null) {
      debugPrint('[GPS] skip upload: location not yet acquired');
      return;
    }
    if (lat.abs() > 90 || lng.abs() > 180) {
      debugPrint('[GPS] skip upload: invalid coords lat=$lat lng=$lng');
      return;
    }

    try {
      final dio = _ref.read(dioProvider);
      await dio.post(ApiConstants.gpsRecord, data: {
        'lat': lat,
        'lng': lng,
        'accuracy': _lastAccuracy,
        'capturedAt': DateTime.now().toIso8601String(),
      });
    } catch (e) {
      // TODO(MOBILE-07-followup): persist to local queue and retry on reconnect.
      debugPrint('[GPS] upload failed: $e');
    }
  }
}

final gpsUploadServiceProvider = Provider<GpsUploadService>((ref) => GpsUploadService(ref));
