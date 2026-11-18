import '../../../shared/utils/calendar_date.dart';

/// Who decided a leave request: the latest leave_approvals row
/// (Web/backend/src/leave/leave.service.ts LEAVE_REQUEST_COLUMNS).
class LeaveReviewer {
  const LeaveReviewer({required this.id, required this.fullName});

  final String id;
  final String fullName;
}

/// A leave request row from GET /leave (Web/backend/src/leave/leave.service.ts).
class LeaveRequest {
  final String id;
  final String code;
  final String requesterName;
  final String leaveTypeName;
  final DateTime? fromDate;
  final DateTime? toDate;
  final double totalDays;
  final String reason;
  final String status; // pending | approved | rejected | cancelled
  final DateTime? createdAt;

  /// The latest decision; null while nobody decided the request
  final LeaveReviewer? reviewedBy;
  final DateTime? reviewedAt;

  /// The reason given with that decision
  final String? reviewNote;

  const LeaveRequest({
    required this.id,
    required this.code,
    required this.requesterName,
    required this.leaveTypeName,
    this.fromDate,
    this.toDate,
    required this.totalDays,
    required this.reason,
    required this.status,
    this.createdAt,
    this.reviewedBy,
    this.reviewedAt,
    this.reviewNote,
  });

  factory LeaveRequest.fromJson(Map<String, dynamic> json) {
    final id = json['id'];
    if (id == null) throw const FormatException('leave request without id');
    final days = json['totalDays'];
    return LeaveRequest(
      id: id.toString(),
      code: json['code'] as String? ?? '',
      requesterName: json['requesterName'] as String? ?? '',
      leaveTypeName: json['leaveTypeName'] as String? ?? '',
      // DATE columns: 'YYYY-MM-DD' calendar days (Web/backend/src/database/pg-types.ts)
      fromDate: parseCalendarDate(json['fromDate']),
      toDate: parseCalendarDate(json['toDate']),
      // total_days is NUMERIC: node-postgres sends it as a string
      totalDays: days is num ? days.toDouble() : double.tryParse('$days') ?? 0,
      reason: json['reason'] as String? ?? '',
      status: json['status'] as String? ?? 'pending',
      createdAt: _instant(json['createdAt']),
      reviewedBy: _reviewer(json['reviewedBy']),
      reviewedAt: _instant(json['reviewedAt']),
      reviewNote: _nonBlank(json['reviewNote']),
    );
  }

  bool get isPending => status == 'pending';
}

/// The {data, total, page, limit} envelope of GET /leave.
class LeaveRequestPage {
  final List<LeaveRequest> items;
  final int total;
  final int page;
  final int limit;

  const LeaveRequestPage({
    required this.items,
    required this.total,
    required this.page,
    required this.limit,
  });

  factory LeaveRequestPage.fromJson(Object? body) {
    if (body is! Map || body['data'] is! List) {
      throw const FormatException('leave request list without data');
    }
    final items = (body['data'] as List)
        .whereType<Map>()
        .map((e) => LeaveRequest.fromJson(Map<String, dynamic>.from(e)))
        .toList();
    int asInt(Object? v, int fallback) => v is num ? v.toInt() : int.tryParse('$v') ?? fallback;
    return LeaveRequestPage(
      items: items,
      total: asInt(body['total'], items.length),
      page: asInt(body['page'], 1),
      limit: asInt(body['limit'], items.length),
    );
  }
}

LeaveReviewer? _reviewer(Object? value) => value is Map && value['id'] != null
    ? LeaveReviewer(id: value['id'].toString(), fullName: value['fullName'] as String? ?? '')
    : null;

DateTime? _instant(Object? value) => value is String ? DateTime.tryParse(value) : null;

String? _nonBlank(Object? value) => value is String && value.trim().isNotEmpty ? value.trim() : null;
