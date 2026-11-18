// Unit Tests: chat typing signals
// Gateway (Web/backend/src/notifications/notifications.gateway.ts:164-200): the client emits
// 'typing_start' / 'typing_stop' {conversationId} in a joined room; others in the room receive
// 'chat:typing' {conversationId, userId, typing}.
// Run: flutter test test/unit_chat_typing_test.dart

import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:police_app/features/chat/typing.dart';

class _FakeTimer implements Timer {
  _FakeTimer(this.duration, this._callback);

  final Duration duration;
  final void Function() _callback;
  bool _active = true;

  @override
  bool get isActive => _active;

  @override
  int get tick => 0;

  @override
  void cancel() => _active = false;

  void fire() {
    if (!_active) return;
    _active = false;
    _callback();
  }
}

class _Timers {
  final created = <_FakeTimer>[];

  Timer create(Duration duration, void Function() callback) {
    final t = _FakeTimer(duration, callback);
    created.add(t);
    return t;
  }

  List<_FakeTimer> get active => created.where((t) => t.isActive).toList();
}

void main() {
  group('TypingEmitter', () {
    test('UT-TYPE-01: one start per burst of keystrokes, stop after the idle delay', () {
      final timers = _Timers();
      final events = <bool>[];
      final emitter = TypingEmitter(onChanged: events.add, timer: timers.create);

      emitter.onInput('X');
      emitter.onInput('Xi');
      emitter.onInput('Xin');

      expect(events, [true]);
      expect(emitter.isTyping, isTrue);
      expect(timers.active, hasLength(1));
      expect(timers.active.single.duration, const Duration(seconds: 3));

      timers.active.single.fire();

      expect(events, [true, false]);
      expect(emitter.isTyping, isFalse);
    });

    test('UT-TYPE-02: clearing the text, sending and disposing stop typing once', () {
      final timers = _Timers();
      final events = <bool>[];
      final emitter = TypingEmitter(onChanged: events.add, timer: timers.create);

      emitter.onInput('abc');
      emitter.onInput('   ');
      expect(events, [true, false]);

      emitter.onInput('abc');
      emitter.stop();
      emitter.stop();
      emitter.dispose();
      expect(events, [true, false, true, false]);
      expect(timers.active, isEmpty);
    });

    test('UT-TYPE-08: a long burst refreshes typing_start before receivers time out', () {
      final timers = _Timers();
      final events = <bool>[];
      var now = DateTime(2026, 9, 14, 8);
      final emitter = TypingEmitter(onChanged: events.add, timer: timers.create, clock: () => now);

      emitter.onInput('a');
      now = now.add(const Duration(seconds: 2));
      emitter.onInput('ab');
      expect(events, [true]);

      now = now.add(const Duration(seconds: 2));
      emitter.onInput('abc');
      expect(events, [true, true]);

      expect(TypingEmitter.refreshEvery < TypingIndicator.defaultTimeout, isTrue);
    });
  });

  group('TypingIndicator', () {
    Map<String, Object?> event(String userId, bool typing, {String conversationId = 'c1'}) =>
        {'conversationId': conversationId, 'userId': userId, 'typing': typing};

    test('UT-TYPE-03: shows others typing in this conversation and clears on stop or timeout', () {
      final timers = _Timers();
      var changes = 0;
      final indicator = TypingIndicator(
        conversationId: 'c1',
        myUserId: 'me',
        onChanged: () => changes++,
        timer: timers.create,
      );

      indicator.handle(event('u2', true));
      indicator.handle(event('u3', true));
      expect(indicator.userIds, ['u2', 'u3']);
      expect(changes, 2);

      indicator.handle(event('u2', false));
      expect(indicator.userIds, ['u3']);

      // No stop ever arrives for u3 (e.g. disconnected): the timeout clears it
      final pending = timers.active.single;
      expect(pending.duration, const Duration(seconds: 6));
      pending.fire();
      expect(indicator.userIds, isEmpty);
      expect(changes, 4);
    });

    test('UT-TYPE-04: repeated starts extend the timeout without flicker', () {
      final timers = _Timers();
      var changes = 0;
      final indicator = TypingIndicator(
        conversationId: 'c1',
        myUserId: 'me',
        onChanged: () => changes++,
        timer: timers.create,
      );

      indicator.handle(event('u2', true));
      final first = timers.active.single;
      indicator.handle(event('u2', true));

      expect(first.isActive, isFalse);
      expect(timers.active, hasLength(1));
      expect(changes, 1);
    });

    test('UT-TYPE-05: ignores itself, other conversations and malformed payloads', () {
      final timers = _Timers();
      final indicator = TypingIndicator(
        conversationId: 'c1',
        myUserId: 'me',
        onChanged: () {},
        timer: timers.create,
      );

      indicator.handle(event('me', true));
      indicator.handle(event('u2', true, conversationId: 'c9'));
      indicator.handle('garbage');
      indicator.handle({'conversationId': 'c1', 'typing': true});

      expect(indicator.userIds, isEmpty);
    });

    test('UT-TYPE-06: a message from a typer clears them; dispose cancels every timer', () {
      final timers = _Timers();
      final indicator = TypingIndicator(
        conversationId: 'c1',
        myUserId: 'me',
        onChanged: () {},
        timer: timers.create,
      );

      indicator.handle(event('u2', true));
      indicator.handle(event('u3', true));
      indicator.clearUser('u2');
      expect(indicator.userIds, ['u3']);

      indicator.dispose();
      expect(indicator.userIds, isEmpty);
      expect(timers.active, isEmpty);
    });
  });

}
