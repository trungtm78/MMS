import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/constants/api_constants.dart';
import '../../../shared/errors/app_failure.dart';
import '../../auth/providers/auth_provider.dart';
import '../models/gps_position.dart';

class GpsApi {
  GpsApi(this._dio);

  final Dio _dio;

  /// GET /gps/live: the latest position of every member in the caller's scope
  /// (Web/backend/src/gps/gps.controller.ts:63-68). Failures are [AppFailure]s.
  Future<List<GpsPosition>> live() async {
    try {
      final res = await _dio.get(ApiConstants.gpsLive);
      return GpsPosition.listFromJson(res.data);
    } catch (e) {
      throw AppFailure.from(e);
    }
  }
}

final gpsApiProvider = Provider<GpsApi>((ref) => GpsApi(ref.watch(dioProvider)));

/// Map tile URL template; null draws the markers without tiles (tests have no network)
final gpsMapTilesProvider = Provider<String?>((ref) => 'https://tile.openstreetmap.org/{z}/{x}/{y}.png');
