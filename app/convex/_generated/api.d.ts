/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as backfills from "../backfills.js";
import type * as customers from "../customers.js";
import type * as deliveries from "../deliveries.js";
import type * as lifecycle from "../lifecycle.js";
import type * as payments from "../payments.js";
import type * as products from "../products.js";
import type * as pullouts from "../pullouts.js";
import type * as sales from "../sales.js";
import type * as settings from "../settings.js";
import type * as stockMovements from "../stockMovements.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  backfills: typeof backfills;
  customers: typeof customers;
  deliveries: typeof deliveries;
  lifecycle: typeof lifecycle;
  payments: typeof payments;
  products: typeof products;
  pullouts: typeof pullouts;
  sales: typeof sales;
  settings: typeof settings;
  stockMovements: typeof stockMovements;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
