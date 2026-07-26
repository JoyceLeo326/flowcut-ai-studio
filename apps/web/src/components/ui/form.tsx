"use client";

import * as React from "react";
import { type Label as LabelPrimitive, Slot as SlotPrimitive } from "radix-ui";

import {
	Controller,
	type ControllerProps,
	type FieldPath,
	type FieldValues,
	FormProvider,
	useFormContext,
	type UseFormReturn,
} from "react-hook-form";

import { cn } from "@/utils/ui";
import { Label } from "./label";

const DRAFT_DEBOUNCE_MS = 500;

export interface DraftStorage {
	getItem(key: string): string | null;
	setItem(key: string, value: string): void;
	removeItem(key: string): void;
}

type FormProps<
	TFieldValues extends FieldValues = FieldValues,
	TContext = unknown,
> = UseFormReturn<TFieldValues, TContext> & {
	children: React.ReactNode;
	persistKey?: string;
	storage?: DraftStorage;
};

function hasSameDraftShape<T>(value: unknown, template: T): value is T {
	if (template === null) {
		return value === null;
	}

	if (typeof template !== "object") {
		return typeof value === typeof template;
	}

	if (template instanceof Date) {
		return value instanceof Date;
	}

	if (Array.isArray(template)) {
		if (!Array.isArray(value) || value.length !== template.length) {
			return false;
		}
		return value.every((item, index) =>
			hasSameDraftShape(item, template[index]),
		);
	}

	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		return false;
	}

	const templateKeys = Object.keys(template);
	const valueKeys = Object.keys(value);
	if (templateKeys.length !== valueKeys.length) {
		return false;
	}

	return templateKeys.every((key) => {
		if (!Reflect.has(value, key)) {
			return false;
		}
		const candidate: unknown = Reflect.get(value, key);
		const expected: unknown = Reflect.get(template, key);
		return hasSameDraftShape(candidate, expected);
	});
}

function Form<
	TFieldValues extends FieldValues = FieldValues,
	TContext = unknown,
>({
	persistKey,
	storage,
	children,
	...methods
}: FormProps<TFieldValues, TContext>) {
	const { watch, reset } = methods;
	// To change keys after mount, re-mount the component with key={persistKey}
	const persistKeyOnMount = React.useRef(persistKey);
	const storageOnMount = React.useRef(storage);
	const resetRef = React.useRef(reset);
	const getValuesRef = React.useRef(methods.getValues);

	React.useEffect(() => {
		if (!persistKeyOnMount.current) return;
		const store = storageOnMount.current ?? window.localStorage;
		try {
			const stored = store.getItem(persistKeyOnMount.current);
			if (stored) {
				const parsed: unknown = JSON.parse(stored);
				const currentValues = getValuesRef.current();
				if (hasSameDraftShape(parsed, currentValues)) {
					resetRef.current(parsed);
				}
			}
		} catch {
			// Storage may be unavailable (private browsing, storage blocked)
		}
	}, []);

	React.useEffect(() => {
		if (!persistKey) return;
		const store = storageOnMount.current ?? window.localStorage;
		let timer: ReturnType<typeof setTimeout>;
		const subscription = watch((values) => {
			clearTimeout(timer);
			timer = setTimeout(() => {
				try {
					store.setItem(persistKey, JSON.stringify(values));
				} catch {
					// Storage may be full or blocked
				}
			}, DRAFT_DEBOUNCE_MS);
		});
		return () => {
			clearTimeout(timer);
			subscription.unsubscribe();
		};
	}, [persistKey, watch]);

	return <FormProvider {...methods}>{children}</FormProvider>;
}

export function clearFormDraft({
	key,
	storage,
}: {
	key: string;
	storage?: DraftStorage;
}): void {
	const store = storage ?? window.localStorage;
	try {
		store.removeItem(key);
	} catch {
		// Storage may be unavailable
	}
}

type FormFieldContextValue<
	TFieldValues extends FieldValues = FieldValues,
	TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
> = {
	name: TName;
};

const FormFieldContext = React.createContext<FormFieldContextValue | null>(
	null,
);

const FormField = <
	TFieldValues extends FieldValues = FieldValues,
	TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>({
	...props
}: ControllerProps<TFieldValues, TName>) => {
	return (
		<FormFieldContext.Provider value={{ name: props.name }}>
			<Controller {...props} />
		</FormFieldContext.Provider>
	);
};

const useFormField = () => {
	const fieldContext = React.useContext(FormFieldContext);
	const itemContext = React.useContext(FormItemContext);

	if (!fieldContext) {
		throw new Error("useFormField should be used within <FormField>");
	}
	if (!itemContext) {
		throw new Error("useFormField should be used within <FormItem>");
	}

	const { getFieldState, formState } = useFormContext();
	const fieldState = getFieldState(fieldContext.name, formState);
	const { id } = itemContext;

	return {
		id,
		name: fieldContext.name,
		formItemId: `${id}-form-item`,
		formDescriptionId: `${id}-form-item-description`,
		formMessageId: `${id}-form-item-message`,
		...fieldState,
	};
};

type FormItemContextValue = {
	id: string;
};

const FormItemContext = React.createContext<FormItemContextValue | null>(null);

const FormItem = React.forwardRef<
	HTMLDivElement,
	React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => {
	const id = React.useId();

	return (
		<FormItemContext.Provider value={{ id }}>
			<div ref={ref} className={cn("space-y-2", className)} {...props} />
		</FormItemContext.Provider>
	);
});
FormItem.displayName = "FormItem";

const FormLabel = React.forwardRef<
	React.ElementRef<typeof LabelPrimitive.Root>,
	React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root>
>(({ className, ...props }, ref) => {
	const { error, formItemId } = useFormField();

	return (
		<Label
			ref={ref}
			className={cn(error && "text-destructive", className)}
			htmlFor={formItemId}
			{...props}
		/>
	);
});
FormLabel.displayName = "FormLabel";

const FormControl = React.forwardRef<
	React.ElementRef<typeof SlotPrimitive.Slot>,
	React.ComponentPropsWithoutRef<typeof SlotPrimitive.Slot>
>(({ ...props }, ref) => {
	const { error, formItemId, formDescriptionId, formMessageId } =
		useFormField();

	return (
		<SlotPrimitive.Slot
			ref={ref}
			id={formItemId}
			aria-describedby={
				error ? `${formDescriptionId} ${formMessageId}` : `${formDescriptionId}`
			}
			aria-invalid={!!error}
			{...props}
		/>
	);
});
FormControl.displayName = "FormControl";

const FormDescription = React.forwardRef<
	HTMLParagraphElement,
	React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => {
	const { formDescriptionId } = useFormField();

	return (
		<p
			ref={ref}
			id={formDescriptionId}
			className={cn("text-muted-foreground text-[0.8rem]", className)}
			{...props}
		/>
	);
});
FormDescription.displayName = "FormDescription";

const FormMessage = React.forwardRef<
	HTMLParagraphElement,
	React.HTMLAttributes<HTMLParagraphElement>
>(({ className, children, ...props }, ref) => {
	const { error, formMessageId } = useFormField();
	const body = error ? String(error?.message) : children;

	if (!body) {
		return null;
	}

	return (
		<p
			ref={ref}
			id={formMessageId}
			className={cn("text-destructive text-[0.8rem] font-medium", className)}
			{...props}
		>
			{body}
		</p>
	);
});
FormMessage.displayName = "FormMessage";

export {
	useFormField,
	Form,
	FormItem,
	FormLabel,
	FormControl,
	FormDescription,
	FormMessage,
	FormField,
};
