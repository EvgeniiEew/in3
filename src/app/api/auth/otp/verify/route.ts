import { NextResponse } from "next/server";

// SMS confirmation was removed. Kept as a stub so old clients get a clear
// error instead of a silent 404. Use POST /api/auth/identify instead.
export async function POST() {
  return NextResponse.json(
    { error: "SMS-подтверждение отключено, используйте /api/auth/identify" },
    { status: 410 }
  );
}
