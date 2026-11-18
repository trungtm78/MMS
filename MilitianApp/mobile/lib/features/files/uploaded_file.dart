import '../../shared/utils/number_format.dart';

/// A stored file as every backend endpoint returns it: FileView in Web/backend/src/files/files.service.ts
/// ({id, url, name, mimeType, size}).
class UploadedFile {
  const UploadedFile({
    required this.id,
    required this.url,
    required this.name,
    required this.mimeType,
    required this.size,
  });

  final String id;

  /// Path of the content with the global API prefix ('/api/v1/mms_core/files/{id}'). Requests are
  /// built from [id] instead (FilesRepository.download): the app's Dio baseUrl already holds the prefix.
  final String url;
  final String name;
  final String mimeType;

  /// Bytes
  final int size;

  factory UploadedFile.fromJson(Map<String, dynamic> json) {
    final id = json['id'];
    if (id == null) throw const FormatException('file without id');
    return UploadedFile(
      id: id.toString(),
      url: json['url'] as String? ?? '',
      name: json['name'] as String? ?? '',
      mimeType: json['mimeType'] as String? ?? '',
      // files.size is BIGINT: node-postgres may send it as text
      size: parseWholeNumber(json['size']) ?? 0,
    );
  }

  /// The files of a record (a work report's attachments, a task report's photos); entries without an
  /// id are skipped.
  static List<UploadedFile> listFromJson(Object? value) => value is List
      ? [
          for (final entry in value)
            if (entry is Map && entry['id'] != null) UploadedFile.fromJson(Map<String, dynamic>.from(entry)),
        ]
      : const [];

  bool get isImage => mimeType.startsWith('image/');
}
