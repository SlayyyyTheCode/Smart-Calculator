import {
  createAppOwner,
  createEvolu,
  createOwnerWebSocketTransport,
  FiniteNumber,
  id,
  Mnemonic,
  mnemonicToOwnerSecret,
  NonEmptyString100,
  SimpleName,
  type InferRow,
} from "@evolu/common";
import { evoluReactWebDeps } from "@evolu/react-web";

/**
 * The Smart Planner transaction, modelled the way the real app models it, so
 * this spike answers a question about THIS app rather than a toy one:
 *
 * - `amountMinor` is integer minor units. Never a float.
 * - `occurredOn` is a YYYY-MM-DD calendar date string, not an instant.
 * - `direction` and `expenseNature` carry the daily / fixed / recurring split.
 */
export const TransactionId = id("Transaction");
export type TransactionId = typeof TransactionId.Type;

export const Schema = {
  transaction: {
    id: TransactionId,
    occurredOn: NonEmptyString100,
    amountMinor: FiniteNumber,
    direction: NonEmptyString100,
    expenseNature: NonEmptyString100,
    note: NonEmptyString100,
  },
};

export type TransactionRow = InferRow<typeof Schema.transaction>;

/**
 * Both devices are handed the SAME owner, derived from one mnemonic.
 *
 * That is the whole point of the design: the mnemonic is the key, it is
 * generated on a device, and the relay only ever sees an owner id and
 * ciphertext. Passing the owner in explicitly (`externalAppOwner`) is also what
 * a real "add my second device" flow does once the pairing code has carried the
 * secret across.
 */
export function makeEvolu(instanceName: string, relayUrl: string, mnemonic: string) {
  const owner = createAppOwner(mnemonicToOwnerSecret(Mnemonic.orThrow(mnemonic)));

  return {
    owner,
    evolu: createEvolu(evoluReactWebDeps)(Schema, {
      name: SimpleName.orThrow(instanceName),
      externalAppOwner: owner,
      // The helper puts the owner id in the query string, which is how the
      // relay routes and authorises. A bare URL syncs nothing.
      transports: [createOwnerWebSocketTransport({ url: relayUrl, ownerId: owner.id })],
    }),
  };
}
