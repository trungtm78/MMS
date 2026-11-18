import '../../../shared/files/uploaded_file.dart';
import '../../../shared/utils/calendar_date.dart';

/// report_type values accepted by the backend (Web/backend/src/work-reports/work-reports.dto.ts:16)
const workReportTypes = ['daily', 'incident', 'monthly'];

/// reviewStatus filter values (work-reports.dto.ts:64)
const workReviewStatuses = ['pending', 'approved', 'rejected'];

/// A work report from GET /work-reports and GET /work-reports/:id (work-reports.service.ts
/// REPORT_COLUMNS), with its attached files in the author's order. Type and review status stay
/// codes; lib/features/reports/widgets/work_report_texts.dart gives their texts.
class WorkReport {
  final String id;
  final String reportType;
  final String title;
  final String content;
  final String? location;
  final String? period;
  final String reviewStatus; // pending | approved | rejected
  final String? reviewNote;
  final String? createdBy;
  final String? authorName;
  final DateTime? createdAt;
  final DateTime? reviewedAt;
  final String? reviewedBy;
  final List<UploadedFile> attachments;

  const WorkReport({
    required this.id,
    required this.reportType,
    required this.title,
    required this.content,
    this.location,
    this.period,
    required this.reviewStatus,
    this.reviewNote,
    this.createdBy,
    this.authorName,
    this.createdAt,
    this.reviewedAt,
    this.reviewedBy,
    this.attachments = const [],
  });

  factory WorkReport.fromJson(Map<String, dynamic> json) {
    final id = json['id'];
    if (id == null) throw const FormatException('work report without id');
    return WorkReport(
      id: id.toString(),
      reportType: json['reportType'] as String? ?? '',
      title: json['title'] as String? ?? '',
      content: json['content'] as String? ?? '',
      location: _nonBlank(json['location']),
      period: _nonBlank(json['period']),
      reviewStatus: json['reviewStatus'] as String? ?? 'pending',
      reviewNote: _nonBlank(json['reviewNote']),
      createdBy: json['createdBy']?.toString(),
      authorName: _nonBlank(json['authorName']),
      createdAt: _parseDate(json['createdAt']),
      reviewedAt: _parseDate(json['reviewedAt']),
      reviewedBy: json['reviewedBy']?.toString(),
      attachments: UploadedFile.listFromJson(json['attachments']),
    );
  }

  bool get isPending => reviewStatus == 'pending';

  /// The attachments that can be shown as pictures
  List<UploadedFile> get imageAttachments => [
        for (final file in attachments)
          if (file.isImage) file,
      ];
}

/// The {data, total, page, limit} envelope of GET /work-reports.
class WorkReportPage {
  final List<WorkReport> items;
  final int total;
  final int page;
  final int limit;

  const WorkReportPage({
    required this.items,
    required this.total,
    required this.page,
    required this.limit,
  });

  factory WorkReportPage.fromJson(Object? body) {
    if (body is! Map || body['data'] is! List) {
      throw const FormatException('work report list without data');
    }
    final items = (body['data'] as List)
        .whereType<Map>()
        .map((e) => WorkReport.fromJson(Map<String, dynamic>.from(e)))
        .toList();
    return WorkReportPage(
      items: items,
      total: _asInt(body['total'], items.length),
      page: _asInt(body['page'], 1),
      limit: _asInt(body['limit'], items.length),
    );
  }
}

/// The from/to query of GET /work-reports for 'week' (Monday..today) or 'month' (1st..today).
/// Both are Vietnamese calendar days, inclusive, as the backend filters
/// (work-reports.dto.ts:83-90, work-reports.service.ts:133-140).
({String from, String to}) reportPeriodRange(String period, [DateTime? now]) {
  final today = vietnamToday(now);
  final DateTime start;
  switch (period) {
    case 'week':
      start = DateTime(today.year, today.month, today.day - (today.weekday - DateTime.monday));
    case 'month':
      start = DateTime(today.year, today.month, 1);
    default:
      throw ArgumentError.value(period, 'period', 'week | month');
  }
  return (from: toCalendarDateString(start), to: toCalendarDateString(today));
}

String? _nonBlank(Object? value) => value is String && value.trim().isNotEmpty ? value : null;

DateTime? _parseDate(Object? value) => value is String ? DateTime.tryParse(value) : null;

int _asInt(Object? value, int fallback) =>
    value is num ? value.toInt() : int.tryParse('$value') ?? fallback;
