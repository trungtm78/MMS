// Unit Tests: ImagePickerPhotoPicker, the settings that make every picked photo an upload the server takes
//   The server decides a file's type from its content and refuses HEIC (Web/backend/src/files/upload-type.ts).
//   image_picker_ios 0.8.13+6 re-encodes library and camera photos that are not PNG or GIF as JPEG
//   (FLTImagePickerMetaDataUtil convertImage, FLTImagePickerPhotoAssetUtil); image_picker_android 0.8.13+14
//   re-encodes only when a maximum size is set or the quality is below 100 (ImageResizer.resizeImageIfNeeded),
//   so both are always passed.
// Run: flutter test test/unit_photo_picker_test.dart

import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image_picker/image_picker.dart';
import 'package:militian_app/features/files/files.dart';

class _FakeImagePicker extends Fake implements ImagePicker {
  final calls = <String>[];
  XFile? single;
  List<XFile> many = const [];
  PlatformException? failure;

  @override
  Future<XFile?> pickImage({
    required ImageSource source,
    double? maxWidth,
    double? maxHeight,
    int? imageQuality,
    CameraDevice preferredCameraDevice = CameraDevice.rear,
    bool requestFullMetadata = true,
  }) async {
    calls.add('pickImage ${source.name} $maxWidth $maxHeight $imageQuality');
    if (failure != null) throw failure!;
    return single;
  }

  @override
  Future<List<XFile>> pickMultiImage({
    double? maxWidth,
    double? maxHeight,
    int? imageQuality,
    int? limit,
    bool requestFullMetadata = true,
  }) async {
    calls.add('pickMultiImage $maxWidth $maxHeight $imageQuality $limit');
    if (failure != null) throw failure!;
    return many;
  }
}

XFile _x(String name) => XFile.fromData(Uint8List(1), name: name, path: name);

void main() {
  test('UT-PICK-01: camera and a single library photo use pickImage with a size limit and JPEG quality 85',
      () async {
    final fake = _FakeImagePicker()..single = _x('cam.jpg');
    final picker = ImagePickerPhotoPicker(fake);

    expect((await picker.pick(PhotoSource.camera, max: 5)).single.name, 'cam.jpg');
    expect((await picker.pick(PhotoSource.gallery, max: 1)).single.name, 'cam.jpg');

    expect(fake.calls, ['pickImage camera 1920.0 1920.0 85', 'pickImage gallery 1920.0 1920.0 85']);
    expect(ImagePickerPhotoPicker.jpegQuality, lessThan(100));
  });

  test('UT-PICK-02: several library photos use pickMultiImage with the limit, and never return more', () async {
    final fake = _FakeImagePicker()..many = [_x('1.jpg'), _x('2.jpg'), _x('3.jpg')];
    final picker = ImagePickerPhotoPicker(fake);

    final photos = await picker.pick(PhotoSource.gallery, max: 2);

    expect(photos.map((p) => p.name), ['1.jpg', '2.jpg']);
    expect(fake.calls, ['pickMultiImage 1920.0 1920.0 85 2']);
  });

  test('UT-PICK-03: nothing to pick, or a cancelled picker, gives no photo', () async {
    final fake = _FakeImagePicker();
    final picker = ImagePickerPhotoPicker(fake);

    expect(await picker.pick(PhotoSource.camera, max: 0), isEmpty);
    expect(fake.calls, isEmpty);
    expect(await picker.pick(PhotoSource.camera, max: 3), isEmpty);
  });

  test('UT-PICK-04: a refused permission and other picker failures are FilesExceptions', () async {
    final fake = _FakeImagePicker();
    final picker = ImagePickerPhotoPicker(fake);

    for (final code in ['camera_access_denied', 'photo_access_denied']) {
      fake.failure = PlatformException(code: code);
      await expectLater(picker.pick(PhotoSource.camera, max: 1),
          throwsA(isA<FilesException>().having((e) => e.issue, 'issue', FilesIssue.photoAccessDenied)));
    }
    fake.failure = PlatformException(code: 'invalid_image');
    await expectLater(picker.pick(PhotoSource.gallery, max: 4),
        throwsA(isA<FilesException>().having((e) => e.issue, 'issue', FilesIssue.photoPickFailed)));
  });

  test('UT-PICK-05: the app picker is image_picker', () {
    expect(ImagePickerPhotoPicker(), isA<PhotoPicker>());
  });
}
