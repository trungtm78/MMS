import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart' show XFile;

import '../../core/constants/api_constants.dart';
import '../../shared/utils/api_failure.dart';
import '../auth/providers/auth_provider.dart';
import 'uploaded_file.dart';

/// What an upload is for: files.category (FILE_PURPOSES, Web/backend/src/files/files.service.ts).
/// Attaching a file to another kind of record is refused with file_purpose_mismatch.
enum FilePurpose {
  general('general'),
  taskReport('task_report'),
  workReport('work_report'),
  officialDocument('official_document');

  const FilePurpose(this.wire);

  /// The value the backend accepts
  final String wire;
}

/// Why a file was not uploaded or picked, other than an API error. Worded by filesIssueText
/// (lib/features/files/files_texts.dart).
enum FilesIssue {
  /// Nothing to upload (the server would answer 400 file_empty)
  fileEmpty,

  /// Over [FilesRepository.maxUploadBytes] (the server would answer 413 file_too_large)
  fileTooLarge,

  /// The picked file could not be read from the device
  unreadable,

  /// POST /files/upload did not answer a stored file
  malformedResponse,

  /// The camera or photo library permission was refused
  photoAccessDenied,

  /// The photo picker failed
  photoPickFailed,
}

/// A files call that failed: [issue] for a local check, [failure] for a failed API call (worded by
/// errorTextFor, lib/l10n/error_texts.dart).
class FilesException implements Exception, HasApiFailure {
  const FilesException(FilesIssue this.issue) : failure = null;

  FilesException.api(ApiFailure this.failure) : issue = null;

  final FilesIssue? issue;

  @override
  final ApiFailure? failure;

  int? get statusCode => failure?.status;

  @override
  String toString() => 'FilesException(${issue?.name ?? failure})';
}

/// REST client for Web/backend/src/files/files.controller.ts, on the app's authenticated Dio: the
/// Bearer token, its refresh and the end of the session apply as for every other request.
class FilesRepository {
  FilesRepository(this._dio);

  final Dio _dio;

  /// MAX_UPLOAD_BYTES (Web/backend/src/files/upload-type.ts)
  static const maxUploadBytes = 10 * 1024 * 1024;

  /// Uploads a picked file; see [uploadBytes].
  Future<UploadedFile> upload(
    XFile file, {
    FilePurpose purpose = FilePurpose.general,
    CancelToken? cancelToken,
  }) async =>
      uploadBytes(await readPicked(file), filename: file.name, purpose: purpose, cancelToken: cancelToken);

  /// The content of a picked file, or [FilesIssue.unreadable].
  static Future<Uint8List> readPicked(XFile file) async {
    try {
      return await file.readAsBytes();
    } catch (e) {
      throw const FilesException(FilesIssue.unreadable);
    }
  }

  /// POST /files/upload (multipart: file, purpose) → 201 the stored file, not attached to anything yet.
  /// Its id is what work reports (attachmentIds) and task reports (photoIds) accept.
  Future<UploadedFile> uploadBytes(
    Uint8List bytes, {
    required String filename,
    FilePurpose purpose = FilePurpose.general,
    CancelToken? cancelToken,
  }) async {
    // The server's own size refusals, checked first so a refused file is not sent over mobile data
    if (bytes.isEmpty) throw const FilesException(FilesIssue.fileEmpty);
    if (bytes.length > maxUploadBytes) throw const FilesException(FilesIssue.fileTooLarge);
    final form = FormData.fromMap({
      'purpose': purpose.wire,
      // Declared as generic application/octet-stream: the server decides the type from the content
      // (upload-type.ts resolveUploadType). Dio would otherwise declare a type from the file name.
      'file': MultipartFile.fromBytes(
        bytes,
        filename: filename,
        contentType: DioMediaType('application', 'octet-stream'),
      ),
    });
    final Object? data;
    try {
      data = (await _dio.post<Object?>(ApiConstants.filesUpload, data: form, cancelToken: cancelToken)).data;
    } on DioException catch (e) {
      throw FilesException.api(ApiFailure.from(e));
    }
    if (data is! Map || data['id'] == null) throw const FilesException(FilesIssue.malformedResponse);
    return UploadedFile.fromJson(Map<String, dynamic>.from(data));
  }

  /// GET /files/:id → the content, for those who may read the record the file belongs to; 404
  /// file_not_found for anyone else.
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
      throw FilesException.api(ApiFailure.from(_withJsonBody(e)));
    }
  }

  /// A bytes request keeps an error body as bytes; the error code is in its JSON.
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

final filesRepositoryProvider = Provider<FilesRepository>((ref) => FilesRepository(ref.watch(apiDioProvider)));

/// How long downloaded content stays cached once nothing shows it
const fileBytesCacheDuration = Duration(minutes: 5);

/// The content of a stored file by id ([FilesRepository.download]). A download nobody waits for any
/// more is cancelled; content that arrived stays cached for [fileBytesCacheDuration]. Failures are not
/// cached: `ref.invalidate` downloads again.
final fileBytesProvider = FutureProvider.autoDispose.family<Uint8List, String>((ref, id) async {
  final cancel = CancelToken();
  ref.onDispose(cancel.cancel);
  final bytes = await ref.watch(filesRepositoryProvider).download(id, cancelToken: cancel);
  final link = ref.keepAlive();
  final expiry = Timer(fileBytesCacheDuration, link.close);
  ref.onDispose(expiry.cancel);
  return bytes;
});
