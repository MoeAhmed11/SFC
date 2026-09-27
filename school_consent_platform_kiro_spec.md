# School Consent & Event Reminder Platform

## Product Requirements and Implementation Brief for Kiro

**Document status:** Initial MVP specification\
**Working name:** SchoolConnect (placeholder; not a final brand
decision)\
**Market:** United Kingdom\
**Date:** 27 September 2026\
**Audience:** Kiro AI development IDE, product owner, and development
team

------------------------------------------------------------------------

## 1. Purpose

Build a school-facing SaaS web platform for UK primary schools to create
school activities, collect parental consent digitally, track responses,
automate reminders, and send event reminders to parents who have
consented.

The product should reduce administrative work for school staff, help
parents avoid missed consent deadlines and forgotten activities, and
reduce the risk of children missing activities because consent was not
completed.

This document is intended to be used as an implementation brief by Kiro.
Treat requirements as the initial product direction; do not invent
integrations, legal assurances, or production credentials. Where a
decision is marked **Open**, ask the product owner or implement a
clearly isolated placeholder.

## 2. Product decisions already made

  -----------------------------------------------------------------------
  Topic                               Decision
  ----------------------------------- -----------------------------------
  Target market                       Both UK state and independent
                                      primary schools

  Paying customer                     School

  Product model                       School-facing SaaS

  Parent experience                   Secure link; no mandatory parent
                                      account or app

  Integration direction               Integrate with existing school
                                      systems

  Initial business approach           Validate with a small pilot before
                                      scaling

  Initial product                     Web application, not separate
                                      mobile apps

  Initial notifications               Email

  Working name                        SchoolConnect (placeholder)

  Initial integration approach        CSV import/export, then pilot
                                      selected integrations

  Event reminders                     Required: notify parents who have
                                      submitted consent before the event
  -----------------------------------------------------------------------

## 3. Problem statement

Parents receive consent forms and activity announcements through
different channels, often with deadlines and event dates. Communications
can be overlooked amid daily responsibilities, causing missed consent
deadlines or forgotten activities. This can create parental stress,
disappointment when a child misses an activity, and extra administrative
work for school staff who must chase responses.

Schools may use paper forms, email, spreadsheets, or existing school
platforms. The prevalence and severity of the problem must be validated
with target schools.

## 4. Product proposition

A central platform that enables schools to:

1.  Create events and consent forms.
2.  Send secure links to parents or guardians.
3.  Collect and track explicit consent responses.
4.  Automatically remind parents who have not responded.
5.  Send event reminders to parents who have submitted consent.
6.  View and export consent records.

**Primary value hypothesis:** reduce staff time spent chasing consent
while improving on-time response rates.

## 5. Users and permissions

### 5.1 School administrator

Can manage school settings, staff access, classes, pupil/guardian
records, events, forms, reminders, reports, and exports, subject to
permissions.

### 5.2 Teacher / event organiser

Can manage or view assigned events, monitor consent status, and access
event reports according to school-configured permissions.

### 5.3 Parent / guardian

Does not need a platform account. Uses a secure, recipient-specific link
to view an event, submit or decline consent, and see confirmation.
Receives notifications through configured channels.

### 5.4 Tenant isolation

Each school is a tenant. Staff must only access data for their
authorised school and role. Do not rely on client-side checks alone;
enforce access controls server-side.

## 6. MVP scope

### 6.1 Required for MVP

-   School tenant and staff authentication.
-   Role-based access control for administrators and event organisers.
-   Class/year-group management or secure import of class rosters.
-   Pupil and parent/guardian contact records, with authorised
    relationships.
-   Event creation, editing, cancellation, and publication.
-   Basic digital consent forms.
-   Secure parent links without mandatory parent accounts.
-   Explicit consent / decline response capture.
-   Consent status dashboard.
-   Configurable automated deadline reminders.
-   Configurable event reminders for parents who have consented.
-   Email notifications and delivery status.
-   Event change/cancellation notifications.
-   Consent audit history and notification history.
-   CSV import/export for initial data exchange.
-   Basic event report and consent register export.
-   Privacy-conscious logging, error handling, and security controls.

### 6.2 Defer unless explicitly approved

-   Dedicated parent mobile application.
-   SMS, WhatsApp, or push notifications.
-   Payments or trip-fee collection.
-   Complex medical or highly sensitive information collection.
-   Advanced form builder.
-   AI features.
-   Broad catalogue of third-party integrations.
-   Sophisticated analytics beyond basic operational metrics.

## 7. Functional requirements

### FR-01: School and staff access

-   Staff can sign in securely.
-   An administrator can invite, deactivate, and assign roles to staff.
-   Enforce tenant isolation on every data access and mutation.
-   Record important administrative actions in an audit log.

### FR-02: Event management

Each event should support: - Event name and description. - Event date. -
Start/end time and timezone. - Location. - Instructions (e.g. clothing
or equipment). - Assigned class(es) or eligible pupils. - Consent
deadline. - Consent form. - Reminder schedule. - Status: draft,
published, cancelled, completed (or equivalent). - Created/updated
timestamps and responsible staff member.

Staff can create, edit, publish, cancel, and view events. Validate that
deadlines and event times are coherent. When a published event changes
materially, identify affected recipients and notify them as configured.

### FR-03: Consent form and response

-   Provide a simple configurable form for the MVP.
-   Support an explicit **Consent granted** and **Consent declined**
    response.
-   Capture the responding parent/guardian identity, associated pupil,
    event, response, submission timestamp, and optional notes where
    appropriate.
-   Show a confirmation after submission.
-   Permit correction or resubmission only according to a
    school-configurable policy; retain the prior response in the audit
    history.
-   Never infer consent from silence, a reminder being sent, or a form
    being opened.
-   Do not represent a declined or missing response as consent.
-   Keep form content and response records associated with the correct
    event and pupil.

### FR-04: Secure parent access links

-   Generate high-entropy, unguessable, recipient-specific access
    tokens.
-   Store token hashes where feasible rather than raw tokens.
-   Bind each token to the intended recipient, pupil/event scope, and
    permitted action.
-   Support expiry and revocation.
-   Do not place pupil names, contact details, or other personal data in
    the URL.
-   Prevent a recipient from viewing another pupil's records by changing
    URL parameters.
-   Rate-limit sensitive endpoints and avoid leaking whether unrelated
    records exist.
-   Provide a safe process for reissuing a link.
-   Consider additional identity verification for sensitive information
    or higher-risk actions.
-   Do not expose a consent form or response without validating the
    token server-side.

### FR-05: Consent tracking dashboard

For each event, show at minimum: - Total invited/eligible pupils. -
Consent received. - Consent declined. - Outstanding/no response. -
Optionally: delivery failures and response timestamps.

Allow authorised staff to open the response list, filter by status, and
send a reminder to selected outstanding recipients. Dashboard totals
must be derived consistently from stored response records.

### FR-06: Deadline reminders

-   Send the initial consent request when an event is published.
-   Support configurable reminder offsets before the deadline.
-   Suggested defaults: 7 days, 3 days, and 1 day before deadline. These
    are proposed defaults, not fixed policy.
-   Only remind recipients whose response remains outstanding.
-   Stop routine consent reminders after a response is received or the
    deadline passes.
-   Make reminder schedules configurable per event or school.
-   Avoid duplicate sends when a job retries.
-   Log scheduled, attempted, sent, failed, and cancelled notifications.
-   Allow authorised staff to send a manual reminder to outstanding
    recipients.

### FR-07: Event reminders (required feature)

-   Send a separate event reminder to parents/guardians who have
    submitted consent.
-   Allow school staff to configure timing, with a proposed default of
    one day before the event.
-   Support a configurable option such as one day before, two days
    before, or the event morning, subject to scheduling capability.
-   Include event name, date/time, location, and school-provided
    instructions/contact information.
-   Use the latest published event details.
-   If the event is cancelled or materially changed, suppress obsolete
    reminders and notify affected recipients as appropriate.
-   Do not send event reminders to recipients who have not consented or
    have declined.
-   If consent is changed or revoked, update eligibility for future
    reminders.
-   Log delivery status.

### FR-08: Notifications

Initial channel: email. Notification types: - Consent request. - Consent
deadline reminder. - Event reminder. - Event cancellation or
schedule-change notice. - Submission confirmation.

Requirements: - Use reusable, accessible email templates. - Include a
secure link where action is required. - Do not include unnecessary child
personal data in email subject lines or message bodies. - Track delivery
outcomes where the provider supports it. - Handle bounces and provider
errors safely. - Keep notification sending asynchronous through a
job/queue mechanism.

### FR-09: Reporting and export

-   Provide a per-event consent register.
-   Export authorised event data to CSV.
-   Include response status and relevant timestamps.
-   Restrict exports to authorised staff.
-   Avoid including unnecessary personal data.
-   Record export activity in the audit log.

### FR-10: CSV import

For initial onboarding, support secure CSV import of the minimum
necessary school data, such as classes, pupils, guardian contacts, and
relationships. - Provide a downloadable template and field validation. -
Show validation errors before committing records. - Prevent accidental
cross-school imports. - Do not log raw CSV contents or sensitive
values. - Define duplicate matching and update behaviour explicitly
before implementation.

## 8. Core user journeys

### Journey A: Create and publish an event

1.  Staff member signs in.
2.  Selects **Create event**.
3.  Enters event details, class/recipients, consent deadline, form, and
    reminder settings.
4.  Reviews the event.
5.  Publishes it.
6.  System schedules and sends consent requests.
7.  Event appears in the school dashboard.

### Journey B: Parent submits consent

1.  Parent receives an email containing a secure link.
2.  Opens the link.
3.  Server validates token and scope.
4.  Parent reviews event details and form.
5.  Parent selects consent granted or declined and completes required
    fields.
6.  System validates and stores response with timestamp and audit event.
7.  Parent sees confirmation.
8.  Dashboard and reminder eligibility update.

### Journey C: Staff monitors responses

1.  Staff opens an event.
2.  Sees consent, declined, and outstanding totals.
3.  Filters outstanding recipients.
4.  Sends or reviews scheduled reminders.
5.  Exports the final consent register when needed.

### Journey D: Deadline reminder

1.  Scheduler identifies an upcoming reminder.
2.  System checks that event is published, deadline has not passed, and
    response is still outstanding.
3.  System queues an idempotent email.
4.  Delivery result is recorded.
5.  If response arrives before send, cancel or suppress the reminder
    where possible.

### Journey E: Event reminder

1.  Scheduler reaches the configured event-reminder time.
2.  System checks event status and latest event details.
3.  System selects recipients with current consent granted.
4.  System queues an idempotent email.
5.  Delivery result is recorded.

### Journey F: Event changed or cancelled

1.  Staff edits or cancels a published event.
2.  System identifies affected recipients and scheduled notifications.
3.  Obsolete reminders are cancelled or recalculated.
4.  A change/cancellation notification is sent according to school
    settings.
5.  Audit history records the change.

## 9. Suggested data model

Use a relational database (PostgreSQL suggested). Adapt naming to the
chosen framework, but preserve relationships and tenant boundaries.

-   **School**: id, name, school_type, contact/settings, created_at.
-   **StaffUser**: id, school_id, name, email, role, status, created_at.
-   **ClassGroup**: id, school_id, name/year_group.
-   **Pupil**: id, school_id, class_group_id, minimal necessary
    identifying fields, status.
-   **Guardian**: id, school_id, name, email, status.
-   **PupilGuardianRelationship**: id, school_id, pupil_id, guardian_id,
    relationship/authorisation metadata, notification preferences if
    applicable.
-   **Event**: id, school_id, title, description, location, starts_at,
    ends_at, consent_deadline, status, created_by, updated_at.
-   **EventRecipient**: id, school_id, event_id, pupil_id, guardian_id,
    invitation status, eligibility metadata.
-   **ConsentForm**: id, school_id, event_id, form schema/version,
    published_at.
-   **ConsentResponse**: id, school_id, event_id, pupil_id, guardian_id,
    response (granted/declined), submitted_at, form_version, optional
    notes, current/revoked state.
-   **SecureAccessToken**: id, school_id, event_id, guardian_id,
    pupil_id, token_hash, expires_at, revoked_at, created_at,
    last_used_at.
-   **Notification**: id, school_id, event_id, guardian_id, pupil_id,
    type, scheduled_at, status, provider_message_id, sent_at,
    failure_code (avoid storing unnecessary sensitive payload).
-   **AuditLog**: id, school_id, actor type/id, action, entity type/id,
    timestamp, minimal metadata.

Important: Define uniqueness constraints, indexes, retention rules, and
guardian-to-pupil authorisation rules. Do not assume that every guardian
is authorised to receive every notification; schools need a reliable
source of authorised relationships.

## 10. Business rules and edge cases

-   No response is not consent.
-   Declined consent is distinct from outstanding consent.
-   A parent should not receive consent reminders after submitting a
    response.
-   Event reminders go only to currently consented recipients.
-   If consent is revised or revoked, future reminder eligibility must
    update.
-   Event cancellation must suppress future event reminders.
-   Event date/deadline changes must recalculate scheduled jobs and
    notify affected recipients where appropriate.
-   Multiple authorised guardians may exist for a pupil; define whether
    each receives notifications and how conflicting responses are
    handled. **This policy is open and must be confirmed.**
-   A guardian may be associated with multiple pupils; links and forms
    must clearly identify the relevant event/pupil without exposing
    other children.
-   Handle invalid, expired, revoked, or already-used links with a safe,
    understandable message and a route to request a new link.
-   Handle email delivery failure and provide staff with visibility.
-   Prevent duplicate reminders during retries or concurrent jobs.
-   Account for daylight saving time and the school's configured
    timezone.
-   Define what happens when a parent submits after the deadline; do not
    silently reject or accept without a school-defined policy.
-   Define whether staff can enter consent received through an offline
    process, and preserve who recorded it and when.

## 11. Non-functional requirements

### Security and privacy

-   Treat child and guardian data as sensitive personal data.
-   Apply data minimisation and purpose limitation.
-   Enforce tenant isolation and role-based access control server-side.
-   Encrypt data in transit and at rest using platform-supported
    controls.
-   Store secrets in environment/secret management, never in source
    control.
-   Use secure session handling, CSRF protection where relevant, input
    validation, output encoding, and rate limiting.
-   Maintain audit trails for important actions.
-   Set configurable data retention and deletion processes.
-   Provide appropriate backup and recovery processes.
-   Do not claim legal compliance merely because these controls exist.
    Obtain appropriate UK data protection and safeguarding review before
    production use.

### Reliability

-   Reminder jobs must be durable and idempotent.
-   Failed jobs should retry with bounded backoff and be visible to
    administrators.
-   Prevent duplicate sends.
-   Use monitoring for job failures and email delivery issues.

### Accessibility and usability

-   Responsive parent pages for mobile browsers.
-   Clear, plain-English forms and notifications.
-   Accessible form labels, keyboard navigation, focus states, and error
    messages.
-   Minimise steps for parents; no mandatory account.
-   School dashboard should make outstanding responses easy to identify.

### Performance

-   Establish measurable performance targets during implementation.
-   Use pagination for large recipient lists and exports.
-   Avoid blocking user-facing requests while sending email or
    processing bulk reminders.

## 12. Integration strategy

### Phase 1: CSV import/export

-   Provide validated CSV templates.
-   Support importing class/pupil/guardian data with a preview and error
    report.
-   Provide consent register exports.
-   Keep data import secure and auditable.

### Phase 2: Pilot integrations

-   Interview schools to identify their current management/communication
    systems.
-   Confirm API availability, permissions, contractual terms, and
    technical constraints.
-   Select one or two integrations based on pilot demand.
-   Do not claim an integration exists until implemented and tested.

### Phase 3: Expand

Add further integrations only where customer demand and reliable access
justify the effort.

## 13. Commercial assumptions (unvalidated)

Potential school subscription prices discussed as hypotheses: - Small
school: £29/month. - Medium school: £59/month. - Large school:
£99/month.

These are not validated prices and should be tested with schools. An
initial pilot may be free or paid; decide after discovery. Revenue
illustrations at £59/month are gross revenue only and exclude costs,
taxes, churn, and acquisition expenses.

## 14. Pilot and validation plan

### Discovery

Interview approximately 15--20 parents and 5--10 school
administrators/office staff/teachers. Investigate: - How forms are
currently distributed and collected. - Frequency of missed or late
consent. - Administrative time spent chasing. - Existing systems and
overlapping features. - Parent notification preferences. - School
purchasing process and willingness to pay.

### Pilot

Recruit 2--3 schools for a limited pilot. Compare current workflow with
platform use.

Track: - On-time consent completion rate. - Staff time spent chasing
before and after. - Number of manual reminders. - Response rate after
reminders. - Parent completion rate and usability feedback. - Delivery
failures. - School willingness to pay and continue.

A meaningful validation signal is a school agreeing to pay to continue
after observing measurable operational benefit.

## 15. Development roadmap (indicative)

A previous rough estimate was 8--11 weeks for a focused MVP with a small
experienced team and limited integrations. This is only a planning
estimate and must be refined after technical discovery.

Suggested sequence: 1. Requirements, workflow confirmation, wireframes,
and data/privacy review. 2. Tenant foundation, staff authentication, and
role permissions. 3. School/class/pupil/guardian data and CSV import. 4.
Event creation and publishing. 5. Consent forms and secure parent links.
6. Consent dashboard and exports. 7. Notification templates, queue,
deadline reminders, and event reminders. 8. Audit logging, security
testing, accessibility, and operational monitoring. 9. Pilot onboarding
and feedback cycle.

## 16. Acceptance criteria for MVP

The MVP is ready for a controlled pilot when:

1.  A school administrator can create and publish an event for a
    selected class.
2.  Intended guardians receive a secure link to the correct consent
    form.
3.  A guardian can submit granted or declined consent without creating
    an account.
4.  A submission is stored with event, pupil, guardian, response, and
    timestamp.
5.  The school dashboard accurately shows consent, declined, and
    outstanding counts.
6.  The system sends configurable reminders only to outstanding
    recipients.
7.  The system sends configurable event reminders only to recipients
    with current consent granted.
8.  Event cancellation or date changes update scheduled reminders and
    notify affected recipients as configured.
9.  Staff can export an authorised consent register.
10. School data is isolated from other tenants.
11. Important consent, event, and notification actions are auditable.
12. Expired/revoked/invalid links cannot expose data or submit consent.
13. Duplicate job execution does not create duplicate notifications.
14. Core parent and staff workflows are usable on mobile and desktop
    browsers.
15. Known limitations, data handling, and pilot support procedures are
    documented.

## 17. Open decisions --- ask before finalising

1.  **School management systems:** Which systems should be prioritised
    for integration after discovery?
2.  **Guardian rules:** Should all authorised guardians receive
    notifications, or should schools select a primary contact? How
    should conflicting responses be resolved?
3.  **Late consent:** Can parents submit after the deadline, and should
    staff approval be required?
4.  **Consent editing:** Can parents change a response, and until when?
5.  **Offline consent:** Can staff record paper/verbal consent, and what
    evidence/audit fields are required?
6.  **Reminder defaults:** Confirm default offsets and whether schools
    can customise them.
7.  **Event reminder timing:** Confirm default (suggested: one day
    before) and whether event-morning reminders are required in MVP.
8.  **Email provider and domain:** Select provider, sender identity, and
    deliverability setup.
9.  **Data retention:** Define retention and deletion periods with
    appropriate advice.
10. **Pricing and pilot terms:** Validate proposed price bands and
    decide pilot arrangement.
11. **Brand:** Confirm whether "SchoolConnect" is retained or replaced.
12. **Consent form scope:** Confirm whether MVP supports only a simple
    yes/no consent or additional question types.

## 18. Instructions for Kiro

Use this document as the source of truth for the initial MVP.

1.  Inspect the existing repository before making changes. If no
    repository exists, propose a sensible project structure and explain
    the selected stack.
2.  First produce:
    -   architecture proposal,
    -   entity relationship diagram or schema,
    -   page/route map,
    -   security and privacy risk checklist,
    -   phased implementation plan,
    -   list of assumptions and unresolved decisions.
3.  Do not implement real third-party integrations without credentials,
    documented API access, and explicit approval. Use clearly labelled
    interfaces/adapters or mock data during development.
4.  Do not use real children's personal data in development or tests.
    Use synthetic fixtures.
5.  Implement in small, reviewable phases. After each phase, run tests
    and report files changed, decisions made, test results, and
    remaining issues.
6.  Add automated tests for tenant isolation, role permissions, token
    expiry/revocation, consent status transitions, reminder eligibility,
    cancellation/date-change handling, and idempotent notification jobs.
7.  Keep secrets out of the repository. Provide an `.env.example`
    containing names and safe placeholders only.
8.  Document local setup, migrations, seed data, test commands, and
    deployment assumptions.
9.  Treat all open decisions in Section 17 as unresolved. Ask questions
    when a decision materially affects data model, security, or
    workflow; otherwise isolate the assumption and document it.
10. Do not claim the product is production-ready or legally compliant
    without appropriate review and testing.

## 19. Suggested first task for Kiro

**Task:** Review this specification and the repository, then create an
implementation plan without writing application code yet.

Deliver: - Recommended architecture and rationale. - Proposed folder
structure. - Database schema and relationships. - UI route/page
inventory for staff and parent experiences. - API endpoint inventory. -
Reminder scheduling and idempotency design. - Secure-link threat
model. - Test strategy. - Open questions and assumptions.

After the plan is reviewed, begin implementation in small milestones,
starting with the tenant and authentication foundation.
