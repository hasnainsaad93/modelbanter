import { NextResponse } from "next/server";
export function apiOk<T>(data: T, init?: ResponseInit) { return NextResponse.json({ data, error: null }, init); }
export function apiError(code: string, message: string, status = 400) { return NextResponse.json({ data: null, error: { code, message } }, { status }); }

