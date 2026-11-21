import type { EmailDeliveryStatus } from "../shared/email-operations";
import { log } from "./logger.server";
import { isDatabaseConfigured, transaction } from "./postgres.server";
import { hashEmailRecipient, suppressEmailRecipient } from "./email-outbox.server";

export type { EmailDeliveryStatus } from "../shared/email-operations";

export type EmailDeliveryEvent = {
  eventId: string;
  type: EmailDeliveryStatus;
  occurredAt: Date;
  providerMessageId: string;
  recipients: string[];
  suppressRecipient?: boolean;
};

function isPermanentDeliveryFailure(type: EmailDeliveryStatus): boolean {
  return type === "bounced" || type === "failed" || type === "rejected" || type === "complained";
}

/** Persist normalized delivery state without coupling the product to a sender. */
export async function recordEmailDeliveryEvent(event: EmailDeliveryEvent): Promise<void> {
  if (!isDatabaseConfigured()) throw new Error("Email delivery events database is unavailable");

  await transaction(async (client) => {
    let insertedRecipients = 0;
    const recipientsToSuppress: string[] = [];
    for (const recipient of event.recipients) {
      const recipientHash = hashEmailRecipient(recipient);
      const inserted = await client.query(
        `insert into email_delivery_events (
           event_id, event_type, provider_message_id, recipient_hash, occurred_at
         ) values ($1,$2,$3,$4,$5)
         on conflict (event_id, recipient_hash) do nothing`,
        [event.eventId, event.type, event.providerMessageId, recipientHash, event.occurredAt],
      );
      if (inserted.rowCount === 0) continue;

      const current = await client.query(
        `select 1
           where not exists (
             select 1
               from email_delivery_events newer
              where newer.provider_message_id = $1
                and newer.recipient_hash = $2
                and newer.occurred_at > $3
           )`,
        [event.providerMessageId, recipientHash, event.occurredAt],
      );
      if (
        event.type === "complained" ||
        (current.rowCount && event.type === "bounced" && event.suppressRecipient)
      ) {
        recipientsToSuppress.push(recipient);
      }
      if (current.rowCount) insertedRecipients += 1;
    }

    if (insertedRecipients > 0) {
      if (isPermanentDeliveryFailure(event.type)) {
        await client.query(
          `update email_outbox
              set status = 'failed',
                  provider_delivery_status = $2,
                  provider_status = 422,
                  last_error = $3,
                  failed_at = $4,
                  updated_at = now()
            where provider_message_id = $1 and status in ('accepted', 'failed')
              and $4 >= coalesce((
                select max(delivery.occurred_at)
                  from email_delivery_events delivery
                 where delivery.provider_message_id = $1
              ), $4)`,
          [
            event.providerMessageId,
            event.type,
            `Email provider reported ${event.type}`,
            event.occurredAt,
          ],
        );
      } else {
        await client.query(
          `update email_outbox
              set provider_delivery_status = $2,
                  delivered_at = case when $2 = 'delivered' then $3 else delivered_at end,
                  last_error = case when $2 = 'deferred' then $4 else last_error end,
                  updated_at = now()
            where provider_message_id = $1
              and $3 >= coalesce((
                select max(delivery.occurred_at)
                  from email_delivery_events delivery
                 where delivery.provider_message_id = $1
              ), $3)`,
          [
            event.providerMessageId,
            event.type,
            event.occurredAt,
            `Email provider reported ${event.type}`,
          ],
        );
      }

      await client.query(
        `update communication_stage_deliveries
            set status = $2, updated_at = now()
          where outbox_id in (
            select id from email_outbox where provider_message_id = $1
          )
            and $3 >= coalesce((
              select max(delivery.occurred_at)
                from email_delivery_events delivery
               where delivery.provider_message_id = $1
            ), $3)`,
        [event.providerMessageId, event.type, event.occurredAt],
      );
    }

    for (const recipient of recipientsToSuppress.sort()) {
      await suppressEmailRecipient(
        client,
        recipient,
        event.type === "complained" ? "complained" : "bounced",
        event.providerMessageId,
        event.occurredAt,
      );
    }
  });

  log.info("email.delivery", "Recorded provider delivery event", {
    eventId: event.eventId,
    type: event.type,
    providerMessageId: event.providerMessageId,
    recipients: event.recipients.length,
  });
}
