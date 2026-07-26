import { useCallback, useSyncExternalStore } from "react";

type JsonPrimitive = boolean | number | string | null;
type JsonValue =
	| JsonPrimitive
	| JsonValue[]
	| {
			[key: string]: JsonValue;
	  };
type ValueUpdater<T extends JsonValue> = T | ((previousValue: T) => T);

interface CachedStorageValue {
	serialized: string;
	value: unknown;
}

const cachedValues = new Map<string, CachedStorageValue>();
const listenersByKey = new Map<string, Set<() => void>>();

function hasSameJsonShape({
	value,
	template,
}: {
	value: unknown;
	template: unknown;
}): boolean {
	if (template === null || typeof template !== "object") {
		return (
			typeof value === typeof template && (template !== null || value === null)
		);
	}

	if (Array.isArray(template)) {
		if (!Array.isArray(value)) {
			return false;
		}
		if (template.length === 0) {
			return true;
		}
		return value.every((item, index) =>
			hasSameJsonShape({
				value: item,
				template: template[index % template.length],
			}),
		);
	}

	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		return false;
	}

	return Object.entries(template).every(([key, templateValue]) =>
		hasSameJsonShape({
			value: Reflect.get(value, key),
			template: templateValue,
		}),
	);
}

function matchesStoredValue<T extends JsonValue>(
	value: unknown,
	template: T,
): value is T {
	return hasSameJsonShape({ value, template });
}

function readStoredValue<T extends JsonValue>({
	key,
	defaultValue,
}: {
	key: string;
	defaultValue: T;
}): T {
	if (typeof window === "undefined") {
		return defaultValue;
	}

	try {
		const serialized = localStorage.getItem(key);
		if (serialized === null) {
			return defaultValue;
		}

		const cached = cachedValues.get(key);
		if (
			cached?.serialized === serialized &&
			matchesStoredValue(cached.value, defaultValue)
		) {
			return cached.value;
		}

		const parsed: unknown = JSON.parse(serialized);
		if (!matchesStoredValue(parsed, defaultValue)) {
			return defaultValue;
		}

		cachedValues.set(key, { serialized, value: parsed });
		return parsed;
	} catch {
		return defaultValue;
	}
}

function notifyStorageListeners(key: string): void {
	for (const listener of listenersByKey.get(key) ?? []) {
		listener();
	}
}

function subscribeToStorageKey({
	key,
	listener,
}: {
	key: string;
	listener: () => void;
}): () => void {
	const listeners = listenersByKey.get(key) ?? new Set<() => void>();
	listeners.add(listener);
	listenersByKey.set(key, listeners);

	const handleStorage = (event: StorageEvent) => {
		if (event.key !== key && event.key !== null) {
			return;
		}
		cachedValues.delete(key);
		listener();
	};
	window.addEventListener("storage", handleStorage);

	return () => {
		window.removeEventListener("storage", handleStorage);
		listeners.delete(listener);
		if (listeners.size === 0) {
			listenersByKey.delete(key);
		}
	};
}

function isValueUpdater<T extends JsonValue>(
	value: ValueUpdater<T>,
): value is (previousValue: T) => T {
	return typeof value === "function";
}

function subscribeToHydration(): () => void {
	return () => {};
}

function getClientReady(): boolean {
	return true;
}

function getServerReady(): boolean {
	return false;
}

export function useLocalStorage({
	key,
	defaultValue,
}: {
	key: string;
	defaultValue: boolean;
}): [boolean, ({ value }: { value: ValueUpdater<boolean> }) => void, boolean];
export function useLocalStorage<T extends JsonValue>({
	key,
	defaultValue,
}: {
	key: string;
	defaultValue: T;
}): [T, ({ value }: { value: ValueUpdater<T> }) => void, boolean];
export function useLocalStorage<T extends JsonValue>({
	key,
	defaultValue,
}: {
	key: string;
	defaultValue: T;
}): [T, ({ value }: { value: ValueUpdater<T> }) => void, boolean] {
	const subscribe = useCallback(
		(listener: () => void) => subscribeToStorageKey({ key, listener }),
		[key],
	);
	const getSnapshot = useCallback(
		() => readStoredValue({ key, defaultValue }),
		[defaultValue, key],
	);
	const getServerSnapshot = useCallback(() => defaultValue, [defaultValue]);
	const value = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
	const isReady = useSyncExternalStore(
		subscribeToHydration,
		getClientReady,
		getServerReady,
	);

	const setValueWithCallback = useCallback(
		({ value: nextValue }: { value: ValueUpdater<T> }) => {
			const currentValue = readStoredValue({ key, defaultValue });
			const resolvedValue = isValueUpdater(nextValue)
				? nextValue(currentValue)
				: nextValue;

			try {
				const serialized = JSON.stringify(resolvedValue);
				localStorage.setItem(key, serialized);
				cachedValues.set(key, { serialized, value: resolvedValue });
			} catch {
				return;
			}
			notifyStorageListeners(key);
		},
		[defaultValue, key],
	);

	return [value, setValueWithCallback, isReady];
}
