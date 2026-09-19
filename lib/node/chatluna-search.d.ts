import type { SearchObject } from '@koishijs/registry';
import z from 'zod';
export declare const CHATLUNA_TOOL_NAME = "koishi_plugin_market_search";
export type MarketObject = SearchObject & {
    deprecated?: string;
};
export interface MarketIndex {
    endpoint: string;
    fetchedAt: number;
    version?: number;
    objects: MarketObject[];
}
export interface LoadResult {
    index: MarketIndex;
    stale: boolean;
    error?: string;
}
declare const intentValues: readonly ["search", "recommend", "recent", "popular", "risk", "compare"];
declare const statusValues: readonly ["verified", "insecure", "preview", "portable", "deprecated"];
declare const sortValues: readonly ["relevance", "downloads", "created", "updated"];
declare const orderValues: readonly ["asc", "desc"];
type Intent = typeof intentValues[number];
type Status = typeof statusValues[number];
type Sort = typeof sortValues[number];
type Order = typeof orderValues[number];
export interface NormalizedSearchInput {
    intent: Intent;
    query?: string;
    requirements?: string;
    names: string[];
    category: string[];
    status: Status[];
    createdAfter?: string;
    createdBefore?: string;
    updatedAfter?: string;
    updatedBefore?: string;
    createdWithinDays?: number;
    updatedWithinDays?: number;
    sort: Sort;
    order: Order;
    limit: number;
    includeHidden: boolean;
    includeDeprecated: boolean;
}
export declare const searchSchema: z.ZodObject<{
    intent: z.ZodOptional<z.ZodEnum<["search", "recommend", "recent", "popular", "risk", "compare"]>>;
    query: z.ZodOptional<z.ZodString>;
    requirements: z.ZodOptional<z.ZodString>;
    names: z.ZodEffects<z.ZodOptional<z.ZodArray<z.ZodString, "many">>, string[], unknown>;
    category: z.ZodEffects<z.ZodOptional<z.ZodArray<z.ZodString, "many">>, string[], unknown>;
    status: z.ZodEffects<z.ZodOptional<z.ZodArray<z.ZodEnum<["verified", "insecure", "preview", "portable", "deprecated"]>, "many">>, ("deprecated" | "verified" | "insecure" | "preview" | "portable")[], unknown>;
    createdAfter: z.ZodOptional<z.ZodString>;
    createdBefore: z.ZodOptional<z.ZodString>;
    updatedAfter: z.ZodOptional<z.ZodString>;
    updatedBefore: z.ZodOptional<z.ZodString>;
    createdWithinDays: z.ZodOptional<z.ZodNumber>;
    updatedWithinDays: z.ZodOptional<z.ZodNumber>;
    sort: z.ZodOptional<z.ZodEnum<["relevance", "downloads", "created", "updated"]>>;
    order: z.ZodOptional<z.ZodEnum<["asc", "desc"]>>;
    limit: z.ZodOptional<z.ZodNumber>;
    includeHidden: z.ZodOptional<z.ZodBoolean>;
    includeDeprecated: z.ZodOptional<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    sort?: "relevance" | "downloads" | "created" | "updated";
    status?: ("deprecated" | "verified" | "insecure" | "preview" | "portable")[];
    intent?: "search" | "recommend" | "recent" | "popular" | "risk" | "compare";
    query?: string;
    requirements?: string;
    names?: string[];
    category?: string[];
    createdAfter?: string;
    createdBefore?: string;
    updatedAfter?: string;
    updatedBefore?: string;
    createdWithinDays?: number;
    updatedWithinDays?: number;
    order?: "asc" | "desc";
    limit?: number;
    includeHidden?: boolean;
    includeDeprecated?: boolean;
}, {
    sort?: "relevance" | "downloads" | "created" | "updated";
    status?: unknown;
    intent?: "search" | "recommend" | "recent" | "popular" | "risk" | "compare";
    query?: string;
    requirements?: string;
    names?: unknown;
    category?: unknown;
    createdAfter?: string;
    createdBefore?: string;
    updatedAfter?: string;
    updatedBefore?: string;
    createdWithinDays?: number;
    updatedWithinDays?: number;
    order?: "asc" | "desc";
    limit?: number;
    includeHidden?: boolean;
    includeDeprecated?: boolean;
}>;
export type SearchInput = z.infer<typeof searchSchema>;
export declare function formatSearchResult(result: LoadResult, input: NormalizedSearchInput): string;
export declare function normalizeInput(input: SearchInput): NormalizedSearchInput;
export declare function formatLoadError(endpoint: string, input: NormalizedSearchInput, error: unknown): string;
export {};
