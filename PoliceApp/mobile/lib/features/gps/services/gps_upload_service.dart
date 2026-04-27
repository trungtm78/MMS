import 'dart:async';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/constants/api_constants.dart';
import '../../auth/providers/auth_provider.dart';

class GpsUploadService {
  Timer? _timer;
  final Ref _ref;

  GpsUploadService(this._ref);

  void start({Duration interval = const Duration(seconds: 30)}) {
    _timer?.cancel();
    _timer = Timer.periodic(interval, (_) => _upload());
  }

  void stop() => _timer?.cancel();

  Future<void> _upload() async {
    try {
      final dio = _ref.read(dioProvider);
      await dio.post(ApiConstants.gpsRecord, data: {
        'lat': null,   // wire to location plugin
        'lng': null,
        'accuracy': null,
        'capturedAt': DateTime.now().toIso8601String(),
      });
    } catch (_) {}
  }
}

final gpsUploadServiceProvider = Provider<GpsUploadService>((ref) => GpsUploadService(ref));
