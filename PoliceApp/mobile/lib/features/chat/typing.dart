import 'dart:async';

// Typing signals, matching Web/backend/src/notifications/notifications.gateway.ts:164-200:
// the client emits 'typing_start' / 'typing_stop' {conversationId} in a room it joined, and the
// other sockets in the room receive 'chat:typing' {conversationId, userId, typing}. The server
// keeps no typing state, so a sender that disconnects never sends a stop: receivers time out.

typedef TypingTimerFactory = Timer Function(Duration duration, void Function() callback);

Timer _realTimer(Duration duration, void Function() callback) => Timer(duration, callback);

/// Turns keystrokes into typing start/stop signals for the local user
class TypingEmitter {
  TypingEmitter({
    required this.onChanged,
    TypingTimerFactory? timer,
    DateTime Function()? clock,
  })  : _timer = timer ?? _realTimer,
        _clock = clock ?? DateTime.now;

  /// No keystroke for this long ends the burst
  static const idleDelay = Duration(seconds: 3);

  /// A long burst repeats the start signal so receivers, which time out after
  /// [TypingIndicator.defaultTimeout], keep showing it
  static const refreshEvery = Duration(seconds: 4);

  /// Called with true to emit typing_start and false to emit typing_stop
  final void Function(bool typing) onChanged;
  final TypingTimerFactory _timer;
  final DateTime Function() _clock;

  Timer? _idleTimer;
  DateTime? _lastStartAt;
  bool _typing = false;

  bool get isTyping => _typing;

  void onInput(String text) {
    if (text.trim().isEmpty) {
      stop();
      return;
    }
    _idleTimer?.cancel();
    _idleTimer = _timer(idleDelay, stop);

    final now = _clock();
    final last = _lastStartAt;
    if (!_typing || (last != null && now.difference(last) >= refreshEvery)) {
      _typing = true;
      _lastStartAt = now;
      onChanged(true);
    }
  }

  /// Ends the burst (idle, cleared input, message sent); a no-op when not typing
  void stop() {
    _idleTimer?.cancel();
    _idleTimer = null;
    if (!_typing) return;
    _typing = false;
    _lastStartAt = null;
    onChanged(false);
  }

  void dispose() => stop();
}

/// Tracks who else is typing in one conversation
class TypingIndicator {
  TypingIndicator({
    required this.conversationId,
    this.myUserId,
    required this.onChanged,
    TypingTimerFactory? timer,
    this.timeout = defaultTimeout,
  }) : _timer = timer ?? _realTimer;

  static const defaultTimeout = Duration(seconds: 6);

  final String conversationId;

  /// Set once known; the user's own other devices are not shown as typing
  String? myUserId;
  final void Function() onChanged;
  final Duration timeout;
  final TypingTimerFactory _timer;

  // Insertion-ordered: people are listed in the order they started typing
  final _expiry = <String, Timer>{};

  List<String> get userIds => List.unmodifiable(_expiry.keys);

  /// Applies a chat:typing payload
  void handle(Object? payload) {
    if (payload is! Map) return;
    final userId = payload['userId'];
    final typing = payload['typing'];
    if (payload['conversationId'] != conversationId) return;
    if (userId is! String || userId.isEmpty || typing is! bool) return;
    if (userId == myUserId) return;

    if (!typing) {
      clearUser(userId);
      return;
    }
    final isNew = !_expiry.containsKey(userId);
    _expiry[userId]?.cancel();
    _expiry[userId] = _timer(timeout, () => clearUser(userId));
    if (isNew) onChanged();
  }

  /// Removes one user, e.g. when their message arrives
  void clearUser(String? userId) {
    final timer = _expiry.remove(userId);
    if (timer == null) return;
    timer.cancel();
    onChanged();
  }

  /// Forgets everyone, e.g. after the socket disconnects
  void clear() {
    if (_expiry.isEmpty) return;
    _cancelAll();
    onChanged();
  }

  void dispose() => _cancelAll();

  void _cancelAll() {
    for (final timer in _expiry.values) {
      timer.cancel();
    }
    _expiry.clear();
  }
}
