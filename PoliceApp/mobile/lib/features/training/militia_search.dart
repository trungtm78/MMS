/// One row of GET /militia (Web/backend/src/militia/militia.service.ts:44-54, 374-378).
class MilitiaSearchItem {
  final String id; // militia_profiles.id — what POST /training expects as militiaId
  final String? userId;
  final String militiaCode;
  final String fullName;
  final String? unitCode;
  final String? unitName;
  final String? rank;
  final String? phone;

  const MilitiaSearchItem({
    required this.id,
    this.userId,
    required this.militiaCode,
    required this.fullName,
    this.unitCode,
    this.unitName,
    this.rank,
    this.phone,
  });

  factory MilitiaSearchItem.fromJson(Map<String, dynamic> json) => MilitiaSearchItem(
        id: json['id'].toString(),
        userId: json['userId']?.toString(),
        militiaCode: json['militiaCode'] as String? ?? '',
        fullName: json['fullName'] as String? ?? '',
        unitCode: json['unitCode'] as String?,
        unitName: json['unitName'] as String?,
        rank: json['rank'] as String?,
        phone: json['phone'] as String?,
      );

  String get subtitle => [militiaCode, unitName ?? '']
      .where((part) => part.trim().isNotEmpty)
      .join(' — ');
}

/// The {data, total, page, limit} envelope of GET /militia?q=&limit=.
class MilitiaSearchPage {
  final List<MilitiaSearchItem> items;
  final int total;
  final int page;
  final int limit;

  const MilitiaSearchPage({
    required this.items,
    required this.total,
    required this.page,
    required this.limit,
  });

  factory MilitiaSearchPage.fromJson(Object? body) {
    if (body is! Map || body['data'] is! List) {
      // Not shown to users: AppFailure.from turns it into AppFailure.badResponse
      throw const FormatException('GET /militia: expected {data: [...]}');
    }
    final items = (body['data'] as List)
        .whereType<Map>()
        .where((row) => row['id'] != null)
        .map((row) => MilitiaSearchItem.fromJson(Map<String, dynamic>.from(row)))
        .toList();
    int asInt(Object? v, int fallback) => v is num ? v.toInt() : int.tryParse('$v') ?? fallback;
    return MilitiaSearchPage(
      items: items,
      total: asInt(body['total'], items.length),
      page: asInt(body['page'], 1),
      limit: asInt(body['limit'], items.length),
    );
  }
}
