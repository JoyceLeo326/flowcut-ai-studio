import {
	preflightMediaFiles,
	prepareFileForImport,
	type ImportPreflightBatchResult,
	type ImportPreflightOptions,
} from "@/media/import-preflight";
import {
	browserMediaImportPreflightFeedback,
	type MediaImportPreflightFeedback,
} from "@/media/import-feedback";

export interface PreparedMediaImport {
	readonly files: readonly File[];
	readonly preflight: ImportPreflightBatchResult<File>;
	readonly rejectedCount: number;
	readonly confirmationDeclinedCount: number;
}

const issuedImports = new WeakSet<PreparedMediaImport>();

export async function prepareMediaImport({
	files,
	preflightOptions,
	feedback = browserMediaImportPreflightFeedback,
}: {
	files: FileList | readonly File[];
	preflightOptions?: ImportPreflightOptions;
	feedback?: MediaImportPreflightFeedback;
}): Promise<PreparedMediaImport> {
	const selectedFiles = Array.from(files);
	const preflight = await preflightMediaFiles({
		files: selectedFiles,
		options: preflightOptions,
	});
	const rejectedResults = preflight.files.filter(
		(result) => result.status === "rejected",
	);
	const warningResults = preflight.files.filter(
		(result) => result.status === "needs-confirmation",
	);

	feedback.showRejected({ results: rejectedResults });
	const warningsConfirmed =
		warningResults.length === 0 ||
		(await feedback.confirmWarnings({ results: warningResults }));

	const preparedFiles = preflight.files
		.filter(
			(result) =>
				result.status === "accepted" ||
				(result.status === "needs-confirmation" && warningsConfirmed),
		)
		.map((result) => prepareFileForImport({ result }));
	const preparedImport = Object.freeze({
		files: Object.freeze(preparedFiles),
		preflight,
		rejectedCount: rejectedResults.length,
		confirmationDeclinedCount: warningsConfirmed ? 0 : warningResults.length,
	});

	issuedImports.add(preparedImport);
	return preparedImport;
}

export function claimPreparedMediaImport({
	preparedImport,
}: {
	preparedImport: PreparedMediaImport;
}): readonly File[] {
	if (!issuedImports.delete(preparedImport)) {
		throw new Error(
			"Media import is not preflighted or has already been processed.",
		);
	}

	return preparedImport.files;
}
