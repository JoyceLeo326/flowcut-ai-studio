import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { webEnv } from "@/env/web";

let _db: ReturnType<typeof drizzle> | null = null;

function getDb() {
	if (!_db) {
		const databaseUrl = webEnv.DATABASE_URL;
		if (!databaseUrl) {
			throw new Error(
				"DATABASE_URL is required when database features are enabled",
			);
		}
		const client = postgres(databaseUrl);
		_db = drizzle(client, { schema });
	}

	return _db;
}

export const db = getDb();

export * from "./schema";
