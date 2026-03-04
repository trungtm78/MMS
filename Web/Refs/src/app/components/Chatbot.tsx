import { useState, useRef, useEffect } from 'react';
import { MessageCircle, X, Send, Bot, User as UserIcon } from 'lucide-react';

interface Message {
  id: number;
  text: string;
  sender: 'user' | 'bot';
  timestamp: Date;
}

const quickQuestions = [
  'Làm thế nào để thêm dân quân mới?',
  'Tìm kiếm dân quân theo CCCD',
  'Xuất báo cáo thống kê',
  'Phân quyền người dùng',
];

const botResponses: { [key: string]: string } = {
  'hello': 'Xin chào! Tôi là trợ lý ảo của Hệ thống Quản lý Dân Quân Tự Vệ. Tôi có thể giúp gì cho bạn?',
  'thêm dân quân': 'Để thêm dân quân mới:\n1. Vào menu "Danh sách DQTV"\n2. Click nút "Thêm mới" (màu xanh lá)\n3. Điền đầy đủ thông tin trong 4 tab\n4. Click "Lưu & đóng"',
  'tìm kiếm': 'Để tìm kiếm dân quân:\n1. Vào menu "Tìm kiếm DQTV"\n2. Chọn tiêu chí tìm kiếm (Tên, Mã DQTV, CCCD)\n3. Nhập từ khóa\n4. Click "Tìm kiếm"\n\nBạn cũng có thể sử dụng bộ lọc nâng cao để tìm theo khu vực, chức vụ, trạng thái.',
  'báo cáo': 'Để xuất báo cáo:\n1. Vào menu "Báo cáo - Thống kê"\n2. Chọn loại báo cáo cần xuất\n3. Chọn khoảng thời gian\n4. Click "Xuất Excel" hoặc "Xuất PDF"',
  'phân quyền': 'Để phân quyền người dùng:\n1. Vào menu "Quản lý người dùng & phân quyền"\n2. Chọn vai trò cần phân quyền\n3. Tick vào các quyền tương ứng (Xem, Tạo, Sửa, Xóa)\n4. Click "Lưu thay đổi"',
  'cccd': 'Để tìm kiếm theo số CCCD:\n1. Vào menu "Tìm kiếm DQTV"\n2. Chọn "Tìm theo số CCCD"\n3. Nhập 12 số CCCD\n4. Click "Tìm kiếm"',
  'chỉnh sửa': 'Để chỉnh sửa thông tin dân quân:\n1. Vào "Danh sách DQTV"\n2. Click icon bút chì (Edit) ở cột "Thao tác"\n3. Cập nhật thông tin cần thiết\n4. Click "Lưu & đóng"',
  'xuất excel': 'Để xuất danh sách Excel:\n1. Vào "Danh sách DQTV"\n2. Áp dụng bộ lọc nếu cần\n3. Click nút "Xuất Excel"\n4. File sẽ được tải xuống tự động',
};

export function Chatbot() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 1,
      text: 'Xin chào! Tôi là trợ lý ảo của Hệ thống Quản lý Dân Quân Tự Vệ. Tôi có thể hỗ trợ bạn sử dụng các chức năng của hệ thống. Bạn cần giúp đỡ gì không?',
      sender: 'bot',
      timestamp: new Date(),
    },
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  const getBotResponse = (userMessage: string): string => {
    const lowerMessage = userMessage.toLowerCase();
    
    // Check for keywords
    if (lowerMessage.includes('xin chào') || lowerMessage.includes('hello') || lowerMessage.includes('chào')) {
      return botResponses['hello'];
    }
    if (lowerMessage.includes('thêm') && (lowerMessage.includes('dân quân') || lowerMessage.includes('dqtv'))) {
      return botResponses['thêm dân quân'];
    }
    if (lowerMessage.includes('tìm kiếm') || lowerMessage.includes('tra cứu')) {
      return botResponses['tìm kiếm'];
    }
    if (lowerMessage.includes('báo cáo') || lowerMessage.includes('thống kê')) {
      return botResponses['báo cáo'];
    }
    if (lowerMessage.includes('phân quyền') || lowerMessage.includes('quyền')) {
      return botResponses['phân quyền'];
    }
    if (lowerMessage.includes('cccd') || lowerMessage.includes('căn cước')) {
      return botResponses['cccd'];
    }
    if (lowerMessage.includes('sửa') || lowerMessage.includes('chỉnh sửa') || lowerMessage.includes('cập nhật')) {
      return botResponses['chỉnh sửa'];
    }
    if (lowerMessage.includes('xuất') && lowerMessage.includes('excel')) {
      return botResponses['xuất excel'];
    }
    
    // Default response
    return 'Xin lỗi, tôi chưa hiểu câu hỏi của bạn. Bạn có thể hỏi tôi về:\n- Cách thêm dân quân mới\n- Cách tìm kiếm dân quân\n- Xuất báo cáo\n- Phân quyền người dùng\n- Chỉnh sửa thông tin\n\nHoặc chọn một câu hỏi gợi ý bên dưới.';
  };

  const handleSendMessage = () => {
    if (!inputValue.trim()) return;

    // Add user message
    const userMessage: Message = {
      id: messages.length + 1,
      text: inputValue,
      sender: 'user',
      timestamp: new Date(),
    };

    setMessages([...messages, userMessage]);
    setInputValue('');
    setIsTyping(true);

    // Simulate bot thinking and response
    setTimeout(() => {
      setIsTyping(false);
      const botMessage: Message = {
        id: messages.length + 2,
        text: getBotResponse(inputValue),
        sender: 'bot',
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, botMessage]);
    }, 1000 + Math.random() * 1000);
  };

  const handleQuickQuestion = (question: string) => {
    setInputValue(question);
    setTimeout(() => handleSendMessage(), 100);
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="fixed bottom-4 right-4 md:bottom-6 md:right-6 z-50">
      {/* Chat Window */}
      {isOpen && (
        <div className="fixed md:absolute bottom-16 md:bottom-20 right-0 md:right-0 w-screen md:w-96 h-[calc(100vh-8rem)] md:h-[600px] bg-white rounded-t-2xl md:rounded-2xl shadow-2xl border border-gray-200 flex flex-col">
          {/* Header */}
          <div className="bg-gradient-to-r from-[#1F3A5F] to-[#2E7D32] text-white px-4 md:px-6 py-3 md:py-4 rounded-t-2xl md:rounded-t-2xl flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 md:w-12 md:h-12 bg-white rounded-full flex items-center justify-center">
                <Bot size={20} className="md:w-6 md:h-6 text-[#1F3A5F]" />
              </div>
              <div>
                <h3 className="font-semibold text-sm md:text-base">Trợ lý ảo DQTV</h3>
                <p className="text-xs text-white/80">Luôn sẵn sàng hỗ trợ</p>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="w-8 h-8 flex items-center justify-center hover:bg-white/20 rounded-lg transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex gap-2 ${message.sender === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
              >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                  message.sender === 'bot' ? 'bg-[#2E7D32]' : 'bg-[#1F3A5F]'
                }`}>
                  {message.sender === 'bot' ? (
                    <Bot size={16} className="text-white" />
                  ) : (
                    <UserIcon size={16} className="text-white" />
                  )}
                </div>
                <div className={`flex flex-col max-w-[75%] ${message.sender === 'user' ? 'items-end' : 'items-start'}`}>
                  <div
                    className={`px-4 py-2.5 rounded-lg text-sm whitespace-pre-line ${
                      message.sender === 'bot'
                        ? 'bg-white text-gray-800 border border-gray-200'
                        : 'bg-[#2E7D32] text-white'
                    }`}
                  >
                    {message.text}
                  </div>
                  <span className="text-xs text-gray-500 mt-1 px-1">
                    {formatTime(message.timestamp)}
                  </span>
                </div>
              </div>
            ))}

            {/* Typing Indicator */}
            {isTyping && (
              <div className="flex gap-2">
                <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 bg-[#2E7D32]">
                  <Bot size={16} className="text-white" />
                </div>
                <div className="bg-white border border-gray-200 px-4 py-2.5 rounded-lg">
                  <div className="flex gap-1">
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Quick Questions */}
          {messages.length <= 2 && (
            <div className="px-4 py-3 border-t border-gray-200 bg-white">
              <p className="text-xs font-medium text-gray-600 mb-2">Câu hỏi gợi ý:</p>
              <div className="flex flex-wrap gap-2">
                {quickQuestions.map((question, index) => (
                  <button
                    key={index}
                    onClick={() => handleQuickQuestion(question)}
                    className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-full text-xs transition-colors"
                  >
                    {question}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Input */}
          <div className="p-4 border-t border-gray-200 bg-white">
            <div className="flex gap-2">
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                placeholder="Nhập câu hỏi của bạn..."
                className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2E7D32] focus:border-transparent text-sm"
              />
              <button
                onClick={handleSendMessage}
                disabled={!inputValue.trim()}
                className="px-4 py-2.5 bg-[#2E7D32] text-white rounded-lg hover:bg-[#1B5E20] disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
              >
                <Send size={18} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toggle Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-12 h-12 md:w-14 md:h-14 bg-gradient-to-br from-[#2E7D32] to-[#1B5E20] text-white rounded-full shadow-xl hover:shadow-2xl flex items-center justify-center transition-all hover:scale-110"
      >
        {isOpen ? <X size={24} className="md:w-7 md:h-7" /> : <MessageCircle size={24} className="md:w-7 md:h-7" />}
      </button>
    </div>
  );
}