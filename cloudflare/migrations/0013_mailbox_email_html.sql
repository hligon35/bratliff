ALTER TABLE mailbox_external_messages ADD COLUMN body_html TEXT NOT NULL DEFAULT '';
ALTER TABLE mailbox_external_messages ADD COLUMN body_format TEXT NOT NULL DEFAULT '';