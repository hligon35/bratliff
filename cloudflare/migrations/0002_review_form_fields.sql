ALTER TABLE form_submissions
  ADD COLUMN preferred_speaker TEXT NOT NULL DEFAULT '';

ALTER TABLE form_submissions
  ADD COLUMN speaking_budget TEXT NOT NULL DEFAULT '';