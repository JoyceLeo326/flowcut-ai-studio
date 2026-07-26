import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { getTableConfig, type AnyPgTable } from "drizzle-orm/pg-core";
import {
	accounts,
	agentArtifactStatusEnum,
	agentArtifacts,
	agentRoleEnum,
	aiExecutionModeEnum,
	aiSessionStatusEnum,
	aiSessions,
	assetKindEnum,
	assets,
	assetSourceKindEnum,
	assetStatusEnum,
	creatorDnaProfiles,
	creatorDnaScopeEnum,
	creatorDnaStatusEnum,
	feedback,
	projectMemberRoleEnum,
	projectMembers,
	projectMemberStatusEnum,
	projects,
	projectStatusEnum,
	projectVersions,
	projectVersionStatusEnum,
	projectVisibilityEnum,
	sceneKindEnum,
	scenes,
	sessions,
	storyGraphStatusEnum,
	storyGraphVersions,
	users,
	verifications,
	waitlist,
} from "./schema";

const domainTables = [
	projects,
	projectMembers,
	assets,
	scenes,
	storyGraphVersions,
	aiSessions,
	agentArtifacts,
	projectVersions,
	creatorDnaProfiles,
] as const;

const projectScopedTables = [
	projectMembers,
	assets,
	scenes,
	storyGraphVersions,
	aiSessions,
	agentArtifacts,
	projectVersions,
] as const;

const domainTableNames = [
	"agent_artifacts",
	"ai_sessions",
	"assets",
	"creator_dna_profiles",
	"project_members",
	"project_versions",
	"projects",
	"scenes",
	"story_graph_versions",
] as const;

const enumDefinitions = {
	agent_artifact_status: agentArtifactStatusEnum.enumValues,
	agent_role: agentRoleEnum.enumValues,
	ai_execution_mode: aiExecutionModeEnum.enumValues,
	ai_session_status: aiSessionStatusEnum.enumValues,
	asset_kind: assetKindEnum.enumValues,
	asset_source_kind: assetSourceKindEnum.enumValues,
	asset_status: assetStatusEnum.enumValues,
	creator_dna_scope: creatorDnaScopeEnum.enumValues,
	creator_dna_status: creatorDnaStatusEnum.enumValues,
	project_member_role: projectMemberRoleEnum.enumValues,
	project_member_status: projectMemberStatusEnum.enumValues,
	project_status: projectStatusEnum.enumValues,
	project_version_status: projectVersionStatusEnum.enumValues,
	project_visibility: projectVisibilityEnum.enumValues,
	scene_kind: sceneKindEnum.enumValues,
	story_graph_status: storyGraphStatusEnum.enumValues,
} as const;

function tableConfig(table: AnyPgTable) {
	return getTableConfig(table);
}

function columnMap(table: AnyPgTable) {
	return new Map(
		tableConfig(table).columns.map((column) => [column.name, column]),
	);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireRecord({
	description,
	value,
}: {
	description: string;
	value: unknown;
}): Record<string, unknown> {
	if (!isRecord(value)) {
		throw new TypeError(`${description} must be a JSON object`);
	}
	return value;
}

function parseJsonRecord({
	description,
	json,
}: {
	description: string;
	json: string;
}) {
	const parsed: unknown = JSON.parse(json);
	return requireRecord({ description, value: parsed });
}

describe("VisionCut PostgreSQL domain schema", () => {
	test("preserves the existing auth and product-support tables", () => {
		expect(
			[users, sessions, accounts, feedback, verifications, waitlist].map(
				(table) => tableConfig(table).name,
			),
		).toEqual([
			"users",
			"sessions",
			"accounts",
			"feedback",
			"verifications",
			"waitlist",
		]);
	});

	test("defines every required VisionCut domain table with fail-closed RLS", () => {
		expect(domainTables.map((table) => tableConfig(table).name).sort()).toEqual(
			[...domainTableNames],
		);

		for (const table of domainTables) {
			const config = tableConfig(table);
			const operations = config.policies.map((policy) => policy.for).sort();

			expect(config.enableRLS, `${config.name} must enable RLS`).toBe(true);
			expect(
				config.policies,
				`${config.name} must have four operation-specific policies`,
			).toHaveLength(4);
			expect(operations).toEqual(["delete", "insert", "select", "update"]);
			expect(config.policies.every((policy) => policy.to === "public")).toBe(
				true,
			);
		}
	});

	test("keeps project and owner scope explicit and revisions positive", () => {
		const projectColumns = columnMap(projects);
		expect(projectColumns.get("id")?.notNull).toBe(true);
		expect(projectColumns.get("owner_user_id")?.notNull).toBe(true);

		for (const table of projectScopedTables) {
			const config = tableConfig(table);
			const columns = columnMap(table);

			expect(columns.get("project_id")?.notNull, config.name).toBe(true);
			expect(columns.get("owner_user_id")?.notNull, config.name).toBe(true);
			expect(columns.get("revision")?.notNull, config.name).toBe(true);
			expect(
				config.checks.some((constraint) =>
					constraint.name.endsWith("revision_positive"),
				),
				`${config.name} must reject non-positive revisions`,
			).toBe(true);
		}

		const dnaColumns = columnMap(creatorDnaProfiles);
		expect(dnaColumns.get("owner_user_id")?.notNull).toBe(true);
		expect(dnaColumns.get("project_id")?.notNull).toBe(false);
		expect(
			tableConfig(creatorDnaProfiles).checks.map((item) => item.name),
		).toContain("creator_dna_profiles_scope_consistent");
	});

	test("enforces composite project boundaries and conservative deletion", () => {
		const requiredScopedForeignKeys = new Map<AnyPgTable, string[]>([
			[projectMembers, ["project_members_project_scope_fk"]],
			[assets, ["assets_project_scope_fk"]],
			[scenes, ["scenes_project_scope_fk", "scenes_asset_scope_fk"]],
			[
				storyGraphVersions,
				[
					"story_graph_versions_project_scope_fk",
					"story_graph_versions_parent_scope_fk",
				],
			],
			[aiSessions, ["ai_sessions_project_scope_fk"]],
			[
				agentArtifacts,
				[
					"agent_artifacts_project_scope_fk",
					"agent_artifacts_session_scope_fk",
					"agent_artifacts_parent_scope_fk",
				],
			],
			[
				projectVersions,
				[
					"project_versions_project_scope_fk",
					"project_versions_parent_scope_fk",
					"project_versions_source_ai_session_fk",
				],
			],
			[creatorDnaProfiles, ["creator_dna_profiles_project_scope_fk"]],
		]);

		for (const [table, expectedNames] of requiredScopedForeignKeys) {
			const names = tableConfig(table).foreignKeys.map((key) => key.getName());
			for (const name of expectedNames) {
				expect(names, `${tableConfig(table).name} foreign keys`).toContain(
					name,
				);
			}
		}

		const projectOwnerForeignKey = tableConfig(projects).foreignKeys.find(
			(key) => key.getName() === "projects_owner_user_id_users_id_fk",
		);
		const sceneAssetForeignKey = tableConfig(scenes).foreignKeys.find(
			(key) => key.getName() === "scenes_asset_scope_fk",
		);
		const artifactSessionForeignKey = tableConfig(
			agentArtifacts,
		).foreignKeys.find(
			(key) => key.getName() === "agent_artifacts_session_scope_fk",
		);

		expect(projectOwnerForeignKey?.onDelete).toBe("restrict");
		expect(sceneAssetForeignKey?.onDelete).toBe("restrict");
		expect(artifactSessionForeignKey?.onDelete).toBe("restrict");
	});

	test("stores structured metadata and references but no media binary", () => {
		const expectedJsonColumns = new Set([
			"agent_artifacts.evidence",
			"agent_artifacts.payload",
			"ai_sessions.request_metadata",
			"assets.metadata",
			"assets.storage_reference",
			"creator_dna_profiles.evidence",
			"creator_dna_profiles.preferences",
			"project_versions.asset_manifest",
			"project_versions.state",
			"projects.settings",
			"scenes.evidence",
			"scenes.metadata",
			"story_graph_versions.graph",
			"story_graph_versions.provenance",
		]);
		const actualJsonColumns = new Set<string>();

		for (const table of domainTables) {
			const config = tableConfig(table);
			let jsonColumnCount = 0;
			for (const column of config.columns) {
				const sqlType = column.getSQLType().toLowerCase();
				expect(sqlType).not.toMatch(/bytea|blob|binary/);
				if (sqlType === "jsonb") {
					jsonColumnCount += 1;
					actualJsonColumns.add(`${config.name}.${column.name}`);
				}
			}
			expect(
				config.checks.filter((constraint) =>
					constraint.name.endsWith("_safe_json"),
				),
				`${config.name} must type-check and scrub every JSONB column`,
			).toHaveLength(jsonColumnCount);
		}

		expect(actualJsonColumns).toEqual(expectedJsonColumns);
	});

	test("uses enums for all persisted status, role, mode, and media kinds", () => {
		expect(enumDefinitions.project_member_role).toEqual([
			"owner",
			"editor",
			"reviewer",
			"viewer",
		]);
		expect(enumDefinitions.agent_role).toContain("camera");
		expect(enumDefinitions.ai_execution_mode).toEqual([
			"local",
			"byok",
			"managed_cloud",
		]);
		expect(enumDefinitions.asset_kind).toEqual([
			"video",
			"audio",
			"image",
			"subtitle",
			"other",
		]);
		expect(Object.keys(enumDefinitions)).toHaveLength(16);
	});
});

describe("VisionCut Drizzle migration metadata", () => {
	const migrationPath = resolve(
		import.meta.dir,
		"../../migrations/0001_visioncut_cloud_domain.sql",
	);
	const snapshotPath = resolve(
		import.meta.dir,
		"../../migrations/meta/0001_snapshot.json",
	);
	const journalPath = resolve(
		import.meta.dir,
		"../../migrations/meta/_journal.json",
	);

	test("is the next append-only migration and never drops existing data", async () => {
		const [migrationSql, journalJson] = await Promise.all([
			readFile(migrationPath, "utf8"),
			readFile(journalPath, "utf8"),
		]);
		const journal = parseJsonRecord({
			json: journalJson,
			description: "migration journal",
		});
		if (!Array.isArray(journal.entries)) {
			throw new TypeError("migration journal entries must be an array");
		}

		expect(journal.entries.at(-1)).toEqual(
			expect.objectContaining({
				idx: 1,
				tag: "0001_visioncut_cloud_domain",
			}),
		);
		expect(migrationSql).not.toMatch(/\bDROP\s+(TABLE|TYPE|COLUMN)\b/i);
		expect(migrationSql).toContain('CREATE TABLE "feedback"');
		expect(migrationSql).not.toContain('CREATE TABLE "waitlist"');
	});

	test("matches required tables, enums, RLS policies, and scoped keys", async () => {
		const migrationSql = await readFile(migrationPath, "utf8");

		for (const tableName of domainTableNames) {
			expect(migrationSql).toContain(`CREATE TABLE "${tableName}"`);
			expect(migrationSql).toContain(
				`ALTER TABLE "${tableName}" ENABLE ROW LEVEL SECURITY`,
			);
		}

		for (const enumName of Object.keys(enumDefinitions)) {
			expect(migrationSql).toContain(
				`CREATE TYPE "public"."${enumName}" AS ENUM`,
			);
		}

		expect(migrationSql.match(/CREATE POLICY /g)).toHaveLength(
			domainTables.length * 4,
		);
		expect(migrationSql).toContain(
			'CONSTRAINT "scenes_asset_scope_fk" FOREIGN KEY ("asset_id","project_id","owner_user_id")',
		);
		expect(migrationSql).toContain(
			'CONSTRAINT "agent_artifacts_session_scope_fk" FOREIGN KEY ("ai_session_id","project_id","owner_user_id")',
		);
		expect(migrationSql).toContain(
			"current_setting('app.current_user_id', true)",
		);
		expect(migrationSql).not.toMatch(
			/"(api_key|session_byok_key|binary|video_blob)"\s+/i,
		);
	});

	test("keeps the generated snapshot aligned with schema metadata", async () => {
		const snapshotJson = await readFile(snapshotPath, "utf8");
		const snapshot = parseJsonRecord({
			json: snapshotJson,
			description: "migration snapshot",
		});
		const snapshotTables = requireRecord({
			value: snapshot.tables,
			description: "migration snapshot tables",
		});
		const snapshotEnums = requireRecord({
			value: snapshot.enums,
			description: "migration snapshot enums",
		});
		const snapshotTableNames = Object.values(snapshotTables)
			.map((table, index) => {
				const tableRecord = requireRecord({
					value: table,
					description: `migration snapshot table ${index}`,
				});
				if (typeof tableRecord.name !== "string") {
					throw new TypeError("migration snapshot table name must be a string");
				}
				return tableRecord.name;
			})
			.sort();

		expect(snapshotTableNames).toEqual(
			[
				"accounts",
				...domainTableNames,
				"feedback",
				"sessions",
				"users",
				"verifications",
				"waitlist",
			].sort(),
		);

		for (const [enumName, enumValues] of Object.entries(enumDefinitions)) {
			const enumRecord = requireRecord({
				value: snapshotEnums[`public.${enumName}`],
				description: `migration snapshot enum ${enumName}`,
			});
			expect(enumRecord.values).toEqual(enumValues);
		}
	});
});
