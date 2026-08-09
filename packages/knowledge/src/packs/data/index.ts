/**
 * Built-in Knowledge Pack Data — barrel export.
 *
 * Exports all production-quality knowledge packs for registration.
 *
 * @module @veris/knowledge/packs/data
 */

import { LOBINS_PACK } from './lolbins-pack.js';
import { MALWARE_FAMILIES_PACK } from './malware-families.js';
import { NETWORK_INDICATORS_PACK } from './network-indicators-pack.js';
import { PACKERS_PACK } from './packers-pack.js';
import { PERSISTENCE_PACK } from './persistence-pack.js';
import { SUSPICIOUS_APIS_PACK } from './suspicious-apis-pack.js';

export {
  MALWARE_FAMILIES_PACK,
  LOBINS_PACK,
  PACKERS_PACK,
  PERSISTENCE_PACK,
  NETWORK_INDICATORS_PACK,
  SUSPICIOUS_APIS_PACK,
};

/** Array of all built-in packs for easy registration. */
export const BUILT_IN_PACKS = Object.freeze([
  MALWARE_FAMILIES_PACK,
  LOBINS_PACK,
  PACKERS_PACK,
  PERSISTENCE_PACK,
  NETWORK_INDICATORS_PACK,
  SUSPICIOUS_APIS_PACK,
]);
