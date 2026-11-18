import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/constants/api_constants.dart';
import '../../../shared/errors/app_failure.dart';
import '../../auth/providers/auth_provider.dart';
import '../models/leave_request.dart';

/// REST client for Web/backend/src/leave/leave.controller.ts. Every failure is an [AppFailure]:
/// the backend's refusals keep their code and status (e.g. 409 leave_request_not_pending).
class LeaveApprovalsApi {
  LeaveApprovalsApi(this._dio);

  final Dio _dio;

  /// ReviewLeaveDto.reason @MaxLength(1000) (leave.controller.ts:26-29)
  static const maxReasonLength = 1000;

  /// GET /leave?status=&page=&limit= — reviewers see their unit's requests (limit ≤ 100)
  Future<LeaveRequestPage> list({required String status, int page = 1, int limit = 100}) async {
    try {
      final res = await _dio.get<Object?>(
        ApiConstants.leaveRequests,
        queryParameters: {'status': status, 'page': page, 'limit': limit},
      );
      return LeaveRequestPage.fromJson(res.data);
    } catch (e) {
      throw AppFailure.from(e);
    }
  }

  /// PATCH /leave/:id/review {action: approve | reject, reason?} → 204
  Future<void> review(String id, {required bool approve, String? reason}) async {
    final r = reason?.trim() ?? '';
    if (r.length > maxReasonLength) {
      throw const AppFailure(AppFailure.leaveReasonTooLong, args: {'max': maxReasonLength});
    }
    try {
      await _dio.patch<Object?>(
        ApiConstants.leaveReview.replaceAll('{id}', id),
        data: {'action': approve ? 'approve' : 'reject', if (r.isNotEmpty) 'reason': r},
      );
    } catch (e) {
      throw AppFailure.from(e);
    }
  }
}

final leaveApprovalsApiProvider = Provider<LeaveApprovalsApi>((ref) {
  return LeaveApprovalsApi(ref.watch(dioProvider));
});
