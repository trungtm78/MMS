import 'dart:async';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/dio_client.dart';
import '../../../core/constants/api_constants.dart';
import '../../auth/providers/auth_provider.dart';

class GpsBackgroundService {
  Timer? _timer;
  final Ref _ref;

  GpsBackgroundService(this._ref);

  void start({Duration interval = const Duration(seconds: 30)}) {
    _timer?.cancel();
    _timer = Timer.periodic(interval, (_) => _uploadGps());
  }

  void stop() {
    _timer?.cancel();
    _timer = null;
  }

  Future<void> _uploadGps() async {
    try {
      // In a real app, get GPS from location plugin
      // For now, stub with placeholder that can be wired to location plugin
      final storage = _ref.read(secureStorageProvider);
      final dio = DioClient.getInstance(storage);
      await dio.post(ApiConstants.gpsRecord, data: {
        'lat': null,   // wire to actual GPS
        'lng': null,
        'accuracy': null,
        'capturedAt': DateTime.now().toIso8601String(),
      });
    } catch (_) {
      // Silent failure — GPS upload is best-effort
    }
  }
}

final gpsBackgroundServiceProvider = Provider<GpsBackgroundService>((ref) {
  return GpsBackgroundService(ref);
});
