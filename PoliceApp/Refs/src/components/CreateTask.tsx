import { ArrowLeft, HelpCircle, MapPin, Calendar, Clock, Plus, Upload, X, Mic, MicOff, Play, Pause, Trash2 } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';

interface CreateTaskProps {
  onNavigate: (screen: string) => void;
}

interface AudioRecording {
  id: string;
  blob: Blob;
  url: string;
  duration: number;
  timestamp: Date;
}

export default function CreateTask({ onNavigate }: CreateTaskProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [recognition, setRecognition] = useState<any>(null);
  const [micError, setMicError] = useState('');
  const [audioRecordings, setAudioRecordings] = useState<AudioRecording[]>([]);
  const [playingId, setPlayingId] = useState<string | null>(null);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingStartTimeRef = useRef<number>(0);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);

  // Initialize Speech Recognition
  useEffect(() => {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
      const recognitionInstance = new SpeechRecognition();
      recognitionInstance.continuous = true;
      recognitionInstance.interimResults = true;
      recognitionInstance.lang = 'vi-VN';

      recognitionInstance.onresult = (event: any) => {
        let interimTranscript = '';
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcript + ' ';
          } else {
            interimTranscript += transcript;
          }
        }

        if (finalTranscript) {
          setDescription(prev => prev + finalTranscript);
          setMicError('');
        }
      };

      recognitionInstance.onerror = (event: any) => {
        setIsRecording(false);
        
        if (event.error === 'not-allowed') {
          setMicError('Vui lòng cho phép truy cập microphone. Click vào icon 🔒 trên thanh địa chỉ → Microphone → Cho phép');
        } else if (event.error === 'no-speech') {
          // Không nghe thấy giọng nói - bỏ qua
          setMicError('');
        } else if (event.error === 'network') {
          setMicError('Lỗi kết nối mạng. Vui lòng kiểm tra internet.');
        } else if (event.error === 'aborted') {
          setMicError('');
        }
      };

      recognitionInstance.onend = () => {
        setIsRecording(false);
      };

      setRecognition(recognitionInstance);
    }
  }, []);

  const toggleRecording = async () => {
    if (!recognition) {
      setMicError('Trình duyệt không hỗ trợ ghi âm. Vui lòng sử dụng Chrome hoặc Edge.');
      return;
    }

    if (isRecording) {
      // Stop recording
      recognition.stop();
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      setIsRecording(false);
    } else {
      try {
        // Request microphone permission first
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        
        // Start speech recognition for text
        recognition.start();
        
        // Start audio recording for saving
        const mediaRecorder = new MediaRecorder(stream);
        mediaRecorderRef.current = mediaRecorder;
        audioChunksRef.current = [];
        recordingStartTimeRef.current = Date.now();

        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            audioChunksRef.current.push(event.data);
          }
        };

        mediaRecorder.onstop = () => {
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          const audioUrl = URL.createObjectURL(audioBlob);
          const duration = Math.floor((Date.now() - recordingStartTimeRef.current) / 1000);
          
          const newRecording: AudioRecording = {
            id: Date.now().toString(),
            blob: audioBlob,
            url: audioUrl,
            duration: duration,
            timestamp: new Date()
          };
          
          setAudioRecordings(prev => [...prev, newRecording]);
          
          // Stop all tracks
          stream.getTracks().forEach(track => track.stop());
        };

        mediaRecorder.start();
        setIsRecording(true);
        setMicError('');
      } catch (error: any) {
        setIsRecording(false);
        
        if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
          setMicError('⚠️ Quyền microphone bị từ chối! Click icon 🔒 trên thanh địa chỉ → Microphone → Cho phép → Làm mới trang');
        } else if (error.name === 'NotFoundError') {
          setMicError('❌ Không tìm thấy microphone. Vui lòng kiểm tra thiết bị.');
        } else if (error.name === 'NotReadableError') {
          setMicError('⚠️ Microphone đang được sử dụng bởi ứng dụng khác.');
        } else {
          setMicError('❌ Lỗi: ' + (error.message || 'Không thể truy cập microphone'));
        }
      }
    }
  };

  const togglePlayAudio = (recording: AudioRecording) => {
    if (playingId === recording.id) {
      // Pause current audio
      if (audioElementRef.current) {
        audioElementRef.current.pause();
      }
      setPlayingId(null);
    } else {
      // Play new audio
      if (audioElementRef.current) {
        audioElementRef.current.pause();
      }
      
      const audio = new Audio(recording.url);
      audioElementRef.current = audio;
      
      audio.onended = () => {
        setPlayingId(null);
      };
      
      audio.play();
      setPlayingId(recording.id);
    }
  };

  const deleteAudio = (id: string) => {
    if (playingId === id && audioElementRef.current) {
      audioElementRef.current.pause();
      setPlayingId(null);
    }
    
    setAudioRecordings(prev => {
      const recording = prev.find(r => r.id === id);
      if (recording) {
        URL.revokeObjectURL(recording.url);
      }
      return prev.filter(r => r.id !== id);
    });
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-24">
      {/* Header */}
      <div className="bg-gradient-to-br from-[#FBBF24] via-[#FDE047] to-[#FEF08A] px-4 pt-12 pb-4 sticky top-0 z-10 shadow-sm border-b-4 border-[#DC2626]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => onNavigate('dashboard')} className="p-2 -ml-2">
              <ArrowLeft className="text-[#DC2626]" size={24} />
            </button>
            <h1 className="text-xl font-extrabold text-[#DC2626]">Giao việc mới</h1>
          </div>
          <button className="p-2">
            <HelpCircle className="text-[#DC2626]" size={20} />
          </button>
        </div>
      </div>

      <div className="px-4 pt-4 space-y-3">
        {/* Task Type Section */}
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <h2 className="text-base font-semibold text-[#0F172A] mb-3">Loại nhiệm vụ</h2>
          <div className="grid grid-cols-2 gap-3">
            <button className="flex flex-col items-center justify-center p-4 border-2 border-[#366092] bg-[#EFF6FF] rounded-lg">
              <span className="text-2xl mb-2">🚶</span>
              <span className="text-sm font-medium text-[#366092]">Tuần tra</span>
            </button>
            <button className="flex flex-col items-center justify-center p-4 border border-[#E2E8F0] rounded-lg hover:border-[#366092] hover:bg-[#EFF6FF] transition-colors">
              <span className="text-2xl mb-2">🚨</span>
              <span className="text-sm font-medium text-[#64748B]">Xử lý sự vụ</span>
            </button>
            <button className="flex flex-col items-center justify-center p-4 border border-[#E2E8F0] rounded-lg hover:border-[#366092] hover:bg-[#EFF6FF] transition-colors">
              <span className="text-2xl mb-2">📢</span>
              <span className="text-sm font-medium text-[#64748B]">Tuyên truyền</span>
            </button>
            <button className="flex flex-col items-center justify-center p-4 border border-[#E2E8F0] rounded-lg hover:border-[#366092] hover:bg-[#EFF6FF] transition-colors">
              <span className="text-2xl mb-2">🤝</span>
              <span className="text-sm font-medium text-[#64748B]">Hỗ trợ dân</span>
            </button>
          </div>
        </div>

        {/* Details Section */}
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <h2 className="text-base font-semibold text-[#0F172A] mb-3">Thông tin cơ bản</h2>
          <div className="space-y-3">
            <input
              type="text"
              placeholder="Tiêu đề nhiệm vụ"
              className="w-full h-12 px-4 bg-white border border-[#E2E8F0] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#366092] focus:border-transparent"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <textarea
              placeholder="Mô tả chi tiết..."
              rows={4}
              className="w-full px-4 py-3 bg-white border border-[#E2E8F0] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#366092] focus:border-transparent resize-none"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
            <div className="flex items-center justify-between mt-2">
              <p className="text-xs text-[#64748B]">
                {isRecording ? '🎤 Đang ghi âm...' : 'Nhấn mic để nhập bằng giọng nói'}
              </p>
              <button 
                onClick={toggleRecording}
                className={`p-2.5 rounded-full transition-all ${
                  isRecording 
                    ? 'bg-[#EF4444] animate-pulse' 
                    : 'bg-[#366092] hover:bg-[#2c4d75]'
                }`}
              >
                {isRecording ? (
                  <MicOff className="text-white" size={20} />
                ) : (
                  <Mic className="text-white" size={20} />
                )}
              </button>
            </div>
            {micError && (
              <p className="text-xs text-red-500 mt-1">{micError}</p>
            )}
          </div>

          <div className="mt-4">
            <p className="text-sm font-medium text-[#0F172A] mb-2">Mức độ ưu tiên</p>
            <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
              <button className="px-4 py-2 bg-[#EF4444] text-white rounded-full text-sm font-medium whitespace-nowrap">
                🔴 Khẩn cấp
              </button>
              <button className="px-4 py-2 bg-white border border-[#E2E8F0] text-[#64748B] rounded-full text-sm font-medium whitespace-nowrap hover:border-[#F59E0B] hover:bg-[#FFF7ED] hover:text-[#F59E0B]">
                🟠 Cao
              </button>
              <button className="px-4 py-2 bg-white border border-[#E2E8F0] text-[#64748B] rounded-full text-sm font-medium whitespace-nowrap hover:border-[#FBBF24] hover:bg-[#FFFBEB] hover:text-[#FBBF24]">
                🟡 Trung bình
              </button>
              <button className="px-4 py-2 bg-white border border-[#E2E8F0] text-[#64748B] rounded-full text-sm font-medium whitespace-nowrap hover:border-[#94A3B8] hover:bg-[#F8FAFC]">
                ⚪ Thấp
              </button>
            </div>
          </div>
        </div>

        {/* Location Section */}
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <h2 className="text-base font-semibold text-[#0F172A] mb-3">Địa điểm</h2>
          <div className="mb-3">
            <div className="w-full h-48 bg-gradient-to-br from-[#E8F4F8] to-[#D0E8F0] rounded-xl border border-[#E2E8F0] flex items-center justify-center relative overflow-hidden">
              <div className="absolute inset-0 opacity-20 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAwIDEwIEwgNDAgMTAgTSAxMCAwIEwgMTAgNDAgTSAwIDIwIEwgNDAgMjAgTSAyMCAwIEwgMjAgNDAgTSAwIDMwIEwgNDAgMzAgTSAzMCAwIEwgMzAgNDAiIGZpbGw9Im5vbmUiIHN0cm9rZT0iIzAwMCIgb3BhY2l0eT0iMC4xIiBzdHJva2Utd2lkdGg9IjEiLz48L3BhdHRlcm4+PC9kZWZzPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9InVybCgjZ3JpZCkiLz48L3N2Zz4=')]"></div>
              <MapPin className="text-[#366092]" size={48} />
            </div>
          </div>
          <input
            type="text"
            placeholder="Nhập địa chỉ"
            className="w-full h-12 px-4 bg-white border border-[#E2E8F0] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#366092] focus:border-transparent mb-3"
          />
          <button className="w-full h-12 border border-[#366092] text-[#366092] rounded-lg text-sm font-medium hover:bg-[#EFF6FF] transition-colors">
            Chọn trên bản đồ
          </button>
        </div>

        {/* Time Section */}
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <h2 className="text-base font-semibold text-[#0F172A] mb-3">Thời gian</h2>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 text-[#64748B]" size={20} />
              <input
                type="date"
                className="w-full h-12 pl-10 pr-4 bg-white border border-[#E2E8F0] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#366092] focus:border-transparent"
              />
            </div>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 text-[#F59E0B]" size={20} />
              <input
                type="date"
                className="w-full h-12 pl-10 pr-4 bg-white border border-[#E2E8F0] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#366092] focus:border-transparent"
              />
            </div>
          </div>
          <div className="relative mb-3">
            <Clock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-[#64748B]" size={20} />
            <input
              type="time"
              className="w-full h-12 pl-10 pr-4 bg-white border border-[#E2E8F0] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#366092] focus:border-transparent"
            />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-[#0F172A]">Lặp lại hàng ngày</span>
            <button className="w-12 h-7 bg-[#E2E8F0] rounded-full relative">
              <div className="w-5 h-5 bg-white rounded-full absolute top-1 left-1 shadow-sm"></div>
            </button>
          </div>
        </div>

        {/* Assign DQTV Section */}
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <h2 className="text-base font-semibold text-[#0F172A] mb-3">Giao cho DQTV</h2>
          <input
            type="text"
            placeholder="Tìm DQTV..."
            className="w-full h-12 px-4 bg-white border border-[#E2E8F0] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#366092] focus:border-transparent mb-3"
          />
          <div className="flex gap-2 mb-3 overflow-x-auto pb-2 no-scrollbar">
            <div className="flex items-center gap-2 px-3 py-2 bg-[#EFF6FF] rounded-full whitespace-nowrap">
              <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-xs font-bold">
                A
              </div>
              <span className="text-sm text-[#0F172A]">Nguyễn Văn An</span>
              <button className="p-0.5">
                <X className="text-[#64748B]" size={16} />
              </button>
            </div>
            <div className="flex items-center gap-2 px-3 py-2 bg-[#EFF6FF] rounded-full whitespace-nowrap">
              <div className="w-6 h-6 rounded-full bg-gradient-to-br from-purple-400 to-purple-600 flex items-center justify-center text-white text-xs font-bold">
                B
              </div>
              <span className="text-sm text-[#0F172A]">Trần Thị Bình</span>
              <button className="p-0.5">
                <X className="text-[#64748B]" size={16} />
              </button>
            </div>
          </div>
          <button className="w-full h-12 border border-[#366092] text-[#366092] rounded-lg text-sm font-medium hover:bg-[#EFF6FF] transition-colors">
            + Thêm người
          </button>
        </div>

        {/* Attachments Section */}
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <h2 className="text-base font-semibold text-[#0F172A] mb-3">Tài liệu đính kèm</h2>
          
          {/* Audio Recordings */}
          {audioRecordings.length > 0 && (
            <div className="mb-3 space-y-2">
              <p className="text-xs font-medium text-[#64748B] mb-2">Ghi âm ({audioRecordings.length})</p>
              {audioRecordings.map((recording, index) => (
                <div key={recording.id} className="flex items-center gap-3 p-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg">
                  <button
                    onClick={() => togglePlayAudio(recording)}
                    className="w-9 h-9 rounded-full bg-[#366092] hover:bg-[#2c4d75] flex items-center justify-center transition-colors flex-shrink-0"
                  >
                    {playingId === recording.id ? (
                      <Pause className="text-white" size={16} fill="white" />
                    ) : (
                      <Play className="text-white ml-0.5" size={16} fill="white" />
                    )}
                  </button>
                  
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[#0F172A]">
                      🎤 Ghi âm #{index + 1}
                    </p>
                    <p className="text-xs text-[#64748B]">
                      {formatDuration(recording.duration)} • {recording.timestamp.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  
                  <button
                    onClick={() => deleteAudio(recording.id)}
                    className="w-8 h-8 rounded-full hover:bg-[#FEE2E2] flex items-center justify-center transition-colors flex-shrink-0"
                  >
                    <Trash2 className="text-[#EF4444]" size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}
          
          <div className="border-2 border-dashed border-[#CBD5E1] rounded-xl p-8 text-center">
            <Upload className="mx-auto mb-2 text-[#64748B]" size={32} />
            <p className="text-sm text-[#0F172A] mb-1">Chọn file hoặc chụp ảnh</p>
            <p className="text-xs text-[#64748B]">Max 5MB</p>
          </div>
        </div>
      </div>

      {/* Bottom Buttons */}
      <div className="fixed bottom-16 left-0 right-0 bg-white border-t border-[#E2E8F0] p-4 shadow-lg">
        <div className="flex gap-3">
          <button className="flex-1 h-12 border border-[#64748B] text-[#64748B] rounded-lg text-sm font-medium hover:bg-[#F8FAFC] transition-colors">
            Lưu nháp
          </button>
          <button className="flex-1 h-12 bg-[#366092] text-white rounded-lg text-sm font-medium hover:bg-[#2c4d75] transition-colors">
            Gửi nhiệm vụ
          </button>
        </div>
      </div>
    </div>
  );
}