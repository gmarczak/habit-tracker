/** Wspólne, po polsku: błędy logowania i hasła, których Supabase nie tłumaczy. */
export function authMessage(error: { status?: number; message: string; code?: string; name?: string }): string {
  if (error.status === 0 || error.name === "AuthRetryableFetchError") return "Brak połączenia z serwerem — sprawdź internet i spróbuj ponownie.";
  if (error.name === "AuthSessionMissingError") return "Sesja wygasła — zaloguj się ponownie.";
  if (error.status === 429) return "Za dużo prób w krótkim czasie. Odczekaj kilka minut i spróbuj ponownie.";
  if (error.code === "email_address_invalid") return "Nieprawidłowy adres e-mail.";
  if (error.code === "signup_disabled") return "Zakładanie kont jest wyłączone.";
  return "Nie udało się — spróbuj ponownie.";
}
