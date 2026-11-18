import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/constants/api_constants.dart';
import '../../../core/network/dio_client.dart';
import '../../../shared/utils/api_failure.dart';
import '../../auth/providers/auth_provider.dart';

/// Why a report was refused before it was sent. Worded by incidentReportErrorText
/// (lib/features/incident/incident_report_texts.dart).
enum IncidentReportIssue {
  titleRequired,
  titleTooLong,
  contentRequired,
  contentTooLong,
  locationRequired,
  locationTooLong,

  /// More than [IncidentReportRepository.maxAttachments] attachments
  tooManyAttachments,

  /// The same upload twice (the server answers 400 duplicate_file_ids)
  duplicateAttachments,
}

/// A report that was not sent: [issue] for a local check, [failure] for a refused or failed call.
class IncidentReportException implements Exception, HasApiFailure {
  const IncidentReportException(IncidentReportIssue this.issue) : failure = null;

  IncidentReportException.api(ApiFailure this.failure) : issue = null;

  final IncidentReportIssue? issue;

  @override
  final ApiFailure? failure;

  int? get statusCode => failure?.status;

  @override
  String toString() => 'IncidentReportException(${issue?.name ?? failure})';
}

/// Sends incident reports as work reports: POST /work-reports
/// (Web/backend/src/work-reports/work-reports.controller.ts create, work-reports.service.ts create).
class IncidentReportRepository {
  IncidentReportRepository(this._dio);

  final Dio _dio;

  /// One of WORK_REPORT_TYPES (Web/backend/src/work-reports/work-reports.dto.ts)
  static const reportType = 'incident';

  // CreateWorkReportBodyDto limits (work-reports.dto.ts), in characters
  static const maxTitleLength = 255;
  static const maxContentLength = 10000;
  static const maxLocationLength = 255;

  /// attachmentIds @ArrayMaxSize(10) @ArrayUnique (work-reports.dto.ts)
  static const maxAttachments = 10;

  /// The request body, or [IncidentReportException] when a field would be rejected.
  /// Only DTO fields are sent: the global ValidationPipe rejects unknown ones. [attachmentIds] are
  /// uploads with purpose work_report (POST /files/upload), in display order.
  static Map<String, dynamic> buildPayload({
    required String title,
    required String content,
    required String location,
    List<String> attachmentIds = const [],
  }) {
    final t = title.trim();
    final c = content.trim();
    final l = location.trim();
    if (t.isEmpty) throw const IncidentReportException(IncidentReportIssue.titleRequired);
    if (t.runes.length > maxTitleLength) throw const IncidentReportException(IncidentReportIssue.titleTooLong);
    if (c.isEmpty) throw const IncidentReportException(IncidentReportIssue.contentRequired);
    if (c.runes.length > maxContentLength) throw const IncidentReportException(IncidentReportIssue.contentTooLong);
    if (l.isEmpty) throw const IncidentReportException(IncidentReportIssue.locationRequired);
    if (l.runes.length > maxLocationLength) {
      throw const IncidentReportException(IncidentReportIssue.locationTooLong);
    }
    if (attachmentIds.length > maxAttachments) {
      throw const IncidentReportException(IncidentReportIssue.tooManyAttachments);
    }
    if (attachmentIds.toSet().length != attachmentIds.length) {
      throw const IncidentReportException(IncidentReportIssue.duplicateAttachments);
    }
    return {
      'reportType': reportType,
      'title': t,
      'content': c,
      'location': l,
      if (attachmentIds.isNotEmpty) 'attachmentIds': attachmentIds,
    };
  }

  /// Sends the report and returns the stored row, attachments included. Refusals keep their code:
  /// 400 validation_failed, and for attachments 400 file_not_found / duplicate_file_ids /
  /// file_purpose_mismatch / file_type_not_allowed and 409 file_already_attached (files.service.ts attach).
  Future<Map<String, dynamic>> submit({
    required String title,
    required String content,
    required String location,
    List<String> attachmentIds = const [],
  }) async {
    final payload = buildPayload(title: title, content: content, location: location, attachmentIds: attachmentIds);
    try {
      final res = await _dio.post(ApiConstants.incidentReport, data: payload);
      final data = res.data;
      return data is Map ? Map<String, dynamic>.from(data) : <String, dynamic>{};
    } on DioException catch (e) {
      throw IncidentReportException.api(ApiFailure.from(e));
    }
  }
}

final incidentReportRepositoryProvider = Provider<IncidentReportRepository>((ref) {
  return IncidentReportRepository(DioClient.getInstance(ref.watch(secureStorageProvider)));
});
