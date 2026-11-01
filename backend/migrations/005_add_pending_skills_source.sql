-- A task whose skills could not be identified yet, so it is saved and retried later.

ALTER TYPE skills_source ADD VALUE 'pending';
