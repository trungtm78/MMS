import { useState } from 'react';
import { Target, Plus, Edit2, Trash2, Save, X, AlertCircle } from 'lucide-react';

interface ChiTieuCategory {
  id: string;
  name: string;
  weight: number;
  criteria: ChiTieuCriterion[];
}

interface ChiTieuCriterion {
  id: string;
  name: string;
  description: string;
  maxScore: number;
  evaluationMethod: string;
}

export function SettingsChiTieu() {
  const [showSuccess, setShowSuccess] = useState(false);
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [showAddCriterion, setShowAddCriterion] = useState<string | null>(null);

  const [categories, setCategories] = useState<ChiTieuCategory[]>([
    {
      id: '1',
      name: 'Kỷ luật & Chấp hành',
      weight: 30,
      criteria: [
        {
          id: '1-1',
          name: 'Tham gia tập huấn',
          description: 'Tham gia đầy đủ các buổi tập huấn, huấn luyện',
          maxScore: 10,
          evaluationMethod: 'Tự động (dựa trên điểm danh)',
        },
        {
          id: '1-2',
          name: 'Chấp hành mệnh lệnh',
          description: 'Thực hiện đúng và kịp thời các mệnh lệnh được giao',
          maxScore: 10,
          evaluationMethod: 'Thủ công (đánh giá của cấp trên)',
        },
        {
          id: '1-3',
          name: 'Trang phục, tác phong',
          description: 'Mặc trang phục đúng quy định, tác phong nghiêm túc',
          maxScore: 10,
          evaluationMethod: 'Thủ công (đánh giá của cấp trên)',
        },
      ],
    },
    {
      id: '2',
      name: 'Thực hiện nhiệm vụ',
      weight: 40,
      criteria: [
        {
          id: '2-1',
          name: 'Hoàn thành nhiệm vụ',
          description: 'Tỷ lệ hoàn thành nhiệm vụ được giao',
          maxScore: 20,
          evaluationMethod: 'Tự động (dựa trên hệ thống giao việc)',
        },
        {
          id: '2-2',
          name: 'Chất lượng công việc',
          description: 'Chất lượng và hiệu quả trong việc thực hiện nhiệm vụ',
          maxScore: 20,
          evaluationMethod: 'Thủ công (đánh giá của cấp trên)',
        },
      ],
    },
    {
      id: '3',
      name: 'Thái độ & Tinh thần',
      weight: 20,
      criteria: [
        {
          id: '3-1',
          name: 'Tinh thần trách nhiệm',
          description: 'Tinh thần trách nhiệm, tự giác trong công việc',
          maxScore: 10,
          evaluationMethod: 'Thủ công (đánh giá của cấp trên)',
        },
        {
          id: '3-2',
          name: 'Hợp tác đồng đội',
          description: 'Tinh thần hợp tác, hỗ trợ đồng đội',
          maxScore: 10,
          evaluationMethod: 'Thủ công (đánh giá của cấp trên)',
        },
      ],
    },
    {
      id: '4',
      name: 'Học tập & Phát triển',
      weight: 10,
      criteria: [
        {
          id: '4-1',
          name: 'Nâng cao kỹ năng',
          description: 'Tham gia học tập, nâng cao kỹ năng nghiệp vụ',
          maxScore: 10,
          evaluationMethod: 'Tự động (dựa trên khóa học đã hoàn thành)',
        },
      ],
    },
  ]);

  const [newCategory, setNewCategory] = useState({
    name: '',
    weight: 0,
  });

  const [newCriterion, setNewCriterion] = useState({
    name: '',
    description: '',
    maxScore: 10,
    evaluationMethod: 'manual',
  });

  const totalWeight = categories.reduce((sum, cat) => sum + cat.weight, 0);

  const handleSaveCategory = () => {
    if (newCategory.name && newCategory.weight > 0) {
      const newCat: ChiTieuCategory = {
        id: Date.now().toString(),
        name: newCategory.name,
        weight: newCategory.weight,
        criteria: [],
      };
      setCategories([...categories, newCat]);
      setNewCategory({ name: '', weight: 0 });
      setShowAddCategory(false);
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    }
  };

  const handleDeleteCategory = (id: string) => {
    if (confirm('Bạn có chắc chắn muốn xóa danh mục này?')) {
      setCategories(categories.filter(cat => cat.id !== id));
    }
  };

  const handleAddCriterion = (categoryId: string) => {
    if (newCriterion.name) {
      const criterion: ChiTieuCriterion = {
        id: `${categoryId}-${Date.now()}`,
        ...newCriterion,
      };
      
      setCategories(categories.map(cat => {
        if (cat.id === categoryId) {
          return { ...cat, criteria: [...cat.criteria, criterion] };
        }
        return cat;
      }));
      
      setNewCriterion({ name: '', description: '', maxScore: 10, evaluationMethod: 'manual' });
      setShowAddCriterion(null);
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    }
  };

  const handleDeleteCriterion = (categoryId: string, criterionId: string) => {
    if (confirm('Bạn có chắc chắn muốn xóa tiêu chí này?')) {
      setCategories(categories.map(cat => {
        if (cat.id === categoryId) {
          return { ...cat, criteria: cat.criteria.filter(c => c.id !== criterionId) };
        }
        return cat;
      }));
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1F3A5F]">Cấu Hình Chỉ tiêu</h1>
          <p className="text-sm text-gray-600 mt-1">Thiết lập các chỉ tiêu đánh giá hiệu suất dân quân tự vệ</p>
        </div>
        <button
          onClick={() => setShowAddCategory(true)}
          className="px-4 py-2 bg-[#2E7D32] text-white rounded-lg hover:bg-[#1b5e20] transition-colors flex items-center gap-2"
        >
          <Plus size={18} />
          Thêm danh mục
        </button>
      </div>

      {/* Success Message */}
      {showSuccess && (
        <div className="bg-[#2E7D32] text-white px-4 py-3 rounded-lg">
          ✓ Cập nhật cấu hình Chỉ tiêu thành công!
        </div>
      )}

      {/* Weight Warning */}
      {totalWeight !== 100 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle size={20} className="text-[#F57C00] flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium text-[#F57C00]">Tổng trọng số chưa đúng!</p>
            <p className="text-gray-700 mt-1">
              Tổng trọng số của tất cả danh mục phải bằng 100%. Hiện tại: <span className="font-bold">{totalWeight}%</span>
            </p>
          </div>
        </div>
      )}

      {/* Add Category Modal */}
      {showAddCategory && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-[#1F3A5F] mb-4">Thêm danh mục Chỉ tiêu mới</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Tên danh mục <span className="text-[#C62828]">*</span>
                </label>
                <input
                  type="text"
                  value={newCategory.name}
                  onChange={(e) => setNewCategory({ ...newCategory, name: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1F3A5F] focus:border-transparent"
                  placeholder="Ví dụ: Kỷ luật & Chấp hành"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Trọng số (%) <span className="text-[#C62828]">*</span>
                </label>
                <input
                  type="number"
                  value={newCategory.weight || ''}
                  onChange={(e) => setNewCategory({ ...newCategory, weight: parseInt(e.target.value) || 0 })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1F3A5F] focus:border-transparent"
                  placeholder="30"
                  min="0"
                  max="100"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={handleSaveCategory}
                className="flex-1 px-4 py-2 bg-[#2E7D32] text-white rounded-lg hover:bg-[#1b5e20] transition-colors"
              >
                Lưu
              </button>
              <button
                onClick={() => {
                  setShowAddCategory(false);
                  setNewCategory({ name: '', weight: 0 });
                }}
                className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Hủy
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Chỉ tiêu Categories */}
      <div className="space-y-4">
        {categories.map((category, index) => (
          <div key={category.id} className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
            {/* Category Header */}
            <div className="bg-gradient-to-r from-blue-50 to-blue-100 p-4 flex items-center justify-between border-b border-blue-200">
              <div className="flex items-center gap-3">
                <Target size={20} className="text-[#1F3A5F]" />
                <div>
                  <h3 className="font-semibold text-[#1F3A5F]">{category.name}</h3>
                  <p className="text-sm text-gray-600">Trọng số: {category.weight}%</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowAddCriterion(category.id)}
                  className="px-3 py-1.5 bg-[#2E7D32] hover:bg-[#1b5e20] text-white rounded transition-colors text-sm flex items-center gap-1"
                >
                  <Plus size={16} />
                  Thêm tiêu chí
                </button>
                <button
                  onClick={() => handleDeleteCategory(category.id)}
                  className="p-2 hover:bg-red-100 rounded transition-colors text-gray-600 hover:text-[#C62828]"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>

            {/* Criteria List */}
            <div className="p-4">
              {category.criteria.length === 0 ? (
                <p className="text-center text-gray-500 py-4">Chưa có tiêu chí đánh giá nào</p>
              ) : (
                <div className="space-y-3">
                  {category.criteria.map((criterion) => (
                    <div key={criterion.id} className="border border-gray-200 rounded-lg p-4 hover:border-[#1F3A5F] transition-colors">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h4 className="font-medium text-gray-900">{criterion.name}</h4>
                            <span className="px-2 py-0.5 bg-[#2E7D32] text-white rounded text-xs font-medium">
                              {criterion.maxScore} điểm
                            </span>
                          </div>
                          <p className="text-sm text-gray-600 mb-2">{criterion.description}</p>
                          <div className="flex items-center gap-2 text-xs text-gray-500">
                            <span className="px-2 py-1 bg-gray-100 rounded">
                              {criterion.evaluationMethod}
                            </span>
                          </div>
                        </div>
                        <button
                          onClick={() => handleDeleteCriterion(category.id, criterion.id)}
                          className="ml-4 p-2 hover:bg-gray-100 rounded transition-colors text-gray-400 hover:text-[#C62828]"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Add Criterion Form */}
              {showAddCriterion === category.id && (
                <div className="mt-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
                  <h4 className="font-medium text-gray-900 mb-3">Thêm tiêu chí mới</h4>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Tên tiêu chí <span className="text-[#C62828]">*</span>
                      </label>
                      <input
                        type="text"
                        value={newCriterion.name}
                        onChange={(e) => setNewCriterion({ ...newCriterion, name: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1F3A5F] focus:border-transparent text-sm"
                        placeholder="Ví dụ: Tham gia tập huấn"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Mô tả</label>
                      <textarea
                        value={newCriterion.description}
                        onChange={(e) => setNewCriterion({ ...newCriterion, description: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1F3A5F] focus:border-transparent text-sm resize-none"
                        rows={2}
                        placeholder="Mô tả chi tiết về tiêu chí đánh giá"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Điểm tối đa <span className="text-[#C62828]">*</span>
                        </label>
                        <input
                          type="number"
                          value={newCriterion.maxScore}
                          onChange={(e) => setNewCriterion({ ...newCriterion, maxScore: parseInt(e.target.value) || 0 })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1F3A5F] focus:border-transparent text-sm"
                          min="1"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Phương thức đánh giá</label>
                        <select
                          value={newCriterion.evaluationMethod}
                          onChange={(e) => setNewCriterion({ ...newCriterion, evaluationMethod: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1F3A5F] focus:border-transparent text-sm"
                        >
                          <option value="Thủ công (đánh giá của cấp trên)">Thủ công</option>
                          <option value="Tự động (dựa trên hệ thống)">Tự động</option>
                        </select>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={() => handleAddCriterion(category.id)}
                        className="px-4 py-2 bg-[#2E7D32] text-white rounded-lg hover:bg-[#1b5e20] transition-colors text-sm flex items-center gap-2"
                      >
                        <Save size={16} />
                        Lưu tiêu chí
                      </button>
                      <button
                        onClick={() => {
                          setShowAddCriterion(null);
                          setNewCriterion({ name: '', description: '', maxScore: 10, evaluationMethod: 'manual' });
                        }}
                        className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm"
                      >
                        Hủy
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Summary */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
        <h3 className="text-lg font-semibold text-[#1F3A5F] mb-4">Tổng quan Chỉ tiêu</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="text-center p-4 bg-blue-50 rounded-lg">
            <p className="text-sm text-gray-600 mb-1">Tổng số danh mục</p>
            <p className="text-2xl font-bold text-[#1F3A5F]">{categories.length}</p>
          </div>
          <div className="text-center p-4 bg-green-50 rounded-lg">
            <p className="text-sm text-gray-600 mb-1">Tổng số tiêu chí</p>
            <p className="text-2xl font-bold text-[#2E7D32]">
              {categories.reduce((sum, cat) => sum + cat.criteria.length, 0)}
            </p>
          </div>
          <div className="text-center p-4 bg-amber-50 rounded-lg">
            <p className="text-sm text-gray-600 mb-1">Tổng trọng số</p>
            <p className={`text-2xl font-bold ${totalWeight === 100 ? 'text-[#2E7D32]' : 'text-[#F57C00]'}`}>
              {totalWeight}%
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
