# Owner acceptance walkthrough (10–15 minutes)

Use the verified URL from RELEASE_EVIDENCE.md or the local synthetic demo command in README.md.

- [ ] Overview identifies the experience as synthetic; all four scenarios are discoverable.
- [ ] Open each scenario. Its service, evidence, plausible cause, and uncertainty are consistent.
- [ ] Replay a timeline. It is visibly recorded/synthetic and creates no live work.
- [ ] Click an evidence reference and inspect source, metrics, and observation time.
- [ ] Export a report and confirm it contains no credentials or private data.
- [ ] Open `/architecture` directly, refresh it, and switch all four study views.
- [ ] Inspect high-level, sequence, and data diagrams; use zoom and diagram source.
- [ ] Check the architecture version, application version, source commit, and change notes.
- [ ] On a phone-sized screen, open the navigation and read a report and architecture section.
- [ ] Integrations explains fixture equivalents and does not offer live public configuration.
- [ ] Public state-changing requests and private-data API requests fail.
- [ ] In a separately bootstrapped private environment, create application → environment → credential, send an authenticated synthetic event, start the worker, and inspect the report.
- [ ] Re-send the event; it retains its ID. Change the payload with the same ID; it conflicts.
- [ ] Revoke the credential and confirm subsequent ingestion is denied.
- [ ] Review release limitations before enabling a model provider or connecting any real system.

A manual acceptance check is an owner review, not a substitute for automated verification or a claim of commercial readiness.
