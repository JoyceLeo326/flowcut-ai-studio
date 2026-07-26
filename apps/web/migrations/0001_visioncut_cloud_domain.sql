CREATE TYPE "public"."agent_artifact_status" AS ENUM('candidate', 'in_review', 'accepted', 'rejected', 'stale', 'failed');--> statement-breakpoint
CREATE TYPE "public"."agent_role" AS ENUM('director', 'story', 'camera', 'editor', 'color', 'sound', 'growth');--> statement-breakpoint
CREATE TYPE "public"."ai_execution_mode" AS ENUM('local', 'byok', 'managed_cloud');--> statement-breakpoint
CREATE TYPE "public"."ai_session_status" AS ENUM('planning', 'running', 'awaiting_review', 'completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."asset_kind" AS ENUM('video', 'audio', 'image', 'subtitle', 'other');--> statement-breakpoint
CREATE TYPE "public"."asset_source_kind" AS ENUM('local_reference', 'managed_object', 'generated');--> statement-breakpoint
CREATE TYPE "public"."asset_status" AS ENUM('pending', 'ready', 'failed', 'deleted');--> statement-breakpoint
CREATE TYPE "public"."creator_dna_scope" AS ENUM('global', 'project');--> statement-breakpoint
CREATE TYPE "public"."creator_dna_status" AS ENUM('learning', 'active', 'paused');--> statement-breakpoint
CREATE TYPE "public"."project_member_role" AS ENUM('owner', 'editor', 'reviewer', 'viewer');--> statement-breakpoint
CREATE TYPE "public"."project_member_status" AS ENUM('invited', 'active', 'suspended');--> statement-breakpoint
CREATE TYPE "public"."project_status" AS ENUM('active', 'archived', 'deleted');--> statement-breakpoint
CREATE TYPE "public"."project_version_status" AS ENUM('checkpoint', 'approved', 'published', 'archived');--> statement-breakpoint
CREATE TYPE "public"."project_visibility" AS ENUM('private', 'shared');--> statement-breakpoint
CREATE TYPE "public"."scene_kind" AS ENUM('primary', 'b_roll', 'audio', 'title', 'generated');--> statement-breakpoint
CREATE TYPE "public"."story_graph_status" AS ENUM('draft', 'in_review', 'approved', 'superseded');--> statement-breakpoint
CREATE TABLE "agent_artifacts" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"owner_user_id" text NOT NULL,
	"ai_session_id" text NOT NULL,
	"parent_artifact_id" text,
	"parent_project_id" text,
	"parent_owner_user_id" text,
	"created_by_user_id" text,
	"role" "agent_role" NOT NULL,
	"artifact_kind" text NOT NULL,
	"status" "agent_artifact_status" DEFAULT 'candidate' NOT NULL,
	"revision" integer NOT NULL,
	"input_fingerprint" text NOT NULL,
	"artifact_digest" text NOT NULL,
	"payload" jsonb NOT NULL,
	"evidence" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_at" timestamp with time zone,
	CONSTRAINT "agent_artifacts_revision_positive" CHECK ("agent_artifacts"."revision" > 0),
	CONSTRAINT "agent_artifacts_parent_scope_consistent" CHECK ((
				(
					"agent_artifacts"."parent_artifact_id" IS NULL
					AND "agent_artifacts"."parent_project_id" IS NULL
					AND "agent_artifacts"."parent_owner_user_id" IS NULL
				)
				OR (
					"agent_artifacts"."parent_artifact_id" IS NOT NULL
					AND "agent_artifacts"."parent_project_id" = "agent_artifacts"."project_id"
					AND "agent_artifacts"."parent_owner_user_id" = "agent_artifacts"."owner_user_id"
				)
			)),
	CONSTRAINT "agent_artifacts_input_fingerprint_sha256" CHECK ("agent_artifacts"."input_fingerprint" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "agent_artifacts_digest_sha256" CHECK ("agent_artifacts"."artifact_digest" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "agent_artifacts_payload_safe_json" CHECK ((
		jsonb_typeof("agent_artifacts"."payload") = 'object'
		AND NOT (
			"agent_artifacts"."payload"::text
			~* '"(api[_-]?key|authorization|session[_-]?byok[_-]?key|token|secret)"[[:space:]]*:'
		)
	)),
	CONSTRAINT "agent_artifacts_evidence_safe_json" CHECK ((
		jsonb_typeof("agent_artifacts"."evidence") = 'array'
		AND NOT (
			"agent_artifacts"."evidence"::text
			~* '"(api[_-]?key|authorization|session[_-]?byok[_-]?key|token|secret)"[[:space:]]*:'
		)
	))
);
--> statement-breakpoint
ALTER TABLE "agent_artifacts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "ai_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"owner_user_id" text NOT NULL,
	"created_by_user_id" text,
	"status" "ai_session_status" DEFAULT 'planning' NOT NULL,
	"execution_mode" "ai_execution_mode" DEFAULT 'local' NOT NULL,
	"intent" text NOT NULL,
	"provider_id" text,
	"model_id" text,
	"request_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_sessions_revision_positive" CHECK ("ai_sessions"."revision" > 0),
	CONSTRAINT "ai_sessions_timestamps_consistent" CHECK ((
				"ai_sessions"."completed_at" IS NULL
				OR (
					"ai_sessions"."started_at" IS NOT NULL
					AND "ai_sessions"."completed_at" >= "ai_sessions"."started_at"
				)
			)),
	CONSTRAINT "ai_sessions_request_metadata_safe_json" CHECK ((
		jsonb_typeof("ai_sessions"."request_metadata") = 'object'
		AND NOT (
			"ai_sessions"."request_metadata"::text
			~* '"(api[_-]?key|authorization|session[_-]?byok[_-]?key|token|secret)"[[:space:]]*:'
		)
	))
);
--> statement-breakpoint
ALTER TABLE "ai_sessions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "assets" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"owner_user_id" text NOT NULL,
	"created_by_user_id" text,
	"kind" "asset_kind" NOT NULL,
	"status" "asset_status" DEFAULT 'pending' NOT NULL,
	"source_kind" "asset_source_kind" NOT NULL,
	"file_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"byte_size" bigint NOT NULL,
	"duration_ms" bigint,
	"content_fingerprint" text NOT NULL,
	"storage_reference" jsonb NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "assets_revision_positive" CHECK ("assets"."revision" > 0),
	CONSTRAINT "assets_byte_size_nonnegative" CHECK ("assets"."byte_size" >= 0),
	CONSTRAINT "assets_duration_nonnegative" CHECK ("assets"."duration_ms" IS NULL OR "assets"."duration_ms" >= 0),
	CONSTRAINT "assets_fingerprint_sha256" CHECK ("assets"."content_fingerprint" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "assets_storage_reference_safe_json" CHECK ((
		jsonb_typeof("assets"."storage_reference") = 'object'
		AND NOT (
			"assets"."storage_reference"::text
			~* '"(api[_-]?key|authorization|session[_-]?byok[_-]?key|token|secret)"[[:space:]]*:'
		)
	)),
	CONSTRAINT "assets_metadata_safe_json" CHECK ((
		jsonb_typeof("assets"."metadata") = 'object'
		AND NOT (
			"assets"."metadata"::text
			~* '"(api[_-]?key|authorization|session[_-]?byok[_-]?key|token|secret)"[[:space:]]*:'
		)
	)),
	CONSTRAINT "assets_deleted_state_consistent" CHECK ((
				("assets"."status" = 'deleted' AND "assets"."deleted_at" IS NOT NULL)
				OR ("assets"."status" <> 'deleted' AND "assets"."deleted_at" IS NULL)
			))
);
--> statement-breakpoint
ALTER TABLE "assets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "creator_dna_profiles" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_user_id" text NOT NULL,
	"scope" "creator_dna_scope" DEFAULT 'global' NOT NULL,
	"project_id" text,
	"project_owner_user_id" text,
	"status" "creator_dna_status" DEFAULT 'learning' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"preferences" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"evidence" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_learned_at" timestamp with time zone,
	CONSTRAINT "creator_dna_profiles_revision_positive" CHECK ("creator_dna_profiles"."revision" > 0),
	CONSTRAINT "creator_dna_profiles_scope_consistent" CHECK ((
				(
					"creator_dna_profiles"."scope" = 'global'
					AND "creator_dna_profiles"."project_id" IS NULL
					AND "creator_dna_profiles"."project_owner_user_id" IS NULL
				)
				OR (
					"creator_dna_profiles"."scope" = 'project'
					AND "creator_dna_profiles"."project_id" IS NOT NULL
					AND "creator_dna_profiles"."project_owner_user_id" IS NOT NULL
				)
			)),
	CONSTRAINT "creator_dna_profiles_preferences_safe_json" CHECK ((
		jsonb_typeof("creator_dna_profiles"."preferences") = 'object'
		AND NOT (
			"creator_dna_profiles"."preferences"::text
			~* '"(api[_-]?key|authorization|session[_-]?byok[_-]?key|token|secret)"[[:space:]]*:'
		)
	)),
	CONSTRAINT "creator_dna_profiles_evidence_safe_json" CHECK ((
		jsonb_typeof("creator_dna_profiles"."evidence") = 'array'
		AND NOT (
			"creator_dna_profiles"."evidence"::text
			~* '"(api[_-]?key|authorization|session[_-]?byok[_-]?key|token|secret)"[[:space:]]*:'
		)
	))
);
--> statement-breakpoint
ALTER TABLE "creator_dna_profiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "feedback" (
	"id" text PRIMARY KEY NOT NULL,
	"message" text NOT NULL,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_members" (
	"project_id" text NOT NULL,
	"owner_user_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" "project_member_role" NOT NULL,
	"status" "project_member_status" DEFAULT 'invited' NOT NULL,
	"invited_by_user_id" text,
	"revision" integer DEFAULT 1 NOT NULL,
	"invited_at" timestamp with time zone DEFAULT now() NOT NULL,
	"joined_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_members_project_user_pk" PRIMARY KEY("project_id","user_id"),
	CONSTRAINT "project_members_revision_positive" CHECK ("project_members"."revision" > 0),
	CONSTRAINT "project_members_owner_role_consistent" CHECK ((
				("project_members"."user_id" = "project_members"."owner_user_id" AND "project_members"."role" = 'owner')
				OR ("project_members"."user_id" <> "project_members"."owner_user_id" AND "project_members"."role" <> 'owner')
			)),
	CONSTRAINT "project_members_joined_state_consistent" CHECK ((
				("project_members"."status" = 'active' AND "project_members"."joined_at" IS NOT NULL)
				OR ("project_members"."status" <> 'active')
			))
);
--> statement-breakpoint
ALTER TABLE "project_members" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "project_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"owner_user_id" text NOT NULL,
	"parent_version_id" text,
	"parent_project_id" text,
	"parent_owner_user_id" text,
	"source_ai_session_id" text,
	"created_by_user_id" text,
	"revision" integer NOT NULL,
	"status" "project_version_status" DEFAULT 'checkpoint' NOT NULL,
	"label" text NOT NULL,
	"state_fingerprint" text NOT NULL,
	"state" jsonb NOT NULL,
	"asset_manifest" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone,
	CONSTRAINT "project_versions_revision_positive" CHECK ("project_versions"."revision" > 0),
	CONSTRAINT "project_versions_parent_scope_consistent" CHECK ((
				(
					"project_versions"."parent_version_id" IS NULL
					AND "project_versions"."parent_project_id" IS NULL
					AND "project_versions"."parent_owner_user_id" IS NULL
				)
				OR (
					"project_versions"."parent_version_id" IS NOT NULL
					AND "project_versions"."parent_project_id" = "project_versions"."project_id"
					AND "project_versions"."parent_owner_user_id" = "project_versions"."owner_user_id"
				)
			)),
	CONSTRAINT "project_versions_fingerprint_sha256" CHECK ("project_versions"."state_fingerprint" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "project_versions_published_state_consistent" CHECK ((
				("project_versions"."status" = 'published' AND "project_versions"."published_at" IS NOT NULL)
				OR ("project_versions"."status" <> 'published' AND "project_versions"."published_at" IS NULL)
			)),
	CONSTRAINT "project_versions_state_safe_json" CHECK ((
		jsonb_typeof("project_versions"."state") = 'object'
		AND NOT (
			"project_versions"."state"::text
			~* '"(api[_-]?key|authorization|session[_-]?byok[_-]?key|token|secret)"[[:space:]]*:'
		)
	)),
	CONSTRAINT "project_versions_asset_manifest_safe_json" CHECK ((
		jsonb_typeof("project_versions"."asset_manifest") = 'array'
		AND NOT (
			"project_versions"."asset_manifest"::text
			~* '"(api[_-]?key|authorization|session[_-]?byok[_-]?key|token|secret)"[[:space:]]*:'
		)
	))
);
--> statement-breakpoint
ALTER TABLE "project_versions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "projects" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_user_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"status" "project_status" DEFAULT 'active' NOT NULL,
	"visibility" "project_visibility" DEFAULT 'private' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "projects_revision_positive" CHECK ("projects"."revision" > 0),
	CONSTRAINT "projects_settings_safe_json" CHECK ((
		jsonb_typeof("projects"."settings") = 'object'
		AND NOT (
			"projects"."settings"::text
			~* '"(api[_-]?key|authorization|session[_-]?byok[_-]?key|token|secret)"[[:space:]]*:'
		)
	)),
	CONSTRAINT "projects_lifecycle_consistent" CHECK ((
				("projects"."status" = 'active' AND "projects"."archived_at" IS NULL AND "projects"."deleted_at" IS NULL)
				OR ("projects"."status" = 'archived' AND "projects"."archived_at" IS NOT NULL AND "projects"."deleted_at" IS NULL)
				OR ("projects"."status" = 'deleted' AND "projects"."deleted_at" IS NOT NULL)
			))
);
--> statement-breakpoint
ALTER TABLE "projects" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "scenes" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"owner_user_id" text NOT NULL,
	"asset_id" text,
	"created_by_user_id" text,
	"kind" "scene_kind" NOT NULL,
	"title" text NOT NULL,
	"story_order" integer NOT NULL,
	"source_in_ms" bigint,
	"source_out_ms" bigint,
	"timeline_start_ms" bigint DEFAULT 0 NOT NULL,
	"duration_ms" bigint NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"evidence" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scenes_revision_positive" CHECK ("scenes"."revision" > 0),
	CONSTRAINT "scenes_story_order_nonnegative" CHECK ("scenes"."story_order" >= 0),
	CONSTRAINT "scenes_timeline_values_valid" CHECK ("scenes"."timeline_start_ms" >= 0 AND "scenes"."duration_ms" > 0),
	CONSTRAINT "scenes_source_range_complete" CHECK ((
				("scenes"."asset_id" IS NULL AND "scenes"."source_in_ms" IS NULL AND "scenes"."source_out_ms" IS NULL)
				OR (
					"scenes"."asset_id" IS NOT NULL
					AND "scenes"."source_in_ms" IS NOT NULL
					AND "scenes"."source_out_ms" IS NOT NULL
					AND "scenes"."source_in_ms" >= 0
					AND "scenes"."source_out_ms" > "scenes"."source_in_ms"
				)
			)),
	CONSTRAINT "scenes_metadata_safe_json" CHECK ((
		jsonb_typeof("scenes"."metadata") = 'object'
		AND NOT (
			"scenes"."metadata"::text
			~* '"(api[_-]?key|authorization|session[_-]?byok[_-]?key|token|secret)"[[:space:]]*:'
		)
	)),
	CONSTRAINT "scenes_evidence_safe_json" CHECK ((
		jsonb_typeof("scenes"."evidence") = 'array'
		AND NOT (
			"scenes"."evidence"::text
			~* '"(api[_-]?key|authorization|session[_-]?byok[_-]?key|token|secret)"[[:space:]]*:'
		)
	))
);
--> statement-breakpoint
ALTER TABLE "scenes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "story_graph_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"owner_user_id" text NOT NULL,
	"parent_version_id" text,
	"parent_project_id" text,
	"parent_owner_user_id" text,
	"created_by_user_id" text,
	"revision" integer NOT NULL,
	"status" "story_graph_status" DEFAULT 'draft' NOT NULL,
	"graph" jsonb NOT NULL,
	"provenance" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"content_fingerprint" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_at" timestamp with time zone,
	CONSTRAINT "story_graph_versions_revision_positive" CHECK ("story_graph_versions"."revision" > 0),
	CONSTRAINT "story_graph_versions_parent_scope_consistent" CHECK ((
				(
					"story_graph_versions"."parent_version_id" IS NULL
					AND "story_graph_versions"."parent_project_id" IS NULL
					AND "story_graph_versions"."parent_owner_user_id" IS NULL
				)
				OR (
					"story_graph_versions"."parent_version_id" IS NOT NULL
					AND "story_graph_versions"."parent_project_id" = "story_graph_versions"."project_id"
					AND "story_graph_versions"."parent_owner_user_id" = "story_graph_versions"."owner_user_id"
				)
			)),
	CONSTRAINT "story_graph_versions_fingerprint_sha256" CHECK ("story_graph_versions"."content_fingerprint" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "story_graph_versions_graph_safe_json" CHECK ((
		jsonb_typeof("story_graph_versions"."graph") = 'object'
		AND NOT (
			"story_graph_versions"."graph"::text
			~* '"(api[_-]?key|authorization|session[_-]?byok[_-]?key|token|secret)"[[:space:]]*:'
		)
	)),
	CONSTRAINT "story_graph_versions_provenance_safe_json" CHECK ((
		jsonb_typeof("story_graph_versions"."provenance") = 'array'
		AND NOT (
			"story_graph_versions"."provenance"::text
			~* '"(api[_-]?key|authorization|session[_-]?byok[_-]?key|token|secret)"[[:space:]]*:'
		)
	))
);
--> statement-breakpoint
ALTER TABLE "story_graph_versions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "email_verified" SET DEFAULT false;--> statement-breakpoint
ALTER TABLE "agent_artifacts" ADD CONSTRAINT "agent_artifacts_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "agent_artifacts" ADD CONSTRAINT "agent_artifacts_project_scope_fk" FOREIGN KEY ("project_id","owner_user_id") REFERENCES "public"."projects"("id","owner_user_id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "agent_artifacts" ADD CONSTRAINT "agent_artifacts_session_scope_fk" FOREIGN KEY ("ai_session_id","project_id","owner_user_id") REFERENCES "public"."ai_sessions"("id","project_id","owner_user_id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "agent_artifacts" ADD CONSTRAINT "agent_artifacts_parent_scope_fk" FOREIGN KEY ("parent_artifact_id","parent_project_id","parent_owner_user_id") REFERENCES "public"."agent_artifacts"("id","project_id","owner_user_id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "ai_sessions" ADD CONSTRAINT "ai_sessions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "ai_sessions" ADD CONSTRAINT "ai_sessions_project_scope_fk" FOREIGN KEY ("project_id","owner_user_id") REFERENCES "public"."projects"("id","owner_user_id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_project_scope_fk" FOREIGN KEY ("project_id","owner_user_id") REFERENCES "public"."projects"("id","owner_user_id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "creator_dna_profiles" ADD CONSTRAINT "creator_dna_profiles_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "creator_dna_profiles" ADD CONSTRAINT "creator_dna_profiles_project_scope_fk" FOREIGN KEY ("project_id","project_owner_user_id") REFERENCES "public"."projects"("id","owner_user_id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_invited_by_user_id_users_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_project_scope_fk" FOREIGN KEY ("project_id","owner_user_id") REFERENCES "public"."projects"("id","owner_user_id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "project_versions" ADD CONSTRAINT "project_versions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "project_versions" ADD CONSTRAINT "project_versions_project_scope_fk" FOREIGN KEY ("project_id","owner_user_id") REFERENCES "public"."projects"("id","owner_user_id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "project_versions" ADD CONSTRAINT "project_versions_parent_scope_fk" FOREIGN KEY ("parent_version_id","parent_project_id","parent_owner_user_id") REFERENCES "public"."project_versions"("id","project_id","owner_user_id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "project_versions" ADD CONSTRAINT "project_versions_source_ai_session_fk" FOREIGN KEY ("source_ai_session_id","project_id","owner_user_id") REFERENCES "public"."ai_sessions"("id","project_id","owner_user_id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "scenes" ADD CONSTRAINT "scenes_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "scenes" ADD CONSTRAINT "scenes_project_scope_fk" FOREIGN KEY ("project_id","owner_user_id") REFERENCES "public"."projects"("id","owner_user_id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "scenes" ADD CONSTRAINT "scenes_asset_scope_fk" FOREIGN KEY ("asset_id","project_id","owner_user_id") REFERENCES "public"."assets"("id","project_id","owner_user_id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "story_graph_versions" ADD CONSTRAINT "story_graph_versions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "story_graph_versions" ADD CONSTRAINT "story_graph_versions_project_scope_fk" FOREIGN KEY ("project_id","owner_user_id") REFERENCES "public"."projects"("id","owner_user_id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "story_graph_versions" ADD CONSTRAINT "story_graph_versions_parent_scope_fk" FOREIGN KEY ("parent_version_id","parent_project_id","parent_owner_user_id") REFERENCES "public"."story_graph_versions"("id","project_id","owner_user_id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_artifacts_id_project_scope_unique" ON "agent_artifacts" USING btree ("id","project_id","owner_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_artifacts_session_role_revision_unique" ON "agent_artifacts" USING btree ("ai_session_id","role","revision");--> statement-breakpoint
CREATE INDEX "agent_artifacts_project_status_idx" ON "agent_artifacts" USING btree ("project_id","status","created_at");--> statement-breakpoint
CREATE INDEX "agent_artifacts_session_idx" ON "agent_artifacts" USING btree ("ai_session_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_sessions_id_project_scope_unique" ON "ai_sessions" USING btree ("id","project_id","owner_user_id");--> statement-breakpoint
CREATE INDEX "ai_sessions_project_status_idx" ON "ai_sessions" USING btree ("project_id","status","created_at");--> statement-breakpoint
CREATE INDEX "ai_sessions_creator_idx" ON "ai_sessions" USING btree ("created_by_user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "assets_id_project_scope_unique" ON "assets" USING btree ("id","project_id","owner_user_id");--> statement-breakpoint
CREATE INDEX "assets_project_status_kind_idx" ON "assets" USING btree ("project_id","status","kind");--> statement-breakpoint
CREATE INDEX "assets_project_created_idx" ON "assets" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE INDEX "assets_content_fingerprint_idx" ON "assets" USING btree ("content_fingerprint");--> statement-breakpoint
CREATE UNIQUE INDEX "creator_dna_profiles_global_owner_unique" ON "creator_dna_profiles" USING btree ("owner_user_id") WHERE "creator_dna_profiles"."scope" = 'global';--> statement-breakpoint
CREATE UNIQUE INDEX "creator_dna_profiles_project_owner_unique" ON "creator_dna_profiles" USING btree ("owner_user_id","project_id") WHERE "creator_dna_profiles"."scope" = 'project';--> statement-breakpoint
CREATE INDEX "creator_dna_profiles_owner_status_idx" ON "creator_dna_profiles" USING btree ("owner_user_id","status");--> statement-breakpoint
CREATE INDEX "project_members_user_status_idx" ON "project_members" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "project_members_project_role_idx" ON "project_members" USING btree ("project_id","role","status");--> statement-breakpoint
CREATE UNIQUE INDEX "project_versions_id_project_scope_unique" ON "project_versions" USING btree ("id","project_id","owner_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "project_versions_project_revision_unique" ON "project_versions" USING btree ("project_id","revision");--> statement-breakpoint
CREATE INDEX "project_versions_project_status_idx" ON "project_versions" USING btree ("project_id","status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "projects_id_owner_scope_unique" ON "projects" USING btree ("id","owner_user_id");--> statement-breakpoint
CREATE INDEX "projects_owner_updated_idx" ON "projects" USING btree ("owner_user_id","updated_at");--> statement-breakpoint
CREATE INDEX "projects_owner_status_idx" ON "projects" USING btree ("owner_user_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "scenes_id_project_scope_unique" ON "scenes" USING btree ("id","project_id","owner_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "scenes_project_story_order_unique" ON "scenes" USING btree ("project_id","story_order");--> statement-breakpoint
CREATE INDEX "scenes_project_timeline_idx" ON "scenes" USING btree ("project_id","timeline_start_ms");--> statement-breakpoint
CREATE INDEX "scenes_asset_idx" ON "scenes" USING btree ("asset_id");--> statement-breakpoint
CREATE UNIQUE INDEX "story_graph_versions_id_scope_unique" ON "story_graph_versions" USING btree ("id","project_id","owner_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "story_graph_versions_project_revision_unique" ON "story_graph_versions" USING btree ("project_id","revision");--> statement-breakpoint
CREATE INDEX "story_graph_versions_project_status_idx" ON "story_graph_versions" USING btree ("project_id","status","created_at");--> statement-breakpoint
CREATE POLICY "agent_artifacts_select_member" ON "agent_artifacts" AS PERMISSIVE FOR SELECT TO public USING ((
		"agent_artifacts"."owner_user_id" = nullif(current_setting('app.current_user_id', true), '')
		OR EXISTS (
			SELECT 1
			FROM "project_members" AS "visioncut_member"
			WHERE "visioncut_member"."project_id" = "agent_artifacts"."project_id"
				AND "visioncut_member"."owner_user_id" = "agent_artifacts"."owner_user_id"
				AND "visioncut_member"."user_id" = nullif(current_setting('app.current_user_id', true), '')
				AND "visioncut_member"."status" = 'active'
		)
	));--> statement-breakpoint
CREATE POLICY "agent_artifacts_insert_editor" ON "agent_artifacts" AS PERMISSIVE FOR INSERT TO public WITH CHECK ((
		"agent_artifacts"."owner_user_id" = nullif(current_setting('app.current_user_id', true), '')
		OR EXISTS (
			SELECT 1
			FROM "project_members" AS "visioncut_member"
			WHERE "visioncut_member"."project_id" = "agent_artifacts"."project_id"
				AND "visioncut_member"."owner_user_id" = "agent_artifacts"."owner_user_id"
				AND "visioncut_member"."user_id" = nullif(current_setting('app.current_user_id', true), '')
				AND "visioncut_member"."status" = 'active'
				AND "visioncut_member"."role" IN ('owner', 'editor')
		)
	));--> statement-breakpoint
CREATE POLICY "agent_artifacts_update_editor" ON "agent_artifacts" AS PERMISSIVE FOR UPDATE TO public USING ((
		"agent_artifacts"."owner_user_id" = nullif(current_setting('app.current_user_id', true), '')
		OR EXISTS (
			SELECT 1
			FROM "project_members" AS "visioncut_member"
			WHERE "visioncut_member"."project_id" = "agent_artifacts"."project_id"
				AND "visioncut_member"."owner_user_id" = "agent_artifacts"."owner_user_id"
				AND "visioncut_member"."user_id" = nullif(current_setting('app.current_user_id', true), '')
				AND "visioncut_member"."status" = 'active'
				AND "visioncut_member"."role" IN ('owner', 'editor')
		)
	)) WITH CHECK ((
		"agent_artifacts"."owner_user_id" = nullif(current_setting('app.current_user_id', true), '')
		OR EXISTS (
			SELECT 1
			FROM "project_members" AS "visioncut_member"
			WHERE "visioncut_member"."project_id" = "agent_artifacts"."project_id"
				AND "visioncut_member"."owner_user_id" = "agent_artifacts"."owner_user_id"
				AND "visioncut_member"."user_id" = nullif(current_setting('app.current_user_id', true), '')
				AND "visioncut_member"."status" = 'active'
				AND "visioncut_member"."role" IN ('owner', 'editor')
		)
	));--> statement-breakpoint
CREATE POLICY "agent_artifacts_delete_owner" ON "agent_artifacts" AS PERMISSIVE FOR DELETE TO public USING (("agent_artifacts"."owner_user_id" = nullif(current_setting('app.current_user_id', true), '')));--> statement-breakpoint
CREATE POLICY "ai_sessions_select_member" ON "ai_sessions" AS PERMISSIVE FOR SELECT TO public USING ((
		"ai_sessions"."owner_user_id" = nullif(current_setting('app.current_user_id', true), '')
		OR EXISTS (
			SELECT 1
			FROM "project_members" AS "visioncut_member"
			WHERE "visioncut_member"."project_id" = "ai_sessions"."project_id"
				AND "visioncut_member"."owner_user_id" = "ai_sessions"."owner_user_id"
				AND "visioncut_member"."user_id" = nullif(current_setting('app.current_user_id', true), '')
				AND "visioncut_member"."status" = 'active'
		)
	));--> statement-breakpoint
CREATE POLICY "ai_sessions_insert_editor" ON "ai_sessions" AS PERMISSIVE FOR INSERT TO public WITH CHECK ((
		"ai_sessions"."owner_user_id" = nullif(current_setting('app.current_user_id', true), '')
		OR EXISTS (
			SELECT 1
			FROM "project_members" AS "visioncut_member"
			WHERE "visioncut_member"."project_id" = "ai_sessions"."project_id"
				AND "visioncut_member"."owner_user_id" = "ai_sessions"."owner_user_id"
				AND "visioncut_member"."user_id" = nullif(current_setting('app.current_user_id', true), '')
				AND "visioncut_member"."status" = 'active'
				AND "visioncut_member"."role" IN ('owner', 'editor')
		)
	));--> statement-breakpoint
CREATE POLICY "ai_sessions_update_editor" ON "ai_sessions" AS PERMISSIVE FOR UPDATE TO public USING ((
		"ai_sessions"."owner_user_id" = nullif(current_setting('app.current_user_id', true), '')
		OR EXISTS (
			SELECT 1
			FROM "project_members" AS "visioncut_member"
			WHERE "visioncut_member"."project_id" = "ai_sessions"."project_id"
				AND "visioncut_member"."owner_user_id" = "ai_sessions"."owner_user_id"
				AND "visioncut_member"."user_id" = nullif(current_setting('app.current_user_id', true), '')
				AND "visioncut_member"."status" = 'active'
				AND "visioncut_member"."role" IN ('owner', 'editor')
		)
	)) WITH CHECK ((
		"ai_sessions"."owner_user_id" = nullif(current_setting('app.current_user_id', true), '')
		OR EXISTS (
			SELECT 1
			FROM "project_members" AS "visioncut_member"
			WHERE "visioncut_member"."project_id" = "ai_sessions"."project_id"
				AND "visioncut_member"."owner_user_id" = "ai_sessions"."owner_user_id"
				AND "visioncut_member"."user_id" = nullif(current_setting('app.current_user_id', true), '')
				AND "visioncut_member"."status" = 'active'
				AND "visioncut_member"."role" IN ('owner', 'editor')
		)
	));--> statement-breakpoint
CREATE POLICY "ai_sessions_delete_owner" ON "ai_sessions" AS PERMISSIVE FOR DELETE TO public USING (("ai_sessions"."owner_user_id" = nullif(current_setting('app.current_user_id', true), '')));--> statement-breakpoint
CREATE POLICY "assets_select_member" ON "assets" AS PERMISSIVE FOR SELECT TO public USING ((
		"assets"."owner_user_id" = nullif(current_setting('app.current_user_id', true), '')
		OR EXISTS (
			SELECT 1
			FROM "project_members" AS "visioncut_member"
			WHERE "visioncut_member"."project_id" = "assets"."project_id"
				AND "visioncut_member"."owner_user_id" = "assets"."owner_user_id"
				AND "visioncut_member"."user_id" = nullif(current_setting('app.current_user_id', true), '')
				AND "visioncut_member"."status" = 'active'
		)
	));--> statement-breakpoint
CREATE POLICY "assets_insert_editor" ON "assets" AS PERMISSIVE FOR INSERT TO public WITH CHECK ((
		"assets"."owner_user_id" = nullif(current_setting('app.current_user_id', true), '')
		OR EXISTS (
			SELECT 1
			FROM "project_members" AS "visioncut_member"
			WHERE "visioncut_member"."project_id" = "assets"."project_id"
				AND "visioncut_member"."owner_user_id" = "assets"."owner_user_id"
				AND "visioncut_member"."user_id" = nullif(current_setting('app.current_user_id', true), '')
				AND "visioncut_member"."status" = 'active'
				AND "visioncut_member"."role" IN ('owner', 'editor')
		)
	));--> statement-breakpoint
CREATE POLICY "assets_update_editor" ON "assets" AS PERMISSIVE FOR UPDATE TO public USING ((
		"assets"."owner_user_id" = nullif(current_setting('app.current_user_id', true), '')
		OR EXISTS (
			SELECT 1
			FROM "project_members" AS "visioncut_member"
			WHERE "visioncut_member"."project_id" = "assets"."project_id"
				AND "visioncut_member"."owner_user_id" = "assets"."owner_user_id"
				AND "visioncut_member"."user_id" = nullif(current_setting('app.current_user_id', true), '')
				AND "visioncut_member"."status" = 'active'
				AND "visioncut_member"."role" IN ('owner', 'editor')
		)
	)) WITH CHECK ((
		"assets"."owner_user_id" = nullif(current_setting('app.current_user_id', true), '')
		OR EXISTS (
			SELECT 1
			FROM "project_members" AS "visioncut_member"
			WHERE "visioncut_member"."project_id" = "assets"."project_id"
				AND "visioncut_member"."owner_user_id" = "assets"."owner_user_id"
				AND "visioncut_member"."user_id" = nullif(current_setting('app.current_user_id', true), '')
				AND "visioncut_member"."status" = 'active'
				AND "visioncut_member"."role" IN ('owner', 'editor')
		)
	));--> statement-breakpoint
CREATE POLICY "assets_delete_editor" ON "assets" AS PERMISSIVE FOR DELETE TO public USING ((
		"assets"."owner_user_id" = nullif(current_setting('app.current_user_id', true), '')
		OR EXISTS (
			SELECT 1
			FROM "project_members" AS "visioncut_member"
			WHERE "visioncut_member"."project_id" = "assets"."project_id"
				AND "visioncut_member"."owner_user_id" = "assets"."owner_user_id"
				AND "visioncut_member"."user_id" = nullif(current_setting('app.current_user_id', true), '')
				AND "visioncut_member"."status" = 'active'
				AND "visioncut_member"."role" IN ('owner', 'editor')
		)
	));--> statement-breakpoint
CREATE POLICY "creator_dna_profiles_select_owner" ON "creator_dna_profiles" AS PERMISSIVE FOR SELECT TO public USING (("creator_dna_profiles"."owner_user_id" = nullif(current_setting('app.current_user_id', true), '')));--> statement-breakpoint
CREATE POLICY "creator_dna_profiles_insert_owner" ON "creator_dna_profiles" AS PERMISSIVE FOR INSERT TO public WITH CHECK (("creator_dna_profiles"."owner_user_id" = nullif(current_setting('app.current_user_id', true), '')));--> statement-breakpoint
CREATE POLICY "creator_dna_profiles_update_owner" ON "creator_dna_profiles" AS PERMISSIVE FOR UPDATE TO public USING (("creator_dna_profiles"."owner_user_id" = nullif(current_setting('app.current_user_id', true), ''))) WITH CHECK (("creator_dna_profiles"."owner_user_id" = nullif(current_setting('app.current_user_id', true), '')));--> statement-breakpoint
CREATE POLICY "creator_dna_profiles_delete_owner" ON "creator_dna_profiles" AS PERMISSIVE FOR DELETE TO public USING (("creator_dna_profiles"."owner_user_id" = nullif(current_setting('app.current_user_id', true), '')));--> statement-breakpoint
CREATE POLICY "project_members_select_participant" ON "project_members" AS PERMISSIVE FOR SELECT TO public USING ((
				"project_members"."owner_user_id" = nullif(current_setting('app.current_user_id', true), '')
				OR "project_members"."user_id" = nullif(current_setting('app.current_user_id', true), '')
			));--> statement-breakpoint
CREATE POLICY "project_members_insert_owner" ON "project_members" AS PERMISSIVE FOR INSERT TO public WITH CHECK (("project_members"."owner_user_id" = nullif(current_setting('app.current_user_id', true), '')));--> statement-breakpoint
CREATE POLICY "project_members_update_owner" ON "project_members" AS PERMISSIVE FOR UPDATE TO public USING (("project_members"."owner_user_id" = nullif(current_setting('app.current_user_id', true), ''))) WITH CHECK (("project_members"."owner_user_id" = nullif(current_setting('app.current_user_id', true), '')));--> statement-breakpoint
CREATE POLICY "project_members_delete_owner" ON "project_members" AS PERMISSIVE FOR DELETE TO public USING (("project_members"."owner_user_id" = nullif(current_setting('app.current_user_id', true), '')));--> statement-breakpoint
CREATE POLICY "project_versions_select_member" ON "project_versions" AS PERMISSIVE FOR SELECT TO public USING ((
		"project_versions"."owner_user_id" = nullif(current_setting('app.current_user_id', true), '')
		OR EXISTS (
			SELECT 1
			FROM "project_members" AS "visioncut_member"
			WHERE "visioncut_member"."project_id" = "project_versions"."project_id"
				AND "visioncut_member"."owner_user_id" = "project_versions"."owner_user_id"
				AND "visioncut_member"."user_id" = nullif(current_setting('app.current_user_id', true), '')
				AND "visioncut_member"."status" = 'active'
		)
	));--> statement-breakpoint
CREATE POLICY "project_versions_insert_editor" ON "project_versions" AS PERMISSIVE FOR INSERT TO public WITH CHECK ((
		"project_versions"."owner_user_id" = nullif(current_setting('app.current_user_id', true), '')
		OR EXISTS (
			SELECT 1
			FROM "project_members" AS "visioncut_member"
			WHERE "visioncut_member"."project_id" = "project_versions"."project_id"
				AND "visioncut_member"."owner_user_id" = "project_versions"."owner_user_id"
				AND "visioncut_member"."user_id" = nullif(current_setting('app.current_user_id', true), '')
				AND "visioncut_member"."status" = 'active'
				AND "visioncut_member"."role" IN ('owner', 'editor')
		)
	));--> statement-breakpoint
CREATE POLICY "project_versions_update_editor" ON "project_versions" AS PERMISSIVE FOR UPDATE TO public USING ((
		"project_versions"."owner_user_id" = nullif(current_setting('app.current_user_id', true), '')
		OR EXISTS (
			SELECT 1
			FROM "project_members" AS "visioncut_member"
			WHERE "visioncut_member"."project_id" = "project_versions"."project_id"
				AND "visioncut_member"."owner_user_id" = "project_versions"."owner_user_id"
				AND "visioncut_member"."user_id" = nullif(current_setting('app.current_user_id', true), '')
				AND "visioncut_member"."status" = 'active'
				AND "visioncut_member"."role" IN ('owner', 'editor')
		)
	)) WITH CHECK ((
		"project_versions"."owner_user_id" = nullif(current_setting('app.current_user_id', true), '')
		OR EXISTS (
			SELECT 1
			FROM "project_members" AS "visioncut_member"
			WHERE "visioncut_member"."project_id" = "project_versions"."project_id"
				AND "visioncut_member"."owner_user_id" = "project_versions"."owner_user_id"
				AND "visioncut_member"."user_id" = nullif(current_setting('app.current_user_id', true), '')
				AND "visioncut_member"."status" = 'active'
				AND "visioncut_member"."role" IN ('owner', 'editor')
		)
	));--> statement-breakpoint
CREATE POLICY "project_versions_delete_owner" ON "project_versions" AS PERMISSIVE FOR DELETE TO public USING (("project_versions"."owner_user_id" = nullif(current_setting('app.current_user_id', true), '')));--> statement-breakpoint
CREATE POLICY "projects_select_member" ON "projects" AS PERMISSIVE FOR SELECT TO public USING ((
		"projects"."owner_user_id" = nullif(current_setting('app.current_user_id', true), '')
		OR EXISTS (
			SELECT 1
			FROM "project_members" AS "visioncut_member"
			WHERE "visioncut_member"."project_id" = "projects"."id"
				AND "visioncut_member"."owner_user_id" = "projects"."owner_user_id"
				AND "visioncut_member"."user_id" = nullif(current_setting('app.current_user_id', true), '')
				AND "visioncut_member"."status" = 'active'
		)
	));--> statement-breakpoint
CREATE POLICY "projects_insert_owner" ON "projects" AS PERMISSIVE FOR INSERT TO public WITH CHECK (("projects"."owner_user_id" = nullif(current_setting('app.current_user_id', true), '')));--> statement-breakpoint
CREATE POLICY "projects_update_owner" ON "projects" AS PERMISSIVE FOR UPDATE TO public USING (("projects"."owner_user_id" = nullif(current_setting('app.current_user_id', true), ''))) WITH CHECK (("projects"."owner_user_id" = nullif(current_setting('app.current_user_id', true), '')));--> statement-breakpoint
CREATE POLICY "projects_delete_owner" ON "projects" AS PERMISSIVE FOR DELETE TO public USING (("projects"."owner_user_id" = nullif(current_setting('app.current_user_id', true), '')));--> statement-breakpoint
CREATE POLICY "scenes_select_member" ON "scenes" AS PERMISSIVE FOR SELECT TO public USING ((
		"scenes"."owner_user_id" = nullif(current_setting('app.current_user_id', true), '')
		OR EXISTS (
			SELECT 1
			FROM "project_members" AS "visioncut_member"
			WHERE "visioncut_member"."project_id" = "scenes"."project_id"
				AND "visioncut_member"."owner_user_id" = "scenes"."owner_user_id"
				AND "visioncut_member"."user_id" = nullif(current_setting('app.current_user_id', true), '')
				AND "visioncut_member"."status" = 'active'
		)
	));--> statement-breakpoint
CREATE POLICY "scenes_insert_editor" ON "scenes" AS PERMISSIVE FOR INSERT TO public WITH CHECK ((
		"scenes"."owner_user_id" = nullif(current_setting('app.current_user_id', true), '')
		OR EXISTS (
			SELECT 1
			FROM "project_members" AS "visioncut_member"
			WHERE "visioncut_member"."project_id" = "scenes"."project_id"
				AND "visioncut_member"."owner_user_id" = "scenes"."owner_user_id"
				AND "visioncut_member"."user_id" = nullif(current_setting('app.current_user_id', true), '')
				AND "visioncut_member"."status" = 'active'
				AND "visioncut_member"."role" IN ('owner', 'editor')
		)
	));--> statement-breakpoint
CREATE POLICY "scenes_update_editor" ON "scenes" AS PERMISSIVE FOR UPDATE TO public USING ((
		"scenes"."owner_user_id" = nullif(current_setting('app.current_user_id', true), '')
		OR EXISTS (
			SELECT 1
			FROM "project_members" AS "visioncut_member"
			WHERE "visioncut_member"."project_id" = "scenes"."project_id"
				AND "visioncut_member"."owner_user_id" = "scenes"."owner_user_id"
				AND "visioncut_member"."user_id" = nullif(current_setting('app.current_user_id', true), '')
				AND "visioncut_member"."status" = 'active'
				AND "visioncut_member"."role" IN ('owner', 'editor')
		)
	)) WITH CHECK ((
		"scenes"."owner_user_id" = nullif(current_setting('app.current_user_id', true), '')
		OR EXISTS (
			SELECT 1
			FROM "project_members" AS "visioncut_member"
			WHERE "visioncut_member"."project_id" = "scenes"."project_id"
				AND "visioncut_member"."owner_user_id" = "scenes"."owner_user_id"
				AND "visioncut_member"."user_id" = nullif(current_setting('app.current_user_id', true), '')
				AND "visioncut_member"."status" = 'active'
				AND "visioncut_member"."role" IN ('owner', 'editor')
		)
	));--> statement-breakpoint
CREATE POLICY "scenes_delete_editor" ON "scenes" AS PERMISSIVE FOR DELETE TO public USING ((
		"scenes"."owner_user_id" = nullif(current_setting('app.current_user_id', true), '')
		OR EXISTS (
			SELECT 1
			FROM "project_members" AS "visioncut_member"
			WHERE "visioncut_member"."project_id" = "scenes"."project_id"
				AND "visioncut_member"."owner_user_id" = "scenes"."owner_user_id"
				AND "visioncut_member"."user_id" = nullif(current_setting('app.current_user_id', true), '')
				AND "visioncut_member"."status" = 'active'
				AND "visioncut_member"."role" IN ('owner', 'editor')
		)
	));--> statement-breakpoint
CREATE POLICY "story_graph_versions_select_member" ON "story_graph_versions" AS PERMISSIVE FOR SELECT TO public USING ((
		"story_graph_versions"."owner_user_id" = nullif(current_setting('app.current_user_id', true), '')
		OR EXISTS (
			SELECT 1
			FROM "project_members" AS "visioncut_member"
			WHERE "visioncut_member"."project_id" = "story_graph_versions"."project_id"
				AND "visioncut_member"."owner_user_id" = "story_graph_versions"."owner_user_id"
				AND "visioncut_member"."user_id" = nullif(current_setting('app.current_user_id', true), '')
				AND "visioncut_member"."status" = 'active'
		)
	));--> statement-breakpoint
CREATE POLICY "story_graph_versions_insert_editor" ON "story_graph_versions" AS PERMISSIVE FOR INSERT TO public WITH CHECK ((
		"story_graph_versions"."owner_user_id" = nullif(current_setting('app.current_user_id', true), '')
		OR EXISTS (
			SELECT 1
			FROM "project_members" AS "visioncut_member"
			WHERE "visioncut_member"."project_id" = "story_graph_versions"."project_id"
				AND "visioncut_member"."owner_user_id" = "story_graph_versions"."owner_user_id"
				AND "visioncut_member"."user_id" = nullif(current_setting('app.current_user_id', true), '')
				AND "visioncut_member"."status" = 'active'
				AND "visioncut_member"."role" IN ('owner', 'editor')
		)
	));--> statement-breakpoint
CREATE POLICY "story_graph_versions_update_editor" ON "story_graph_versions" AS PERMISSIVE FOR UPDATE TO public USING ((
		"story_graph_versions"."owner_user_id" = nullif(current_setting('app.current_user_id', true), '')
		OR EXISTS (
			SELECT 1
			FROM "project_members" AS "visioncut_member"
			WHERE "visioncut_member"."project_id" = "story_graph_versions"."project_id"
				AND "visioncut_member"."owner_user_id" = "story_graph_versions"."owner_user_id"
				AND "visioncut_member"."user_id" = nullif(current_setting('app.current_user_id', true), '')
				AND "visioncut_member"."status" = 'active'
				AND "visioncut_member"."role" IN ('owner', 'editor')
		)
	)) WITH CHECK ((
		"story_graph_versions"."owner_user_id" = nullif(current_setting('app.current_user_id', true), '')
		OR EXISTS (
			SELECT 1
			FROM "project_members" AS "visioncut_member"
			WHERE "visioncut_member"."project_id" = "story_graph_versions"."project_id"
				AND "visioncut_member"."owner_user_id" = "story_graph_versions"."owner_user_id"
				AND "visioncut_member"."user_id" = nullif(current_setting('app.current_user_id', true), '')
				AND "visioncut_member"."status" = 'active'
				AND "visioncut_member"."role" IN ('owner', 'editor')
		)
	));--> statement-breakpoint
CREATE POLICY "story_graph_versions_delete_owner" ON "story_graph_versions" AS PERMISSIVE FOR DELETE TO public USING (("story_graph_versions"."owner_user_id" = nullif(current_setting('app.current_user_id', true), '')));