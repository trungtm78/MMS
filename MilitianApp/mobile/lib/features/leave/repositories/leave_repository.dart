import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/constants/api_constants.dart';
import '../../../core/network/dio_client.dart';
import '../../../shared/utils/api_failure.dart';
import '../../auth/providers/auth_provider.dart';
import '../leave_balance.dart';

/// A leave call that failed. [failure] is a failed API call, worded by the screen with errorTextFor
/// (lib/l10n/error_texts.dart); [message] is the text of a local check.
class LeaveException implements Exception, HasApiFailure {
  const LeaveException(String this.message, {this.statusCode, this.code}) : failure = null;

  LeaveException.api(ApiFailure this.failure)
      : message = null,
        statusCode = failure.status,
        code = failure.code;

  final String? message;

  @override
  final ApiFailure? failure;

  final int? statusCode;

  /// The backend error code (the body's `message`), when there is one
  final String? code;

  /// 404 or 409: the request is gone or no longer pending, so what the screen shows is out of date.
  bool get requestChanged => statusCode == 404 || statusCode == 409;

  @override
  String toString() => message ?? 'LeaveException($failure)';
}

/// REST client for Web/backend/src/leave/leave.controller.ts. The backend has no route that edits
/// or resubmits a leave request: only create, list, read, review and cancel.
class LeaveRepository {
  LeaveRepository(this._dio);

  final Dio _dio;

  /// listLeaveRequests clamps limit to 1..100 (leave.service.ts:146)
  static const pageSize = 100;

  /// Upper bound on pages read, so a misbehaving server cannot keep the app looping
  static const maxPages = 50;

  /// The caller's own requests, newest first: GET /leave?mine=true&page=&limit=
  /// (leave.controller.ts:41-56, leave.service.ts:135-201). Pages are read until one comes back short.
  Future<List<Map<String, dynamic>>> myRequests() async {
    final rows = <Map<String, dynamic>>[];
    for (var page = 1; page <= maxPages; page++) {
      final body = await _call(() => _dio.get(
            ApiConstants.leaveHistory,
            queryParameters: {'mine': 'true', 'page': page, 'limit': pageSize},
          ));
      if (body is! Map || body['data'] is! List) {
        throw const LeaveException('Dữ liệu đơn nghỉ phép không đúng định dạng.');
      }
      final data =
          (body['data'] as List).whereType<Map>().map((r) => Map<String, dynamic>.from(r)).toList();
      rows.addAll(data);
      if (data.length < pageSize) break;
    }
    return rows;
  }

  /// The balances of [year] from GET /leave-balances (bare array).
  Future<List<LeaveBalanceItem>> balances(int year) async =>
      balancesForYear(await _call(() => _dio.get(ApiConstants.leaveBalances)), year);

  /// PATCH /leave/:id/cancel → 204. Only the requester's own pending request can be cancelled:
  /// 404 leave_request_not_found, 403 not_your_leave_request, 409 leave_request_not_pending
  /// (leave.controller.ts:137-146, leave.service.ts:424-446).
  Future<void> cancel(String id) async {
    await _call(() => _dio.patch(ApiConstants.cancelLeave.replaceFirst('{id}', id)));
  }

  static Future<Object?> _call(Future<Response<dynamic>> Function() request) async {
    try {
      return (await request()).data;
    } on DioException catch (e) {
      throw LeaveException.api(ApiFailure.from(e));
    }
  }
}

final leaveRepositoryProvider = Provider<LeaveRepository>((ref) {
  return LeaveRepository(DioClient.getInstance(ref.watch(secureStorageProvider)));
});
