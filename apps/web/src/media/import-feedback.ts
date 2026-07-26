import { toast } from "sonner";
import type { ImportPreflightFileResult } from "@/media/import-preflight";

export interface MediaImportPreflightFeedback {
	showRejected: ({
		results,
	}: {
		results: readonly ImportPreflightFileResult<File>[];
	}) => void;
	confirmWarnings: ({
		results,
	}: {
		results: readonly ImportPreflightFileResult<File>[];
	}) => Promise<boolean>;
}

function summarizeResults({
	results,
}: {
	results: readonly ImportPreflightFileResult<File>[];
}): string {
	const visibleResults = results.slice(0, 3);
	const summary = visibleResults
		.map((result) => {
			const reason = result.reasons.find(
				(candidate) => candidate.severity !== "info",
			);
			return `${result.file.name}：${reason?.message ?? "未通过素材导入预检。"}`;
		})
		.join("；");
	const hiddenCount = results.length - visibleResults.length;

	return hiddenCount > 0 ? `${summary}；另有 ${hiddenCount} 个文件。` : summary;
}

function showRejected({
	results,
}: {
	results: readonly ImportPreflightFileResult<File>[];
}): void {
	if (results.length === 0) return;

	toast.error(`${results.length} 个素材未通过导入预检`, {
		description: summarizeResults({ results }),
		duration: 8000,
	});
}

function confirmWarnings({
	results,
}: {
	results: readonly ImportPreflightFileResult<File>[];
}): Promise<boolean> {
	if (results.length === 0) return Promise.resolve(true);

	return new Promise((resolve) => {
		let isSettled = false;

		const settle = ({ confirmed }: { confirmed: boolean }) => {
			if (isSettled) return;
			isSettled = true;
			resolve(confirmed);
		};

		toast.warning(`${results.length} 个素材需要确认`, {
			description: summarizeResults({ results }),
			duration: Infinity,
			closeButton: true,
			action: {
				label: "仍然导入",
				onClick: () => settle({ confirmed: true }),
			},
			cancel: {
				label: "跳过这些",
				onClick: () => settle({ confirmed: false }),
			},
			onDismiss: () => settle({ confirmed: false }),
		});
	});
}

export const browserMediaImportPreflightFeedback: MediaImportPreflightFeedback =
	Object.freeze({
		showRejected,
		confirmWarnings,
	});
