import { NextResponse } from "next/server";
import { enqueueJob, runDueJobs } from "@/server/jobs";

/** Appelé par Vercel Cron (en-tête Authorization: Bearer CRON_SECRET). */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const hour = new Date().toISOString().slice(0, 13);
  await enqueueJob("auth.purge", `auth.purge:${hour}`);
  const result = await runDueJobs();
  return NextResponse.json(result);
}
