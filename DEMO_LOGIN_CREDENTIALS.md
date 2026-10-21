# DEVELOPMENT AND TESTING ONLY, NOT FOR PRODUCTION USE

These fictional accounts are created only when the development or test seeder is run. The application login route is `/login`. The existing patient portal remains OTP based at `/portal`, so the patient account is a role fixture for authorization testing and is not a substitute for portal verification.

| Full name | Role identifier | Email | Username | Initial password | Expected view |
|---|---|---|---|---|---|
| System Administrator | system_administrator | admin@healthcare.test | admin | AdminDemo#2026 | Administrative dashboard |
| Demo Medical Doctor | medical_doctor | doctor@healthcare.test | doctor | DoctorDemo#2026 | Clinical dashboard |
| Demo Nurse | nurse | nurse@healthcare.test | nurse | NurseDemo#2026 | Nursing dashboard |
| Demo Midwife | midwife | midwife@healthcare.test | midwife | MidwifeDemo#2026 | Midwifery dashboard |
| Demo Community Health Extension Worker | community_health_extension_worker | chew@healthcare.test | chew | ChewDemo#2026 | Community healthcare dashboard |
| Demo Maternal Health Officer | maternal_health_officer | maternal@healthcare.test | maternal | MaternalDemo#2026 | Maternal health dashboard |
| Demo Child Health Officer | child_health_officer | childhealth@healthcare.test | childhealth | ChildHealthDemo#2026 | Child health dashboard |
| Demo Immunization Officer | immunization_officer | immunization@healthcare.test | immunization | ImmunizeDemo#2026 | Immunization dashboard |
| Demo ANC Officer | antenatal_care_officer | anc@healthcare.test | anc | AncDemo#2026 | ANC dashboard |
| Demo PNC Officer | postnatal_care_officer | pnc@healthcare.test | pnc | PncDemo#2026 | PNC dashboard |
| Demo Laboratory Technician | laboratory_technician | lab@healthcare.test | lab | LabDemo#2026 | Laboratory view, module not present |
| Demo Pharmacy Officer | pharmacy_officer | pharmacy@healthcare.test | pharmacy | PharmacyDemo#2026 | Pharmacy view, module not present |
| Demo Medical Records Officer | medical_records_officer | records@healthcare.test | records | RecordsDemo#2026 | Medical records dashboard |
| Demo Patient Registration Officer | patient_registration_officer | registration@healthcare.test | registration | RegisterDemo#2026 | Patient registration dashboard |
| Demo Health Facility Manager | health_facility_manager | facilitymanager@healthcare.test | facilitymanager | FacilityDemo#2026 | Facility management dashboard |
| Demo Public Health Officer | public_health_officer | publichealth@healthcare.test | publichealth | PublicHealthDemo#2026 | Public health dashboard |
| Demo Data Analyst | data_analyst | analyst@healthcare.test | analyst | AnalystDemo#2026 | Analytics dashboard |
| Demo Monitoring and Evaluation Officer | monitoring_and_evaluation_officer | me@healthcare.test | me | MonitoringDemo#2026 | M&E dashboard |
| Demo Mother | patient_mother | mother@healthcare.test | mother | MotherDemo#2026 | Patient portal role fixture |
| Demo System Auditor | system_auditor | auditor@healthcare.test | auditor | AuditorDemo#2026 | Audit dashboard, audit module not present |

Run `npx prisma db push` and then `npm run db:seed` in a development or test environment. The seeder is repeatable, hashes newly created passwords with bcrypt, preserves existing account passwords, and refuses to create demo accounts in production unless `ALLOW_DEMO_SEED=true` is explicitly set. To disable accounts, set `active` to false through the administrator user-management flow or database administration. To remove only these fixtures, delete the accounts by their `@healthcare.test` email addresses after confirming they are not being used by test data.
