import { AlertCircle, CheckCircle, AlertTriangle, Info, X } from 'lucide-react';

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  type?: 'danger' | 'warning' | 'success' | 'info';
  confirmText?: string;
  cancelText?: string;
}

export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  type = 'danger',
  confirmText = 'Xác nhận',
  cancelText = 'Hủy'
}: ConfirmDialogProps) {
  if (!isOpen) return null;

  const config = {
    danger: {
      icon: AlertCircle,
      iconBg: '#FFEBEE',
      iconColor: '#C62828',
      confirmBg: '#C62828',
      confirmHover: '#B71C1C',
    },
    warning: {
      icon: AlertTriangle,
      iconBg: '#FFF3E0',
      iconColor: '#F57C00',
      confirmBg: '#F57C00',
      confirmHover: '#E65100',
    },
    success: {
      icon: CheckCircle,
      iconBg: '#E8F5E9',
      iconColor: '#2E7D32',
      confirmBg: '#2E7D32',
      confirmHover: '#1B5E20',
    },
    info: {
      icon: Info,
      iconBg: '#E3F2FD',
      iconColor: '#1976D2',
      confirmBg: '#1976D2',
      confirmHover: '#0D47A1',
    },
  };

  const { icon: Icon, iconBg, iconColor, confirmBg, confirmHover } = config[type];

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 animate-fadeIn"
        onClick={onClose}
      />
      
      {/* Dialog */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div 
          className="bg-white rounded-2xl shadow-2xl max-w-md w-full pointer-events-auto animate-slideUp"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="p-6 pb-4">
            <div className="flex items-start gap-4">
              <div 
                className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: iconBg }}
              >
                <Icon size={24} style={{ color: iconColor }} />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-[#0F172A] mb-2">{title}</h3>
                <p className="text-sm text-[#64748B] leading-relaxed">{message}</p>
              </div>
              <button
                onClick={onClose}
                className="text-[#64748B] hover:text-[#0F172A] transition-colors"
              >
                <X size={20} />
              </button>
            </div>
          </div>

          {/* Actions */}
          <div className="p-6 pt-0 flex items-center gap-3 justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2.5 text-sm font-medium text-[#64748B] hover:bg-[#F8FAFC] rounded-lg transition-all"
            >
              {cancelText}
            </button>
            <button
              onClick={() => {
                onConfirm();
                onClose();
              }}
              className="px-6 py-2.5 text-sm font-medium text-white rounded-lg transition-all shadow-md hover:shadow-lg"
              style={{ 
                backgroundColor: confirmBg,
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = confirmHover}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = confirmBg}
            >
              {confirmText}
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(20px) scale(0.95);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        .animate-fadeIn {
          animation: fadeIn 200ms ease-out;
        }
        .animate-slideUp {
          animation: slideUp 300ms cubic-bezier(0.16, 1, 0.3, 1);
        }
      `}</style>
    </>
  );
}
