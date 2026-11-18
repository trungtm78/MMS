import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart' show XFile;

import '../../core/constants/api_constants.dart';
import '../../features/auth/providers/auth_provider.dart';
import '../errors/app_failure.dart';
import 'uploaded_file.dart';

/// What an upload is for: files.category (FILE_PURPOSES, Web/backend/src/files/files.service.ts).
/// Attaching a file to another kind of record is refused with file_purpose_mismatch.
enum FilePurpose {
  general('general'),
  taskReport('task_report'),
  workReport('work_report'),
  officialDocument('official_document'),

  /// Attachments of a task itself
  task('task'),

  /// Documents of a militia profile
  militiaProfile('militia_profile');

  const FilePurpose(this.wire);

  /// The value the backend accepts
  final String wire;
}

/// REST client for Web/backend/src/files/files.controller.ts. Every failure is an [AppFailure].
class FilesApi {
  FilesApi(this._dio);

  final Dio _dio;

  /// MAX_UPLOAD_BYTES (Web/backend/src/files/upload-type.ts)
  static const maxUploadBytes = 10 * 1024 * 1024;

  /// Uploads a picked file; see [uploadBytes]
  Future<UploadedFile> upload(
    XFile file, {
    FilePurpose purpose = FilePurpose.general,
    CancelToken? cancelToken,
  }) async {
    final Uint8List bytes;
    try {
      bytes = await file.readAsBytes();
    } catch (e) {
      throw AppFailure.from(e);
    }
    return uploadBytes(bytes, filename: file.name, purpose: purpose, cancelToken: cancelToken);
  }

  /// POST /files/upload (multipart: file, purpose) → 201 the stored file, not yet attached to
  /// anything. Its id is what work reports (attachmentIds) and task reports accept.
  Future<UploadedFile> uploadBytes(
    Uint8List bytes, {
    required String filename,
    FilePurpose purpose = FilePurpose.general,
    CancelToken? cancelToken,
  }) async {
    // The server's own refusals, checked first so a refused file is not sent over mobile data
    if (bytes.isEmpty) throw const AppFailure('file_empty');
    if (bytes.length > maxUploadBytes) throw const AppFailure('file_too_large');
    final form = FormData.fromMap({
      'purpose': purpose.wire,
      // Declared as generic application/octet-stream: the server decides the type from the
      // content (upload-type.ts resolveUploadType). Dio would otherwise declare a type from the
      // file name, and a photo re-encoded as JPEG but still named .heic would be refused
      'file': MultipartFile.fromBytes(
        bytes,
        filename: filename,
        contentType: DioMediaType('application', 'octet-stream'),
      ),
    });
    try {
      final res = await _dio.post<Object?>(ApiConstants.filesUpload, data: form, cancelToken: cancelToken);
      final data = res.data;
      if (data is! Map || data['id'] == null) throw const AppFailure(AppFailure.badResponse);
      return UploadedFile.fromJson(Map<String, dynamic>.from(data));
    } catch (e) {
      throw AppFailure.from(e);
    }
  }

  /// GET /files/:id → the content, for those who may read the record the file belongs to; 404
  /// file_not_found for anyone else. Sent through the app's Dio, so the Bearer token, its
  /// refresh and the end of the session apply as for every other request.
  Future<Uint8List> download(String id, {CancelToken? cancelToken}) async {
    try {
      final res = await _dio.get<List<int>>(
        ApiConstants.fileById.replaceFirst('{id}', Uri.encodeComponent(id)),
        options: Options(responseType: ResponseType.bytes),
        cancelToken: cancelToken,
      );
      final data = res.data;
      return data is Uint8List ? data : Uint8List.fromList(data ?? const []);
    } on DioException catch (e) {
      throw AppFailure.from(_withJsonBody(e));
    }
  }

  /// A bytes request keeps an error body as bytes; the error code is in its JSON
  static DioException _withJsonBody(DioException e) {
    final response = e.response;
    final body = response?.data;
    if (response == null || body is! List<int>) return e;
    try {
      return e.copyWith(
        response: Response<Object?>(
          requestOptions: response.requestOptions,
          statusCode: response.statusCode,
          headers: response.headers,
          data: jsonDecode(utf8.decode(body)),
        ),
      );
    } on FormatException {
      return e;
    }
  }
}

final filesApiProvider = Provider<FilesApi>((ref) => FilesApi(ref.watch(dioProvider)));

/// How long downloaded content stays cached once nobody shows it
const fileBytesCacheDuration = Duration(minutes: 5);

/// The content of a stored file by id ([FilesApi.download]). A download nobody waits for any more
/// is cancelled; content that arrived stays cached for [fileBytesCacheDuration], so a list
/// scrolled back or a viewer opened on a thumbnail does not fetch it again. Failures are not
/// cached: `ref.invalidate` downloads again.
final fileBytesProvider = FutureProvider.autoDispose.family<Uint8List, String>((ref, id) async {
  final cancel = CancelToken();
  ref.onDispose(cancel.cancel);
  final bytes = await ref.watch(filesApiProvider).download(id, cancelToken: cancel);
  final link = ref.keepAlive();
  final expiry = Timer(fileBytesCacheDuration, link.close);
  ref.onDispose(expiry.cancel);
  return bytes;
});
