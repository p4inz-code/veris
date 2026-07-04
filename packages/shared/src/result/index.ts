export type { Ok, Err, Result } from './result.js';
export {
  ok,
  err,
  isOk,
  isErr,
  unwrap,
  unwrapOr,
  unwrapOrElse,
  map,
  mapErr,
  andThen,
  tryCatch,
  tryCatchAsync,
  collect,
} from './result.js';
