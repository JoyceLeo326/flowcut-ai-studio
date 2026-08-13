import { NextResponse } from "next/server";
import { localSoundBySlug } from "@/sounds/local-sound-library";
import { createLocalSoundWav } from "@/sounds/local-wav";

export const dynamic = "force-static";

export function generateStaticParams() {
	return [
		"soft-ui-click",
		"clean-whoosh",
		"cinematic-impact",
		"camera-marker",
		"focus-bed",
		"forward-motion",
		"night-documentary",
		"launch-pulse",
	].map((slug) => ({ slug }));
}

// Next.js route handlers require this positional context signature.
// eslint-disable-next-line opencut/prefer-object-params
export async function GET(
	_request: Request,
	{ params }: { params: Promise<{ slug: string }> },
) {
	const { slug } = await params;
	const sound = localSoundBySlug(slug);
	if (!sound)
		return NextResponse.json({ error: "Sound not found" }, { status: 404 });
	return new NextResponse(
		new Blob([createLocalSoundWav(sound)], { type: "audio/wav" }),
		{
			headers: {
				"Cache-Control": "public, max-age=31536000, immutable",
				"Content-Disposition": `inline; filename="${sound.slug}.wav"`,
				"Content-Type": "audio/wav",
			},
		},
	);
}
