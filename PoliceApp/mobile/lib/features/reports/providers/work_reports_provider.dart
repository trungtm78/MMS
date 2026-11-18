import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/constants/api_constants.dart';
import '../../../shared/errors/app_failure.dart';
import '../../../shared/utils/calendar_date.dart';
import '../../auth/providers/auth_provider.dart';
import '../models/work_report.dart';

/// REST client for Web/backend/src/work-reports/work-reports.controller.ts. Every failure is an
/// [AppFailure]: local checks throw app codes before any request; the backend's refusals keep
/// their code and status.
class WorkReportsApi {
  WorkReportsApi(this._dio);

  final Dio _dio;

  // Limits from Web/backend/src/work-reports/work-reports.dto.ts
  static const maxTitleLength = 255;
  static const maxContentLength = 10000;
  static const maxLocationLength = 255;
  static const maxReviewNoteLength = 1000;

  /// attachmentIds @ArrayMaxSize(10)
  static const maxAttachments = 10;

  /// GET /work-reports?type=&reviewStatus=&from=&to=&page=&limit= (limit ≤ 100;
  /// from/to are 'YYYY-MM-DD' Vietnamese calendar days, inclusive)
  Future<WorkReportPage> list({
    String? type,
    String? reviewStatus,
    String? from,
    String? to,
    int page = 1,
    int limit = 20,
  }) async {
    if (type != null && !workReportTypes.contains(type)) {
      throw const AppFailure(AppFailure.reportTypeInvalid);
    }
    if (reviewStatus != null && !workReviewStatuses.contains(reviewStatus)) {
      throw const AppFailure(AppFailure.reviewStatusInvalid);
    }
    for (final date in [from, to]) {
      if (date != null && (date.length != 10 || parseCalendarDate(date) == null)) {
        throw const AppFailure(AppFailure.dateFilterInvalid);
      }
    }
    return _call(() async {
      final res = await _dio.get<Object?>(
        ApiConstants.workReports,
        queryParameters: {
          'page': page,
          'limit': limit,
          if (type != null) 'type': type,
          if (reviewStatus != null) 'reviewStatus': reviewStatus,
          if (from != null) 'from': from,
          if (to != null) 'to': to,
        },
      );
      return WorkReportPage.fromJson(res.data);
    });
  }

  /// GET /work-reports/:id — one report with its attachments; 404 work_report_not_found outside
  /// the caller's audience
  Future<WorkReport> findOne(String id) => _call(() async {
        final res = await _dio.get<Object?>(
          ApiConstants.workReportById.replaceFirst('{id}', Uri.encodeComponent(id)),
        );
        final data = res.data;
        if (data is! Map) throw const FormatException('work report is not an object');
        return WorkReport.fromJson(Map<String, dynamic>.from(data));
      });

  /// POST /work-reports {reportType, title, content, location?, attachmentIds?}. [attachmentIds]
  /// are uploads with purpose work_report, in display order; the report and its attachments are
  /// written together, so a refused attachment (file_not_found, duplicate_file_ids,
  /// file_purpose_mismatch, file_type_not_allowed, file_already_attached) creates nothing.
  Future<WorkReport> create({
    required String reportType,
    required String title,
    required String content,
    String? location,
    List<String> attachmentIds = const [],
  }) async {
    if (!workReportTypes.contains(reportType)) {
      throw const AppFailure(AppFailure.reportTypeInvalid);
    }
    final t = title.trim();
    final c = content.trim();
    final l = location?.trim() ?? '';
    if (t.isEmpty) throw const AppFailure(AppFailure.reportTitleRequired);
    if (t.length > maxTitleLength) {
      throw const AppFailure(AppFailure.reportTitleTooLong, args: {'max': maxTitleLength});
    }
    if (c.isEmpty) throw const AppFailure(AppFailure.reportContentRequired);
    if (c.length > maxContentLength) {
      throw const AppFailure(AppFailure.reportContentTooLong, args: {'max': maxContentLength});
    }
    if (l.length > maxLocationLength) {
      throw const AppFailure(AppFailure.reportLocationTooLong, args: {'max': maxLocationLength});
    }
    if (attachmentIds.length > maxAttachments) {
      throw const AppFailure(AppFailure.attachmentsTooMany, args: {'max': maxAttachments});
    }
    return _call(() async {
      final res = await _dio.post<Object?>(ApiConstants.workReports, data: {
        'reportType': reportType,
        'title': t,
        'content': c,
        if (l.isNotEmpty) 'location': l,
        if (attachmentIds.isNotEmpty) 'attachmentIds': attachmentIds,
      });
      final data = res.data;
      // A 201 is a created report even when its answer has no body
      return data is Map
          ? WorkReport.fromJson(Map<String, dynamic>.from(data))
          : WorkReport(id: '', reportType: reportType, title: t, content: c, reviewStatus: 'pending');
    });
  }

  /// PATCH /work-reports/:id/review {reviewStatus: approved | rejected, reviewNote?}
  Future<void> review(String id, {required bool approve, String? note}) async {
    final n = note?.trim() ?? '';
    if (n.length > maxReviewNoteLength) {
      throw const AppFailure(AppFailure.reviewNoteTooLong, args: {'max': maxReviewNoteLength});
    }
    await _call(() => _dio.patch<Object?>(
          ApiConstants.workReportReview.replaceFirst('{id}', id),
          data: {
            'reviewStatus': approve ? 'approved' : 'rejected',
            if (n.isNotEmpty) 'reviewNote': n,
          },
        ));
  }

  /// A request whose failure, whatever it is (a refusal, a lost connection, a malformed answer),
  /// becomes an [AppFailure]
  static Future<T> _call<T>(Future<T> Function() request) async {
    try {
      return await request();
    } catch (e) {
      throw AppFailure.from(e);
    }
  }
}

final workReportsApiProvider = Provider<WorkReportsApi>((ref) {
  return WorkReportsApi(ref.watch(dioProvider));
});
