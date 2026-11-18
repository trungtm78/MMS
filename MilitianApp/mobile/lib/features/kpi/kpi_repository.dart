import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/constants/api_constants.dart';
import '../auth/providers/auth_provider.dart';
import 'kpi_data.dart';

/// REST client for the caller's own KPI (Web/backend/src/kpi/kpi.controller.ts). Both routes answer
/// bare JSON, without a {data} envelope; failures are the Dio errors, worded by errorTextFor.
class KpiRepository {
  KpiRepository(this._dio);

  final Dio _dio;

  /// GET /kpi/current: this month's score, scale and standing
  Future<KpiCurrent> current() async => KpiCurrent.fromJson((await _dio.get<dynamic>(ApiConstants.kpiCurrent)).data);

  /// GET /kpi/history: the last [months] evaluated months, oldest first
  Future<List<KpiTrendPoint>> trend({int months = 6}) async =>
      kpiTrend((await _dio.get<dynamic>(ApiConstants.kpiHistory)).data, months: months);
}

final kpiRepositoryProvider = Provider<KpiRepository>((ref) => KpiRepository(ref.watch(apiDioProvider)));

/// This month's KPI of the caller, for the profile stats
final kpiCurrentProvider = FutureProvider.autoDispose<KpiCurrent>((ref) => ref.watch(kpiRepositoryProvider).current());
