"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";
import { getSortedReleases } from "../utils";
import type { Release } from "../utils";

const STORAGE_KEY = "last-seen-version";

function subscribeToClientState() {
	return () => undefined;
}

function getClientSnapshot() {
	return true;
}

function getServerSnapshot() {
	return false;
}

function getUnreadRelease(): Release | null {
	const latest = getSortedReleases()[0];
	if (!latest) return null;

	let storedVersion: string | null = null;
	try {
		storedVersion = localStorage.getItem(STORAGE_KEY);
	} catch {
		// localStorage unavailable
	}

	const isOutdated =
		storedVersion === null ||
		storedVersion.localeCompare(latest.version, undefined, {
			numeric: true,
		}) < 0;

	return isOutdated ? latest : null;
}

export function ChangelogNotification() {
	const isClient = useSyncExternalStore(
		subscribeToClientState,
		getClientSnapshot,
		getServerSnapshot,
	);
	const release = useMemo(
		() => (isClient ? getUnreadRelease() : null),
		[isClient],
	);
	const [dismissedVersion, setDismissedVersion] = useState<string | null>(null);

	useEffect(() => {
		// TODO(v0.4): revert to the standard "null = first-time visitor, record silently"
		// path. The null case intentionally shows the card for this release so existing
		// users who never had the key get the 0.3.0 announcement.
		if (!release) return;

		try {
			localStorage.setItem(STORAGE_KEY, release.version);
		} catch {
			// ignore
		}
	}, [release]);

	if (!release || dismissedVersion === release.version) return null;

	return (
		<div className="fixed bottom-5 left-5 z-50 flex w-72 flex-col gap-3 rounded-xl border bg-card p-4 shadow-lg">
			<div className="flex items-start justify-between gap-2">
				<div className="flex flex-col gap-1">
					<span className="text-sm font-semibold leading-snug">
						{release.title}
					</span>
					<span className="text-xs text-muted-foreground">
						v{release.version}
					</span>
				</div>
				<Button
					variant="ghost"
					size="icon"
					className="-mr-1 -mt-1 shrink-0"
					onClick={() => setDismissedVersion(release.version)}
					aria-label="Dismiss"
				>
					<HugeiconsIcon icon={Cancel01Icon} className="size-4" />
				</Button>
			</div>

			{release.summary && (
				<p className="text-xs leading-relaxed text-muted-foreground">
					{release.summary}
				</p>
			)}

			<div className="flex justify-end">
				<Button asChild size="sm">
					<Link
						href="/changelog"
						onClick={() => setDismissedVersion(release.version)}
					>
						See full changelog
					</Link>
				</Button>
			</div>
		</div>
	);
}
