import { useEffect, useRef, useState, type ReactNode } from "react";

type Theme = "dark" | "light";
type Tab = "new" | "shipments";
type Category = "Heavy" | "Express" | "Standard";

type Parcel = {
  id: string;
  name: string;
  weight: number;
  priority: boolean;
  category: Category;
  shippingDate: string;
};

type FormErrors = Partial<Record<"name" | "weight" | "date", string>>;
type FormStatus =
  | { type: "calculation"; category: Category }
  | { type: "success"; category: Category }
  | { type: "error"; message: string }
  | null;

const STORAGE_KEY = "parcelbot-parcels";

const Icon = ({
  children,
  size = 18,
  className = "",
}: {
  children: ReactNode;
  size?: number;
  className?: string;
}) => (
  <svg
    aria-hidden="true"
    className={className}
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    {children}
  </svg>
);

const BoxIcon = ({ size = 22 }: { size?: number }) => (
  <Icon size={size}>
    <path d="m21 8-9 5-9-5" />
    <path d="m3.3 7 8.7-5 8.7 5v10L12 22l-8.7-5Z" />
    <path d="M12 13v9" />
    <path d="m7.5 4.6 9 5" />
  </Icon>
);

const CalendarIcon = ({ size = 18 }: { size?: number }) => (
  <Icon size={size}>
    <path d="M8 2v4M16 2v4M3 9h18" />
    <rect x="3" y="4" width="18" height="17" rx="2" />
  </Icon>
);

const Spinner = () => <span className="spinner" aria-hidden="true" />;

export const classifyParcel = (weight: number, priority: boolean): Category => {
  if (weight > 10) return "Heavy";
  return priority ? "Express" : "Standard";
};

const isValidDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
};

const isParcel = (value: unknown): value is Parcel => {
  if (!value || typeof value !== "object") return false;
  const parcel = value as Record<string, unknown>;
  return (
    typeof parcel.id === "string" &&
    typeof parcel.name === "string" &&
    typeof parcel.weight === "number" &&
    parcel.weight > 0 &&
    typeof parcel.priority === "boolean" &&
    ["Heavy", "Express", "Standard"].includes(String(parcel.category)) &&
    typeof parcel.shippingDate === "string" &&
    isValidDate(parcel.shippingDate)
  );
};

const readParcels = (): Parcel[] => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    const parsed: unknown = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed.filter(isParcel) : [];
  } catch {
    return [];
  }
};

function ThemeToggle({ theme, onChange }: { theme: Theme; onChange: () => void }) {
  return (
    <button
      className="theme-toggle"
      onClick={onChange}
      aria-label={theme === "dark" ? "Включить светлую тему" : "Включить тёмную тему"}
      title={theme === "dark" ? "Светлая тема" : "Тёмная тема"}
    >
      <span className="theme-icon">
        {theme === "dark" ? (
          <Icon size={17}>
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
          </Icon>
        ) : (
          <Icon size={17}>
            <path d="M20.8 15.2A9 9 0 0 1 8.8 3.2 9 9 0 1 0 20.8 15.2Z" />
          </Icon>
        )}
      </span>
      <span className="theme-label">{theme === "dark" ? "Тёмная" : "Светлая"}</span>
      <span className="toggle-track" aria-hidden="true">
        <span className="toggle-thumb" />
      </span>
    </button>
  );
}

function StatusBanner({ status }: { status: Exclude<FormStatus, null> }) {
  const isError = status.type === "error";
  const isSaved = status.type === "success";
  const category =
    status.type === "calculation" || status.type === "success" ? status.category : null;

  return (
    <div
      className={`notice ${isError ? "notice-error" : "notice-success"} result-notice`}
      role={isError ? "alert" : "status"}
      aria-live="polite"
    >
      <span className="notice-icon">
        {isError ? (
          <Icon size={17}>
            <circle cx="12" cy="12" r="9" />
            <path d="M12 8v5M12 16.5v.5" />
          </Icon>
        ) : (
          <Icon size={17}>
            <path d="m5 12 4 4L19 6" />
          </Icon>
        )}
      </span>
      <span>
        <strong>
          {isError
            ? status.message
            : isSaved
              ? "Посылка успешно сохранена"
              : `Категория: ${category}`}
        </strong>
        {isSaved && category && <small>Категория: {category}</small>}
      </span>
      {category && <span className={`tag tag-${category.toLowerCase()}`}>{category}</span>}
    </div>
  );
}

function NewParcel({ onSave }: { onSave: (parcel: Parcel) => void }) {
  const [name, setName] = useState("");
  const [weight, setWeight] = useState("");
  const [date, setDate] = useState("2026-11-25");
  const [priority, setPriority] = useState(true);
  const [errors, setErrors] = useState<FormErrors>({});
  const [loading, setLoading] = useState<"calculate" | "save" | null>(null);
  const [status, setStatus] = useState<FormStatus>(null);
  const savingRef = useRef(false);

  const parsedWeight = Number(weight);
  const weightIsValid = weight.trim() !== "" && Number.isFinite(parsedWeight) && parsedWeight > 0;

  const clearCalculation = () => {
    if (status?.type === "calculation") setStatus(null);
  };

  const handleWeightChange = (value: string) => {
    setWeight(value);
    setErrors((current) => ({ ...current, weight: undefined }));
    clearCalculation();
  };

  const handlePriorityChange = () => {
    setPriority((value) => !value);
    clearCalculation();
  };

  const calculate = () => {
    if (loading || !weightIsValid) {
      setStatus(null);
      setErrors((current) => ({
        ...current,
        weight: "Вес должен быть положительным числом",
      }));
      return;
    }

    setErrors((current) => ({ ...current, weight: undefined }));
    setStatus(null);
    setLoading("calculate");
    window.setTimeout(() => {
      setStatus({ type: "calculation", category: classifyParcel(parsedWeight, priority) });
      setLoading(null);
    }, 350);
  };

  const save = () => {
    if (savingRef.current || loading) return;

    const nextErrors: FormErrors = {};
    const trimmedName = name.trim();
    if (trimmedName.length < 1 || trimmedName.length > 80) {
      nextErrors.name = "Название должно содержать от 1 до 80 символов";
    }
    if (!weightIsValid) {
      nextErrors.weight = "Вес должен быть положительным числом";
    }
    if (!isValidDate(date)) {
      nextErrors.date = "Некорректная дата отправки";
    }

    setErrors(nextErrors);
    setStatus(null);
    if (Object.keys(nextErrors).length > 0) return;

    savingRef.current = true;
    setLoading("save");

    window.setTimeout(() => {
      const category = classifyParcel(parsedWeight, priority);
      const parcel: Parcel = {
        id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
        name: trimmedName,
        weight: parsedWeight,
        priority,
        category,
        shippingDate: date,
      };

      try {
        onSave(parcel);
        setStatus({ type: "success", category });
        setName("");
        setWeight("");
        setErrors({});
      } catch {
        setStatus({
          type: "error",
          message: "Не удалось сохранить посылку. Попробуйте снова",
        });
      } finally {
        savingRef.current = false;
        setLoading(null);
      }
    }, 450);
  };

  return (
    <div className="new-layout">
      <section className="card form-card">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Новая отправка</span>
            <h2>Данные посылки</h2>
            <p>Заполните параметры для определения категории доставки.</p>
          </div>
        </div>

        <div className="form-grid">
          <label className={`field field-wide ${errors.name ? "has-error" : ""}`}>
            <span className="field-label">Название посылки</span>
            <span className="input-wrap">
              <BoxIcon size={18} />
              <input
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                  setErrors((current) => ({ ...current, name: undefined }));
                }}
                placeholder="Например, документы"
                maxLength={81}
                aria-invalid={Boolean(errors.name)}
              />
            </span>
            {errors.name ? (
              <span className="field-error">
                <Icon size={14}>
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 8v5M12 17h.01" />
                </Icon>
                {errors.name}
              </span>
            ) : (
              <span className="field-hint">{name.length}/80 символов</span>
            )}
          </label>

          <label className={`field ${errors.weight ? "has-error" : ""}`}>
            <span className="field-label">Вес, кг</span>
            <span className="input-wrap">
              <Icon size={18}>
                <path d="M6 9a6 6 0 0 1 12 0M8.5 9a3.5 3.5 0 0 1 7 0" />
                <path d="M5 9h14l2 12H3L5 9Z" />
              </Icon>
              <input
                type="number"
                value={weight}
                min="0"
                step="0.1"
                onChange={(event) => handleWeightChange(event.target.value)}
                placeholder="0.0"
                aria-invalid={Boolean(errors.weight)}
              />
            </span>
            {errors.weight && <span className="field-error">{errors.weight}</span>}
          </label>

          <label className={`field ${errors.date ? "has-error" : ""}`}>
            <span className="field-label">Дата отправки</span>
            <span className="input-wrap date-input">
              <CalendarIcon />
              <input
                type="date"
                value={date}
                onChange={(event) => {
                  setDate(event.target.value);
                  setErrors((current) => ({ ...current, date: undefined }));
                }}
                aria-invalid={Boolean(errors.date)}
              />
            </span>
            {errors.date && <span className="field-error">{errors.date}</span>}
          </label>

          <div className="priority-row field-wide">
            <span className="priority-icon">
              <Icon size={19}>
                <path d="m13 2-8 12h7l-1 8 8-12h-7l1-8Z" />
              </Icon>
            </span>
            <span className="priority-copy">
              <strong>Приоритетная доставка</strong>
              <small>{priority ? "Включена" : "Выключена"}</small>
            </span>
            <button
              type="button"
              className={`switch ${priority ? "active" : ""}`}
              onClick={handlePriorityChange}
              role="switch"
              aria-checked={priority}
              aria-label="Приоритетная доставка"
            >
              <span />
            </button>
          </div>
        </div>

        {loading && (
          <div className="loading-state form-status" role="status" aria-live="polite">
            <Spinner />
            <span>
              <strong>
                {loading === "calculate" ? "Выполняется расчёт" : "Сохраняем посылку"}
              </strong>
              <small>Пожалуйста, подождите</small>
            </span>
          </div>
        )}
        {!loading && status && <StatusBanner status={status} />}

        <div className="actions">
          <button
            className="button button-secondary"
            onClick={calculate}
            disabled={loading !== null}
          >
            {loading === "calculate" ? (
              <>
                <Spinner /> Рассчитываем…
              </>
            ) : (
              <>
                <Icon size={18}>
                  <rect x="4" y="2" width="16" height="20" rx="2" />
                  <path d="M8 6h8M8 11h2M14 11h2M8 16h2M14 16h2" />
                </Icon>
                Рассчитать
              </>
            )}
          </button>
          <button className="button button-primary" onClick={save} disabled={loading !== null}>
            {loading === "save" ? (
              <>
                <Spinner /> Сохраняем…
              </>
            ) : (
              <>
                <Icon size={18}>
                  <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z" />
                  <path d="M17 21v-8H7v8M7 3v5h8" />
                </Icon>
                Сохранить посылку
              </>
            )}
          </button>
        </div>
      </section>
    </div>
  );
}

function Shipments({ parcels }: { parcels: Parcel[] }) {
  const [date, setDate] = useState("2026-11-25");
  const [results, setResults] = useState<Parcel[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [operationError, setOperationError] = useState<string | null>(null);

  const show = () => {
    if (loading) return;
    setLoading(true);
    setOperationError(null);
    window.setTimeout(() => {
      try {
        setResults(parcels.filter((parcel) => parcel.shippingDate === date));
        setSearched(true);
      } catch {
        setResults([]);
        setSearched(true);
        setOperationError("Не удалось загрузить отправки. Попробуйте снова");
      } finally {
        setLoading(false);
      }
    }, 350);
  };

  return (
    <section className="card shipments-card">
      <div className="section-heading shipments-heading">
        <div>
          <span className="eyebrow">Сохранённые отправки</span>
          <h2>Отправки по дате</h2>
          <p>Выберите дату, чтобы посмотреть сохранённые посылки.</p>
        </div>
        <div className="result-count" aria-live="polite">
          <strong>{results.length}</strong>
          <span>{results.length === 1 ? "отправка" : "отправок"}</span>
        </div>
      </div>

      <div className="filter-bar">
        <label className="field filter-field">
          <span className="field-label">Дата отправки</span>
          <span className="input-wrap date-input">
            <CalendarIcon />
            <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </span>
        </label>
        <button className="button button-primary" onClick={show} disabled={loading}>
          {loading ? (
            <>
              <Spinner /> Загружаем…
            </>
          ) : (
            <>
              <Icon size={18}>
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-4-4" />
              </Icon>
              Показать отправки
            </>
          )}
        </button>
      </div>

      {loading ? (
        <div className="result-placeholder" role="status">
          <Spinner />
          <strong>Загружаем отправки</strong>
          <span>Проверяем сохранённые данные за выбранную дату</span>
        </div>
      ) : operationError ? (
        <div className="empty-state error-state" role="alert">
          <span className="empty-illustration">
            <Icon size={28}>
              <path d="M12 9v4M12 17h.01" />
              <path d="M10.3 3.7 2.2 18a2 2 0 0 0 1.7 3h16.2a2 2 0 0 0 1.7-3L13.7 3.7a2 2 0 0 0-3.4 0Z" />
            </Icon>
          </span>
          <h3>{operationError}</h3>
          <button className="button button-secondary" onClick={show}>
            Попробовать снова
          </button>
        </div>
      ) : results.length > 0 ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Название</th>
                <th>Вес</th>
                <th>Приоритет</th>
                <th>Категория</th>
                <th>Дата отправки</th>
              </tr>
            </thead>
            <tbody>
              {results.map((parcel) => (
                <tr key={parcel.id}>
                  <td data-label="Название">
                    <span className="parcel-name-icon">
                      <BoxIcon size={17} />
                    </span>
                    <strong>{parcel.name}</strong>
                  </td>
                  <td data-label="Вес">{parcel.weight} кг</td>
                  <td data-label="Приоритет">
                    {parcel.priority ? (
                      <span className="priority-pill">
                        <Icon size={13}>
                          <path d="m13 2-8 12h7l-1 8 8-12h-7l1-8Z" />
                        </Icon>
                        Приоритетная
                      </span>
                    ) : (
                      <span>Обычная</span>
                    )}
                  </td>
                  <td data-label="Категория">
                    <span className={`tag tag-${parcel.category.toLowerCase()}`}>
                      {parcel.category}
                    </span>
                  </td>
                  <td data-label="Дата отправки">{parcel.shippingDate}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty-state">
          <span className="empty-illustration">
            <CalendarIcon size={28} />
          </span>
          <h3>На выбранную дату посылок нет</h3>
          <p>
            {searched
              ? "Выберите другую дату или сохраните новую посылку."
              : "Выберите дату и нажмите «Показать отправки»."}
          </p>
        </div>
      )}
    </section>
  );
}

export default function App() {
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      return localStorage.getItem("parcelbot-theme") === "light" ? "light" : "dark";
    } catch {
      return "dark";
    }
  });
  const [tab, setTab] = useState<Tab>("new");
  const [parcels, setParcels] = useState<Parcel[]>(readParcels);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("parcelbot-theme", theme);
    } catch {
      // The selected theme still applies for the current session.
    }
  }, [theme]);

  const saveParcel = (parcel: Parcel) => {
    const next = [...parcels, parcel];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setParcels(next);
  };

  return (
    <div className="app-shell">
      <header className="header">
        <div className="header-inner">
          <div className="brand">
            <span className="logo">
              <BoxIcon />
            </span>
            <span className="brand-copy">
              <strong>
                Parcel<span>Bot</span>
              </strong>
              <small>Сервис классификации и планирования отправок</small>
            </span>
          </div>
          <ThemeToggle
            theme={theme}
            onChange={() => setTheme((value) => (value === "dark" ? "light" : "dark"))}
          />
        </div>
      </header>

      <main>
        <div className="top-row">
          <nav className="tabs" aria-label="Разделы приложения">
            <button className={tab === "new" ? "active" : ""} onClick={() => setTab("new")}>
              <Icon size={18}>
                <path d="M12 5v14M5 12h14" />
              </Icon>
              Новая посылка
            </button>
            <button
              className={tab === "shipments" ? "active" : ""}
              onClick={() => setTab("shipments")}
            >
              <CalendarIcon />
              Отправки по дате
              {parcels.length > 0 && <span className="tab-count">{parcels.length}</span>}
            </button>
          </nav>
          <span className="demo-badge">Демо-режим</span>
        </div>

        {tab === "new" ? (
          <NewParcel onSave={saveParcel} />
        ) : (
          <Shipments key={parcels.length} parcels={parcels} />
        )}
      </main>

      <footer>
        <span>ParcelBot</span>
        <span className="system-status">
          <i /> Данные хранятся в этом браузере
        </span>
        <span>Демо-режим</span>
      </footer>
    </div>
  );
}
