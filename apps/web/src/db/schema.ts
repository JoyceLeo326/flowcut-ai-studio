import { sql } from "drizzle-orm";
import {
	bigint,
	boolean,
	check,
	foreignKey,
	index,
	integer,
	jsonb,
	pgEnum,
	pgPolicy,
	pgTable,
	primaryKey,
	text,
	timestamp,
	uniqueIndex,
	type AnyPgColumn,
} from "drizzle-orm/pg-core";

export type JsonPrimitive = boolean | number | string | null;
export type JsonValue =
	| JsonPrimitive
	| { readonly [key: string]: JsonValue }
	| readonly JsonValue[];
export type StructuredMetadata = Readonly<Record<string, JsonValue>>;

export interface EvidenceReference {
	readonly evidenceId: string;
	readonly sourceId: string;
	readonly sourceKind:
		| "agent-artifact"
		| "asset-fingerprint"
		| "media-index"
		| "transcript";
	readonly timeRangeMs?: {
		readonly end: number;
		readonly start: number;
	};
}

export interface AssetStorageReference {
	readonly bucket?: string;
	readonly objectKey?: string;
	readonly provider: "local-reference" | "managed-object" | "generated";
	readonly region?: string;
}

const currentUserId = sql`nullif(current_setting('app.current_user_id', true), '')`;

function ownsScope(ownerUserId: AnyPgColumn) {
	return sql`(${ownerUserId} = ${currentUserId})`;
}

function isSafeJsonObject(column: AnyPgColumn) {
	return sql`(
		jsonb_typeof(${column}) = 'object'
		AND NOT (
			${column}::text
			~* '"(api[_-]?key|authorization|session[_-]?byok[_-]?key|token|secret)"[[:space:]]*:'
		)
	)`;
}

function isSafeJsonArray(column: AnyPgColumn) {
	return sql`(
		jsonb_typeof(${column}) = 'array'
		AND NOT (
			${column}::text
			~* '"(api[_-]?key|authorization|session[_-]?byok[_-]?key|token|secret)"[[:space:]]*:'
		)
	)`;
}

function canReadProject({
	ownerUserId,
	projectId,
}: {
	ownerUserId: AnyPgColumn;
	projectId: AnyPgColumn;
}) {
	return sql`(
		${ownerUserId} = ${currentUserId}
		OR EXISTS (
			SELECT 1
			FROM "project_members" AS "visioncut_member"
			WHERE "visioncut_member"."project_id" = ${projectId}
				AND "visioncut_member"."owner_user_id" = ${ownerUserId}
				AND "visioncut_member"."user_id" = ${currentUserId}
				AND "visioncut_member"."status" = 'active'
		)
	)`;
}

function canEditProject({
	ownerUserId,
	projectId,
}: {
	ownerUserId: AnyPgColumn;
	projectId: AnyPgColumn;
}) {
	return sql`(
		${ownerUserId} = ${currentUserId}
		OR EXISTS (
			SELECT 1
			FROM "project_members" AS "visioncut_member"
			WHERE "visioncut_member"."project_id" = ${projectId}
				AND "visioncut_member"."owner_user_id" = ${ownerUserId}
				AND "visioncut_member"."user_id" = ${currentUserId}
				AND "visioncut_member"."status" = 'active'
				AND "visioncut_member"."role" IN ('owner', 'editor')
		)
	)`;
}

export const projectStatusEnum = pgEnum("project_status", [
	"active",
	"archived",
	"deleted",
]);
export const projectVisibilityEnum = pgEnum("project_visibility", [
	"private",
	"shared",
]);
export const projectMemberRoleEnum = pgEnum("project_member_role", [
	"owner",
	"editor",
	"reviewer",
	"viewer",
]);
export const projectMemberStatusEnum = pgEnum("project_member_status", [
	"invited",
	"active",
	"suspended",
]);
export const assetKindEnum = pgEnum("asset_kind", [
	"video",
	"audio",
	"image",
	"subtitle",
	"other",
]);
export const assetStatusEnum = pgEnum("asset_status", [
	"pending",
	"ready",
	"failed",
	"deleted",
]);
export const assetSourceKindEnum = pgEnum("asset_source_kind", [
	"local_reference",
	"managed_object",
	"generated",
]);
export const sceneKindEnum = pgEnum("scene_kind", [
	"primary",
	"b_roll",
	"audio",
	"title",
	"generated",
]);
export const storyGraphStatusEnum = pgEnum("story_graph_status", [
	"draft",
	"in_review",
	"approved",
	"superseded",
]);
export const aiSessionStatusEnum = pgEnum("ai_session_status", [
	"planning",
	"running",
	"awaiting_review",
	"completed",
	"failed",
	"cancelled",
]);
export const aiExecutionModeEnum = pgEnum("ai_execution_mode", [
	"local",
	"byok",
	"managed_cloud",
]);
export const agentRoleEnum = pgEnum("agent_role", [
	"director",
	"story",
	"camera",
	"editor",
	"color",
	"sound",
	"growth",
]);
export const agentArtifactStatusEnum = pgEnum("agent_artifact_status", [
	"candidate",
	"in_review",
	"accepted",
	"rejected",
	"stale",
	"failed",
]);
export const projectVersionStatusEnum = pgEnum("project_version_status", [
	"checkpoint",
	"approved",
	"published",
	"archived",
]);
export const creatorDnaScopeEnum = pgEnum("creator_dna_scope", [
	"global",
	"project",
]);
export const creatorDnaStatusEnum = pgEnum("creator_dna_status", [
	"learning",
	"active",
	"paused",
]);

export const users = pgTable("users", {
	id: text("id").primaryKey(),

	// todo: implement fully anonymous sign-in for privacy
	// we don't have any auth flows currently so this is fine for now
	name: text("name").notNull(),
	email: text("email").notNull().unique(),
	emailVerified: boolean("email_verified").default(false).notNull(),
	image: text("image"),
	createdAt: timestamp("created_at")
		.$defaultFn(() => /* @__PURE__ */ new Date())
		.notNull(),
	updatedAt: timestamp("updated_at")
		.$defaultFn(() => /* @__PURE__ */ new Date())
		.notNull(),
}).enableRLS();

export const sessions = pgTable("sessions", {
	id: text("id").primaryKey(),
	expiresAt: timestamp("expires_at").notNull(),
	token: text("token").notNull().unique(),
	createdAt: timestamp("created_at").notNull(),
	updatedAt: timestamp("updated_at").notNull(),
	ipAddress: text("ip_address"),
	userAgent: text("user_agent"),
	userId: text("user_id")
		.notNull()
		.references(() => users.id, { onDelete: "cascade" }),
}).enableRLS();

export const accounts = pgTable("accounts", {
	id: text("id").primaryKey(),
	accountId: text("account_id").notNull(),
	providerId: text("provider_id").notNull(),
	userId: text("user_id")
		.notNull()
		.references(() => users.id, { onDelete: "cascade" }),
	accessToken: text("access_token"),
	refreshToken: text("refresh_token"),
	idToken: text("id_token"),
	accessTokenExpiresAt: timestamp("access_token_expires_at"),
	refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
	scope: text("scope"),
	password: text("password"),
	createdAt: timestamp("created_at").notNull(),
	updatedAt: timestamp("updated_at").notNull(),
}).enableRLS();

export const feedback = pgTable("feedback", {
	id: text("id").primaryKey(),
	message: text("message").notNull(),
	createdAt: timestamp("created_at")
		.$defaultFn(() => new Date())
		.notNull(),
});

export const verifications = pgTable("verifications", {
	id: text("id").primaryKey(),
	identifier: text("identifier").notNull(),
	value: text("value").notNull(),
	expiresAt: timestamp("expires_at").notNull(),
	createdAt: timestamp("created_at").$defaultFn(
		() => /* @__PURE__ */ new Date(),
	),
	updatedAt: timestamp("updated_at").$defaultFn(
		() => /* @__PURE__ */ new Date(),
	),
}).enableRLS();

// The initial database migration created this table. Keeping it in the schema
// prevents later Drizzle generations from dropping existing waitlist records.
export const waitlist = pgTable("waitlist", {
	id: text("id").primaryKey(),
	email: text("email").notNull().unique(),
	createdAt: timestamp("created_at").notNull(),
}).enableRLS();

export const projects = pgTable(
	"projects",
	{
		id: text("id").primaryKey(),
		ownerUserId: text("owner_user_id")
			.notNull()
			.references(() => users.id, {
				onDelete: "restrict",
				onUpdate: "cascade",
			}),
		name: text("name").notNull(),
		description: text("description"),
		status: projectStatusEnum("status").default("active").notNull(),
		visibility: projectVisibilityEnum("visibility")
			.default("private")
			.notNull(),
		revision: integer("revision").default(1).notNull(),
		settings: jsonb("settings")
			.$type<StructuredMetadata>()
			.default(sql`'{}'::jsonb`)
			.notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		archivedAt: timestamp("archived_at", { withTimezone: true }),
		deletedAt: timestamp("deleted_at", { withTimezone: true }),
	},
	(table) => [
		uniqueIndex("projects_id_owner_scope_unique").on(
			table.id,
			table.ownerUserId,
		),
		index("projects_owner_updated_idx").on(table.ownerUserId, table.updatedAt),
		index("projects_owner_status_idx").on(table.ownerUserId, table.status),
		check("projects_revision_positive", sql`${table.revision} > 0`),
		check("projects_settings_safe_json", isSafeJsonObject(table.settings)),
		check(
			"projects_lifecycle_consistent",
			sql`(
				(${table.status} = 'active' AND ${table.archivedAt} IS NULL AND ${table.deletedAt} IS NULL)
				OR (${table.status} = 'archived' AND ${table.archivedAt} IS NOT NULL AND ${table.deletedAt} IS NULL)
				OR (${table.status} = 'deleted' AND ${table.deletedAt} IS NOT NULL)
			)`,
		),
		pgPolicy("projects_select_member", {
			for: "select",
			to: "public",
			using: canReadProject({
				projectId: table.id,
				ownerUserId: table.ownerUserId,
			}),
		}),
		pgPolicy("projects_insert_owner", {
			for: "insert",
			to: "public",
			withCheck: ownsScope(table.ownerUserId),
		}),
		pgPolicy("projects_update_owner", {
			for: "update",
			to: "public",
			using: ownsScope(table.ownerUserId),
			withCheck: ownsScope(table.ownerUserId),
		}),
		pgPolicy("projects_delete_owner", {
			for: "delete",
			to: "public",
			using: ownsScope(table.ownerUserId),
		}),
	],
).enableRLS();

export const projectMembers = pgTable(
	"project_members",
	{
		projectId: text("project_id").notNull(),
		ownerUserId: text("owner_user_id").notNull(),
		userId: text("user_id")
			.notNull()
			.references(() => users.id, {
				onDelete: "cascade",
				onUpdate: "cascade",
			}),
		role: projectMemberRoleEnum("role").notNull(),
		status: projectMemberStatusEnum("status").default("invited").notNull(),
		invitedByUserId: text("invited_by_user_id").references(() => users.id, {
			onDelete: "set null",
			onUpdate: "cascade",
		}),
		revision: integer("revision").default(1).notNull(),
		invitedAt: timestamp("invited_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		joinedAt: timestamp("joined_at", { withTimezone: true }),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		primaryKey({
			name: "project_members_project_user_pk",
			columns: [table.projectId, table.userId],
		}),
		foreignKey({
			name: "project_members_project_scope_fk",
			columns: [table.projectId, table.ownerUserId],
			foreignColumns: [projects.id, projects.ownerUserId],
		})
			.onDelete("cascade")
			.onUpdate("cascade"),
		index("project_members_user_status_idx").on(table.userId, table.status),
		index("project_members_project_role_idx").on(
			table.projectId,
			table.role,
			table.status,
		),
		check("project_members_revision_positive", sql`${table.revision} > 0`),
		check(
			"project_members_owner_role_consistent",
			sql`(
				(${table.userId} = ${table.ownerUserId} AND ${table.role} = 'owner')
				OR (${table.userId} <> ${table.ownerUserId} AND ${table.role} <> 'owner')
			)`,
		),
		check(
			"project_members_joined_state_consistent",
			sql`(
				(${table.status} = 'active' AND ${table.joinedAt} IS NOT NULL)
				OR (${table.status} <> 'active')
			)`,
		),
		pgPolicy("project_members_select_participant", {
			for: "select",
			to: "public",
			using: sql`(
				${table.ownerUserId} = ${currentUserId}
				OR ${table.userId} = ${currentUserId}
			)`,
		}),
		pgPolicy("project_members_insert_owner", {
			for: "insert",
			to: "public",
			withCheck: ownsScope(table.ownerUserId),
		}),
		pgPolicy("project_members_update_owner", {
			for: "update",
			to: "public",
			using: ownsScope(table.ownerUserId),
			withCheck: ownsScope(table.ownerUserId),
		}),
		pgPolicy("project_members_delete_owner", {
			for: "delete",
			to: "public",
			using: ownsScope(table.ownerUserId),
		}),
	],
).enableRLS();

export const assets = pgTable(
	"assets",
	{
		id: text("id").primaryKey(),
		projectId: text("project_id").notNull(),
		ownerUserId: text("owner_user_id").notNull(),
		createdByUserId: text("created_by_user_id").references(() => users.id, {
			onDelete: "set null",
			onUpdate: "cascade",
		}),
		kind: assetKindEnum("kind").notNull(),
		status: assetStatusEnum("status").default("pending").notNull(),
		sourceKind: assetSourceKindEnum("source_kind").notNull(),
		fileName: text("file_name").notNull(),
		mimeType: text("mime_type").notNull(),
		byteSize: bigint("byte_size", { mode: "number" }).notNull(),
		durationMs: bigint("duration_ms", { mode: "number" }),
		contentFingerprint: text("content_fingerprint").notNull(),
		storageReference: jsonb("storage_reference")
			.$type<AssetStorageReference>()
			.notNull(),
		metadata: jsonb("metadata")
			.$type<StructuredMetadata>()
			.default(sql`'{}'::jsonb`)
			.notNull(),
		revision: integer("revision").default(1).notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		deletedAt: timestamp("deleted_at", { withTimezone: true }),
	},
	(table) => [
		uniqueIndex("assets_id_project_scope_unique").on(
			table.id,
			table.projectId,
			table.ownerUserId,
		),
		foreignKey({
			name: "assets_project_scope_fk",
			columns: [table.projectId, table.ownerUserId],
			foreignColumns: [projects.id, projects.ownerUserId],
		})
			.onDelete("cascade")
			.onUpdate("cascade"),
		index("assets_project_status_kind_idx").on(
			table.projectId,
			table.status,
			table.kind,
		),
		index("assets_project_created_idx").on(table.projectId, table.createdAt),
		index("assets_content_fingerprint_idx").on(table.contentFingerprint),
		check("assets_revision_positive", sql`${table.revision} > 0`),
		check("assets_byte_size_nonnegative", sql`${table.byteSize} >= 0`),
		check(
			"assets_duration_nonnegative",
			sql`${table.durationMs} IS NULL OR ${table.durationMs} >= 0`,
		),
		check(
			"assets_fingerprint_sha256",
			sql`${table.contentFingerprint} ~ '^[a-f0-9]{64}$'`,
		),
		check(
			"assets_storage_reference_safe_json",
			isSafeJsonObject(table.storageReference),
		),
		check("assets_metadata_safe_json", isSafeJsonObject(table.metadata)),
		check(
			"assets_deleted_state_consistent",
			sql`(
				(${table.status} = 'deleted' AND ${table.deletedAt} IS NOT NULL)
				OR (${table.status} <> 'deleted' AND ${table.deletedAt} IS NULL)
			)`,
		),
		pgPolicy("assets_select_member", {
			for: "select",
			to: "public",
			using: canReadProject(table),
		}),
		pgPolicy("assets_insert_editor", {
			for: "insert",
			to: "public",
			withCheck: canEditProject(table),
		}),
		pgPolicy("assets_update_editor", {
			for: "update",
			to: "public",
			using: canEditProject(table),
			withCheck: canEditProject(table),
		}),
		pgPolicy("assets_delete_editor", {
			for: "delete",
			to: "public",
			using: canEditProject(table),
		}),
	],
).enableRLS();

export const scenes = pgTable(
	"scenes",
	{
		id: text("id").primaryKey(),
		projectId: text("project_id").notNull(),
		ownerUserId: text("owner_user_id").notNull(),
		assetId: text("asset_id"),
		createdByUserId: text("created_by_user_id").references(() => users.id, {
			onDelete: "set null",
			onUpdate: "cascade",
		}),
		kind: sceneKindEnum("kind").notNull(),
		title: text("title").notNull(),
		storyOrder: integer("story_order").notNull(),
		sourceInMs: bigint("source_in_ms", { mode: "number" }),
		sourceOutMs: bigint("source_out_ms", { mode: "number" }),
		timelineStartMs: bigint("timeline_start_ms", { mode: "number" })
			.default(0)
			.notNull(),
		durationMs: bigint("duration_ms", { mode: "number" }).notNull(),
		metadata: jsonb("metadata")
			.$type<StructuredMetadata>()
			.default(sql`'{}'::jsonb`)
			.notNull(),
		evidence: jsonb("evidence")
			.$type<readonly EvidenceReference[]>()
			.default(sql`'[]'::jsonb`)
			.notNull(),
		revision: integer("revision").default(1).notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		uniqueIndex("scenes_id_project_scope_unique").on(
			table.id,
			table.projectId,
			table.ownerUserId,
		),
		uniqueIndex("scenes_project_story_order_unique").on(
			table.projectId,
			table.storyOrder,
		),
		foreignKey({
			name: "scenes_project_scope_fk",
			columns: [table.projectId, table.ownerUserId],
			foreignColumns: [projects.id, projects.ownerUserId],
		})
			.onDelete("cascade")
			.onUpdate("cascade"),
		foreignKey({
			name: "scenes_asset_scope_fk",
			columns: [table.assetId, table.projectId, table.ownerUserId],
			foreignColumns: [assets.id, assets.projectId, assets.ownerUserId],
		})
			.onDelete("restrict")
			.onUpdate("cascade"),
		index("scenes_project_timeline_idx").on(
			table.projectId,
			table.timelineStartMs,
		),
		index("scenes_asset_idx").on(table.assetId),
		check("scenes_revision_positive", sql`${table.revision} > 0`),
		check("scenes_story_order_nonnegative", sql`${table.storyOrder} >= 0`),
		check(
			"scenes_timeline_values_valid",
			sql`${table.timelineStartMs} >= 0 AND ${table.durationMs} > 0`,
		),
		check(
			"scenes_source_range_complete",
			sql`(
				(${table.assetId} IS NULL AND ${table.sourceInMs} IS NULL AND ${table.sourceOutMs} IS NULL)
				OR (
					${table.assetId} IS NOT NULL
					AND ${table.sourceInMs} IS NOT NULL
					AND ${table.sourceOutMs} IS NOT NULL
					AND ${table.sourceInMs} >= 0
					AND ${table.sourceOutMs} > ${table.sourceInMs}
				)
			)`,
		),
		check("scenes_metadata_safe_json", isSafeJsonObject(table.metadata)),
		check("scenes_evidence_safe_json", isSafeJsonArray(table.evidence)),
		pgPolicy("scenes_select_member", {
			for: "select",
			to: "public",
			using: canReadProject(table),
		}),
		pgPolicy("scenes_insert_editor", {
			for: "insert",
			to: "public",
			withCheck: canEditProject(table),
		}),
		pgPolicy("scenes_update_editor", {
			for: "update",
			to: "public",
			using: canEditProject(table),
			withCheck: canEditProject(table),
		}),
		pgPolicy("scenes_delete_editor", {
			for: "delete",
			to: "public",
			using: canEditProject(table),
		}),
	],
).enableRLS();

export const storyGraphVersions = pgTable(
	"story_graph_versions",
	{
		id: text("id").primaryKey(),
		projectId: text("project_id").notNull(),
		ownerUserId: text("owner_user_id").notNull(),
		parentVersionId: text("parent_version_id"),
		parentProjectId: text("parent_project_id"),
		parentOwnerUserId: text("parent_owner_user_id"),
		createdByUserId: text("created_by_user_id").references(() => users.id, {
			onDelete: "set null",
			onUpdate: "cascade",
		}),
		revision: integer("revision").notNull(),
		status: storyGraphStatusEnum("status").default("draft").notNull(),
		graph: jsonb("graph").$type<StructuredMetadata>().notNull(),
		provenance: jsonb("provenance")
			.$type<readonly EvidenceReference[]>()
			.default(sql`'[]'::jsonb`)
			.notNull(),
		contentFingerprint: text("content_fingerprint").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
	},
	(table) => [
		uniqueIndex("story_graph_versions_id_scope_unique").on(
			table.id,
			table.projectId,
			table.ownerUserId,
		),
		uniqueIndex("story_graph_versions_project_revision_unique").on(
			table.projectId,
			table.revision,
		),
		foreignKey({
			name: "story_graph_versions_project_scope_fk",
			columns: [table.projectId, table.ownerUserId],
			foreignColumns: [projects.id, projects.ownerUserId],
		})
			.onDelete("cascade")
			.onUpdate("cascade"),
		foreignKey({
			name: "story_graph_versions_parent_scope_fk",
			columns: [
				table.parentVersionId,
				table.parentProjectId,
				table.parentOwnerUserId,
			],
			foreignColumns: [table.id, table.projectId, table.ownerUserId],
		})
			.onDelete("set null")
			.onUpdate("cascade"),
		index("story_graph_versions_project_status_idx").on(
			table.projectId,
			table.status,
			table.createdAt,
		),
		check("story_graph_versions_revision_positive", sql`${table.revision} > 0`),
		check(
			"story_graph_versions_parent_scope_consistent",
			sql`(
				(
					${table.parentVersionId} IS NULL
					AND ${table.parentProjectId} IS NULL
					AND ${table.parentOwnerUserId} IS NULL
				)
				OR (
					${table.parentVersionId} IS NOT NULL
					AND ${table.parentProjectId} = ${table.projectId}
					AND ${table.parentOwnerUserId} = ${table.ownerUserId}
				)
			)`,
		),
		check(
			"story_graph_versions_fingerprint_sha256",
			sql`${table.contentFingerprint} ~ '^[a-f0-9]{64}$'`,
		),
		check(
			"story_graph_versions_graph_safe_json",
			isSafeJsonObject(table.graph),
		),
		check(
			"story_graph_versions_provenance_safe_json",
			isSafeJsonArray(table.provenance),
		),
		pgPolicy("story_graph_versions_select_member", {
			for: "select",
			to: "public",
			using: canReadProject(table),
		}),
		pgPolicy("story_graph_versions_insert_editor", {
			for: "insert",
			to: "public",
			withCheck: canEditProject(table),
		}),
		pgPolicy("story_graph_versions_update_editor", {
			for: "update",
			to: "public",
			using: canEditProject(table),
			withCheck: canEditProject(table),
		}),
		pgPolicy("story_graph_versions_delete_owner", {
			for: "delete",
			to: "public",
			using: ownsScope(table.ownerUserId),
		}),
	],
).enableRLS();

export const aiSessions = pgTable(
	"ai_sessions",
	{
		id: text("id").primaryKey(),
		projectId: text("project_id").notNull(),
		ownerUserId: text("owner_user_id").notNull(),
		createdByUserId: text("created_by_user_id").references(() => users.id, {
			onDelete: "set null",
			onUpdate: "cascade",
		}),
		status: aiSessionStatusEnum("status").default("planning").notNull(),
		executionMode: aiExecutionModeEnum("execution_mode")
			.default("local")
			.notNull(),
		intent: text("intent").notNull(),
		providerId: text("provider_id"),
		modelId: text("model_id"),
		requestMetadata: jsonb("request_metadata")
			.$type<StructuredMetadata>()
			.default(sql`'{}'::jsonb`)
			.notNull(),
		revision: integer("revision").default(1).notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		startedAt: timestamp("started_at", { withTimezone: true }),
		completedAt: timestamp("completed_at", { withTimezone: true }),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		uniqueIndex("ai_sessions_id_project_scope_unique").on(
			table.id,
			table.projectId,
			table.ownerUserId,
		),
		foreignKey({
			name: "ai_sessions_project_scope_fk",
			columns: [table.projectId, table.ownerUserId],
			foreignColumns: [projects.id, projects.ownerUserId],
		})
			.onDelete("cascade")
			.onUpdate("cascade"),
		index("ai_sessions_project_status_idx").on(
			table.projectId,
			table.status,
			table.createdAt,
		),
		index("ai_sessions_creator_idx").on(table.createdByUserId, table.createdAt),
		check("ai_sessions_revision_positive", sql`${table.revision} > 0`),
		check(
			"ai_sessions_timestamps_consistent",
			sql`(
				${table.completedAt} IS NULL
				OR (
					${table.startedAt} IS NOT NULL
					AND ${table.completedAt} >= ${table.startedAt}
				)
			)`,
		),
		check(
			"ai_sessions_request_metadata_safe_json",
			isSafeJsonObject(table.requestMetadata),
		),
		pgPolicy("ai_sessions_select_member", {
			for: "select",
			to: "public",
			using: canReadProject(table),
		}),
		pgPolicy("ai_sessions_insert_editor", {
			for: "insert",
			to: "public",
			withCheck: canEditProject(table),
		}),
		pgPolicy("ai_sessions_update_editor", {
			for: "update",
			to: "public",
			using: canEditProject(table),
			withCheck: canEditProject(table),
		}),
		pgPolicy("ai_sessions_delete_owner", {
			for: "delete",
			to: "public",
			using: ownsScope(table.ownerUserId),
		}),
	],
).enableRLS();

export const agentArtifacts = pgTable(
	"agent_artifacts",
	{
		id: text("id").primaryKey(),
		projectId: text("project_id").notNull(),
		ownerUserId: text("owner_user_id").notNull(),
		aiSessionId: text("ai_session_id").notNull(),
		parentArtifactId: text("parent_artifact_id"),
		parentProjectId: text("parent_project_id"),
		parentOwnerUserId: text("parent_owner_user_id"),
		createdByUserId: text("created_by_user_id").references(() => users.id, {
			onDelete: "set null",
			onUpdate: "cascade",
		}),
		role: agentRoleEnum("role").notNull(),
		artifactKind: text("artifact_kind").notNull(),
		status: agentArtifactStatusEnum("status").default("candidate").notNull(),
		revision: integer("revision").notNull(),
		inputFingerprint: text("input_fingerprint").notNull(),
		artifactDigest: text("artifact_digest").notNull(),
		payload: jsonb("payload").$type<StructuredMetadata>().notNull(),
		evidence: jsonb("evidence")
			.$type<readonly EvidenceReference[]>()
			.default(sql`'[]'::jsonb`)
			.notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
	},
	(table) => [
		uniqueIndex("agent_artifacts_id_project_scope_unique").on(
			table.id,
			table.projectId,
			table.ownerUserId,
		),
		uniqueIndex("agent_artifacts_session_role_revision_unique").on(
			table.aiSessionId,
			table.role,
			table.revision,
		),
		foreignKey({
			name: "agent_artifacts_project_scope_fk",
			columns: [table.projectId, table.ownerUserId],
			foreignColumns: [projects.id, projects.ownerUserId],
		})
			.onDelete("cascade")
			.onUpdate("cascade"),
		foreignKey({
			name: "agent_artifacts_session_scope_fk",
			columns: [table.aiSessionId, table.projectId, table.ownerUserId],
			foreignColumns: [
				aiSessions.id,
				aiSessions.projectId,
				aiSessions.ownerUserId,
			],
		})
			.onDelete("restrict")
			.onUpdate("cascade"),
		foreignKey({
			name: "agent_artifacts_parent_scope_fk",
			columns: [
				table.parentArtifactId,
				table.parentProjectId,
				table.parentOwnerUserId,
			],
			foreignColumns: [table.id, table.projectId, table.ownerUserId],
		})
			.onDelete("set null")
			.onUpdate("cascade"),
		index("agent_artifacts_project_status_idx").on(
			table.projectId,
			table.status,
			table.createdAt,
		),
		index("agent_artifacts_session_idx").on(table.aiSessionId, table.createdAt),
		check("agent_artifacts_revision_positive", sql`${table.revision} > 0`),
		check(
			"agent_artifacts_parent_scope_consistent",
			sql`(
				(
					${table.parentArtifactId} IS NULL
					AND ${table.parentProjectId} IS NULL
					AND ${table.parentOwnerUserId} IS NULL
				)
				OR (
					${table.parentArtifactId} IS NOT NULL
					AND ${table.parentProjectId} = ${table.projectId}
					AND ${table.parentOwnerUserId} = ${table.ownerUserId}
				)
			)`,
		),
		check(
			"agent_artifacts_input_fingerprint_sha256",
			sql`${table.inputFingerprint} ~ '^[a-f0-9]{64}$'`,
		),
		check(
			"agent_artifacts_digest_sha256",
			sql`${table.artifactDigest} ~ '^[a-f0-9]{64}$'`,
		),
		check("agent_artifacts_payload_safe_json", isSafeJsonObject(table.payload)),
		check(
			"agent_artifacts_evidence_safe_json",
			isSafeJsonArray(table.evidence),
		),
		pgPolicy("agent_artifacts_select_member", {
			for: "select",
			to: "public",
			using: canReadProject(table),
		}),
		pgPolicy("agent_artifacts_insert_editor", {
			for: "insert",
			to: "public",
			withCheck: canEditProject(table),
		}),
		pgPolicy("agent_artifacts_update_editor", {
			for: "update",
			to: "public",
			using: canEditProject(table),
			withCheck: canEditProject(table),
		}),
		pgPolicy("agent_artifacts_delete_owner", {
			for: "delete",
			to: "public",
			using: ownsScope(table.ownerUserId),
		}),
	],
).enableRLS();

export const projectVersions = pgTable(
	"project_versions",
	{
		id: text("id").primaryKey(),
		projectId: text("project_id").notNull(),
		ownerUserId: text("owner_user_id").notNull(),
		parentVersionId: text("parent_version_id"),
		parentProjectId: text("parent_project_id"),
		parentOwnerUserId: text("parent_owner_user_id"),
		sourceAiSessionId: text("source_ai_session_id"),
		createdByUserId: text("created_by_user_id").references(() => users.id, {
			onDelete: "set null",
			onUpdate: "cascade",
		}),
		revision: integer("revision").notNull(),
		status: projectVersionStatusEnum("status").default("checkpoint").notNull(),
		label: text("label").notNull(),
		stateFingerprint: text("state_fingerprint").notNull(),
		state: jsonb("state").$type<StructuredMetadata>().notNull(),
		assetManifest: jsonb("asset_manifest")
			.$type<readonly AssetStorageReference[]>()
			.default(sql`'[]'::jsonb`)
			.notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		publishedAt: timestamp("published_at", { withTimezone: true }),
	},
	(table) => [
		uniqueIndex("project_versions_id_project_scope_unique").on(
			table.id,
			table.projectId,
			table.ownerUserId,
		),
		uniqueIndex("project_versions_project_revision_unique").on(
			table.projectId,
			table.revision,
		),
		foreignKey({
			name: "project_versions_project_scope_fk",
			columns: [table.projectId, table.ownerUserId],
			foreignColumns: [projects.id, projects.ownerUserId],
		})
			.onDelete("cascade")
			.onUpdate("cascade"),
		foreignKey({
			name: "project_versions_parent_scope_fk",
			columns: [
				table.parentVersionId,
				table.parentProjectId,
				table.parentOwnerUserId,
			],
			foreignColumns: [table.id, table.projectId, table.ownerUserId],
		})
			.onDelete("set null")
			.onUpdate("cascade"),
		foreignKey({
			name: "project_versions_source_ai_session_fk",
			columns: [table.sourceAiSessionId, table.projectId, table.ownerUserId],
			foreignColumns: [
				aiSessions.id,
				aiSessions.projectId,
				aiSessions.ownerUserId,
			],
		})
			.onDelete("restrict")
			.onUpdate("cascade"),
		index("project_versions_project_status_idx").on(
			table.projectId,
			table.status,
			table.createdAt,
		),
		check("project_versions_revision_positive", sql`${table.revision} > 0`),
		check(
			"project_versions_parent_scope_consistent",
			sql`(
				(
					${table.parentVersionId} IS NULL
					AND ${table.parentProjectId} IS NULL
					AND ${table.parentOwnerUserId} IS NULL
				)
				OR (
					${table.parentVersionId} IS NOT NULL
					AND ${table.parentProjectId} = ${table.projectId}
					AND ${table.parentOwnerUserId} = ${table.ownerUserId}
				)
			)`,
		),
		check(
			"project_versions_fingerprint_sha256",
			sql`${table.stateFingerprint} ~ '^[a-f0-9]{64}$'`,
		),
		check(
			"project_versions_published_state_consistent",
			sql`(
				(${table.status} = 'published' AND ${table.publishedAt} IS NOT NULL)
				OR (${table.status} <> 'published' AND ${table.publishedAt} IS NULL)
			)`,
		),
		check("project_versions_state_safe_json", isSafeJsonObject(table.state)),
		check(
			"project_versions_asset_manifest_safe_json",
			isSafeJsonArray(table.assetManifest),
		),
		pgPolicy("project_versions_select_member", {
			for: "select",
			to: "public",
			using: canReadProject(table),
		}),
		pgPolicy("project_versions_insert_editor", {
			for: "insert",
			to: "public",
			withCheck: canEditProject(table),
		}),
		pgPolicy("project_versions_update_editor", {
			for: "update",
			to: "public",
			using: canEditProject(table),
			withCheck: canEditProject(table),
		}),
		pgPolicy("project_versions_delete_owner", {
			for: "delete",
			to: "public",
			using: ownsScope(table.ownerUserId),
		}),
	],
).enableRLS();

export const creatorDnaProfiles = pgTable(
	"creator_dna_profiles",
	{
		id: text("id").primaryKey(),
		ownerUserId: text("owner_user_id")
			.notNull()
			.references(() => users.id, {
				onDelete: "cascade",
				onUpdate: "cascade",
			}),
		scope: creatorDnaScopeEnum("scope").default("global").notNull(),
		projectId: text("project_id"),
		projectOwnerUserId: text("project_owner_user_id"),
		status: creatorDnaStatusEnum("status").default("learning").notNull(),
		revision: integer("revision").default(1).notNull(),
		preferences: jsonb("preferences")
			.$type<StructuredMetadata>()
			.default(sql`'{}'::jsonb`)
			.notNull(),
		evidence: jsonb("evidence")
			.$type<readonly EvidenceReference[]>()
			.default(sql`'[]'::jsonb`)
			.notNull(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		lastLearnedAt: timestamp("last_learned_at", { withTimezone: true }),
	},
	(table) => [
		uniqueIndex("creator_dna_profiles_global_owner_unique")
			.on(table.ownerUserId)
			.where(sql`${table.scope} = 'global'`),
		uniqueIndex("creator_dna_profiles_project_owner_unique")
			.on(table.ownerUserId, table.projectId)
			.where(sql`${table.scope} = 'project'`),
		foreignKey({
			name: "creator_dna_profiles_project_scope_fk",
			columns: [table.projectId, table.projectOwnerUserId],
			foreignColumns: [projects.id, projects.ownerUserId],
		})
			.onDelete("cascade")
			.onUpdate("cascade"),
		index("creator_dna_profiles_owner_status_idx").on(
			table.ownerUserId,
			table.status,
		),
		check("creator_dna_profiles_revision_positive", sql`${table.revision} > 0`),
		check(
			"creator_dna_profiles_scope_consistent",
			sql`(
				(
					${table.scope} = 'global'
					AND ${table.projectId} IS NULL
					AND ${table.projectOwnerUserId} IS NULL
				)
				OR (
					${table.scope} = 'project'
					AND ${table.projectId} IS NOT NULL
					AND ${table.projectOwnerUserId} IS NOT NULL
				)
			)`,
		),
		check(
			"creator_dna_profiles_preferences_safe_json",
			isSafeJsonObject(table.preferences),
		),
		check(
			"creator_dna_profiles_evidence_safe_json",
			isSafeJsonArray(table.evidence),
		),
		pgPolicy("creator_dna_profiles_select_owner", {
			for: "select",
			to: "public",
			using: ownsScope(table.ownerUserId),
		}),
		pgPolicy("creator_dna_profiles_insert_owner", {
			for: "insert",
			to: "public",
			withCheck: ownsScope(table.ownerUserId),
		}),
		pgPolicy("creator_dna_profiles_update_owner", {
			for: "update",
			to: "public",
			using: ownsScope(table.ownerUserId),
			withCheck: ownsScope(table.ownerUserId),
		}),
		pgPolicy("creator_dna_profiles_delete_owner", {
			for: "delete",
			to: "public",
			using: ownsScope(table.ownerUserId),
		}),
	],
).enableRLS();
