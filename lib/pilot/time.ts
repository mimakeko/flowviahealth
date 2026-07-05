export const FLOWVIA_OPERATIONS_TIME_ZONE = process.env.FLOWVIA_OPERATIONS_TIME_ZONE || "America/Chicago";

const dateTimeLocalPattern = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/;

type DateParts = {
  day: number;
  hour: number;
  minute: number;
  month: number;
  second: number;
  year: number;
};

function numberPart(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes) {
  return Number(parts.find((part) => part.type === type)?.value);
}

function getZonedParts(date: Date, timeZone = FLOWVIA_OPERATIONS_TIME_ZONE): DateParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "2-digit",
    second: "2-digit",
    timeZone,
    year: "numeric",
  }).formatToParts(date);

  return {
    day: numberPart(parts, "day"),
    hour: numberPart(parts, "hour"),
    minute: numberPart(parts, "minute"),
    month: numberPart(parts, "month"),
    second: numberPart(parts, "second"),
    year: numberPart(parts, "year"),
  };
}

function getTimeZoneOffsetMs(date: Date, timeZone = FLOWVIA_OPERATIONS_TIME_ZONE) {
  const parts = getZonedParts(date, timeZone);
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return asUtc - date.getTime();
}

function zonedTimeToUtc(parts: Omit<DateParts, "second">, timeZone = FLOWVIA_OPERATIONS_TIME_ZONE) {
  const utcGuess = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, 0);
  const firstOffset = getTimeZoneOffsetMs(new Date(utcGuess), timeZone);
  const firstUtc = utcGuess - firstOffset;
  const finalOffset = getTimeZoneOffsetMs(new Date(firstUtc), timeZone);
  return new Date(utcGuess - finalOffset);
}

export function parseOperationsDateTimeLocal(value: string | null | undefined) {
  const text = value?.trim();
  if (!text) return undefined;

  const match = dateTimeLocalPattern.exec(text);
  if (!match) return undefined;

  const [, year, month, day, hour, minute] = match;
  const date = zonedTimeToUtc({
    day: Number(day),
    hour: Number(hour),
    minute: Number(minute),
    month: Number(month),
    year: Number(year),
  });

  return Number.isNaN(date.getTime()) ? undefined : date;
}

export function formatOperationsDate(value: Date | string | null | undefined) {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeZone: FLOWVIA_OPERATIONS_TIME_ZONE,
  }).format(new Date(value));
}

export function formatOperationsDateTime(value: Date | string | null | undefined) {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: FLOWVIA_OPERATIONS_TIME_ZONE,
  }).format(new Date(value));
}

export function formatOperationsDateTimeLocalInput(value: Date | string | null | undefined) {
  if (!value) return "";
  const parts = getZonedParts(new Date(value));
  const pad = (item: number) => String(item).padStart(2, "0");
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}`;
}
