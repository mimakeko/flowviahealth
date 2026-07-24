# Mobile Field UI Reset v1

## Before-state inventory

- The authenticated shell exposed ten destinations at equal weight, including audit, health, data, and message-ledger destinations that are not field tasks.
- Therapist `/dashboard` led with metrics and operational-assistant panels before a therapist could reach their next visit or a decision card.
- Therapist `/my-work` already had correct workflow actions, but default cards repeated workflow state, recommendation detail, status labels, and supporting guidance.
- Admin `/dashboard` displayed a broad metric wall, SMS and audit summaries, and assistant panels alongside operational work.
- New referral intake was a single long form that required excessive scrolling and keyboard use on a phone.

## Reset information architecture

Therapist mobile navigation has four primary destinations:

1. Home — `/my-work`
2. Opportunities — `/my-work#opportunities`
3. Schedule — `/my-work#schedule`
4. More — `/my-work#more`

Admin home is `/dashboard` and has three operational lanes:

1. Needs attention
2. Ready to move
3. Today

## Presentation rules applied

- One teal primary action for the immediate task; links and disclosures handle secondary work.
- Recommendation fit remains visible, while evidence and uncertainty are progressive disclosure only.
- Therapist cards remove duplicate status labels, default scoring detail, and secondary diagnostics.
- The fixed mobile rail and capture button use 44px-or-larger targets.
- Referral intake uses four concise stages: who and where, service, workflow detail, review.
- Existing actions, server-side checks, RBAC, audit logging, no-PHI validation, scheduling gates, and opportunity acceptance rules remain unchanged.

## Validation note

The local workspace has no `DATABASE_URL`. Authenticated browser login succeeds, but real dashboard/worklist rendering stops at the existing Prisma database guard. No mock records, database, external service, or production setting were created to bypass that boundary.
