import { useState } from 'react';
import { Search, Filter, Calendar, MapPin, User as UserIcon } from 'lucide-react';
import { SmartSelect, SmartSelectOption } from './ui/smart-select';

interface MilitiaSearchProps {
  onViewProfile: (id: string) => void;
}

const searchByOptions: SmartSelectOption[] = [
  { value: 'name', label: 'Tìm theo tên' },
  { value: 'id', label: 'Tìm theo mã DQTV' },
  { value: 'cccd', label: 'Tìm theo số CCCD' },
];

const unitOptions: SmartSelectOption[] = [
  { value: '', label: 'Tất cả khu vực' },
  { value: 'Khu phố 1', label: 'Khu phố 1' },
  { value: 'Khu phố 2', label: 'Khu phố 2' },
  { value: 'Khu phố 3', label: 'Khu phố 3' },
  { value: 'Khu phố 4', label: 'Khu phố 4' },
  { value: 'Khu phố 5', label: 'Khu phố 5' },
  { value: 'Khu phố 6', label: 'Khu phố 6' },
];

const positionOptions: SmartSelectOption[] = [
  { value: '', label: 'Tất cả chức vụ' },
  { value: 'Chỉ huy trưởng', label: 'Chỉ huy trưởng' },
  { value: 'Phó chỉ huy', label: 'Phó chỉ huy' },
  { value: 'Tổ trưởng', label: 'Tổ trưởng' },
  { value: 'Tổ phó', label: 'Tổ phó' },
  { value: 'Chiến sĩ', label: 'Chiến sĩ' },
];

const statusOptions: SmartSelectOption[] = [
  { value: '', label: 'Tất cả trạng thái' },
  { value: 'active', label: 'Đang hoạt động' },
  { value: 'reserve', label: 'Dự bị' },
  { value: 'inactive', label: 'Đã xuất ngũ' },
];

const mockSearchResults = [
  { 
    id: 'DQTV001', 
    name: 'Nguyễn Văn Minh', 
    dob: '15/03/1995', 
    cccd: '079095001234',
    unit: 'Khu phố 1', 
    position: 'Phó chỉ huy', 
    status: 'active',
    phone: '0901234567',
    address: '123 Đường Nguyễn Văn Linh, Phường Tân Phú, TP.HCM'
  },
  { 
    id: 'DQTV002', 
    name: 'Trần Thanh Tùng', 
    dob: '22/07/1993', 
    cccd: '079093002345',
    unit: 'Khu phố 1', 
    position: 'Chiến sĩ', 
    status: 'active',
    phone: '0902345678',
    address: '456 Đường Huỳnh Tấn Phát, Phường Tân Phú, TP.HCM'
  },
  { 
    id: 'DQTV003', 
    name: 'Lê Hoàng Nam', 
    dob: '10/11/1996', 
    cccd: '079096003456',
    unit: 'Khu phố 2', 
    position: 'Tổ trưởng', 
    status: 'active',
    phone: '0903456789',
    address: '789 Đường Nguyễn Thị Thập, Phường Tân Phú, TP.HCM'
  },
];

export function MilitiaSearch({ onViewProfile }: MilitiaSearchProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [searchBy, setSearchBy] = useState('name');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [searchResults, setSearchResults] = useState<typeof mockSearchResults>([]);
  const [hasSearched, setHasSearched] = useState(false);

  // Advanced filters
  const [unitFilter, setUnitFilter] = useState('');
  const [positionFilter, setPositionFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [dobFrom, setDobFrom] = useState('');
  const [dobTo, setDobTo] = useState('');

  const handleSearch = () => {
    setHasSearched(true);
    // Mock search logic
    const results = mockSearchResults.filter(item => {
      const matchesSearchTerm = searchTerm === '' || 
        (searchBy === 'name' && item.name.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (searchBy === 'cccd' && item.cccd.includes(searchTerm)) ||
        (searchBy === 'id' && item.id.toLowerCase().includes(searchTerm.toLowerCase()));
      
      const matchesUnit = !unitFilter || item.unit === unitFilter;
      const matchesPosition = !positionFilter || item.position === positionFilter;
      const matchesStatus = !statusFilter || item.status === statusFilter;
      
      return matchesSearchTerm && matchesUnit && matchesPosition && matchesStatus;
    });
    setSearchResults(results);
  };

  const getStatusDisplay = (status: string) => {
    switch (status) {
      case 'active': return { label: 'Đang hoạt động', class: 'bg-green-100 text-green-700' };
      case 'reserve': return { label: 'Dự bị', class: 'bg-yellow-100 text-yellow-700' };
      case 'inactive': return { label: 'Đã xuất ngũ', class: 'bg-gray-100 text-gray-700' };
      default: return { label: status, class: 'bg-gray-100 text-gray-700' };
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Tìm kiếm Dân Quân Tự Vệ</h1>
          <p className="text-sm text-gray-500 mt-1">Tra cứu thông tin dân quân theo nhiều tiêu chí</p>
        </div>
      </div>

      {/* Search Form */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="space-y-6">
          {/* Basic Search */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">Tìm kiếm nhanh</label>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <SmartSelect
                  options={searchByOptions}
                  value={searchBy}
                  onChange={setSearchBy}
                  allowClear={false}
                />
              </div>
              <div className="col-span-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                  <input
                    type="text"
                    placeholder={
                      searchBy === 'name' ? 'Nhập họ tên...' :
                      searchBy === 'id' ? 'Nhập mã DQTV...' :
                      'Nhập số CCCD...'
                    }
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                    className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1F3A5F] focus:border-transparent text-sm"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Advanced Search Toggle */}
          <div className="border-t border-gray-200 pt-4">
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center gap-2 text-sm text-[#2E7D32] hover:text-[#1B5E20] font-medium"
            >
              <Filter size={16} />
              {showAdvanced ? 'Ẩn bộ lọc nâng cao' : 'Hiển thị bộ lọc nâng cao'}
            </button>
          </div>

          {/* Advanced Filters */}
          {showAdvanced && (
            <div className="grid grid-cols-3 gap-4 pt-4 border-t border-gray-200">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Khu vực</label>
                <SmartSelect
                  options={unitOptions}
                  value={unitFilter}
                  onChange={setUnitFilter}
                  placeholder="Tất cả khu vực"
                  searchPlaceholder="Tìm khu vực..."
                  allowClear={false}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Chức vụ</label>
                <SmartSelect
                  options={positionOptions}
                  value={positionFilter}
                  onChange={setPositionFilter}
                  placeholder="Tất cả chức vụ"
                  searchPlaceholder="Tìm chức vụ..."
                  allowClear={false}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Trạng thái</label>
                <SmartSelect
                  options={statusOptions}
                  value={statusFilter}
                  onChange={setStatusFilter}
                  placeholder="Tất cả trạng thái"
                  searchPlaceholder="Tìm trạng thái..."
                  allowClear={false}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Năm sinh từ</label>
                <input
                  type="date"
                  value={dobFrom}
                  onChange={(e) => setDobFrom(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1F3A5F] focus:border-transparent text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Năm sinh đến</label>
                <input
                  type="date"
                  value={dobTo}
                  onChange={(e) => setDobTo(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1F3A5F] focus:border-transparent text-sm"
                />
              </div>
            </div>
          )}

          {/* Search Button */}
          <div className="flex justify-end gap-3">
            <button
              onClick={() => {
                setSearchTerm('');
                setUnitFilter('');
                setPositionFilter('');
                setStatusFilter('');
                setDobFrom('');
                setDobTo('');
                setSearchResults([]);
                setHasSearched(false);
              }}
              className="px-6 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm font-medium transition-colors"
            >
              Đặt lại
            </button>
            <button
              onClick={handleSearch}
              className="px-6 py-2.5 bg-[#2E7D32] text-white rounded-lg hover:bg-[#1B5E20] flex items-center gap-2 text-sm font-medium transition-colors shadow-sm"
            >
              <Search size={16} />
              Tìm kiếm
            </button>
          </div>
        </div>
      </div>

      {/* Search Results */}
      {hasSearched && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-base font-semibold text-gray-900">
              Kết quả tìm kiếm ({searchResults.length})
            </h3>
          </div>

          {searchResults.length === 0 ? (
            <div className="p-12 text-center">
              <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Search size={32} className="text-gray-400" />
              </div>
              <h3 className="text-base font-medium text-gray-900 mb-2">Không tìm thấy kết quả</h3>
              <p className="text-sm text-gray-500">
                Vui lòng thử lại với từ khóa hoặc bộ lọc khác
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {searchResults.map((result) => {
                const statusInfo = getStatusDisplay(result.status);
                return (
                  <div
                    key={result.id}
                    onClick={() => onViewProfile(result.id)}
                    className="p-6 hover:bg-gray-50 cursor-pointer transition-colors"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex gap-4 flex-1">
                        <div className="w-16 h-16 bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center rounded-lg border-2 border-gray-300 flex-shrink-0">
                          <UserIcon size={28} className="text-gray-400" />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-start justify-between mb-3">
                            <div>
                              <h4 className="text-base font-semibold text-gray-900 mb-1">{result.name}</h4>
                              <p className="text-sm text-gray-600">
                                Mã DQTV: <span className="font-medium text-[#1F3A5F]">{result.id}</span>
                              </p>
                            </div>
                            <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${statusInfo.class}`}>
                              {statusInfo.label}
                            </span>
                          </div>
                          
                          <div className="grid grid-cols-4 gap-4 text-sm">
                            <div className="flex items-center gap-2 text-gray-600">
                              <Calendar size={14} className="text-gray-400" />
                              <span>Sinh: {result.dob}</span>
                            </div>
                            <div className="flex items-center gap-2 text-gray-600">
                              <MapPin size={14} className="text-gray-400" />
                              <span>{result.unit}</span>
                            </div>
                            <div className="flex items-center gap-2 text-gray-600">
                              <UserIcon size={14} className="text-gray-400" />
                              <span>{result.position}</span>
                            </div>
                            <div className="text-gray-600">
                              CCCD: <span className="font-medium">{result.cccd}</span>
                            </div>
                          </div>
                          
                          <div className="mt-2 text-xs text-gray-500">
                            {result.address}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
