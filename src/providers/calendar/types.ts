declare const CalendarIdBrand: unique symbol;
declare const EventIdBrand: unique symbol;
declare const UserIdBrand: unique symbol;

export type CalendarId = string & { readonly [CalendarIdBrand]: typeof CalendarIdBrand };
export type EventId = string & { readonly [EventIdBrand]: typeof EventIdBrand };
export type UserId = string & { readonly [UserIdBrand]: typeof UserIdBrand };

export function toCalendarId(id: string): CalendarId {
  return id as CalendarId;
}

export function toEventId(id: string): EventId {
  return id as EventId;
}

export function toUserId(id: string): UserId {
  return id as UserId;
}

export const ProviderId = {
  GOOGLE: "google",
  OUTLOOK: "outlook",
  APPLE: "apple",
} as const;

export type ProviderId = (typeof ProviderId)[keyof typeof ProviderId];

export const AccessRole = {
  OWNER: "owner",
  WRITER: "writer",
  READER: "reader",
  FREE_BUSY_READER: "freeBusyReader",
} as const;

export type AccessRole = (typeof AccessRole)[keyof typeof AccessRole];

export const ResponseStatus = {
  NEEDS_ACTION: "needsAction",
  DECLINED: "declined",
  TENTATIVE: "tentative",
  ACCEPTED: "accepted",
} as const;

export type ResponseStatus = (typeof ResponseStatus)[keyof typeof ResponseStatus];

export const EventStatus = {
  CONFIRMED: "confirmed",
  TENTATIVE: "tentative",
  CANCELLED: "cancelled",
} as const;

export type EventStatus = (typeof EventStatus)[keyof typeof EventStatus];

export const Visibility = {
  DEFAULT: "default",
  PUBLIC: "public",
  PRIVATE: "private",
  CONFIDENTIAL: "confidential",
} as const;

export type Visibility = (typeof Visibility)[keyof typeof Visibility];

export const EventOrderBy = {
  START_TIME: "startTime",
  UPDATED: "updated",
} as const;

export type EventOrderBy = (typeof EventOrderBy)[keyof typeof EventOrderBy];

export const SendUpdates = {
  ALL: "all",
  EXTERNAL_ONLY: "externalOnly",
  NONE: "none",
} as const;

export type SendUpdates = (typeof SendUpdates)[keyof typeof SendUpdates];

export const ReminderMethod = {
  EMAIL: "email",
  POPUP: "popup",
  SMS: "sms",
} as const;

export type ReminderMethod = (typeof ReminderMethod)[keyof typeof ReminderMethod];

export interface EventReminder {
  method: ReminderMethod;
  minutes: number;
}

export const RecurrenceFrequency = {
  DAILY: "daily",
  WEEKLY: "weekly",
  MONTHLY: "monthly",
  YEARLY: "yearly",
} as const;

export type RecurrenceFrequency =
  (typeof RecurrenceFrequency)[keyof typeof RecurrenceFrequency];

export const Weekday = {
  MONDAY: "MO",
  TUESDAY: "TU",
  WEDNESDAY: "WE",
  THURSDAY: "TH",
  FRIDAY: "FR",
  SATURDAY: "SA",
  SUNDAY: "SU",
} as const;

export type Weekday = (typeof Weekday)[keyof typeof Weekday];

export type RecurrenceEnd =
  | { type: "count"; count: number }
  | { type: "until"; until: string }
  | { type: "forever" };

export interface RecurrenceRule {
  frequency: RecurrenceFrequency;
  interval?: number;
  end?: RecurrenceEnd;
  byDay?: Weekday[];
  byMonthDay?: number[];
  byMonth?: number[];
}

export interface Calendar {
  id: CalendarId;
  name: string;
  description?: string;
  color?: string;
  primary: boolean;
  accessRole: AccessRole;
  timeZone?: string;
}

export type TimedEventDateTime = {
  kind: "timed";
  dateTime: string;
  timeZone?: string;
};

export type AllDayEventDateTime = {
  kind: "allDay";
  date: string;
};

export type EventDateTime = TimedEventDateTime | AllDayEventDateTime;

export type DefaultReminders = { type: "default" };
export type CustomReminders = { type: "custom"; overrides: EventReminder[] };
export type EventReminders = DefaultReminders | CustomReminders;

export interface EventAttendee {
  email: string;
  displayName?: string;
  responseStatus?: ResponseStatus;
  optional?: boolean;
  organizer?: boolean;
  self?: boolean;
}

export interface CalendarEvent {
  id: EventId;
  calendarId: CalendarId;
  summary: string;
  description?: string;
  location?: string;
  start: EventDateTime;
  end: EventDateTime;
  status: EventStatus;
  attendees?: EventAttendee[];
  organizer?: {
    email: string;
    displayName?: string;
    self?: boolean;
  };
  reminders?: EventReminders;
  recurrence?: string[];
  created?: string;
  updated?: string;
  htmlLink?: string;
  recurringEventId?: EventId;
  visibility?: Visibility;
}

export interface ListEventsParams {
  calendarId: CalendarId | string;
  timeMin?: Date;
  timeMax?: Date;
  maxResults?: number;
  query?: string;
  singleEvents?: boolean;
  orderBy?: EventOrderBy;
}

export interface CreateEventParams {
  summary: string;
  description?: string;
  location?: string;
  start: EventDateTime;
  end: EventDateTime;
  attendees?: Pick<EventAttendee, "email" | "displayName" | "optional">[];
  visibility?: Visibility;
  sendUpdates?: SendUpdates;
  reminders?: EventReminders;
  recurrence?: RecurrenceRule;
}

export interface UpdateEventParams {
  summary?: string;
  description?: string;
  location?: string;
  start?: EventDateTime;
  end?: EventDateTime;
  attendees?: Pick<EventAttendee, "email" | "displayName" | "optional">[];
  visibility?: Visibility;
  sendUpdates?: SendUpdates;
  reminders?: EventReminders;
  recurrence?: RecurrenceRule;
}
