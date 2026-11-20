import type { Parcel } from "../api/parcels";
export const parcel: Parcel = {
  id: 42,
  name: "Документы",
  weight: 2.5,
  priority: true,
  category: "express",
  shippingDate: "2026-11-25",
};
export const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
