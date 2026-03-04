import { useState, useRef, useEffect } from 'react';
import { 
  ArrowLeft, 
  Mic, 
  Camera, 
  Phone, 
  Send, 
  X, 
  StopCircle,
  Image as ImageIcon,
  CheckCircle,
  MapPin,
  Clock,
  Navigation
} from 'lucide-react';

interface TaskReportProps {
  onBack: () => void;
  taskId?: string;
  taskTitle?: string;
}

export function TaskReport({ onBack, taskId, taskTitle }: TaskReportProps) {
  const [selectedTask, setSelectedTask] = useState(taskId || '');
  const [description, setDescription] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [hasVoiceNote, setHasVoiceNote] = useState(false);
  const [voiceText, setVoiceText] = useState('');
  const [showSuccess, setShowSuccess] = useState(false);
  const [dateTime, setDateTime] = useState(new Date().toISOString().slice(0, 16));
  const [location, setLocation] = useState('');
  const [showLocationDropdown, setShowLocationDropdown] = useState(false);
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recordingIntervalRef = useRef<number | null>(null);
  const locationInputRef = useRef<HTMLDivElement>(null);

  // Mock tasks list
  const availableTasks = [
    { id: '1', title: 'Tuần tra khu vực chợ Bến Thành' },
    { id: '2', title: 'Kiểm tra an ninh khu dân cư KP1' },
    { id: '3', title: 'Hỗ trợ điều tiết giao thông' },
    { id: '4', title: 'Tuyên truyền phòng cháy chữa cháy' },
    { id: '5', title: 'Khác (Tự nhập tiêu đề)' },
  ];

  // Preset locations
  const presetLocations = [
    { name: 'Chợ Bến Thành, KP1', address: 'Phường Phú Định, TP.HCM' },
    { name: 'Trụ sở UBND Phường Phú Định', address: 'Đường Nguyễn Văn Linh, Quận 7' },
    { name: 'Khu dân cư KP1', address: 'Phường Phú Định, TP.HCM' },
    { name: 'Khu dân cư KP2', address: 'Phường Phú Định, TP.HCM' },
    { name: 'Khu dân cư KP3', address: 'Phường Phú Định, TP.HCM' },
    { name: 'Công viên Phú Định', address: 'Phường Phú Định, TP.HCM' },
    { name: 'Trường Tiểu học Phú Định', address: 'Phường Phú Định, TP.HCM' },
    { name: 'Trạm Y tế Phường', address: 'Phường Phú Định, TP.HCM' },
  ];

  // Filter locations based on input
  const filteredLocations = presetLocations.filter(loc =>
    loc.name.toLowerCase().includes(location.toLowerCase()) ||
    loc.address.toLowerCase().includes(location.toLowerCase())
  );

  // Get GPS Location
  const handleGetGPSLocation = () => {
    setIsGettingLocation(true);
    
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          // Simulate reverse geocoding
          setLocation(`${latitude.toFixed(6)}, ${longitude.toFixed(6)} (GPS)`);
          setShowLocationDropdown(false);
          setIsGettingLocation(false);
        },
        (error) => {
          alert('⚠️ Không thể lấy vị trí GPS. Vui lòng nhập thủ công hoặc chọn từ danh sách.');
          setIsGettingLocation(false);
        }
      );
    } else {
      alert('⚠️ Thiết bị không hỗ trợ GPS');
      setIsGettingLocation(false);
    }
  };

  // Handle location selection
  const handleSelectLocation = (loc: { name: string; address: string }) => {
    setLocation(`${loc.name}, ${loc.address}`);
    setShowLocationDropdown(false);
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (locationInputRef.current && !locationInputRef.current.contains(event.target as Node)) {
        setShowLocationDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Voice Recording
  const handleStartRecording = () => {
    setIsRecording(true);
    setRecordingTime(0);
    setHasVoiceNote(false);
    
    recordingIntervalRef.current = window.setInterval(() => {
      setRecordingTime(prev => prev + 1);
    }, 1000);
  };

  const handleStopRecording = () => {
    setIsRecording(false);
    setHasVoiceNote(true);
    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current);
      recordingIntervalRef.current = null;
    }
    
    // Simulate speech-to-text conversion
    setTimeout(() => {
      const mockTranscription = `Báo cáo công việc ngày ${new Date().toLocaleDateString('vi-VN')}. Tôi đã hoàn thành nhiệm vụ tuần tra khu vực. Tình hình an ninh ổn định, không phát hiện điểm bất thường. Đã kiểm tra các điểm trọng yếu và ghi nhận các hoạt động thường ngày của người dân. Mọi việc diễn ra bình thường.`;
      setVoiceText(mockTranscription);
      setDescription(mockTranscription);
    }, 500);
  };

  const handleDeleteVoice = () => {
    setHasVoiceNote(false);
    setRecordingTime(0);
    setVoiceText('');
    // Don't clear description to allow user to keep edited text
  };

  // Photo Upload
  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      const newPhotos = Array.from(files).map(file => URL.createObjectURL(file));
      setPhotos(prev => [...prev, ...newPhotos]);
    }
  };

  const handleDeletePhoto = (index: number) => {
    setPhotos(prev => prev.filter((_, i) => i !== index));
  };

  // SOS Call
  const handleSOSCall = () => {
    if (confirm('🚨 GỌI KHẨN CẤP SOS?\n\nBạn có chắc chắn muốn gọi điện khẩn cấp đến Công An Khu Vực?')) {
      // Simulate phone call
      window.location.href = 'tel:0900123456';
    }
  };

  // Submit Report
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!description.trim()) {
      alert('⚠️ Vui lòng nhập mô tả báo cáo');
      return;
    }

    // Show success animation
    setShowSuccess(true);
    
    // Reset form after delay
    setTimeout(() => {
      setShowSuccess(false);
      setDescription('');
      setPhotos([]);
      setHasVoiceNote(false);
      setRecordingTime(0);
      onBack();
    }, 2000);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      {/* Header */}
      <div className="bg-[#366092] text-white px-4 py-3 sticky top-0 z-10 shadow-lg">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <h1 className="text-lg font-bold">Báo Cáo Công Việc</h1>
            <p className="text-xs text-white/80">Ghi âm, chụp hình, gọi SOS</p>
          </div>
        </div>
      </div>

      {/* Success Overlay */}
      {showSuccess && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 animate-fade-in">
          <div className="bg-white rounded-2xl p-8 m-4 text-center shadow-2xl animate-scale-in">
            <div className="w-16 h-16 bg-[#10B981] rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-10 h-10 text-white" />
            </div>
            <h2 className="text-xl font-bold text-[#1E293B] mb-2">
              Gửi Báo Cáo Thành Công!
            </h2>
            <p className="text-sm text-[#64748B]">
              Báo cáo của bạn đã được ghi nhận
            </p>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="p-4 pb-20">
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* SOS Button */}
          <button
            type="button"
            onClick={handleSOSCall}
            className="w-full bg-[#EF4444] text-white py-4 rounded-xl font-bold text-lg shadow-lg hover:bg-[#DC2626] transition-all flex items-center justify-center gap-3 animate-pulse-subtle"
          >
            <Phone className="w-6 h-6" />
            <span>🚨 GỌI KHẨN CẤP SOS</span>
          </button>

          {/* Task Selection */}
          <div className="bg-white rounded-xl p-4 shadow-sm">
            <label className="block text-sm font-bold text-[#475569] mb-2">
              Chọn công việc *
            </label>
            <select
              value={selectedTask}
              onChange={(e) => setSelectedTask(e.target.value)}
              className="w-full px-4 py-3 border-2 border-[#E2E8F0] rounded-lg focus:border-[#366092] focus:outline-none text-[#1E293B]"
              required
            >
              <option value="">Chọn công việc</option>
              {availableTasks.map(task => (
                <option key={task.id} value={task.id}>
                  {task.title}
                </option>
              ))}
            </select>
          </div>

          {/* Voice Recording */}
          <div className="bg-white rounded-xl p-4 shadow-sm">
            <label className="block text-sm font-bold text-[#475569] mb-3">
              Ghi âm giọng nói để báo cáo
            </label>
            
            {!hasVoiceNote ? (
              <div className="space-y-3">
                {isRecording ? (
                  <>
                    {/* Recording UI */}
                    <div className="bg-[#EF4444]/10 border-2 border-[#EF4444] rounded-lg p-4 text-center">
                      <div className="flex items-center justify-center gap-3 mb-2">
                        <div className="w-3 h-3 bg-[#EF4444] rounded-full animate-pulse"></div>
                        <span className="text-[#EF4444] font-bold text-lg">
                          Đang ghi âm...
                        </span>
                      </div>
                      <div className="text-3xl font-bold text-[#EF4444] font-mono">
                        {formatTime(recordingTime)}
                      </div>
                    </div>
                    
                    <button
                      type="button"
                      onClick={handleStopRecording}
                      className="w-full bg-[#EF4444] text-white py-3 rounded-lg font-bold flex items-center justify-center gap-2 hover:bg-[#DC2626] transition-colors"
                    >
                      <StopCircle className="w-5 h-5" />
                      Dừng Ghi Âm
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={handleStartRecording}
                    className="w-full bg-[#366092] text-white py-3 rounded-lg font-bold flex items-center justify-center gap-2 hover:bg-[#2d4f78] transition-colors"
                  >
                    <Mic className="w-5 h-5" />
                    Bắt Đầu Ghi Âm
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="bg-[#10B981]/10 border-2 border-[#10B981] rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-[#10B981] rounded-full flex items-center justify-center">
                        <Mic className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <p className="font-bold text-[#1E293B]">Ghi âm ({formatTime(recordingTime)})</p>
                        <p className="text-xs text-[#10B981]">✓ Đã chuyển thành văn bản</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleDeleteVoice}
                      className="p-2 text-[#EF4444] hover:bg-[#EF4444]/10 rounded-lg transition-colors"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                  <div className="bg-white rounded-lg p-3 text-sm text-[#64748B] border border-[#E2E8F0]">
                    <p className="italic">"{voiceText.substring(0, 100)}..."</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Photo Upload */}
          <div className="bg-white rounded-xl p-4 shadow-sm">
            <label className="block text-sm font-bold text-[#475569] mb-3">
              Chụp hình hiện trạng
            </label>
            
            <input
              type="file"
              ref={fileInputRef}
              onChange={handlePhotoUpload}
              accept="image/*"
              multiple
              capture="environment"
              className="hidden"
            />
            
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full bg-[#10B981] text-white py-3 rounded-lg font-bold flex items-center justify-center gap-2 hover:bg-[#059669] transition-colors mb-3"
            >
              <Camera className="w-5 h-5" />
              Chụp Ảnh / Tải Lên
            </button>

            {/* Photo Grid */}
            {photos.length > 0 && (
              <div className="grid grid-cols-3 gap-2">
                {photos.map((photo, index) => (
                  <div key={index} className="relative group">
                    <img
                      src={photo}
                      alt={`Photo ${index + 1}`}
                      className="w-full h-24 object-cover rounded-lg"
                    />
                    <button
                      type="button"
                      onClick={() => handleDeletePhoto(index)}
                      className="absolute top-1 right-1 p-1 bg-[#EF4444] text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            
            {photos.length > 0 && (
              <p className="text-xs text-[#64748B] mt-2 flex items-center gap-1">
                <ImageIcon className="w-3 h-3" />
                {photos.length} ảnh đã chọn
              </p>
            )}
          </div>

          {/* Description */}
          <div className="bg-white rounded-xl p-4 shadow-sm">
            <label className="block text-sm font-bold text-[#475569] mb-2">
              Mô tả chi tiết (Tùy chọn)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-4 py-3 border-2 border-[#E2E8F0] rounded-lg focus:border-[#366092] focus:outline-none text-[#1E293B] resize-none"
              rows={4}
              placeholder="Nhập thông tin chi tiết về công việc..."
            />
          </div>

          {/* Date and Time */}
          <div className="bg-white rounded-xl p-4 shadow-sm">
            <label className="block text-sm font-bold text-[#475569] mb-2">
              Ngày và giờ thực hiện *
            </label>
            <input
              type="datetime-local"
              value={dateTime}
              onChange={(e) => setDateTime(e.target.value)}
              className="w-full px-4 py-3 border-2 border-[#E2E8F0] rounded-lg focus:border-[#366092] focus:outline-none text-[#1E293B]"
              required
            />
          </div>

          {/* Location - Grab-style */}
          <div className="bg-white rounded-xl p-4 shadow-sm" ref={locationInputRef}>
            <label className="block text-sm font-bold text-[#475569] mb-2">
              Vị trí thực hiện *
            </label>
            <div className="relative">
              <input
                type="text"
                value={location}
                onChange={(e) => {
                  setLocation(e.target.value);
                  setShowLocationDropdown(true);
                }}
                onFocus={() => setShowLocationDropdown(true)}
                className="w-full pl-12 pr-14 py-3 border-2 border-[#E2E8F0] rounded-lg focus:border-[#366092] focus:outline-none text-[#1E293B]"
                placeholder="Nhập địa chỉ hoặc chọn từ danh sách..."
                required
              />
              {/* Map Pin Icon */}
              <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#64748B]" />
              
              {/* GPS Button */}
              <button
                type="button"
                onClick={handleGetGPSLocation}
                disabled={isGettingLocation}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-[#366092] text-white rounded-lg hover:bg-[#2d4f78] transition-colors disabled:opacity-50"
              >
                {isGettingLocation ? (
                  <Navigation className="w-5 h-5 animate-spin" />
                ) : (
                  <Navigation className="w-5 h-5" />
                )}
              </button>

              {/* Dropdown List */}
              {showLocationDropdown && filteredLocations.length > 0 && (
                <div className="absolute z-20 left-0 right-0 top-full mt-2 bg-white border-2 border-[#E2E8F0] rounded-lg shadow-xl max-h-64 overflow-y-auto">
                  {filteredLocations.map((loc, index) => (
                    <button
                      key={index}
                      type="button"
                      onClick={() => handleSelectLocation(loc)}
                      className="w-full px-4 py-3 text-left hover:bg-[#F1F5F9] transition-colors border-b border-[#E2E8F0] last:border-b-0 flex items-start gap-3"
                    >
                      <MapPin className="w-5 h-5 text-[#366092] flex-shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <p className="font-bold text-[#1E293B] text-sm">{loc.name}</p>
                        <p className="text-xs text-[#64748B] mt-0.5">{loc.address}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            
            {location && (
              <p className="text-xs text-[#10B981] mt-2 flex items-center gap-1">
                <CheckCircle className="w-3 h-3" />
                Đã chọn vị trí
              </p>
            )}
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            className="w-full bg-[#366092] text-white py-4 rounded-xl font-bold text-lg shadow-lg hover:bg-[#2d4f78] transition-colors flex items-center justify-center gap-2"
          >
            <Send className="w-5 h-5" />
            Gửi Báo Cáo
          </button>
        </form>
      </div>

      <style>{`
        @keyframes fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        
        @keyframes scale-in {
          from { transform: scale(0.9); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
        
        @keyframes pulse-subtle {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.02); }
        }
        
        .animate-fade-in {
          animation: fade-in 0.2s ease-out;
        }
        
        .animate-scale-in {
          animation: scale-in 0.3s ease-out;
        }
        
        .animate-pulse-subtle {
          animation: pulse-subtle 2s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}