import { NextResponse } from "next/server";

const disabledResponse = () =>
	NextResponse.json(
		{
			error: "Authentication is not enabled in this local-first deployment.",
		},
		{ status: 503 },
	);

export const GET = disabledResponse;
export const POST = disabledResponse;
