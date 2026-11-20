export type Category = "heavy" | "express" | "standard";
export type Parcel = {
  id: number;
  name: string;
  weight: number;
  priority: boolean;
  category: Category;
  shippingDate: string;
};
export type ParcelInput = Omit<Parcel, "id" | "category">;

export function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export function today(): string {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object";
const isCategory = (value: unknown): value is Category =>
  typeof value === "string" && ["heavy", "express", "standard"].includes(value);
const isParcel = (value: unknown): value is Parcel =>
  record(value) &&
  typeof value.id === "number" &&
  Number.isFinite(value.id) &&
  typeof value.name === "string" &&
  typeof value.weight === "number" &&
  Number.isFinite(value.weight) &&
  value.weight > 0 &&
  typeof value.priority === "boolean" &&
  isCategory(value.category) &&
  typeof value.shippingDate === "string" &&
  isValidDate(value.shippingDate);

async function request(
  path: string,
  init: RequestInit,
  expectedStatus: number,
): Promise<Record<string, unknown>> {
  const base = import.meta.env.VITE_API_BASE_URL?.trim().replace(/\/+$/, "");
  if (!base)
    throw new Error("Не настроен адрес API. Укажите VITE_API_BASE_URL и перезапустите приложение.");
  const response = await fetch(`${base}/${path}`, init);
  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new Error(`Некорректный ответ сервера (HTTP ${response.status})`);
  }
  if (!response.ok) {
    if (
      record(data) &&
      record(data.error) &&
      data.error.code === "VALIDATION_ERROR" &&
      typeof data.error.message === "string"
    ) {
      throw new Error(data.error.message);
    }
    throw new Error(`Сервер недоступен (HTTP ${response.status}). Попробуйте снова.`);
  }
  if (response.status !== expectedStatus || !record(data))
    throw new Error("Неожиданный ответ сервера");
  return data;
}
const post = (data: unknown, status: number) =>
  request(
    "parcelbot-parcel",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    },
    status,
  );
export async function calculateParcel(weight: number, priority: boolean): Promise<Category> {
  const data = await post({ action: "calculate", weight, priority }, 200);
  if (!isCategory(data.category)) throw new Error("Некорректная категория в ответе сервера");
  return data.category;
}
export async function saveParcel(input: ParcelInput): Promise<Parcel> {
  const data = await post({ action: "save", ...input }, 201);
  if (!isParcel(data.parcel))
    throw new Error(
      "Некорректная посылка в ответе сервера. Проверьте список перед повторным сохранением.",
    );
  return data.parcel;
}
export async function getParcels(date: string, signal?: AbortSignal): Promise<Parcel[]> {
  const data = await request(
    `parcelbot-parcels?${new URLSearchParams({ date })}`,
    { method: "GET", signal },
    200,
  );
  if (
    !Array.isArray(data.parcels) ||
    !data.parcels.every(isParcel) ||
    data.parcels.some((p) => p.shippingDate !== date)
  ) {
    throw new Error("Некорректный список посылок в ответе сервера");
  }
  return data.parcels;
}
export const errorMessage = (error: unknown) =>
  error instanceof Error && error.message
    ? error.message
    : "Не удалось выполнить запрос. Проверьте соединение и попробуйте снова.";
