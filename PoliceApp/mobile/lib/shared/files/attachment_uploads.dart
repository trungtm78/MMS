import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:image_picker/image_picker.dart' show XFile;

import '../errors/app_failure.dart';
import 'files_api.dart';
import 'uploaded_file.dart';

enum AttachmentStatus { uploading, uploaded, failed }

/// One picked photo on its way to the server
class AttachmentItem {
  AttachmentItem._(this.key, this.name, this._source);

  /// Stable identity while the list changes
  final int key;
  final String name;
  final XFile _source;

  Uint8List? _bytes;
  AttachmentStatus _status = AttachmentStatus.uploading;
  UploadedFile? _file;
  AppFailure? _failure;
  CancelToken? _cancel;
  Completer<void>? _settled;

  /// The picked content once read, for the preview and the upload
  Uint8List? get bytes => _bytes;
  AttachmentStatus get status => _status;

  /// The stored file, once uploaded
  UploadedFile? get file => _file;

  /// Why the last upload failed
  AppFailure? get failure => _failure;
}

/// Photos picked for a record, each uploaded ([FilesApi.uploadBytes] with [purpose]) as soon as it
/// is added, until the record is submitted with [uploadedIds]. Holds at most [max] photos.
class AttachmentUploads extends ChangeNotifier {
  AttachmentUploads({required FilesApi api, required this.purpose, required this.max}) : _api = api;

  final FilesApi _api;
  final FilePurpose purpose;
  final int max;

  final _items = <AttachmentItem>[];
  var _nextKey = 0;
  var _disposed = false;

  List<AttachmentItem> get items => List.unmodifiable(_items);
  int get remaining => max - _items.length;
  bool get isUploading => _items.any((i) => i.status == AttachmentStatus.uploading);
  bool get hasFailures => _items.any((i) => i.status == AttachmentStatus.failed);

  /// Ids of the uploaded photos, in display order
  List<String> get uploadedIds => [
        for (final item in _items)
          if (item.file case final file?) file.id,
      ];

  /// Adds [files] while there is room and starts uploading them. [skipped] counts the files left
  /// out; [done] completes once every added upload has finished, failed or been removed.
  ({int skipped, Future<void> done}) add(List<XFile> files) {
    if (_disposed) return (skipped: files.length, done: Future<void>.value());
    final added = [
      for (final file in files.take(remaining)) AttachmentItem._(_nextKey++, file.name, file),
    ];
    _items.addAll(added);
    return (
      skipped: files.length - added.length,
      done: Future.wait(added.map(_upload)),
    );
  }

  /// Uploads a failed photo again; anything else is left as it is
  Future<void> retry(AttachmentItem item) =>
      item.status == AttachmentStatus.failed && _items.contains(item) ? _upload(item) : Future.value();

  /// Drops a photo, cancelling its upload if it is still running
  void remove(AttachmentItem item) {
    if (!_items.remove(item)) return;
    _abandon(item);
    _notify();
  }

  /// Drops every photo (e.g. once the record was submitted)
  void clear() {
    for (final item in _items) {
      _abandon(item);
    }
    _items.clear();
    _notify();
  }

  Future<void> _upload(AttachmentItem item) {
    final settled = item._settled = Completer<void>();
    final cancel = item._cancel = CancelToken();
    item
      .._status = AttachmentStatus.uploading
      .._failure = null;
    _notify();
    unawaited(_send(item, cancel).whenComplete(() {
      if (!settled.isCompleted) settled.complete();
    }));
    return settled.future;
  }

  Future<void> _send(AttachmentItem item, CancelToken cancel) async {
    try {
      final bytes = item._bytes ??= await item._source.readAsBytes();
      _notify();
      item._file = await _api.uploadBytes(bytes, filename: item.name, purpose: purpose, cancelToken: cancel);
      item._status = AttachmentStatus.uploaded;
    } catch (e) {
      // A removed photo's cancelled upload lands here too; it is no longer listed
      item
        .._failure = AppFailure.from(e)
        .._status = AttachmentStatus.failed;
    }
    _notify();
  }

  /// Stops waiting for a photo that is no longer listed
  void _abandon(AttachmentItem item) {
    item._cancel?.cancel();
    final settled = item._settled;
    if (settled != null && !settled.isCompleted) settled.complete();
  }

  void _notify() {
    if (!_disposed) notifyListeners();
  }

  @override
  void dispose() {
    _disposed = true;
    for (final item in _items) {
      _abandon(item);
    }
    super.dispose();
  }
}
