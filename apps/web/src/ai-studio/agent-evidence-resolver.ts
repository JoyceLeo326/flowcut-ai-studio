import {
	type AgentEvidenceKind,
	type AgentEvidenceOrigin,
	type AgentRole,
} from "./agent-orchestrator";
import { assertMediaIndexInvariants, type MediaIndex } from "./media-index";
import {
	parseTimelineTranscriptArtifact,
	type TimelineTranscriptArtifact,
} from "./transcript-artifact";
import {
	fingerprintJson,
	stableJson,
	type Sha256Fingerprint,
} from "./chatcut-fingerprint";

export const AGENT_EVIDENCE_PACKAGE_KIND =
	"visioncut.agent-evidence-package" as const;
export const AGENT_EVIDENCE_PACKAGE_SCHEMA_VERSION = 1 as const;
export const AGENT_EVIDENCE_RESOLVER_VERSION =
	"visioncut.agent-evidence-resolver/1.0.0" as const;
export const DEFAULT_AGENT_EVIDENCE_MAX_CHARACTERS = 8_000;
export const MIN_AGENT_EVIDENCE_MAX_CHARACTERS = 1_024;
export const MAX_AGENT_EVIDENCE_MAX_CHARACTERS = 12_000;

const MAX_EVIDENCE_REFERENCES = 128;
const MAX_MEDIA_INDEXES = 64;
const MAX_RECORDS_PER_EVIDENCE = 256;
const TRUNCATION_MARKER = "[additional records omitted by evidence budget]";

const AGENT_EVIDENCE_KINDS = [
	"intent-spec",
	"publication-target",
	"asset-metadata",
	"audio-metadata",
	"scene-analysis",
	"transcript",
	"visual-analysis",
	"audio-analysis",
	"audience-brief",
	"brand-guideline",
	"style-reference",
	"performance-data",
	"human-note",
] as const satisfies readonly AgentEvidenceKind[];

const AGENT_ROLES = [
	"director",
	"story",
	"camera",
	"editor",
	"color",
	"sound",
	"growth",
] as const satisfies readonly AgentRole[];

const ROLE_EVIDENCE_KINDS = {
	director: new Set<AgentEvidenceKind>(AGENT_EVIDENCE_KINDS),
	story: new Set<AgentEvidenceKind>([
		"intent-spec",
		"asset-metadata",
		"scene-analysis",
		"transcript",
		"human-note",
		"brand-guideline",
	]),
	camera: new Set<AgentEvidenceKind>([
		"intent-spec",
		"publication-target",
		"asset-metadata",
		"scene-analysis",
		"visual-analysis",
		"brand-guideline",
		"style-reference",
		"human-note",
	]),
	editor: new Set<AgentEvidenceKind>([
		"intent-spec",
		"asset-metadata",
		"scene-analysis",
		"transcript",
		"human-note",
	]),
	color: new Set<AgentEvidenceKind>([
		"intent-spec",
		"asset-metadata",
		"visual-analysis",
		"brand-guideline",
		"style-reference",
		"human-note",
	]),
	sound: new Set<AgentEvidenceKind>([
		"intent-spec",
		"audio-metadata",
		"audio-analysis",
		"transcript",
		"human-note",
	]),
	growth: new Set<AgentEvidenceKind>([
		"intent-spec",
		"publication-target",
		"audience-brief",
		"brand-guideline",
		"performance-data",
		"human-note",
	]),
} as const satisfies Record<AgentRole, ReadonlySet<AgentEvidenceKind>>;

const ROLE_LIMITATIONS = {
	director:
		"Director evidence contains no semantic media understanding beyond supplied transcript segments and numeric MediaIndex signals.",
	story:
		"Story evidence does not establish speakers, people, emotion, objects, or off-screen context.",
	camera:
		"Camera evidence contains frame-change and luminance measurements only; it does not establish composition, camera movement, people, or objects.",
	editor:
		"Editor evidence contains candidates and observations, not approved cuts or proof that an edit should be applied.",
	color:
		"Color evidence contains luminance samples only; it does not establish palette, skin tone, exposure correctness, or grading intent.",
	sound:
		"Sound energy candidates do not prove speech, speaker identity, dialogue quality, music fit, or perceived loudness.",
	growth:
		"Growth evidence cannot predict retention, reach, virality, or audience response without cited performance data.",
} as const satisfies Record<AgentRole, string>;

const GUARANTEES = Object.freeze({
	deterministic: true,
	network: false,
	rawMediaIncluded: false,
	semanticRecognitionPerformed: false,
	executionAuthority: false,
} as const);

const BASE_LIMITATIONS = [
	"Only supplied orchestrator references and resolved local evidence sources are included.",
	"MediaIndex contributes timestamps, frame difference, mean luminance, audio RMS, audio peak, and deterministic energy-based candidates only.",
	"MediaIndex does not perform ASR, person recognition, speaker identification, emotion recognition, object recognition, or semantic scene understanding.",
	"Transcript evidence is segment-level only; word timestamps, speaker identity, person identity, emotion, and language verification are unavailable.",
	"This package is evidence for a reviewable proposal and cannot bypass runtime evidence rules, human approval, or the edit executor.",
] as const;

const SENSITIVE_VALUE_PATTERNS = [
	/\bBearer\s+[A-Za-z0-9._~+/=-]{8,}\b/giu,
	/\bsk-(?:ant-)?[A-Za-z0-9_-]{8,}\b/gu,
	/\bAIza[A-Za-z0-9_-]{12,}\b/gu,
	/\b(?:api[-_ ]?key|access[-_ ]?token|password|secret)\s*[:=]\s*["']?[^"',\s}]{8,}/giu,
] as const;

export interface AgentEvidenceReference {
	readonly evidenceId: string;
	readonly kind: AgentEvidenceKind;
	readonly label: string;
	readonly referenceId: string;
	readonly origin: AgentEvidenceOrigin;
}

export interface AgentEvidenceResolverSources {
	readonly mediaIndexes?: readonly MediaIndex[];
	readonly transcriptArtifact?: TimelineTranscriptArtifact | null;
	readonly maxCharacters?: number;
}

export type AgentEvidenceSourceKind =
	| "media-index"
	| "transcript-artifact"
	| "orchestrator-reference";

export interface AgentEvidencePackageProvenance {
	readonly evidenceId: string;
	readonly evidenceKind: AgentEvidenceKind;
	readonly referenceId: string;
	readonly origin: AgentEvidenceOrigin;
	readonly sourceKind: AgentEvidenceSourceKind;
	readonly sourceId: string;
	readonly sourceVersion: string;
	readonly sourceFingerprint: Sha256Fingerprint;
}

export interface AgentEvidencePackageEntry {
	readonly evidenceId: string;
	readonly kind: AgentEvidenceKind;
	readonly referenceId: string;
	readonly text: string;
	readonly includedRecordCount: number;
	readonly omittedRecordCount: number;
	readonly provenance: AgentEvidencePackageProvenance;
	readonly limitations: readonly string[];
}

export interface AgentEvidencePackage {
	readonly kind: typeof AGENT_EVIDENCE_PACKAGE_KIND;
	readonly schemaVersion: typeof AGENT_EVIDENCE_PACKAGE_SCHEMA_VERSION;
	readonly resolverVersion: typeof AGENT_EVIDENCE_RESOLVER_VERSION;
	readonly role: AgentRole;
	readonly fingerprint: Sha256Fingerprint;
	readonly text: string;
	readonly entries: readonly AgentEvidencePackageEntry[];
	readonly provenance: readonly AgentEvidencePackageProvenance[];
	readonly limitations: readonly string[];
	readonly includedEvidenceIds: readonly string[];
	readonly omittedEvidenceIds: readonly string[];
	readonly budget: {
		readonly maxCharacters: number;
		readonly usedCharacters: number;
		readonly truncated: boolean;
		readonly omittedRecordCount: number;
	};
	readonly guarantees: typeof GUARANTEES;
}

interface EntryCandidate {
	readonly reference: AgentEvidenceReference;
	readonly headingLines: readonly string[];
	readonly recordLines: readonly string[];
	readonly sourceRecordCount: number;
	readonly provenance: AgentEvidencePackageProvenance;
	readonly limitations: readonly string[];
}

interface RenderedEntry {
	readonly entry: AgentEvidencePackageEntry;
	readonly text: string;
}

export class AgentEvidenceResolverValidationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "AgentEvidenceResolverValidationError";
	}
}

function codePointLength(value: string): number {
	return Array.from(value).length;
}

function normalizeText(value: string): string {
	let normalized = value.normalize("NFKC").trim().replace(/\s+/gu, " ");
	for (const pattern of SENSITIVE_VALUE_PATTERNS) {
		normalized = normalized.replace(pattern, "[REDACTED]");
	}
	return normalized;
}

function quoted(value: string): string {
	return JSON.stringify(normalizeText(value));
}

function formatNumber(value: number): string {
	return value.toFixed(6);
}

function formatSeconds(value: number): string {
	return `${value.toFixed(3)}s`;
}

function uniqueSorted(values: readonly string[]): string[] {
	return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function deepFreeze<T>(value: T): T {
	if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
		return value;
	}
	for (const key of Reflect.ownKeys(value)) {
		deepFreeze(Reflect.get(value, key));
	}
	return Object.freeze(value);
}

function assertReference(reference: AgentEvidenceReference): void {
	if (
		typeof reference.evidenceId !== "string" ||
		!/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/u.test(reference.evidenceId)
	) {
		throw new AgentEvidenceResolverValidationError(
			"Evidence references require canonical evidence ids.",
		);
	}
	if (!(AGENT_EVIDENCE_KINDS as readonly string[]).includes(reference.kind)) {
		throw new AgentEvidenceResolverValidationError(
			`Unsupported evidence kind ${String(reference.kind)}.`,
		);
	}
	if (
		typeof reference.referenceId !== "string" ||
		!/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/u.test(reference.referenceId)
	) {
		throw new AgentEvidenceResolverValidationError(
			"Evidence references require canonical source references.",
		);
	}
	if (
		typeof reference.label !== "string" ||
		normalizeText(reference.label).length === 0
	) {
		throw new AgentEvidenceResolverValidationError(
			"Evidence references require a non-empty label.",
		);
	}
}

function mediaIndexProvenance({
	reference,
	index,
}: {
	reference: AgentEvidenceReference;
	index: MediaIndex;
}): AgentEvidencePackageProvenance {
	return {
		evidenceId: reference.evidenceId,
		evidenceKind: reference.kind,
		referenceId: reference.referenceId,
		origin: reference.origin,
		sourceKind: "media-index",
		sourceId: index.mediaIndexId,
		sourceVersion: `${index.schemaVersion}:${index.algorithm.version}`,
		sourceFingerprint: fingerprintJson(index),
	};
}

function transcriptProvenance({
	reference,
	artifact,
}: {
	reference: AgentEvidenceReference;
	artifact: TimelineTranscriptArtifact;
}): AgentEvidencePackageProvenance {
	return {
		evidenceId: reference.evidenceId,
		evidenceKind: reference.kind,
		referenceId: reference.referenceId,
		origin: reference.origin,
		sourceKind: "transcript-artifact",
		sourceId: artifact.artifactId,
		sourceVersion: `${artifact.schemaVersion}:revision-${artifact.revision}`,
		sourceFingerprint: artifact.contentFingerprint,
	};
}

function referenceProvenance(
	reference: AgentEvidenceReference,
): AgentEvidencePackageProvenance {
	return {
		evidenceId: reference.evidenceId,
		evidenceKind: reference.kind,
		referenceId: reference.referenceId,
		origin: reference.origin,
		sourceKind: "orchestrator-reference",
		sourceId: reference.referenceId,
		sourceVersion: "reference-only",
		sourceFingerprint: fingerprintJson(reference),
	};
}

function metadataRecord(index: MediaIndex): string {
	const metadata = index.sourceSnapshot.metadata;
	const resolution =
		metadata.videoWidth === undefined || metadata.videoHeight === undefined
			? "unknown"
			: `${metadata.videoWidth}x${metadata.videoHeight}`;
	return [
		`[metadata asset=${quoted(index.assetId)}]`,
		`duration=${formatSeconds(metadata.durationSeconds)}`,
		`hasVideo=${String(metadata.hasVideo)}`,
		`hasAudio=${String(metadata.hasAudio)}`,
		`resolution=${resolution}`,
		`nominalFrameRate=${metadata.nominalFrameRate?.toFixed(3) ?? "unknown"}`,
		`captureMethod=${metadata.source.method}`,
		`sourceId=${quoted(metadata.source.sourceId)}`,
	].join(" ");
}

function frameRecord({
	index,
	sampleIndex,
}: {
	index: MediaIndex;
	sampleIndex: number;
}): string {
	const sample = index.sourceSnapshot.videoFrameSamples[sampleIndex];
	if (sample === undefined) {
		throw new AgentEvidenceResolverValidationError(
			"MediaIndex frame sample disappeared during resolution.",
		);
	}
	return [
		`[frame asset=${quoted(index.assetId)} at=${formatSeconds(sample.atSeconds)}]`,
		`differenceFromPrevious=${formatNumber(sample.differenceFromPrevious)}`,
		`meanLuminance=${formatNumber(sample.meanLuminance)}`,
		`captureMethod=${sample.source.method}`,
		`sourceId=${quoted(sample.source.sourceId)}`,
	].join(" ");
}

function boundaryRecord({
	index,
	boundaryIndex,
}: {
	index: MediaIndex;
	boundaryIndex: number;
}): string {
	const boundary = index.sceneBoundaries[boundaryIndex];
	if (boundary === undefined) {
		throw new AgentEvidenceResolverValidationError(
			"MediaIndex boundary disappeared during resolution.",
		);
	}
	return [
		`[frame-change-candidate asset=${quoted(index.assetId)} at=${formatSeconds(boundary.boundaryAtSeconds)}]`,
		`frameDifference=${formatNumber(boundary.basis.frameDifference)}`,
		`luminanceDelta=${formatNumber(boundary.basis.luminanceDelta)}`,
		`heuristicConfidence=${formatNumber(boundary.confidence.score)}`,
		`confidenceMeaning=${quoted(boundary.confidence.meaning)}`,
		`findingId=${boundary.findingId}`,
	].join(" ");
}

function audioWindowRecord({
	index,
	sampleIndex,
}: {
	index: MediaIndex;
	sampleIndex: number;
}): string {
	const sample = index.sourceSnapshot.audioWindowSamples[sampleIndex];
	if (sample === undefined) {
		throw new AgentEvidenceResolverValidationError(
			"MediaIndex audio sample disappeared during resolution.",
		);
	}
	return [
		`[audio-window asset=${quoted(index.assetId)} range=${formatSeconds(sample.startSeconds)}-${formatSeconds(sample.endSeconds)}]`,
		`rms=${formatNumber(sample.rms)}`,
		`peak=${formatNumber(sample.peak)}`,
		`captureMethod=${sample.source.method}`,
		`sourceId=${quoted(sample.source.sourceId)}`,
	].join(" ");
}

function audioCandidateRecord({
	index,
	candidateIndex,
}: {
	index: MediaIndex;
	candidateIndex: number;
}): string {
	const candidate = index.audioActivityCandidates[candidateIndex];
	if (candidate === undefined) {
		throw new AgentEvidenceResolverValidationError(
			"MediaIndex audio candidate disappeared during resolution.",
		);
	}
	return [
		`[energy-${candidate.candidateType}-candidate asset=${quoted(index.assetId)} range=${formatSeconds(candidate.timeRange.startSeconds)}-${formatSeconds(candidate.timeRange.endSeconds)}]`,
		`sampleCount=${candidate.basis.sampleCount}`,
		`meanRms=${formatNumber(candidate.basis.meanRms)}`,
		`maximumPeak=${formatNumber(candidate.basis.maximumPeak)}`,
		`heuristicConfidence=${formatNumber(candidate.confidence.score)}`,
		`interpretation=${quoted(candidate.basis.interpretation)}`,
		`findingId=${candidate.findingId}`,
	].join(" ");
}

function transcriptRecord({
	artifact,
	segmentIndex,
}: {
	artifact: TimelineTranscriptArtifact;
	segmentIndex: number;
}): string {
	const segment = artifact.segments[segmentIndex];
	if (segment === undefined) {
		throw new AgentEvidenceResolverValidationError(
			"Transcript segment disappeared during resolution.",
		);
	}
	return [
		`[transcript-segment id=${segment.id} range=${formatSeconds(segment.startSeconds)}-${formatSeconds(segment.endSeconds)}]`,
		`text=${quoted(segment.text)}`,
	].join(" ");
}

function limitedRecords({
	count,
	create,
}: {
	count: number;
	create: (index: number) => string;
}): string[] {
	const records: string[] = [];
	const limit = Math.min(count, MAX_RECORDS_PER_EVIDENCE);
	for (let index = 0; index < limit; index += 1) {
		records.push(create(index));
	}
	return records;
}

function unresolvedCandidate({
	reference,
	limitation,
}: {
	reference: AgentEvidenceReference;
	limitation: string;
}): EntryCandidate {
	return {
		reference,
		headingLines: [
			`## evidence=${reference.evidenceId}`,
			`kind=${reference.kind} referenceId=${reference.referenceId} origin=${reference.origin}`,
		],
		recordLines: [
			`[reference-only] label=${quoted(reference.label)} sourcePayload=unresolved`,
		],
		sourceRecordCount: 1,
		provenance: referenceProvenance(reference),
		limitations: [limitation],
	};
}

function mediaCandidate({
	reference,
	index,
}: {
	reference: AgentEvidenceReference;
	index: MediaIndex;
}): EntryCandidate {
	const headingLines = [
		`## evidence=${reference.evidenceId}`,
		`kind=${reference.kind} referenceId=${reference.referenceId} origin=${reference.origin}`,
		`source=MediaIndex sourceId=${index.mediaIndexId} assetId=${index.assetId} algorithm=${index.algorithm.version}`,
	];
	let sourceRecordCount = 0;
	let recordLines: string[] = [];
	const limitations: string[] = [];

	switch (reference.kind) {
		case "asset-metadata":
		case "audio-metadata":
			sourceRecordCount = 1;
			recordLines = [metadataRecord(index)];
			break;
		case "scene-analysis": {
			sourceRecordCount =
				index.sceneBoundaries.length +
				index.sourceSnapshot.videoFrameSamples.length;
			const boundaryLines = limitedRecords({
				count: index.sceneBoundaries.length,
				create: (boundaryIndex) => boundaryRecord({ index, boundaryIndex }),
			});
			const remaining = MAX_RECORDS_PER_EVIDENCE - boundaryLines.length;
			const frameCount = Math.min(
				index.sourceSnapshot.videoFrameSamples.length,
				remaining,
			);
			recordLines = [
				...boundaryLines,
				...limitedRecords({
					count: frameCount,
					create: (sampleIndex) => frameRecord({ index, sampleIndex }),
				}),
			];
			limitations.push(
				"Frame-change candidates are deterministic numeric heuristics, not semantic scene labels.",
			);
			break;
		}
		case "visual-analysis":
			sourceRecordCount = index.sourceSnapshot.videoFrameSamples.length;
			recordLines = limitedRecords({
				count: sourceRecordCount,
				create: (sampleIndex) => frameRecord({ index, sampleIndex }),
			});
			limitations.push(
				"Visual evidence contains frame difference and mean luminance only.",
			);
			break;
		case "audio-analysis": {
			sourceRecordCount =
				index.audioActivityCandidates.length +
				index.sourceSnapshot.audioWindowSamples.length;
			const candidateLines = limitedRecords({
				count: index.audioActivityCandidates.length,
				create: (candidateIndex) =>
					audioCandidateRecord({ index, candidateIndex }),
			});
			const remaining = MAX_RECORDS_PER_EVIDENCE - candidateLines.length;
			const windowCount = Math.min(
				index.sourceSnapshot.audioWindowSamples.length,
				remaining,
			);
			recordLines = [
				...candidateLines,
				...limitedRecords({
					count: windowCount,
					create: (sampleIndex) => audioWindowRecord({ index, sampleIndex }),
				}),
			];
			limitations.push(
				"Audio activity classifications are energy-based candidates only and do not prove speech.",
			);
			break;
		}
		default:
			return unresolvedCandidate({
				reference,
				limitation:
					"The resolved MediaIndex cannot provide payload records for this evidence kind.",
			});
	}

	return {
		reference,
		headingLines,
		recordLines,
		sourceRecordCount,
		provenance: mediaIndexProvenance({ reference, index }),
		limitations,
	};
}

function transcriptCandidate({
	reference,
	artifact,
}: {
	reference: AgentEvidenceReference;
	artifact: TimelineTranscriptArtifact;
}): EntryCandidate {
	const sourceRecordCount = artifact.segments.length;
	return {
		reference,
		headingLines: [
			`## evidence=${reference.evidenceId}`,
			`kind=${reference.kind} referenceId=${reference.referenceId} origin=${reference.origin}`,
			`source=TimelineTranscriptArtifact sourceId=${artifact.artifactId} revision=${artifact.revision} provenance=${artifact.provenance}`,
		],
		recordLines: limitedRecords({
			count: sourceRecordCount,
			create: (segmentIndex) => transcriptRecord({ artifact, segmentIndex }),
		}),
		sourceRecordCount,
		provenance: transcriptProvenance({ reference, artifact }),
		limitations: [artifact.limitations.statement],
	};
}

function renderCandidate({
	candidate,
	maxCharacters,
}: {
	candidate: EntryCandidate;
	maxCharacters: number;
}): RenderedEntry | null {
	const heading = candidate.headingLines.join("\n");
	if (codePointLength(heading) > maxCharacters) return null;

	const lines = [...candidate.headingLines];
	let usedCharacters = codePointLength(heading);
	let includedRecordCount = 0;
	for (const recordLine of candidate.recordLines) {
		const addition = `\n${recordLine}`;
		const additionLength = codePointLength(addition);
		if (usedCharacters + additionLength > maxCharacters) break;
		lines.push(recordLine);
		usedCharacters += additionLength;
		includedRecordCount += 1;
	}
	const omittedRecordCount = Math.max(
		0,
		candidate.sourceRecordCount - includedRecordCount,
	);
	if (omittedRecordCount > 0) {
		const marker = `${TRUNCATION_MARKER} count=${omittedRecordCount}`;
		const markerLength = codePointLength(`\n${marker}`);
		if (usedCharacters + markerLength <= maxCharacters) {
			lines.push(marker);
		}
	}
	const text = lines.join("\n");
	return {
		text,
		entry: {
			evidenceId: candidate.reference.evidenceId,
			kind: candidate.reference.kind,
			referenceId: candidate.reference.referenceId,
			text,
			includedRecordCount,
			omittedRecordCount,
			provenance: candidate.provenance,
			limitations: uniqueSorted(candidate.limitations),
		},
	};
}

function packageFingerprintPayload(
	evidencePackage: Omit<AgentEvidencePackage, "fingerprint">,
): Omit<AgentEvidencePackage, "fingerprint"> {
	return evidencePackage;
}

export function assertAgentEvidencePackageInvariants({
	evidencePackage,
	expectedRole,
	expectedEvidenceIds,
}: {
	evidencePackage: AgentEvidencePackage;
	expectedRole?: AgentRole;
	expectedEvidenceIds?: readonly string[];
}): void {
	if (
		evidencePackage.kind !== AGENT_EVIDENCE_PACKAGE_KIND ||
		evidencePackage.schemaVersion !== AGENT_EVIDENCE_PACKAGE_SCHEMA_VERSION ||
		evidencePackage.resolverVersion !== AGENT_EVIDENCE_RESOLVER_VERSION ||
		!(AGENT_ROLES as readonly string[]).includes(evidencePackage.role)
	) {
		throw new AgentEvidenceResolverValidationError(
			"Unsupported agent evidence package schema.",
		);
	}
	if (expectedRole !== undefined && evidencePackage.role !== expectedRole) {
		throw new AgentEvidenceResolverValidationError(
			"Agent evidence package role does not match its runtime role.",
		);
	}
	if (
		!Number.isSafeInteger(evidencePackage.budget.maxCharacters) ||
		evidencePackage.budget.maxCharacters < MIN_AGENT_EVIDENCE_MAX_CHARACTERS ||
		evidencePackage.budget.maxCharacters > MAX_AGENT_EVIDENCE_MAX_CHARACTERS ||
		evidencePackage.budget.usedCharacters !==
			codePointLength(evidencePackage.text) ||
		evidencePackage.budget.usedCharacters > evidencePackage.budget.maxCharacters
	) {
		throw new AgentEvidenceResolverValidationError(
			"Agent evidence package exceeds its declared text budget.",
		);
	}
	const includedEvidenceIds = evidencePackage.entries.map(
		(entry) => entry.evidenceId,
	);
	if (
		new Set(includedEvidenceIds).size !== includedEvidenceIds.length ||
		stableJson(includedEvidenceIds) !==
			stableJson(evidencePackage.includedEvidenceIds) ||
		evidencePackage.provenance.length !== evidencePackage.entries.length ||
		stableJson(evidencePackage.provenance) !==
			stableJson(evidencePackage.entries.map((entry) => entry.provenance)) ||
		evidencePackage.entries.some(
			(entry) =>
				!evidencePackage.text.includes(entry.text) ||
				entry.provenance.evidenceId !== entry.evidenceId ||
				entry.provenance.evidenceKind !== entry.kind ||
				entry.provenance.referenceId !== entry.referenceId ||
				!Number.isSafeInteger(entry.includedRecordCount) ||
				entry.includedRecordCount < 0 ||
				!Number.isSafeInteger(entry.omittedRecordCount) ||
				entry.omittedRecordCount < 0,
		)
	) {
		throw new AgentEvidenceResolverValidationError(
			"Agent evidence entries or provenance are inconsistent.",
		);
	}
	const omittedEvidenceIds = uniqueSorted(evidencePackage.omittedEvidenceIds);
	if (
		stableJson(omittedEvidenceIds) !==
			stableJson(evidencePackage.omittedEvidenceIds) ||
		omittedEvidenceIds.some((evidenceId) =>
			evidencePackage.includedEvidenceIds.includes(evidenceId),
		)
	) {
		throw new AgentEvidenceResolverValidationError(
			"Agent evidence omission accounting is invalid.",
		);
	}
	if (expectedEvidenceIds !== undefined) {
		const expected = uniqueSorted(expectedEvidenceIds);
		const actual = uniqueSorted([
			...evidencePackage.includedEvidenceIds,
			...evidencePackage.omittedEvidenceIds,
		]);
		if (stableJson(expected) !== stableJson(actual)) {
			throw new AgentEvidenceResolverValidationError(
				"Agent evidence package does not account for its input evidence snapshot.",
			);
		}
	}
	const omittedRecordCount = evidencePackage.entries.reduce(
		(total, entry) => total + entry.omittedRecordCount,
		0,
	);
	if (
		evidencePackage.budget.omittedRecordCount < omittedRecordCount ||
		evidencePackage.budget.truncated !==
			(evidencePackage.omittedEvidenceIds.length > 0 ||
				evidencePackage.budget.omittedRecordCount > 0) ||
		stableJson(evidencePackage.guarantees) !== stableJson(GUARANTEES)
	) {
		throw new AgentEvidenceResolverValidationError(
			"Agent evidence budget accounting or guarantees are invalid.",
		);
	}
	const { fingerprint, ...payload } = evidencePackage;
	if (
		!/^sha256:[a-f0-9]{64}$/u.test(fingerprint) ||
		fingerprint !== fingerprintJson(packageFingerprintPayload(payload))
	) {
		throw new AgentEvidenceResolverValidationError(
			"Agent evidence package fingerprint is invalid.",
		);
	}
}

export function resolveAgentEvidence({
	role,
	evidenceReferences,
	mediaIndexes = [],
	transcriptArtifact = null,
	maxCharacters = DEFAULT_AGENT_EVIDENCE_MAX_CHARACTERS,
}: {
	role: AgentRole;
	evidenceReferences: readonly AgentEvidenceReference[];
	mediaIndexes?: readonly MediaIndex[];
	transcriptArtifact?: TimelineTranscriptArtifact | null;
	maxCharacters?: number;
}): AgentEvidencePackage {
	if (!(AGENT_ROLES as readonly string[]).includes(role)) {
		throw new AgentEvidenceResolverValidationError(
			`Unsupported agent role ${String(role)}.`,
		);
	}
	if (
		!Number.isSafeInteger(maxCharacters) ||
		maxCharacters < MIN_AGENT_EVIDENCE_MAX_CHARACTERS ||
		maxCharacters > MAX_AGENT_EVIDENCE_MAX_CHARACTERS
	) {
		throw new AgentEvidenceResolverValidationError(
			`Evidence text budget must be between ${MIN_AGENT_EVIDENCE_MAX_CHARACTERS} and ${MAX_AGENT_EVIDENCE_MAX_CHARACTERS} characters.`,
		);
	}
	if (evidenceReferences.length > MAX_EVIDENCE_REFERENCES) {
		throw new AgentEvidenceResolverValidationError(
			`Evidence resolution accepts at most ${MAX_EVIDENCE_REFERENCES} references.`,
		);
	}
	if (mediaIndexes.length > MAX_MEDIA_INDEXES) {
		throw new AgentEvidenceResolverValidationError(
			`Evidence resolution accepts at most ${MAX_MEDIA_INDEXES} MediaIndex sources.`,
		);
	}

	const sortedReferences = [...evidenceReferences].sort((left, right) =>
		left.evidenceId.localeCompare(right.evidenceId),
	);
	const evidenceIds = new Set<string>();
	for (const reference of sortedReferences) {
		assertReference(reference);
		if (evidenceIds.has(reference.evidenceId)) {
			throw new AgentEvidenceResolverValidationError(
				`Duplicate evidence id ${reference.evidenceId}.`,
			);
		}
		evidenceIds.add(reference.evidenceId);
	}

	const mediaById = new Map<string, MediaIndex>();
	const mediaByAssetId = new Map<string, MediaIndex>();
	for (const index of mediaIndexes) {
		assertMediaIndexInvariants({ index });
		if (
			mediaById.has(index.mediaIndexId) ||
			mediaByAssetId.has(index.assetId)
		) {
			throw new AgentEvidenceResolverValidationError(
				"MediaIndex sources must have unique index and asset ids.",
			);
		}
		mediaById.set(index.mediaIndexId, index);
		mediaByAssetId.set(index.assetId, index);
	}

	const parsedTranscript =
		transcriptArtifact === null
			? null
			: parseTimelineTranscriptArtifact({ value: transcriptArtifact });
	if (transcriptArtifact !== null && parsedTranscript === null) {
		throw new AgentEvidenceResolverValidationError(
			"Transcript source failed strict artifact validation.",
		);
	}

	const allowedKinds = ROLE_EVIDENCE_KINDS[role];
	const omittedEvidenceIds: string[] = [];
	const candidates: EntryCandidate[] = [];
	const dynamicLimitations: string[] = [];
	for (const reference of sortedReferences) {
		if (!allowedKinds.has(reference.kind)) {
			omittedEvidenceIds.push(reference.evidenceId);
			dynamicLimitations.push(
				`${reference.evidenceId} was excluded by the ${role} role projection.`,
			);
			continue;
		}
		if (reference.kind === "transcript") {
			if (
				parsedTranscript !== null &&
				parsedTranscript.artifactId === reference.referenceId
			) {
				candidates.push(
					transcriptCandidate({
						reference,
						artifact: parsedTranscript,
					}),
				);
			} else {
				candidates.push(
					unresolvedCandidate({
						reference,
						limitation:
							"The referenced transcript artifact was not supplied; no transcript text was resolved.",
					}),
				);
				dynamicLimitations.push(
					`${reference.evidenceId} has no matching transcript artifact payload.`,
				);
			}
			continue;
		}

		const index =
			mediaById.get(reference.referenceId) ??
			(reference.kind === "asset-metadata" ||
			reference.kind === "audio-metadata"
				? mediaByAssetId.get(reference.referenceId)
				: undefined);
		if (
			index !== undefined &&
			(reference.kind === "asset-metadata" ||
				reference.kind === "audio-metadata" ||
				reference.kind === "scene-analysis" ||
				reference.kind === "visual-analysis" ||
				reference.kind === "audio-analysis")
		) {
			candidates.push(mediaCandidate({ reference, index }));
			continue;
		}

		candidates.push(
			unresolvedCandidate({
				reference,
				limitation:
					"The orchestrator reference has no matching structured source payload; its label is context only.",
			}),
		);
		if (
			reference.kind === "scene-analysis" ||
			reference.kind === "visual-analysis" ||
			reference.kind === "audio-analysis"
		) {
			dynamicLimitations.push(
				`${reference.evidenceId} has no matching MediaIndex payload.`,
			);
		}
	}

	const header = [
		"[VISIONCUT_AGENT_EVIDENCE]",
		`schema=${AGENT_EVIDENCE_PACKAGE_SCHEMA_VERSION}`,
		`resolver=${AGENT_EVIDENCE_RESOLVER_VERSION}`,
		`role=${role}`,
		"policy=observed-signals-only",
		"semanticBoundary=no-persons,no-speakers,no-emotions,no-objects,no-semantic-scenes",
		"authority=proposal-only; human approval and executor validation remain required",
	].join("\n");
	const parts = [header];
	let usedCharacters = codePointLength(header);
	const entries: AgentEvidencePackageEntry[] = [];
	let omittedRecordCount = 0;
	for (const candidate of candidates) {
		const separatorLength = codePointLength("\n\n");
		const available = maxCharacters - usedCharacters - separatorLength;
		const rendered = renderCandidate({
			candidate,
			maxCharacters: Math.max(0, available),
		});
		if (rendered === null) {
			omittedEvidenceIds.push(candidate.reference.evidenceId);
			omittedRecordCount += candidate.sourceRecordCount;
			continue;
		}
		parts.push(rendered.text);
		usedCharacters += separatorLength + codePointLength(rendered.text);
		entries.push(rendered.entry);
		omittedRecordCount += rendered.entry.omittedRecordCount;
	}

	const normalizedOmittedEvidenceIds = uniqueSorted(omittedEvidenceIds);
	const includedEvidenceIds = entries.map((entry) => entry.evidenceId);
	const limitations = uniqueSorted([
		...BASE_LIMITATIONS,
		ROLE_LIMITATIONS[role],
		...entries.flatMap((entry) => entry.limitations),
		...dynamicLimitations,
		...(normalizedOmittedEvidenceIds.length > 0 || omittedRecordCount > 0
			? [
					"The evidence package was truncated to its declared character and record budget.",
				]
			: []),
	]);
	const text = parts.join("\n\n");
	const payload: Omit<AgentEvidencePackage, "fingerprint"> = {
		kind: AGENT_EVIDENCE_PACKAGE_KIND,
		schemaVersion: AGENT_EVIDENCE_PACKAGE_SCHEMA_VERSION,
		resolverVersion: AGENT_EVIDENCE_RESOLVER_VERSION,
		role,
		text,
		entries,
		provenance: entries.map((entry) => ({ ...entry.provenance })),
		limitations,
		includedEvidenceIds,
		omittedEvidenceIds: normalizedOmittedEvidenceIds,
		budget: {
			maxCharacters,
			usedCharacters: codePointLength(text),
			truncated:
				normalizedOmittedEvidenceIds.length > 0 || omittedRecordCount > 0,
			omittedRecordCount,
		},
		guarantees: { ...GUARANTEES },
	};
	const evidencePackage: AgentEvidencePackage = {
		...payload,
		fingerprint: fingerprintJson(packageFingerprintPayload(payload)),
	};
	assertAgentEvidencePackageInvariants({
		evidencePackage,
		expectedRole: role,
		expectedEvidenceIds: sortedReferences.map(
			(reference) => reference.evidenceId,
		),
	});
	return deepFreeze(evidencePackage);
}
