type TabKey = "home" | "add" | "history" | "analytics" | "goals";

interface BottomNavProps {
  activeTab: TabKey;
  onChange: (tab: TabKey) => void;
}

const items: Array<{ key: TabKey; label: string; icon: string }> = [
  { key: "home", label: "Главная", icon: "◐" },
  { key: "add", label: "Добавить", icon: "+" },
  { key: "history", label: "История", icon: "◷" },
  { key: "analytics", label: "Аналитика", icon: "◫" },
  { key: "goals", label: "Цели", icon: "◎" },
];

export function BottomNav({ activeTab, onChange }: BottomNavProps) {
  return (
    <nav className="bottom-nav">
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          className={`bottom-nav__item ${activeTab === item.key ? "is-active" : ""}`}
          onClick={() => onChange(item.key)}
        >
          <span className="bottom-nav__icon">{item.icon}</span>
          <span>{item.label}</span>
        </button>
      ))}
    </nav>
  );
}
