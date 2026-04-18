import { ClipboardList, MapPin, User, Calendar, AlertCircle, Save, X, Plus, Search, Filter, Upload, FileText, Trash2 } from 'lucide-react';
import { useState, useMemo } from 'react';
import { SmartSelect, SmartSelectMulti, SmartSelectOption } from './ui/smart-select';

interface Personnel {
  id: string;
  name: string;
  avatar: string;
  district: string;
  status: 'available' | 'busy';
  workload: number;
  currentTasks: string;
}

interface AttachedFile {
  id: string;
  name: string;
  size: string;
  type: string;
}

export function NewTask() {
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    type: '',
    priority: '',
    deadline: '',
    location: '',
    address: '',
    district: '',
    assignTo: 'single',
    selectedPersonnel: [] as string[],
    attachments: [] as AttachedFile[],
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [filterDistrict, setFilterDistrict] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [showSuccess, setShowSuccess] = useState(false);
  const [showError, setShowError] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const taskTypes = [
    { id: 'patrol', name: 'Tuần tra', icon: '🚶' },
    { id: 'incident', name: 'Xử lý sự vụ', icon: '⚠️' },
    { id: 'support', name: 'Hỗ trợ dân sinh', icon: '🤝' },
    { id: 'training', name: 'Huấn luyện', icon: '📚' },
    { id: 'propaganda', name: 'Tuyên truyền', icon: '📢' },
    { id: 'guard', name: 'Bảo vệ', icon: '🛡️' },
    { id: 'disaster', name: 'Phòng chống thiên tai', icon: '🌊' },
    { id: 'other', name: 'Khác', icon: '📋' },
  ];

  const priorities = [
    { id: 'urgent', name: 'Khẩn cấp', color: '#C62828', bgColor: '#FFEBEE' },
    { id: 'high', name: 'Cao', color: '#F57C00', bgColor: '#FFF3E0' },
    { id: 'medium', name: 'Trung bình', color: '#FBC02D', bgColor: '#FFFDE7' },
    { id: 'low', name: 'Thấp', color: '#757575', bgColor: '#F5F5F5' },
  ];

  const availablePersonnel: Personnel[] = [
    { 
      id: '1', 
      name: 'Nguyễn Văn Hùng', 
      avatar: 'https://images.unsplash.com/photo-1568602471122-7832951cc4c5?w=100&h=100&fit=crop',
      district: 'KP 1', 
      status: 'available', 
      workload: 3,
      currentTasks: '3 nhiệm vụ'
    },
    { 
      id: '2', 
      name: 'Trần Minh Tuấn', 
      avatar: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=100&h=100&fit=crop',
      district: 'KP 2', 
      status: 'available', 
      workload: 2,
      currentTasks: '2 nhiệm vụ'
    },
    { 
      id: '3', 
      name: 'Lê Quang Minh', 
      avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&h=100&fit=crop',
      district: 'KP 1', 
      status: 'busy', 
      workload: 5,
      currentTasks: '5 nhiệm vụ'
    },
    { 
      id: '4', 
      name: 'Phạm Đức Thắng', 
      avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100&h=100&fit=crop',
      district: 'KP 3', 
      status: 'available', 
      workload: 1,
      currentTasks: '1 nhiệm vụ'
    },
    { 
      id: '5', 
      name: 'Hoàng Anh Khoa', 
      avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&h=100&fit=crop',
      district: 'KP 2', 
      status: 'available', 
      workload: 4,
      currentTasks: '4 nhiệm vụ'
    },
    { 
      id: '6', 
      name: 'Vũ Thành Đạt', 
      avatar: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=100&h=100&fit=crop',
      district: 'KP 3', 
      status: 'available', 
      workload: 2,
      currentTasks: '2 nhiệm vụ'
    },
    { 
      id: '7', 
      name: 'Đỗ Văn Long', 
      avatar: 'https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?w=100&h=100&fit=crop',
      district: 'KP 4', 
      status: 'available', 
      workload: 3,
      currentTasks: '3 nhiệm vụ'
    },
    { 
      id: '8', 
      name: 'Bùi Quốc Anh', 
      avatar: 'https://images.unsplash.com/photo-1463453091185-61582044d556?w=100&h=100&fit=crop',
      district: 'KP 5', 
      status: 'busy', 
      workload: 6,
      currentTasks: '6 nhiệm vụ'
    },
  ];

  const taskTypeOptions: SmartSelectOption[] = useMemo(() => 
    taskTypes.map(type => ({
      value: type.id,
      label: type.name,
      icon: <span>{type.icon}</span>
    })), [taskTypes]);

  const priorityOptions: SmartSelectOption[] = useMemo(() =>
    priorities.map(p => ({
      value: p.id,
      label: p.name
    })), [priorities]);

  const districtOptions: SmartSelectOption[] = useMemo(() => [
    { value: '1', label: 'Khu phố 1' },
    { value: '2', label: 'Khu phố 2' },
    { value: '3', label: 'Khu phố 3' },
    { value: '4', label: 'Khu phố 4' },
    { value: '5', label: 'Khu phố 5' },
    { value: '6', label: 'Khu phố 6' },
  ], []);

  const personnelOptions: SmartSelectOption[] = useMemo(() =>
    availablePersonnel.map(p => ({
      value: p.id,
      label: p.name,
      description: `${p.district} • ${p.currentTasks} • ${p.status === 'available' ? 'Sẵn sàng' : 'Bận'}`
    })), [availablePersonnel]);

  const filteredPersonnel = availablePersonnel.filter(person => {
    const matchesSearch = person.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesDistrict = !filterDistrict || person.district === filterDistrict;
    const matchesStatus = !filterStatus || person.status === filterStatus;
    return matchesSearch && matchesDistrict && matchesStatus;
  });

  const validateForm = () => {
    if (!formData.title.trim()) {
      setErrorMessage('Vui lòng nhập tiêu đề nhiệm vụ');
      setShowError(true);
      return false;
    }
    if (!formData.type) {
      setErrorMessage('Vui lòng chọn loại nhiệm vụ');
      setShowError(true);
      return false;
    }
    if (!formData.priority) {
      setErrorMessage('Vui lòng chọn mức độ ưu tiên');
      setShowError(true);
      return false;
    }
    if (!formData.deadline) {
      setErrorMessage('Vui lòng chọn thời hạn');
      setShowError(true);
      return false;
    }
    if (formData.selectedPersonnel.length === 0) {
      setErrorMessage('Vui lòng chọn ít nhất 1 DQTV thực hiện');
      setShowError(true);
      return false;
    }
    return true;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      setTimeout(() => setShowError(false), 3000);
      return;
    }

    // Simulate API call
    setTimeout(() => {
      setShowSuccess(true);
      setTimeout(() => {
        setShowSuccess(false);
        // Reset form
        setFormData({
          title: '',
          description: '',
          type: '',
          priority: '',
          deadline: '',
          location: '',
          address: '',
          district: '',
          assignTo: 'single',
          selectedPersonnel: [],
          attachments: [],
        });
      }, 2000);
    }, 500);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      const newFiles: AttachedFile[] = Array.from(files).map((file, index) => ({
        id: Date.now().toString() + index,
        name: file.name,
        size: (file.size / 1024).toFixed(1) + ' KB',
        type: file.type,
      }));
      setFormData({ ...formData, attachments: [...formData.attachments, ...newFiles] });
    }
  };

  const removeFile = (id: string) => {
    setFormData({
      ...formData,
      attachments: formData.attachments.filter(f => f.id !== id),
    });
  };

  const getSuggestion = () => {
    const selectedDistrict = formData.district;
    if (!selectedDistrict) return null;

    const suggestedPeople = availablePersonnel
      .filter(p => p.district === `KP ${selectedDistrict}` && p.status === 'available')
      .sort((a, b) => a.workload - b.workload)
      .slice(0, 2);

    return suggestedPeople;
  };

  const suggestions = getSuggestion();

  const isFormValid = formData.title && formData.type && formData.priority && formData.deadline && formData.selectedPersonnel.length > 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1F3A5F]">Giao Nhiệm Vụ Mới</h1>
          <p className="text-sm text-gray-600 mt-1">Điền thông tin và chọn DQTV thực hiện</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            type="button"
            className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-all flex items-center gap-2 border border-gray-300"
          >
            <X size={16} />
            Hủy
          </button>
          <button 
            type="button"
            className="px-4 py-2 text-sm font-medium text-white bg-gray-600 hover:bg-gray-700 rounded-lg transition-all flex items-center gap-2"
          >
            <Save size={16} />
            Lưu nháp
          </button>
          <button 
            onClick={handleSubmit}
            disabled={!isFormValid}
            className="px-6 py-2 text-sm font-medium text-white bg-[#2E7D32] hover:bg-[#1b5e20] rounded-lg transition-all flex items-center gap-2 shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ClipboardList size={16} />
            Giao việc
          </button>
        </div>
      </div>

      {/* Success Message */}
      {showSuccess && (
        <div className="bg-[#2E7D32] text-white px-4 py-3 rounded-lg flex items-center justify-between animate-slide-in">
          <span>✓ Giao nhiệm vụ thành công! {formData.selectedPersonnel.length} DQTV đã nhận nhiệm vụ.</span>
          <button onClick={() => setShowSuccess(false)}>
            <X size={18} />
          </button>
        </div>
      )}

      {/* Error Message */}
      {showError && (
        <div className="bg-[#C62828] text-white px-4 py-3 rounded-lg flex items-center justify-between animate-slide-in">
          <span>✗ {errorMessage}</span>
          <button onClick={() => setShowError(false)}>
            <X size={18} />
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Task Information */}
        <div className="bg-white rounded-lg p-6 border border-gray-200 shadow-sm">
          <h3 className="text-lg font-semibold text-[#1F3A5F] mb-4">Thông tin nhiệm vụ</h3>
          
          <div className="space-y-4">
            {/* Title */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Tiêu đề nhiệm vụ <span className="text-[#C62828]">*</span>
              </label>
              <input
                type="text"
                placeholder="VD: Tuần tra khu vực chợ Phú Định"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1F3A5F] focus:border-transparent"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                maxLength={100}
              />
              <div className="text-xs text-gray-500 mt-1 text-right">{formData.title.length}/100</div>
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Mô tả chi tiết
              </label>
              <textarea
                rows={4}
                placeholder="Mô tả chi tiết nhiệm vụ, yêu cầu cụ thể, lưu ý quan trọng..."
                className="w-full px-4 py-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1F3A5F] focus:border-transparent resize-none"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              />
            </div>

            {/* Type, Priority, Deadline Row */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Task Type */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Loại nhiệm vụ <span className="text-[#C62828]">*</span>
                </label>
                <SmartSelect
                  options={taskTypeOptions}
                  value={formData.type}
                  onChange={(val) => setFormData({ ...formData, type: val })}
                  placeholder="Chọn loại"
                  searchPlaceholder="Tìm loại nhiệm vụ..."
                />
              </div>

              {/* Priority */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Mức độ ưu tiên <span className="text-[#C62828]">*</span>
                </label>
                <SmartSelect
                  options={priorityOptions}
                  value={formData.priority}
                  onChange={(val) => setFormData({ ...formData, priority: val })}
                  placeholder="Chọn mức độ"
                  searchPlaceholder="Tìm mức độ..."
                />
              </div>

              {/* Deadline */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Thời hạn <span className="text-[#C62828]">*</span>
                </label>
                <input
                  type="datetime-local"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1F3A5F]"
                  value={formData.deadline}
                  onChange={(e) => setFormData({ ...formData, deadline: e.target.value })}
                />
              </div>
            </div>

            {/* File Attachments */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <FileText size={16} className="inline mr-1" />
                Tài liệu đính kèm
              </label>
              <div className="flex items-center gap-3">
                <label className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 cursor-pointer flex items-center gap-2 transition-colors">
                  <Upload size={16} />
                  Chọn file
                  <input
                    type="file"
                    multiple
                    onChange={handleFileUpload}
                    className="hidden"
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png"
                  />
                </label>
                <span className="text-xs text-gray-500">PDF, Word, Excel, Hình ảnh (Tối đa 10MB/file)</span>
              </div>
              
              {/* Attached Files List */}
              {formData.attachments.length > 0 && (
                <div className="mt-3 space-y-2">
                  {formData.attachments.map(file => (
                    <div key={file.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
                      <div className="flex items-center gap-3">
                        <FileText size={16} className="text-[#1F3A5F]" />
                        <div>
                          <p className="text-sm font-medium text-gray-900">{file.name}</p>
                          <p className="text-xs text-gray-500">{file.size}</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeFile(file.id)}
                        className="p-1 hover:bg-gray-200 rounded transition-colors"
                      >
                        <Trash2 size={16} className="text-[#C62828]" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Location */}
        <div className="bg-white rounded-lg p-6 border border-gray-200 shadow-sm">
          <h3 className="text-lg font-semibold text-[#1F3A5F] mb-4 flex items-center gap-2">
            <MapPin size={20} />
            Địa điểm tác nghiệp
          </h3>
          
          {/* Map Placeholder */}
          <div className="w-full h-48 bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg mb-4 flex items-center justify-center border border-gray-200">
            <div className="text-center">
              <MapPin size={40} className="text-[#1F3A5F] mx-auto mb-2" />
              <p className="text-sm text-gray-600">Nhấp vào bản đồ để chọn vị trí</p>
              <p className="text-xs text-gray-500 mt-1">Hoặc nhập địa chỉ bên dưới</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Địa chỉ cụ thể
              </label>
              <input
                type="text"
                placeholder="Nhập địa chỉ..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1F3A5F]"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Khu phố
              </label>
              <SmartSelect
                options={districtOptions}
                value={formData.district}
                onChange={(val) => setFormData({ ...formData, district: val })}
                placeholder="Chọn khu phố"
                searchPlaceholder="Tìm khu phố..."
              />
            </div>
          </div>
        </div>

        {/* Assign Personnel */}
        <div className="bg-white rounded-lg p-6 border border-gray-200 shadow-sm">
          <h3 className="text-lg font-semibold text-[#1F3A5F] mb-4 flex items-center gap-2">
            <User size={20} />
            Chọn DQTV thực hiện <span className="text-[#C62828]">*</span>
          </h3>

          {/* Selection Mode */}
          <div className="flex items-center gap-4 mb-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="assignTo"
                value="single"
                checked={formData.assignTo === 'single'}
                onChange={(e) => setFormData({ ...formData, assignTo: e.target.value, selectedPersonnel: [] })}
                className="w-4 h-4 text-[#1F3A5F]"
              />
              <span className="text-sm font-medium text-gray-700">Giao cho 1 người</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="assignTo"
                value="multiple"
                checked={formData.assignTo === 'multiple'}
                onChange={(e) => setFormData({ ...formData, assignTo: e.target.value })}
                className="w-4 h-4 text-[#1F3A5F]"
              />
              <span className="text-sm font-medium text-gray-700">Giao cho nhiều người</span>
            </label>
            {formData.selectedPersonnel.length > 0 && (
              <span className="ml-auto px-3 py-1 bg-[#2E7D32] text-white rounded-full text-xs font-medium">
                Đã chọn: {formData.selectedPersonnel.length}
              </span>
            )}
          </div>

          {/* Search and Filter */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Tìm theo tên..."
                className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1F3A5F]"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <SmartSelect
              options={[
                { value: '', label: 'Tất cả khu phố' },
                { value: 'KP 1', label: 'Khu phố 1' },
                { value: 'KP 2', label: 'Khu phố 2' },
                { value: 'KP 3', label: 'Khu phố 3' },
                { value: 'KP 4', label: 'Khu phố 4' },
                { value: 'KP 5', label: 'Khu phố 5' },
              ]}
              value={filterDistrict}
              onChange={setFilterDistrict}
              placeholder="Tất cả khu phố"
              searchPlaceholder="Tìm khu phố..."
            />
            <SmartSelect
              options={[
                { value: '', label: 'Tất cả trạng thái' },
                { value: 'available', label: 'Sẵn sàng' },
                { value: 'busy', label: 'Bận' },
              ]}
              value={filterStatus}
              onChange={setFilterStatus}
              placeholder="Tất cả trạng thái"
              searchPlaceholder="Tìm trạng thái..."
            />
          </div>

          {/* Personnel List */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-96 overflow-y-auto">
            {filteredPersonnel.length === 0 ? (
              <div className="col-span-full text-center py-8 text-gray-500">
                Không tìm thấy DQTV phù hợp
              </div>
            ) : (
              filteredPersonnel.map(person => (
                <div
                  key={person.id}
                  className={`p-4 border rounded-lg cursor-pointer transition-all ${
                    formData.selectedPersonnel.includes(person.id)
                      ? 'border-[#2E7D32] bg-green-50 ring-2 ring-[#2E7D32]'
                      : 'border-gray-300 hover:border-[#1F3A5F] hover:bg-gray-50'
                  }`}
                  onClick={() => {
                    if (formData.assignTo === 'single') {
                      setFormData({ ...formData, selectedPersonnel: [person.id] });
                    } else {
                      const selected = formData.selectedPersonnel.includes(person.id)
                        ? formData.selectedPersonnel.filter(id => id !== person.id)
                        : [...formData.selectedPersonnel, person.id];
                      setFormData({ ...formData, selectedPersonnel: selected });
                    }
                  }}
                >
                  <div className="flex items-center gap-3 mb-2">
                    <img
                      src={person.avatar}
                      alt={person.name}
                      className="w-12 h-12 rounded-full object-cover border-2 border-white shadow-sm"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{person.name}</p>
                      <p className="text-xs text-gray-600">{person.district}</p>
                    </div>
                    <span className={`px-2 py-1 text-xs font-semibold rounded-full flex-shrink-0 ${
                      person.status === 'available' 
                        ? 'bg-green-100 text-[#2E7D32]'
                        : 'bg-amber-100 text-[#F57C00]'
                    }`}>
                      {person.status === 'available' ? 'Sẵn sàng' : 'Bận'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-gray-600">
                    <span>{person.currentTasks}</span>
                    <div className="flex gap-0.5">
                      {[...Array(5)].map((_, i) => (
                        <div
                          key={i}
                          className={`w-1.5 h-3 rounded-sm ${
                            i < person.workload ? 'bg-[#F57C00]' : 'bg-gray-200'
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Smart Suggestions */}
          {suggestions && suggestions.length > 0 && (
            <div className="mt-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
              <div className="flex items-start gap-2">
                <AlertCircle size={16} className="text-[#1F3A5F] mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-[#1F3A5F] mb-1">💡 Gợi ý thông minh</p>
                  <p className="text-xs text-gray-700">
                    Dựa trên khu phố <span className="font-semibold">KP {formData.district}</span> và khối lượng công việc hiện tại, hệ thống gợi ý:{' '}
                    {suggestions.map((s, i) => (
                      <span key={s.id}>
                        <button
                          type="button"
                          onClick={() => setFormData({ ...formData, selectedPersonnel: [s.id] })}
                          className="font-semibold text-[#1F3A5F] hover:underline"
                        >
                          {s.name}
                        </button>
                        {i < suggestions.length - 1 && ' hoặc '}
                      </span>
                    ))}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Validation Checklist */}
        <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg p-6 border border-gray-200">
          <h4 className="text-sm font-semibold text-[#1F3A5F] mb-3">Kiểm tra trước khi giao:</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="flex items-center gap-2">
              <div className={`w-5 h-5 rounded-full flex items-center justify-center ${formData.title ? 'bg-[#2E7D32]' : 'bg-gray-300'}`}>
                {formData.title && <span className="text-white text-xs">✓</span>}
              </div>
              <span className="text-sm text-gray-700">Tiêu đề đã nhập</span>
            </div>
            <div className="flex items-center gap-2">
              <div className={`w-5 h-5 rounded-full flex items-center justify-center ${formData.type ? 'bg-[#2E7D32]' : 'bg-gray-300'}`}>
                {formData.type && <span className="text-white text-xs">✓</span>}
              </div>
              <span className="text-sm text-gray-700">Loại nhiệm vụ đã chọn</span>
            </div>
            <div className="flex items-center gap-2">
              <div className={`w-5 h-5 rounded-full flex items-center justify-center ${formData.priority ? 'bg-[#2E7D32]' : 'bg-gray-300'}`}>
                {formData.priority && <span className="text-white text-xs">✓</span>}
              </div>
              <span className="text-sm text-gray-700">Mức độ ưu tiên đã chọn</span>
            </div>
            <div className="flex items-center gap-2">
              <div className={`w-5 h-5 rounded-full flex items-center justify-center ${formData.deadline ? 'bg-[#2E7D32]' : 'bg-gray-300'}`}>
                {formData.deadline && <span className="text-white text-xs">✓</span>}
              </div>
              <span className="text-sm text-gray-700">Thời hạn đã đặt</span>
            </div>
            <div className="flex items-center gap-2">
              <div className={`w-5 h-5 rounded-full flex items-center justify-center ${formData.selectedPersonnel.length > 0 ? 'bg-[#2E7D32]' : 'bg-gray-300'}`}>
                {formData.selectedPersonnel.length > 0 && <span className="text-white text-xs">✓</span>}
              </div>
              <span className="text-sm text-gray-700">DQTV đã chọn ({formData.selectedPersonnel.length})</span>
            </div>
            <div className="flex items-center gap-2">
              <div className={`w-5 h-5 rounded-full flex items-center justify-center ${formData.attachments.length > 0 ? 'bg-[#2E7D32]' : 'bg-gray-300'}`}>
                {formData.attachments.length > 0 && <span className="text-white text-xs">✓</span>}
              </div>
              <span className="text-sm text-gray-700">Tài liệu đính kèm ({formData.attachments.length})</span>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
