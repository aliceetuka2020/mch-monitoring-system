# RBAC role and permission matrix

The server-side permission registry is implemented in `lib/rbac.js`. Legacy `ADMIN` and `HEALTH_WORKER` records remain accepted for compatibility. The normalized role catalog and role-permission assignments are stored in `Role`, `Permission`, and `RolePermission` tables.

| Role | Implemented permission identifiers | Scope | Module status |
|---|---|---|---|
| System Administrator | All registered permissions | System-wide administration, without automatic clinical bypass | Implemented |
| Medical Doctor | patients.view, maternal_records.view, maternal_records.create, maternal_records.update, child_records.view, child_records.update, reports.view | Authorized clinical scope | Implemented through existing modules |
| Nurse | patients.view, maternal_records.view, maternal_records.create, child_records.view, child_records.update, appointments.view, appointments.manage | Authorized care scope | Implemented through existing modules |
| Midwife | patients.view, maternal_records.view, maternal_records.create, maternal_records.update, antenatal_records.view, antenatal_records.manage, postnatal_records.view, postnatal_records.manage | Authorized maternal care scope | Implemented through existing modules |
| Community Health Extension Worker | patients.view, patients.register, patients.update_demographics, maternal_records.view, child_records.view, appointments.view, appointments.manage | Assigned community or facility scope | Implemented through shared modules |
| Maternal Health Officer | patients.view, maternal_records.view, maternal_records.create, appointments.view, reports.view | Maternal monitoring scope | Implemented through shared modules |
| Child Health Officer | patients.view, child_records.view, child_records.update, immunization.view, appointments.view, reports.view | Child health scope | Implemented through shared modules |
| Immunization Officer | patients.view, child_records.view, immunization.view, immunization.record, appointments.view, reports.view | Immunization scope | Implemented |
| Antenatal Care Officer | patients.view, maternal_records.view, antenatal_records.view, antenatal_records.manage, appointments.view, appointments.manage | ANC scope | Implemented |
| Postnatal Care Officer | patients.view, maternal_records.view, child_records.view, postnatal_records.view, postnatal_records.manage, appointments.view | PNC scope | Implemented |
| Laboratory Technician | patients.view, reports.view | Authorized laboratory requests, laboratory module absent | Partially implemented, laboratory module not present |
| Pharmacy Officer | patients.view, reports.view | Authorized medication orders, pharmacy module absent | Partially implemented, pharmacy module not present |
| Medical Records Officer | patients.view, patients.update_demographics, reports.view | Authorized demographic records | Implemented through patient module |
| Patient Registration Officer | patients.view, patients.register, patients.update_demographics, appointments.view | Registration scope | Implemented through patient module |
| Health Facility Manager | users.view, patients.view, appointments.view, reports.view, analytics.view | Assigned facility, no global administration | Partially implemented |
| Public Health Officer | reports.view, reports.export, analytics.view | Aggregate or de-identified reporting | Implemented through reports |
| Data Analyst | reports.view, reports.export, analytics.view | Aggregate or de-identified analytics | Implemented through reports |
| Monitoring and Evaluation Officer | reports.view, reports.export, analytics.view | Facility indicators and aggregate reporting | Implemented through reports |
| Patient / Mother | appointments.view | Own patient portal scope only | Partially implemented, portal uses OTP and has no staff login linkage |
| System Auditor | audit_logs.view, reports.view | Read-only audit scope | Partially implemented, audit-log module not present |

| Permission identifier | View | Create | Update | Delete | Approve or finalize | Export | Implementation status |
|---|---|---|---|---|---|---|---|
| users.view | Allowed by administrator and facility manager | Not applicable | Not applicable | Not applicable | Not applicable | Not applicable | Implemented on user API for administrator |
| roles.assign | Allowed by administrator | Not applicable | Allowed by administrator | Not applicable | Not applicable | Not applicable | Registry and seed implemented, user API validation implemented |
| patients.view | Role scoped | Not applicable | Not applicable | Not applicable | Not applicable | Restricted | Existing patient API and pages |
| patients.register | Registration and community roles | Allowed by authorized workflow | Restricted | Denied | Not applicable | Denied | Existing patient API |
| maternal_records.view and maternal_records.create | Clinical roles as mapped | Clinical roles as mapped | Restricted | Denied | Restricted | Denied | Existing ANC and care APIs |
| child_records.view and child_records.update | Child and clinical roles as mapped | Restricted | Restricted | Denied | Restricted | Denied | Existing child API |
| immunization.view and immunization.record | Immunization and child roles as mapped | Immunization role | Immunization role | Denied | Restricted | Denied | Existing immunization API |
| appointments.view and appointments.manage | Care roles as mapped | Care roles as mapped | Care roles as mapped | Restricted | Restricted | Denied | Existing appointment API |
| reports.view and reports.export | Reporting roles as mapped | Not applicable | Not applicable | Not applicable | Not applicable | Allowed only for reporting roles | Existing report API, export route remains administrator-only until migrated |
| analytics.view | Public health, analyst, M&E, manager | Not applicable | Not applicable | Not applicable | Not applicable | Restricted | Existing aggregate report data |
| audit_logs.view | Auditor only in normalized registry | Not applicable | Denied | Denied | Not applicable | Restricted | Audit-log module not present |
| system_settings.manage | Administrator only | Not applicable | Allowed by administrator | Denied | Not applicable | Denied | Existing settings API |

The laboratory, pharmacy, facility management, audit-log, and staff-facing patient dashboard modules do not exist in the supplied codebase. Their roles and permissions are represented as restricted registry entries and are not presented as fully functional modules. Patient portal access remains read-only and OTP based.
