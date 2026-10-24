import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer } from "@/lib/db/server";

/** Powrót z linku logowania: wymiana kodu na sesję. */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");

  if (code) {
    const supabase = await supabaseServer();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}/`);
    // Link z maila otworzył się w Safari, a prośba wyszła z aplikacji na ekranie głównym (osobne ciasteczka)
    if (error.code === "pkce_code_verifier_not_found") return NextResponse.redirect(`${origin}/login?error=browser`);
  }
  return NextResponse.redirect(`${origin}/login?error=link`);
}
