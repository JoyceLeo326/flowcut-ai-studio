import type { EditPlan } from "@/ai-edit/types";
import { IndexedDBAdapter } from "@/services/storage/indexeddb-adapter";

export const CREATOR_DNA_PROFILE_ID = "local-creator";
export const CREATOR_DNA_UPDATED_EVENT = "visioncut:creator-dna-updated";

export type CreatorRhythm = "calm" | "balanced" | "fast";
export type CreatorCaptionDensity = "minimal" | "balanced" | "dense";
export type CreatorAudioPriority = "voice" | "music" | "ambient";

export interface CreatorPreferenceSignal<T extends string> {
	value: T;
	confidence: number;
	evidenceCount: number;
	lastEvidenceAt: string;
	sourcePlanIds: string[];
}

export interface CreatorDNAPreferences {
	rhythm?: CreatorPreferenceSignal<CreatorRhythm>;
	captionDensity?: CreatorPreferenceSignal<CreatorCaptionDensity>;
	audioPriority?: CreatorPreferenceSignal<CreatorAudioPriority>;
	visualStyle?: CreatorPreferenceSignal<string>;
	platform?: CreatorPreferenceSignal<string>;
	aspectRatio?: CreatorPreferenceSignal<string>;
}

export interface CreatorDNAProfile {
	id: typeof CREATOR_DNA_PROFILE_ID;
	formatVersion: "visioncut.creator-dna/v1";
	enabled: boolean;
	createdAt: string;
	updatedAt: string;
	explicitDecisionCount: number;
	preferences: CreatorDNAPreferences;
}

export interface CreatorDNAEvidence {
	plan: EditPlan;
	confirmedAt?: string;
}

const adapter = new IndexedDBAdapter<CreatorDNAProfile>({
	dbName: "visioncut-creator-dna",
	storeName: "profiles",
	version: 1,
});

function nowIso(): string {
	return new Date().toISOString();
}

export function createEmptyCreatorDNA(createdAt = nowIso()): CreatorDNAProfile {
	return {
		id: CREATOR_DNA_PROFILE_ID,
		formatVersion: "visioncut.creator-dna/v1",
		enabled: true,
		createdAt,
		updatedAt: createdAt,
		explicitDecisionCount: 0,
		preferences: {},
	};
}

function inferRhythm(plan: EditPlan): CreatorRhythm {
	const explicitDirection = `${plan.prompt} ${plan.target.style}`;
	if (/(快切|高燃|赛事|节拍|紧凑|燃剪|高光)/i.test(explicitDirection)) {
		return "fast";
	}
	if (/(纪录片|观察式|留白|克制|氛围|余韵)/i.test(explicitDirection)) {
		return "calm";
	}
	return "balanced";
}

function inferCaptionDensity(plan: EditPlan): CreatorCaptionDensity {
	const text = plan.creativeDirection.captionStyle;
	if (/(少量|极简|必要处|留白)/i.test(text)) return "minimal";
	if (/(大字|高能|信息卡|双语|关键词|每句)/i.test(text)) return "dense";
	return "balanced";
}

function inferAudioPriority(plan: EditPlan): CreatorAudioPriority {
	const text = plan.creativeDirection.audioStrategy;
	if (/(人声优先|对白|降噪|语音)/i.test(text)) return "voice";
	if (/(音乐卡点|节拍驱动|配乐|鼓点)/i.test(text)) return "music";
	return "ambient";
}

function mergeSignal<T extends string>({
	current,
	value,
	planId,
	at,
}: {
	current?: CreatorPreferenceSignal<T>;
	value: T;
	planId: string;
	at: string;
}): CreatorPreferenceSignal<T> {
	const sameValue = current?.value === value;
	const evidenceCount = sameValue ? current.evidenceCount + 1 : 1;
	const sourcePlanIds = [
		...(sameValue ? (current?.sourcePlanIds ?? []) : []),
		planId,
	]
		.filter((id, index, values) => values.indexOf(id) === index)
		.slice(-20);
	return {
		value,
		confidence: Math.min(0.95, 0.45 + evidenceCount * 0.1),
		evidenceCount,
		lastEvidenceAt: at,
		sourcePlanIds,
	};
}

export function learnCreatorDNAFromConfirmedPlan({
	profile,
	evidence,
}: {
	profile: CreatorDNAProfile;
	evidence: CreatorDNAEvidence;
}): CreatorDNAProfile {
	if (!profile.enabled) return profile;
	const { plan } = evidence;
	if (hasCreatorDNAPlanEvidence({ profile, planId: plan.id })) return profile;
	const at = evidence.confirmedAt ?? nowIso();
	return {
		...profile,
		updatedAt: at,
		explicitDecisionCount: profile.explicitDecisionCount + 1,
		preferences: {
			rhythm: mergeSignal({
				current: profile.preferences.rhythm,
				value: inferRhythm(plan),
				planId: plan.id,
				at,
			}),
			captionDensity: mergeSignal({
				current: profile.preferences.captionDensity,
				value: inferCaptionDensity(plan),
				planId: plan.id,
				at,
			}),
			audioPriority: mergeSignal({
				current: profile.preferences.audioPriority,
				value: inferAudioPriority(plan),
				planId: plan.id,
				at,
			}),
			visualStyle: mergeSignal({
				current: profile.preferences.visualStyle,
				value: plan.target.style,
				planId: plan.id,
				at,
			}),
			platform: mergeSignal({
				current: profile.preferences.platform,
				value: plan.target.label,
				planId: plan.id,
				at,
			}),
			aspectRatio: mergeSignal({
				current: profile.preferences.aspectRatio,
				value: plan.target.aspectRatio,
				planId: plan.id,
				at,
			}),
		},
	};
}

export function hasCreatorDNAPlanEvidence({
	profile,
	planId,
}: {
	profile: CreatorDNAProfile;
	planId: string;
}): boolean {
	return Object.values(profile.preferences).some((signal) =>
		signal?.sourcePlanIds.includes(planId),
	);
}

export function setCreatorDNAEnabled({
	profile,
	enabled,
	at = nowIso(),
}: {
	profile: CreatorDNAProfile;
	enabled: boolean;
	at?: string;
}): CreatorDNAProfile {
	return { ...profile, enabled, updatedAt: at };
}

export function overrideCreatorPreference<
	K extends keyof CreatorDNAPreferences,
>({
	profile,
	key,
	value,
	at = nowIso(),
}: {
	profile: CreatorDNAProfile;
	key: K;
	value: NonNullable<CreatorDNAPreferences[K]>["value"];
	at?: string;
}): CreatorDNAProfile {
	const current = profile.preferences[key] as
		| CreatorPreferenceSignal<string>
		| undefined;
	return {
		...profile,
		updatedAt: at,
		preferences: {
			...profile.preferences,
			[key]: {
				value,
				confidence: 1,
				evidenceCount: current?.evidenceCount ?? 0,
				lastEvidenceAt: at,
				sourcePlanIds: current?.sourcePlanIds ?? [],
			},
		},
	};
}

export async function loadCreatorDNA(): Promise<CreatorDNAProfile> {
	const stored = await adapter.get(CREATOR_DNA_PROFILE_ID);
	return stored ?? createEmptyCreatorDNA();
}

export async function saveCreatorDNA(
	profile: CreatorDNAProfile,
): Promise<void> {
	await adapter.set({ key: CREATOR_DNA_PROFILE_ID, value: profile });
	if (typeof window !== "undefined") {
		window.dispatchEvent(
			new CustomEvent(CREATOR_DNA_UPDATED_EVENT, { detail: profile }),
		);
	}
}

export async function rememberConfirmedPlan(
	plan: EditPlan,
): Promise<CreatorDNAProfile> {
	const current = await loadCreatorDNA();
	const next = learnCreatorDNAFromConfirmedPlan({
		profile: current,
		evidence: { plan },
	});
	await saveCreatorDNA(next);
	return next;
}

export async function deleteCreatorDNA(): Promise<void> {
	await adapter.remove(CREATOR_DNA_PROFILE_ID);
	if (typeof window !== "undefined") {
		window.dispatchEvent(
			new CustomEvent(CREATOR_DNA_UPDATED_EVENT, {
				detail: createEmptyCreatorDNA(),
			}),
		);
	}
}

export function exportCreatorDNA(profile: CreatorDNAProfile): string {
	return JSON.stringify(profile, null, 2);
}
