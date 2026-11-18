import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';

import 'files_repository.dart';

enum PhotoSource { camera, gallery }

/// Picks photos to upload. Screens read it from [photoPickerProvider], so tests replace it without
/// platform channels.
abstract interface class PhotoPicker {
  /// Up to [max] photos from [source]; empty when the user cancels or [max] is below 1.
  /// Throws [FilesException] with [FilesIssue.photoAccessDenied] or [FilesIssue.photoPickFailed].
  Future<List<XFile>> pick(PhotoSource source, {required int max});
}

/// [PhotoPicker] on image_picker, with settings that make every photo an upload the server takes.
///
/// The server decides a file's type from its content and refuses HEIC (Web/backend/src/files/
/// upload-type.ts). Verified in the pub cache sources:
/// - iOS (image_picker_ios 0.8.13+6): library photos (PHPicker, FLTPHPickerSaveImageToPathOperation
///   processImage) and camera photos go through FLTImagePickerPhotoAssetUtil, which keeps PNG and GIF
///   and writes everything else, HEIC included, as JPEG (FLTImagePickerMetaDataUtil convertImage),
///   compressed with [jpegQuality].
/// - Android (image_picker_android 0.8.13+14): ImageResizer.resizeImageIfNeeded returns the original
///   file unless a maximum size is set or the quality is below 100; with these settings it decodes the
///   photo and writes JPEG (PNG only for images with transparency). A photo the OS cannot decode (HEIC
///   before Android 9) comes back unchanged; the server then answers 415 file_type_not_allowed, which
///   the upload shows on that photo.
/// No extra dependency is needed. [maxDimension] keeps evidence legible and a JPEG at [jpegQuality]
/// far below 10 MB.
class ImagePickerPhotoPicker implements PhotoPicker {
  ImagePickerPhotoPicker([ImagePicker? picker]) : _picker = picker ?? ImagePicker();

  final ImagePicker _picker;

  static const maxDimension = 1920.0;
  static const jpegQuality = 85;

  /// PlatformException codes of a refused permission (image_picker_ios, image_picker_android)
  static const _accessDenied = {'camera_access_denied', 'photo_access_denied'};

  @override
  Future<List<XFile>> pick(PhotoSource source, {required int max}) async {
    if (max < 1) return const [];
    try {
      if (source == PhotoSource.gallery && max > 1) {
        final photos = await _picker.pickMultiImage(
          maxWidth: maxDimension,
          maxHeight: maxDimension,
          imageQuality: jpegQuality,
          limit: max,
        );
        // The limit is a hint some platforms ignore
        return photos.take(max).toList();
      }
      final photo = await _picker.pickImage(
        source: source == PhotoSource.camera ? ImageSource.camera : ImageSource.gallery,
        maxWidth: maxDimension,
        maxHeight: maxDimension,
        imageQuality: jpegQuality,
      );
      return photo == null ? const [] : [photo];
    } on PlatformException catch (e) {
      throw FilesException(
          _accessDenied.contains(e.code) ? FilesIssue.photoAccessDenied : FilesIssue.photoPickFailed);
    }
  }
}

final photoPickerProvider = Provider<PhotoPicker>((ref) => ImagePickerPhotoPicker());
