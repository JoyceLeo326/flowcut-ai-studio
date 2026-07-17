import { NextResponse } from "next/server";

export async function POST() {
	return NextResponse.json(
		{
			error: "Feedback storage is not enabled in this local-first deployment.",
		},
		{ status: 503 },
	);
}
