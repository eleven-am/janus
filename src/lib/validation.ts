import { z } from "zod";
import {
  ProviderId,
  Visibility,
  SendUpdates,
  ReminderMethod,
  RecurrenceFrequency,
  Weekday,
  type EventDateTime,
  type EventReminders,
  type RecurrenceRule,
  type CreateEventParams,
  type UpdateEventParams,
} from "@/providers/calendar/types.js";

const providerIdValues = Object.values(ProviderId) as [string, ...string[]];

export function validateProviderId(value: unknown): ProviderId | null {
  if (typeof value !== "string") return null;
  const normalized = value.toLowerCase();
  if (providerIdValues.includes(normalized)) {
    return normalized as ProviderId;
  }
  return null;
}

export function validateDate(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const date = new Date(value);
  if (isNaN(date.getTime())) return null;
  return date;
}

export function validatePositiveInt(value: unknown): number | null {
  if (typeof value === "string") {
    const parsed = parseInt(value, 10);
    if (isNaN(parsed) || parsed <= 0) return null;
    return parsed;
  }
  if (typeof value === "number") {
    if (!Number.isInteger(value) || value <= 0) return null;
    return value;
  }
  return null;
}

export const providerIdSchema = z.enum(providerIdValues).default(ProviderId.GOOGLE);

export const dateTimeSchema = z.object({
  dateTime: z.string().optional(),
  date: z.string().optional(),
  timeZone: z.string().optional(),
}).refine(
  (data) => data.dateTime !== undefined || data.date !== undefined,
  { message: "Either dateTime or date must be provided" }
);

const reminderOverrideSchema = z.object({
  method: z.enum([ReminderMethod.EMAIL, ReminderMethod.POPUP, ReminderMethod.SMS]),
  minutes: z.number().int().min(0),
});

export const remindersSchema = z.object({
  useDefault: z.boolean(),
  overrides: z.array(reminderOverrideSchema).optional(),
});

const recurrenceRuleSchema = z.object({
  frequency: z.enum([
    RecurrenceFrequency.DAILY,
    RecurrenceFrequency.WEEKLY,
    RecurrenceFrequency.MONTHLY,
    RecurrenceFrequency.YEARLY,
  ]),
  interval: z.number().int().min(1).optional(),
  count: z.number().int().min(1).optional(),
  until: z.string().optional(),
  byDay: z.array(z.enum([
    Weekday.MONDAY,
    Weekday.TUESDAY,
    Weekday.WEDNESDAY,
    Weekday.THURSDAY,
    Weekday.FRIDAY,
    Weekday.SATURDAY,
    Weekday.SUNDAY,
  ])).optional(),
  byMonthDay: z.array(z.number().int().min(1).max(31)).optional(),
  byMonth: z.array(z.number().int().min(1).max(12)).optional(),
}).refine(
  (data) => !(data.count !== undefined && data.until !== undefined),
  { message: "Cannot specify both count and until" }
);

const attendeeSchema = z.object({
  email: z.string().email(),
  displayName: z.string().optional(),
  optional: z.boolean().optional(),
});

export const createEventSchema = z.object({
  summary: z.string().min(1),
  description: z.string().optional(),
  location: z.string().optional(),
  start: dateTimeSchema,
  end: dateTimeSchema,
  attendees: z.array(attendeeSchema).optional(),
  visibility: z.enum([
    Visibility.DEFAULT,
    Visibility.PUBLIC,
    Visibility.PRIVATE,
    Visibility.CONFIDENTIAL,
  ]).optional(),
  sendUpdates: z.enum([
    SendUpdates.ALL,
    SendUpdates.EXTERNAL_ONLY,
    SendUpdates.NONE,
  ]).optional(),
  reminders: remindersSchema.optional(),
  recurrence: recurrenceRuleSchema.optional(),
});

export const updateEventSchema = z.object({
  summary: z.string().min(1).optional(),
  description: z.string().optional(),
  location: z.string().optional(),
  start: dateTimeSchema.optional(),
  end: dateTimeSchema.optional(),
  attendees: z.array(attendeeSchema).optional(),
  visibility: z.enum([
    Visibility.DEFAULT,
    Visibility.PUBLIC,
    Visibility.PRIVATE,
    Visibility.CONFIDENTIAL,
  ]).optional(),
  sendUpdates: z.enum([
    SendUpdates.ALL,
    SendUpdates.EXTERNAL_ONLY,
    SendUpdates.NONE,
  ]).optional(),
  reminders: remindersSchema.optional(),
  recurrence: recurrenceRuleSchema.optional(),
});

export const listEventsQuerySchema = z.object({
  provider: providerIdSchema.optional(),
  timeMin: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: "Invalid date format for timeMin",
  }).optional(),
  timeMax: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: "Invalid date format for timeMax",
  }).optional(),
  maxResults: z.coerce.number().int().min(1).max(2500).optional(),
  q: z.string().optional(),
  singleEvents: z.enum(["true", "false"]).transform((val) => val === "true").optional(),
  orderBy: z.enum(["startTime", "updated"]).optional(),
});

export type CreateEventInput = z.infer<typeof createEventSchema>;
export type UpdateEventInput = z.infer<typeof updateEventSchema>;
export type ListEventsQuery = z.infer<typeof listEventsQuerySchema>;

export interface ValidationError {
  field: string;
  message: string;
}

export function formatZodErrors(error: z.ZodError<unknown>): ValidationError[] {
  return error.issues.map((issue) => ({
    field: issue.path.join("."),
    message: issue.message,
  }));
}

type ZodDateTime = { dateTime?: string; date?: string; timeZone?: string };
type ZodReminders = { useDefault: boolean; overrides?: Array<{ method: string; minutes: number }> };
type ZodRecurrence = {
  frequency: string;
  interval?: number;
  count?: number;
  until?: string;
  byDay?: string[];
  byMonthDay?: number[];
  byMonth?: number[];
};

function toEventDateTime(dt: ZodDateTime): EventDateTime {
  if (dt.dateTime) {
    return { kind: "timed", dateTime: dt.dateTime, timeZone: dt.timeZone };
  }
  return { kind: "allDay", date: dt.date! };
}

function toEventReminders(reminders: ZodReminders): EventReminders {
  if (reminders.useDefault) {
    return { type: "default" };
  }
  return {
    type: "custom",
    overrides: reminders.overrides?.map((r) => ({
      method: r.method as ReminderMethod,
      minutes: r.minutes,
    })) ?? [],
  };
}

function toRecurrenceRule(recurrence: ZodRecurrence): RecurrenceRule {
  return {
    frequency: recurrence.frequency as RecurrenceFrequency,
    interval: recurrence.interval,
    end: recurrence.count
      ? { type: "count", count: recurrence.count }
      : recurrence.until
      ? { type: "until", until: recurrence.until }
      : { type: "forever" },
    byDay: recurrence.byDay as Weekday[] | undefined,
    byMonthDay: recurrence.byMonthDay,
    byMonth: recurrence.byMonth,
  };
}

export function toCreateEventParams(input: CreateEventInput): CreateEventParams {
  return {
    summary: input.summary,
    description: input.description,
    location: input.location,
    start: toEventDateTime(input.start),
    end: toEventDateTime(input.end),
    attendees: input.attendees,
    visibility: input.visibility,
    sendUpdates: input.sendUpdates,
    reminders: input.reminders ? toEventReminders(input.reminders) : undefined,
    recurrence: input.recurrence ? toRecurrenceRule(input.recurrence) : undefined,
  };
}

export function toUpdateEventParams(input: UpdateEventInput): UpdateEventParams {
  return {
    summary: input.summary,
    description: input.description,
    location: input.location,
    start: input.start ? toEventDateTime(input.start) : undefined,
    end: input.end ? toEventDateTime(input.end) : undefined,
    attendees: input.attendees,
    visibility: input.visibility,
    sendUpdates: input.sendUpdates,
    reminders: input.reminders ? toEventReminders(input.reminders) : undefined,
    recurrence: input.recurrence ? toRecurrenceRule(input.recurrence) : undefined,
  };
}
