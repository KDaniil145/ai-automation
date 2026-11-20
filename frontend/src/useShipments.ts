import { useEffect, useRef, useState } from "react";
import { errorMessage, getParcels, isValidDate, today, type Parcel } from "./api/parcels";

type State = {
  date: string;
  status: "idle" | "loading" | "success" | "error";
  parcels: Parcel[];
  error?: string;
};
const initialDate = () => {
  try {
    const value = localStorage.getItem("parcelbot-date");
    if (value && isValidDate(value)) return value;
  } catch {
    /* Storage is optional. */
  }
  return today();
};
export function useShipments(active: boolean) {
  const [date, setDate] = useState(initialDate);
  const [state, setState] = useState<State>({ date: "", status: "idle", parcels: [] });
  const [revision, setRevision] = useState(0);
  const [started, setStarted] = useState(false);
  const sequence = useRef(0);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    if (active) setStarted(true);
  }, [active]);
  useEffect(() => {
    if (isValidDate(date)) {
      try {
        localStorage.setItem("parcelbot-date", date);
      } catch {
        /* Keep state in memory. */
      }
    }
  }, [date]);
  useEffect(() => {
    if (!started || !isValidDate(date)) return;
    const id = ++sequence.current;
    const abort = new AbortController();
    controller.current = abort;
    setState({ date, status: "loading", parcels: [] });
    getParcels(date, abort.signal)
      .then((parcels) => {
        if (id === sequence.current && !abort.signal.aborted)
          setState({ date, status: "success", parcels });
      })
      .catch((error) => {
        if (id === sequence.current && !abort.signal.aborted)
          setState({ date, status: "error", parcels: [], error: errorMessage(error) });
      });
    return () => {
      abort.abort();
    };
  }, [date, started, revision]);
  const invalidate = (parcel: Parcel) => {
    if (parcel.shippingDate !== date) return;
    // Invalidate synchronously: a GET started before save must never overwrite the new data.
    ++sequence.current;
    controller.current?.abort();
    setRevision((value) => value + 1);
  };
  const selectDate = (value: string) => {
    ++sequence.current;
    controller.current?.abort();
    setDate(value);
  };
  const visible =
    state.date === date && isValidDate(date)
      ? state
      : { date, status: "idle" as const, parcels: [] };
  return {
    date,
    selectDate,
    state: visible,
    retry: () => setRevision((value) => value + 1),
    invalidate,
  };
}
