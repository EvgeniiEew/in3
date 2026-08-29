// Belarusian mobile numbers only: "+375" followed by exactly 9 digits — 12
// digits total (375 + 9), e.g. +375291234567. This is the only phone format
// the app accepts anywhere a phone number is entered (client registration,
// anonymous booking, admin-created walk-ins, waitlist entries, master
// accounts).
const BY_PHONE_REGEX = /^\+375\d{9}$/;

/**
 * Strips spaces, dashes and parentheses so "+375 29 123-45-67" and
 * "+375291234567" are treated as — and stored as — the same number.
 * Always normalize before storing or looking up a phone, so formatting
 * differences never create duplicate accounts or failed logins.
 */
export function normalizePhone(raw: string): string {
  return raw.trim().replace(/[\s\-()]/g, "");
}

export function isValidBelarusPhone(raw: string): boolean {
  return BY_PHONE_REGEX.test(normalizePhone(raw));
}

export const PHONE_FORMAT_ERROR = "Введите номер в формате +375XXXXXXXXX (код страны +375 и 9 цифр)";
