import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/constants/api_constants.dart';
import '../../../features/auth/providers/auth_provider.dart';
import '../models/chat_models.dart';

final conversationsProvider = FutureProvider<List<Conversation>>((ref) async {
  final dio = ref.read(dioProvider);
  final res = await dio.get(ApiConstants.conversations);
  final list = res.data as List;
  return list.map((e) => Conversation.fromJson(e as Map<String, dynamic>)).toList();
});

final chatMessagesProvider =
    FutureProvider.family<List<ChatMessage>, String>((ref, convId) async {
  final url = ApiConstants.conversationMessages.replaceAll('{id}', convId);
  final dio = ref.read(dioProvider);
  final res = await dio.get(url, queryParameters: {'page': 1, 'limit': 50});
  final data = res.data['data'] as List;
  return data
      .map((e) => ChatMessage.fromJson(e as Map<String, dynamic>))
      .toList()
      .reversed
      .toList();
});
