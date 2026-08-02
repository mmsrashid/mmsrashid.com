-- Attach documents to the appointment they came from, so a blood test result or
-- an MRI report sits with the visit that produced it rather than only in a flat
-- documents library.
--
-- set null, not cascade: deleting an appointment must not delete the radiology
-- report that was attached to it. The document outlives the calendar entry.
alter table health_documents
  add column if not exists appointment_id uuid
  references health_appointments(id) on delete set null;

create index if not exists health_documents_appointment
  on health_documents(appointment_id);

-- Recorded so a link made by the matcher can be told apart from one the user
-- made deliberately, and so an automatic link can be reviewed or undone in bulk.
alter table health_documents
  add column if not exists link_source text
  check (link_source in ('manual', 'auto'));
