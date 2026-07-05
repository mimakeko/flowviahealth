# HIPAA Risk Register V1

| Risk | Description | Likelihood | Impact | Mitigation | Owner | Status | Production Blocker |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Temporary pilot auth | Signed-cookie pilot auth is not final enterprise auth. | Medium | High | Add per-user auth, MFA, account recovery, revocation, and login auditing. | Engineering/Ops | Open | Yes |
| Temporary generic passwords | Known pilot passwords may still be configured. | Medium | High | Rotate passwords, use generated secrets, and run `pnpm cloud:readiness`. | Engineering/Ops | Open | Yes |
| Local dev / laptop dependency | Local webhooks stop when laptop sleeps. | High | Medium | Move staging webhook to Vercel public domain. | Engineering | Open | No |
| ngrok tunnel for testing | Tunnel exposes local endpoint during testing. | Medium | Medium | Use only personal phone/fake data; stop ngrok after testing. | Engineering | Open | No |
| Unsigned webhook bypass in dev | Local smoke bypass could be misconfigured in cloud. | Low | High | Fail production-like environments when bypass/signing is unsafe. | Engineering | Mitigating | Yes |
| SMS carrier exposure | SMS passes through carrier/Telnyx systems. | Medium | High | Transactional templates only; no PHI in SMS. | Compliance/Ops | Open | Yes |
| Accidental PHI in SMS | Operators or templates may include clinical details. | Medium | High | Central SMS template registry and no clinical placeholders. | Engineering/Ops | Mitigating | Yes |
| Duplicate HELP response | Telnyx portal keyword auto-reply and app reply may both send. | Medium | Medium | Disable Telnyx-side keyword replies if Flowvia controls keywords. | Ops | Open | Yes |
| Vercel env misconfiguration | Missing env vars could break auth, SMS, or webhook signing. | Medium | High | Run `pnpm cloud:readiness` before deploy. | Engineering | Mitigating | Yes |
| Supabase connection/security | Database URLs or policies may be misconfigured. | Medium | High | Use managed secrets, `DATABASE_URL`/`DIRECT_URL`, migrations, backups, access review. | Engineering/Ops | Open | Yes |
| Vendor BAA status | Supabase, Vercel, Telnyx, Resend, and tooling BAA status must be reviewed. | Medium | High | Complete vendor/BAA checklist before PHI. | Compliance/Ops | Open | Yes |
| AI real-provider exposure | AI could receive PHI if enabled without no-PHI routing and vendor controls. | Low | High | Keep `FLOWVIA_AI_ENABLED=false`, provider `mock`/`none`, no-PHI mode on, and require BAA/legal review before any real provider. | Engineering/Compliance | Mitigating | Yes |
| Backup/restore gap | Restore process has not been approved/tested. | Medium | High | Document and test backups/restores. | Engineering/Ops | Open | Yes |
| Retention/deletion gap | Data lifecycle policy is not finalized. | Medium | High | Document retention/deletion and implement workflows. | Compliance/Ops | Open | Yes |
| Incident response gap | Breach/security incident process is not finalized. | Medium | High | Write incident response runbook and escalation contacts. | Compliance/Ops | Open | Yes |
| Auth/MFA gap | MFA and enterprise account controls are missing. | Medium | High | Implement production auth provider and MFA. | Engineering | Open | Yes |
| Audit review gap | Audit logs exist but routine review process is not defined. | Medium | Medium | Define access/audit review cadence and owners. | Ops | Open | Yes |
