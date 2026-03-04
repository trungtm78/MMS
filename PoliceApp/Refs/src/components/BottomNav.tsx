import type { ComponentType } from 'react';

export type BottomNavItem<T extends string> = {
  key: T;
  label: string;
  Icon: ComponentType<{ size?: number }>;
};

type BottomNavProps<T extends string> = {
  items: Array<BottomNavItem<T>>;
  activeKey: T;
  onChange: (key: T) => void;
  navClassName: string;
  wrapperClassName?: string;
  activeTextClassName: string;
  inactiveTextClassName: string;
  iconSize?: number;
};

export default function BottomNav<T extends string>({
  items,
  activeKey,
  onChange,
  navClassName,
  wrapperClassName,
  activeTextClassName,
  inactiveTextClassName,
  iconSize = 24,
}: BottomNavProps<T>) {
  return (
    <nav className={navClassName}>
      <div className={wrapperClassName ?? 'flex items-center justify-around'}>
        {items.map(({ key, label, Icon }) => (
          <button
            key={key}
            onClick={() => onChange(key)}
            className={`flex flex-col items-center justify-center flex-1 h-full ${
              activeKey === key ? activeTextClassName : inactiveTextClassName
            }`}
          >
            <Icon size={iconSize} />
            <span className="text-xs mt-1">{label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}
