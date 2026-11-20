import { describe, expect, it, vi } from "vitest";
import { calculateParcel, getParcels, isValidDate, saveParcel } from "./parcels";
import { jsonResponse, parcel } from "../test/fixtures";

describe("workflow API contract", () => {
  it.each([
    [10, true, "express"],
    [10, false, "standard"],
    [10.01, true, "heavy"],
    [10.01, false, "heavy"],
  ] as const)("uses WF1 calculate for %s/%s", async (weight, priority, category) => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ category }));
    expect(await calculateParcel(weight, priority)).toBe(category);
    expect(fetch).toHaveBeenCalledWith("https://api.example.test/webhook/parcelbot-parcel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "calculate", weight, priority }),
    });
  });
  it("uses WF1 save and accepts the numeric server ID", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ parcel }, 201));
    const { id: _id, category: _category, ...input } = parcel;
    expect(await saveParcel(input)).toEqual(parcel);
    expect(JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body))).toEqual({
      action: "save",
      ...input,
    });
  });
  it("uses WF2 with query date and abort signal", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ parcels: [parcel] }));
    const signal = new AbortController().signal;
    expect(await getParcels(parcel.shippingDate, signal)).toEqual([parcel]);
    expect(fetch).toHaveBeenCalledWith(
      "https://api.example.test/webhook/parcelbot-parcels?date=2026-11-25",
      { method: "GET", signal },
    );
  });
  it("accepts an empty WF2 result", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ parcels: [] }));
    expect(await getParcels(parcel.shippingDate)).toEqual([]);
  });
  it("preserves server validation errors", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(
        { error: { code: "VALIDATION_ERROR", message: "Некорректная дата отправки" } },
        400,
      ),
    );
    await expect(getParcels("bad")).rejects.toThrow("Некорректная дата отправки");
  });
  it.each([
    {},
    { parcels: null },
    { parcels: [{ ...parcel, category: ["express"] }] },
    { parcels: [{ ...parcel, id: "42" }] },
    { parcels: [{ ...parcel, category: "Express" }] },
    { parcels: [{ ...parcel, shippingDate: "2026-11-26" }] },
  ])("rejects malformed lists %j", async (body) => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(body));
    await expect(getParcels(parcel.shippingDate)).rejects.toThrow("Некорректный список");
  });
  it("rejects HTML and infrastructure errors", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response("<html>failure</html>", { status: 502 }))
      .mockResolvedValueOnce(jsonResponse({}, 503));
    await expect(getParcels(parcel.shippingDate)).rejects.toThrow("HTTP 502");
    await expect(getParcels(parcel.shippingDate)).rejects.toThrow("HTTP 503");
  });
  it("does not send requests without configuration", async () => {
    vi.stubEnv("VITE_API_BASE_URL", "");
    await expect(getParcels(parcel.shippingDate)).rejects.toThrow("Не настроен адрес API");
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each([
    ["2024-02-29", true],
    ["2026-02-29", false],
    ["2026-02-30", false],
    ["2026-13-01", false],
    ["", false],
  ])("validates calendar date %s", (date, valid) => {
    expect(isValidDate(date)).toBe(valid);
  });
});
