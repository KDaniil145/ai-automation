import { useEffect, useRef, useState, type ReactNode } from "react";

type Theme = "dark" | "light";
type Tab = "new" | "shipments";
import {
  Button,
  MantineProvider,
  Notification,
  Paper,
  Switch,
  TextInput,
  createTheme,
} from "@mantine/core";
import {
  calculateParcel,
  saveParcel,
  isValidDate,
  today,
  errorMessage,
  type Category,
  type Parcel,
} from "./api/parcels";
import { useShipments } from "./useShipments";

const appTheme = createTheme({
  fontFamily: "Manrope, system-ui, sans-serif",
  primaryColor: "blue",
  defaultRadius: 9,
  spacing: { xs: "8px", sm: "12px", md: "16px", lg: "24px", xl: "32px" },
});
const fieldClasses = {
  root: "field",
  label: "field-label",
  input: "parcel-input",
  wrapper: "field-input-wrap",
  section: "field-section",
  error: "field-error",
  description: "field-hint",
};

type FormErrors = Partial<Record<"name" | "weight" | "date", string>>;
type FormStatus =
  | { type: "calculation"; category: Category }
  | { type: "success"; category: Category }
  | { type: "error"; message: string }
  | null;

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

function ThemeToggle({ theme, onChange }: { theme: Theme; onChange: () => void }) {
  return (
    <Button
      unstyled
      type="button"
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
    </Button>
  );
}

function StatusBanner({ status }: { status: Exclude<FormStatus, null> }) {
  const isError = status.type === "error";
  const isSaved = status.type === "success";
  const category =
    status.type === "calculation" || status.type === "success" ? status.category : null;

  return (
    <Notification
      unstyled
      withCloseButton={false}
      classNames={{
        root: `notice ${isError ? "notice-error" : "notice-success"} result-notice`,
        icon: "notice-icon",
        body: "notice-content",
        title: "notice-title",
        description: "notice-copy",
      }}
      role={isError ? "alert" : "status"}
      aria-live="polite"
      icon={
        <Icon size={17}>
          {isError ? <path d="M12 4v9M12 17v1" /> : <path d="m5 12 4 4L19 6" />}
        </Icon>
      }
      title={
        isError ? status.message : isSaved ? "Посылка успешно сохранена" : `Категория: ${category}`
      }
    >
      {category && <span className={`tag tag-${category}`}>{category}</span>}
    </Notification>
  );
}

function NewParcel({ onSave }: { onSave: (parcel: Parcel) => void }) {
  const [name, setName] = useState("");
  const [weight, setWeight] = useState("");
  const [date, setDate] = useState(today);
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

  const calculate = async () => {
    if (savingRef.current) return;
    if (!weightIsValid) {
      setErrors((current) => ({ ...current, weight: "Вес должен быть положительным числом" }));
      return;
    }
    savingRef.current = true;
    setErrors((current) => ({ ...current, weight: undefined }));
    setStatus(null);
    setLoading("calculate");
    try {
      setStatus({ type: "calculation", category: await calculateParcel(parsedWeight, priority) });
    } catch (error) {
      setStatus({ type: "error", message: errorMessage(error) });
    } finally {
      savingRef.current = false;
      setLoading(null);
    }
  };

  const save = async () => {
    if (savingRef.current) return;
    const nextErrors: FormErrors = {};
    const trimmedName = name.trim();
    if (!trimmedName || trimmedName.length > 80)
      nextErrors.name = "Название должно содержать от 1 до 80 символов";
    if (!weightIsValid) nextErrors.weight = "Вес должен быть положительным числом";
    if (!isValidDate(date)) nextErrors.date = "Некорректная дата отправки";
    setErrors(nextErrors);
    setStatus(null);
    if (Object.keys(nextErrors).length) return;
    savingRef.current = true;
    setLoading("save");
    let parcel: Parcel;
    try {
      parcel = await saveParcel({
        name: trimmedName,
        weight: parsedWeight,
        priority,
        shippingDate: date,
      });
    } catch (error) {
      setStatus({
        type: "error",
        message: `${errorMessage(error)} Если ответ потерян, проверьте отправки перед повторным сохранением.`,
      });
      savingRef.current = false;
      setLoading(null);
      return;
    }
    setStatus({ type: "success", category: parcel.category });
    setName("");
    setWeight("");
    setErrors({});
    savingRef.current = false;
    setLoading(null);
    onSave(parcel);
  };

  return (
    <div className="new-layout">
      <Paper component="section" unstyled className="card form-card">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Новая отправка</span>
            <h2>Данные посылки</h2>
            <p>Заполните параметры для определения категории доставки.</p>
          </div>
        </div>

        <form
          aria-label="Новая посылка"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <fieldset disabled={loading !== null} className="form-fields">
            <div className="form-grid">
              <TextInput
                unstyled
                classNames={{ ...fieldClasses, root: "field field-wide" }}
                label="Название посылки"
                leftSection={<BoxIcon size={18} />}
                inputWrapperOrder={["label", "input", "description", "error"]}
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                  setErrors((current) => ({ ...current, name: undefined }));
                }}
                placeholder="Например, документы"
                maxLength={81}
                error={errors.name}
                description={`${name.length}/80 символов`}
              />
              <TextInput
                unstyled
                classNames={fieldClasses}
                label="Вес, кг"
                leftSection={
                  <Icon size={18}>
                    <path d="M5 9h14l2 12H3L5 9ZM8 9V6a4 4 0 0 1 8 0v3" />
                  </Icon>
                }
                type="number"
                min="0"
                step="any"
                value={weight}
                onChange={(event) => handleWeightChange(event.target.value)}
                placeholder="0.0"
                error={errors.weight}
              />
              <TextInput
                unstyled
                classNames={fieldClasses}
                label="Дата отправки"
                leftSection={<CalendarIcon />}
                type="date"
                value={date}
                onChange={(event) => {
                  setDate(event.target.value);
                  setErrors((current) => ({ ...current, date: undefined }));
                }}
                error={errors.date}
              />

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
                <Switch
                  withThumbIndicator={false}
                  checked={priority}
                  onChange={handlePriorityChange}
                  aria-label="Приоритетная доставка"
                  classNames={{
                    root: "priority-switch",
                    track: "priority-track",
                    thumb: "priority-thumb",
                  }}
                />
              </div>
            </div>
          </fieldset>

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
            <Button
              unstyled
              type="button"
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
            </Button>
            <Button
              unstyled
              type="submit"
              className="button button-primary"
              disabled={loading !== null}
            >
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
            </Button>
          </div>
        </form>
      </Paper>
    </div>
  );
}

function Shipments({ shipments }: { shipments: ReturnType<typeof useShipments> }) {
  const { date, selectDate, state, retry } = shipments;
  const results = state.parcels;
  const loading = isValidDate(date) && (state.status === "idle" || state.status === "loading");
  const operationError = state.error;
  const show = retry;
  return (
    <Paper component="section" unstyled className="card shipments-card">
      <div className="section-heading shipments-heading">
        <div>
          <span className="eyebrow">Сохранённые отправки</span>
          <h2>Отправки по дате</h2>
          <p>Выберите дату, чтобы посмотреть сохранённые посылки.</p>
        </div>
        <div className="result-count" aria-live="polite">
          <strong>{state.status === "success" ? results.length : "—"}</strong>
          <span>{results.length === 1 ? "отправка" : "отправок"}</span>
        </div>
      </div>

      <div className="filter-bar">
        <TextInput
          unstyled
          classNames={{ ...fieldClasses, root: "field filter-field" }}
          label="Дата отправки"
          leftSection={<CalendarIcon />}
          type="date"
          value={date}
          onChange={(event) => selectDate(event.target.value)}
        />
      </div>

      {!isValidDate(date) ? (
        <div className="empty-state">
          <h3>Выберите корректную дату отправки</h3>
        </div>
      ) : loading ? (
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
          <Button unstyled type="button" className="button button-secondary" onClick={show}>
            Попробовать снова
          </Button>
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
          <p>Выберите другую дату или сохраните новую посылку.</p>
        </div>
      )}
    </Paper>
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
  const shipments = useShipments(tab === "shipments");

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("parcelbot-theme", theme);
    } catch {
      // The selected theme still applies for the current session.
    }
  }, [theme]);

  return (
    <MantineProvider theme={appTheme} forceColorScheme={theme}>
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
              <Button
                unstyled
                type="button"
                aria-current={tab === "new" ? "page" : undefined}
                className={tab === "new" ? "active" : ""}
                onClick={() => setTab("new")}
              >
                <Icon size={18}>
                  <path d="M12 5v14M5 12h14" />
                </Icon>
                Новая посылка
              </Button>
              <Button
                unstyled
                type="button"
                aria-current={tab === "shipments" ? "page" : undefined}
                className={tab === "shipments" ? "active" : ""}
                onClick={() => setTab("shipments")}
              >
                <CalendarIcon />
                Отправки по дате
              </Button>
            </nav>
          </div>

          <div hidden={tab !== "new"}>
            <NewParcel onSave={shipments.invalidate} />
          </div>
          {tab === "shipments" && <Shipments shipments={shipments} />}
        </main>

        <footer>
          <span>ParcelBot</span>
        </footer>
      </div>
    </MantineProvider>
  );
}
