import { LucideIcon } from 'lucide-react';

interface PlaceholderProps {
  title: string;
  description: string;
  icon: LucideIcon;
  comingSoon?: boolean;
}

export function Placeholder({ title, description, icon: Icon, comingSoon = false }: PlaceholderProps) {
  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-200px)]">
      <div className="text-center max-w-md">
        <div className="w-24 h-24 bg-gradient-to-br from-[#1F3A5F] to-[#2E7D32] rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg">
          <Icon size={48} className="text-white" />
        </div>
        <h2 className="text-2xl font-bold text-[#0F172A] mb-3">{title}</h2>
        <p className="text-[#64748B] mb-6">{description}</p>
        {comingSoon && (
          <div className="inline-block px-4 py-2 bg-[#2E7D32] text-white rounded-lg font-medium">
            Đang phát triển
          </div>
        )}
      </div>
    </div>
  );
}
