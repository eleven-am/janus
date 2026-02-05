import type {
  Calendar,
  CalendarEvent,
  ListEventsParams,
  CreateEventParams,
  UpdateEventParams,
} from "./types.js";

export abstract class CalendarProvider {
  abstract readonly providerId: string;

  abstract listCalendars(): Promise<Calendar[]>;

  abstract getCalendar(calendarId: string): Promise<Calendar>;

  abstract listEvents(params: ListEventsParams): Promise<CalendarEvent[]>;

  abstract getEvent(
    calendarId: string,
    eventId: string,
  ): Promise<CalendarEvent>;

  abstract createEvent(
    calendarId: string,
    event: CreateEventParams,
  ): Promise<CalendarEvent>;

  abstract updateEvent(
    calendarId: string,
    eventId: string,
    event: UpdateEventParams,
  ): Promise<CalendarEvent>;

  abstract deleteEvent(calendarId: string, eventId: string): Promise<void>;
}
