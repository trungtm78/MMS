// A PhotoPicker without platform channels, for tests of screens that attach photos.

import 'dart:typed_data';

import 'package:image_picker/image_picker.dart';
import 'package:police_app/shared/files/files.dart';

/// Answers every pick with [next] (or throws [error]) and records what was asked
class FakePhotoPicker implements PhotoPicker {
  FakePhotoPicker({List<XFile>? next}) : next = next ?? [];

  List<XFile> next;
  Object? error;

  /// (source, max) of each pick
  final calls = <(PhotoSource, int)>[];

  @override
  Future<List<XFile>> pick(PhotoSource source, {required int max}) async {
    calls.add((source, max));
    final failure = error;
    if (failure != null) throw failure;
    return next;
  }
}

/// A picked photo held in memory; [name] is its file name
XFile fakePhoto(String name, [List<int> bytes = transparentPng]) =>
    XFile.fromData(Uint8List.fromList(bytes), path: name);

/// A valid 1x1 transparent PNG, so Image.memory can decode it
const transparentPng = <int>[
  0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52, //
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4, //
  0x89, 0x00, 0x00, 0x00, 0x0A, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9C, 0x63, 0x00, 0x01, 0x00, 0x00, //
  0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, //
  0x42, 0x60, 0x82,
];
