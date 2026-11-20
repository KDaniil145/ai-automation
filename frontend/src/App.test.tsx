import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import App from "./App";
import { deferred, jsonResponse, parcel } from "./test/fixtures";

const newForm = () => within(screen.getByRole("form", { name: "Новая посылка" }));
const filter = () => document.querySelector<HTMLInputElement>(".filter-field input")!;
const openList = async () => {
  await userEvent.click(screen.getByRole("button", { name: "Отправки по дате" }));
};
async function fillForm() {
  await userEvent.type(newForm().getByLabelText("Название посылки"), "Документы");
  await userEvent.type(newForm().getByLabelText("Вес, кг"), "2.5");
  fireEvent.change(newForm().getByLabelText("Дата отправки"), {
    target: { value: parcel.shippingDate },
  });
}

describe("ParcelBot user scenarios", () => {
  it("renders labelled Mantine fields, keyboard switch, themes and no demo UI", async () => {
    render(<App />);
    expect(newForm().getByLabelText("Название посылки")).toBeVisible();
    const toggle = newForm().getByRole("switch", { name: "Приоритетная доставка" });
    toggle.focus();
    await userEvent.keyboard(" ");
    expect(toggle).not.toBeChecked();
    await userEvent.click(screen.getByRole("button", { name: "Включить светлую тему" }));
    expect(document.documentElement).toHaveAttribute("data-theme", "light");
    expect(localStorage.getItem("parcelbot-theme")).toBe("light");
    expect(screen.queryByText("Демо-режим")).not.toBeInTheDocument();
    expect(screen.queryByText("Данные хранятся в этом браузере")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Отправки по дате" })).toHaveTextContent(
      /^Отправки по дате$/,
    );
    expect(fetch).not.toHaveBeenCalled();
  });
  it("validates required fields and invalid weight/date without a request", async () => {
    render(<App />);
    await userEvent.click(newForm().getByRole("button", { name: "Сохранить посылку" }));
    expect(newForm().getByText("Название должно содержать от 1 до 80 символов")).toBeVisible();
    expect(newForm().getByLabelText("Название посылки")).toHaveAttribute("aria-invalid", "true");
    expect(newForm().getByText("Вес должен быть положительным числом")).toBeVisible();
    await userEvent.type(newForm().getByLabelText("Название посылки"), " ".repeat(2));
    await userEvent.type(newForm().getByLabelText("Вес, кг"), "-1");
    fireEvent.change(newForm().getByLabelText("Дата отправки"), { target: { value: "" } });
    fireEvent.submit(screen.getByRole("form"));
    expect(newForm().getByText("Некорректная дата отправки")).toBeVisible();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("rejects 81 characters but accepts 80 and trims the submitted name", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ parcel }, 201));
    render(<App />);
    await fillForm();
    fireEvent.change(newForm().getByLabelText("Название посылки"), {
      target: { value: "a".repeat(81) },
    });
    fireEvent.submit(screen.getByRole("form"));
    expect(fetch).not.toHaveBeenCalled();
    fireEvent.change(newForm().getByLabelText("Название посылки"), {
      target: { value: "a".repeat(80) },
    });
    fireEvent.submit(screen.getByRole("form"));
    await screen.findByText("Посылка успешно сохранена");
    expect(JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body)).name).toHaveLength(80);
  });
  it("calculates through WF1 without requiring name/date; prevents repeated calculation", async () => {
    const pending = deferred<Response>();
    vi.mocked(fetch).mockReturnValue(pending.promise);
    render(<App />);
    await userEvent.type(newForm().getByLabelText("Вес, кг"), "2.5");
    const button = newForm().getByRole("button", { name: "Рассчитать" });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Выполняется расчёт")).toBeVisible();
    // A deliberately different valid server category proves the UI uses the response.
    await act(async () => pending.resolve(jsonResponse({ category: "heavy" })));
    expect(screen.getByText("Категория: heavy")).toBeVisible();
    await userEvent.type(newForm().getByLabelText("Вес, кг"), "1");
    expect(screen.queryByText("Категория: heavy")).not.toBeInTheDocument();
  });
  it("blocks double click and repeated Enter/submission while saving", async () => {
    const pending = deferred<Response>();
    vi.mocked(fetch).mockReturnValue(pending.promise);
    render(<App />);
    await fillForm();
    const button = newForm().getByRole("button", { name: "Сохранить посылку" });
    fireEvent.click(button);
    fireEvent.click(button);
    fireEvent.submit(screen.getByRole("form"));
    fireEvent.submit(screen.getByRole("form"));
    await userEvent.keyboard("{Enter}{Enter}");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Сохраняем посылку")).toBeVisible();
    expect(button).toBeDisabled();
    await act(async () => pending.resolve(jsonResponse({ parcel }, 201)));
    expect(screen.getByText("Посылка успешно сохранена")).toBeVisible();
    expect(newForm().getByLabelText("Название посылки")).toHaveValue("");
  });
  it("full journey: fills form, calculates via WF1, saves via WF1, then displays WF2 data", async () => {
    localStorage.setItem("parcelbot-date", parcel.shippingDate);
    const calls: string[] = [];
    vi.mocked(fetch).mockImplementation(async (url, init) => {
      if (init?.method === "GET") {
        calls.push("WF2");
        return jsonResponse({ parcels: [{ ...parcel, name: "Документы из WF2" }] });
      }
      const body = JSON.parse(String(init?.body));
      calls.push(body.action);
      return body.action === "calculate"
        ? jsonResponse({ category: "express" })
        : jsonResponse({ parcel }, 201);
    });
    render(<App />);
    await fillForm();
    await userEvent.click(newForm().getByRole("button", { name: "Рассчитать" }));
    await screen.findByText("Категория: express");
    newForm().getByLabelText("Название посылки").focus();
    await userEvent.keyboard("{Enter}");
    await screen.findByText("Посылка успешно сохранена");
    await openList();
    expect(await screen.findByText("Документы из WF2")).toBeVisible();
    expect(calls).toEqual(["calculate", "save", "WF2"]);
    expect(document.querySelector(".result-count")).toHaveTextContent("1");
    expect(localStorage.getItem("parcelbot-parcels")).toBeNull();
    expect(screen.queryByRole("button", { name: "Показать отправки" })).not.toBeInTheDocument();
  });
  it.each(["network", "validation", "server", "malformed"])(
    "retains input after %s save failure and allows retry",
    async (kind) => {
      const mock = vi.mocked(fetch);
      if (kind === "network") mock.mockRejectedValueOnce(new Error("Нет соединения"));
      else if (kind === "validation")
        mock.mockResolvedValueOnce(
          jsonResponse({ error: { code: "VALIDATION_ERROR", message: "Проверьте название" } }, 400),
        );
      else if (kind === "server") mock.mockResolvedValueOnce(jsonResponse({}, 500));
      else mock.mockResolvedValueOnce(jsonResponse({ parcel: { ...parcel, id: "42" } }, 201));
      mock.mockResolvedValueOnce(jsonResponse({ parcel }, 201));
      render(<App />);
      await fillForm();
      await userEvent.click(newForm().getByRole("button", { name: "Сохранить посылку" }));
      expect(await screen.findByRole("alert")).toBeVisible();
      expect(newForm().getByLabelText("Название посылки")).toHaveValue("Документы");
      expect(mock).toHaveBeenCalledTimes(1);
      await userEvent.click(newForm().getByRole("button", { name: "Сохранить посылку" }));
      expect(await screen.findByText("Посылка успешно сохранена")).toBeVisible();
    },
  );
  it("shows loading, empty, error and retry for automatic WF2 requests", async () => {
    const pending = deferred<Response>();
    vi.mocked(fetch)
      .mockReturnValueOnce(pending.promise)
      .mockRejectedValueOnce(new Error("Ошибка загрузки"))
      .mockResolvedValueOnce(jsonResponse({ parcels: [parcel] }));
    render(<App />);
    await openList();
    expect(screen.getByText("Загружаем отправки")).toBeVisible();
    await act(async () => pending.resolve(jsonResponse({ parcels: [] })));
    expect(screen.getByText("На выбранную дату посылок нет")).toBeVisible();
    fireEvent.change(filter(), { target: { value: parcel.shippingDate } });
    expect(await screen.findByRole("alert")).toHaveTextContent("Ошибка загрузки");
    await userEvent.click(screen.getByRole("button", { name: "Попробовать снова" }));
    expect(await screen.findByText("Документы")).toBeVisible();
  });
  it("ignores stale successes and errors, even when transport ignores abort", async () => {
    const a = deferred<Response>();
    const b = deferred<Response>();
    const c = deferred<Response>();
    vi.mocked(fetch)
      .mockReturnValueOnce(a.promise)
      .mockReturnValueOnce(b.promise)
      .mockReturnValueOnce(c.promise);
    render(<App />);
    await openList();
    fireEvent.change(filter(), { target: { value: "2026-11-24" } });
    fireEvent.change(filter(), { target: { value: parcel.shippingDate } });
    await act(async () => c.resolve(jsonResponse({ parcels: [parcel] })));
    expect(screen.getByText("Документы")).toBeVisible();
    await act(async () => {
      a.resolve(jsonResponse({ parcels: [] }));
      b.reject(new Error("Старая ошибка"));
    });
    expect(screen.getByText("Документы")).toBeVisible();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect((vi.mocked(fetch).mock.calls[0][1]?.signal as AbortSignal).aborted).toBe(true);
  });
  it("does not show old rows or count after changing or clearing the date", async () => {
    localStorage.setItem("parcelbot-date", parcel.shippingDate);
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ parcels: [parcel] }))
      .mockReturnValue(new Promise(() => {}));
    render(<App />);
    await openList();
    await screen.findByText("Документы");
    fireEvent.change(filter(), { target: { value: "2026-11-26" } });
    expect(screen.queryByText("Документы")).not.toBeInTheDocument();
    expect(document.querySelector(".result-count")).toHaveTextContent("—");
    fireEvent.change(filter(), { target: { value: "" } });
    expect(screen.getByText("Выберите корректную дату отправки")).toBeVisible();
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("keeps date/results across tabs and reloads results after remount", async () => {
    vi.mocked(fetch).mockImplementation(async () => jsonResponse({ parcels: [parcel] }));
    localStorage.setItem("parcelbot-date", parcel.shippingDate);
    const view = render(<App />);
    await openList();
    await screen.findByText("Документы");
    await userEvent.click(screen.getByRole("button", { name: "Новая посылка" }));
    await openList();
    expect(filter()).toHaveValue(parcel.shippingDate);
    expect(screen.getByText("Документы")).toBeVisible();
    expect(fetch).toHaveBeenCalledTimes(1);
    view.unmount();
    render(<App />);
    await openList();
    expect(filter()).toHaveValue(parcel.shippingDate);
    await screen.findByText("Документы");
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("survives unavailable storage and corrupt saved dates", async () => {
    localStorage.setItem("parcelbot-date", "2026-02-30");
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("Storage disabled");
    });
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ parcels: [] }));
    render(<App />);
    await openList();
    expect(filter().value).not.toBe("2026-02-30");
    expect(await screen.findByText("На выбранную дату посылок нет")).toBeVisible();
  });
  it("refreshes an already loaded list after saving to its date", async () => {
    localStorage.setItem("parcelbot-date", parcel.shippingDate);
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ parcels: [] }))
      .mockResolvedValueOnce(jsonResponse({ parcel }, 201))
      .mockResolvedValueOnce(
        jsonResponse({ parcels: [{ ...parcel, name: "Обновлено через WF2" }] }),
      );
    render(<App />);
    await openList();
    await screen.findByText("На выбранную дату посылок нет");
    await userEvent.click(screen.getByRole("button", { name: "Новая посылка" }));
    await fillForm();
    await userEvent.click(newForm().getByRole("button", { name: "Сохранить посылку" }));
    await screen.findByText("Посылка успешно сохранена");
    await openList();
    expect(await screen.findByText("Обновлено через WF2")).toBeVisible();
    expect(fetch).toHaveBeenCalledTimes(3);
  });
  it("save invalidates an earlier GET; failed refresh never reports failed save", async () => {
    localStorage.setItem("parcelbot-date", parcel.shippingDate);
    const oldGet = deferred<Response>();
    vi.mocked(fetch)
      .mockReturnValueOnce(oldGet.promise)
      .mockResolvedValueOnce(jsonResponse({ parcel }, 201))
      .mockRejectedValueOnce(new Error("Не удалось обновить список"));
    render(<App />);
    await openList();
    await userEvent.click(screen.getByRole("button", { name: "Новая посылка" }));
    await fillForm();
    await userEvent.click(newForm().getByRole("button", { name: "Сохранить посылку" }));
    expect(await screen.findByText("Посылка успешно сохранена")).toBeVisible();
    await act(async () => oldGet.resolve(jsonResponse({ parcels: [] })));
    await openList();
    expect(await screen.findByRole("alert")).toHaveTextContent("Не удалось обновить список");
    await userEvent.click(screen.getByRole("button", { name: "Новая посылка" }));
    expect(screen.getByText("Посылка успешно сохранена")).toBeVisible();
    expect(newForm().queryByRole("alert")).not.toBeInTheDocument();
  });
});
