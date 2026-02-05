export { CalendarProvider } from "./base.js";
export { GoogleCalendarProvider } from "./google.js";
export { OutlookCalendarProvider } from "./outlook.js";
export * from "./types.js";

import { CalendarProvider } from "./base.js";
import { GoogleCalendarProvider } from "./google.js";
import { OutlookCalendarProvider } from "./outlook.js";
import { ProviderId, type ProviderId as ProviderIdType } from "./types.js";

const providerMap: Partial<Record<
  ProviderIdType,
  new (userId: string) => CalendarProvider
>> = {
  [ProviderId.GOOGLE]: GoogleCalendarProvider,
  [ProviderId.OUTLOOK]: OutlookCalendarProvider,
};

export class UnsupportedProviderError extends Error {
  constructor(providerId: string) {
    super(`Calendar provider '${providerId}' is not supported yet`);
    this.name = "UnsupportedProviderError";
  }
}

export function getCalendarProvider(
  userId: string,
  providerId: ProviderIdType,
): CalendarProvider {
  const ProviderClass = providerMap[providerId];

  if (!ProviderClass) {
    if (providerId === ProviderId.APPLE) {
      throw new UnsupportedProviderError("apple");
    }
    throw new UnsupportedProviderError(providerId);
  }

  return new ProviderClass(userId);
}
